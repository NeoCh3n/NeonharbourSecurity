const { pool } = require('../database');
const { auditLog, auditInvestigationAction, generateTraceId } = require('../middleware/audit');
const { performanceManager } = require('../performance');

/**
 * Investigation Orchestrator - Central coordinator for investigation lifecycle
 * 
 * Manages the investigation state machine:
 * planning → executing → analyzing → responding → complete
 */
class InvestigationOrchestrator {
  constructor() {
    this.activeInvestigations = new Map();
    this.investigationQueue = [];
    this.maxConcurrentInvestigations = parseInt(process.env.MAX_CONCURRENT_INVESTIGATIONS || '10', 10);
    this.defaultTimeoutMs = parseInt(process.env.INVESTIGATION_TIMEOUT_MS || '1800000', 10); // 30 minutes
    this.performanceEnabled = process.env.ENABLE_PERFORMANCE_MONITORING !== 'false';
    
    // Initialize performance manager if enabled
    if (this.performanceEnabled) {
      this._initializePerformanceManager();
    }
  }

  /**
   * Start a new investigation for an alert
   * @param {string} alertId - Alert ID to investigate
   * @param {Object} options - Investigation options
   * @param {string} options.userId - User initiating the investigation
   * @param {string} options.tenantId - Tenant ID
   * @param {number} options.priority - Investigation priority (1-5, 5 = highest)
   * @param {number} options.timeoutMs - Custom timeout in milliseconds
   * @returns {Promise<Object>} Investigation object
   */
  async startInvestigation(alertId, options = {}) {
    const { userId, tenantId, priority = 3, timeoutMs = this.defaultTimeoutMs } = options;
    
    if (!alertId || !userId || !tenantId) {
      throw new Error('alertId, userId, and tenantId are required');
    }

    // Check if investigation already exists for this alert
    const existing = await pool.query(
      'SELECT id, status FROM investigations WHERE alert_id = $1 AND tenant_id = $2 AND status NOT IN ($3, $4)',
      [alertId, tenantId, 'complete', 'failed']
    );
    
    if (existing.rows.length > 0) {
      throw new Error(`Investigation already exists for alert ${alertId}: ${existing.rows[0].id}`);
    }

    // Get alert details
    const alertResult = await pool.query(
      'SELECT id, summary, severity, case_id, raw FROM alerts WHERE id = $1 AND tenant_id = $2',
      [alertId, tenantId]
    );
    
    if (alertResult.rows.length === 0) {
      throw new Error(`Alert ${alertId} not found`);
    }

    const alert = alertResult.rows[0];
    const investigationId = this._generateInvestigationId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMs);

    // Create investigation record
    const investigation = await pool.query(`
      INSERT INTO investigations (
        id, alert_id, case_id, tenant_id, user_id, status, priority, 
        created_at, expires_at, context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      investigationId,
      alertId,
      alert.case_id,
      tenantId,
      userId,
      'planning',
      priority,
      now,
      expiresAt,
      JSON.stringify({
        alertSummary: alert.summary,
        alertSeverity: alert.severity,
        startedBy: userId,
        timeoutMs
      })
    ]);

    const investigationRecord = investigation.rows[0];

    // Log investigation creation for audit trail
    await auditInvestigationAction(
      investigationId,
      'investigation_created',
      {
        alertId,
        caseId: alert.case_id,
        priority,
        timeoutMs,
        alertSummary: alert.summary,
        alertSeverity: alert.severity,
        traceId: generateTraceId()
      },
      userId,
      tenantId
    );

    // Add to active investigations
    this.activeInvestigations.set(investigationId, {
      ...investigationRecord,
      startTime: now,
      currentAgent: null,
      stepHistory: []
    });

    // Log investigation start
    await auditLog(userId, 'investigation_started', {
      investigationId,
      alertId,
      priority,
      tenantId
    });

    // Queue for processing with performance monitoring
    if (this.performanceEnabled) {
      try {
        const performanceEntry = await performanceManager.startInvestigation({
          investigationId,
          alertId,
          tenantId,
          userId,
          priority,
          alertSeverity: alert.severity,
          timeoutMs
        });
        
        // Update investigation record with performance info
        investigationRecord.performanceTracking = performanceEntry.performanceTracking;
      } catch (error) {
        console.error(`Failed to start performance monitoring for ${investigationId}:`, error);
        // Continue without performance monitoring
        this._queueInvestigation(investigationId, priority);
      }
    } else {
      this._queueInvestigation(investigationId, priority);
    }

    return investigationRecord;
  }

  /**
   * Get investigation status and progress
   * @param {string} investigationId - Investigation ID
   * @param {string} tenantId - Tenant ID for security
   * @returns {Promise<Object>} Investigation status
   */
  async getInvestigationStatus(investigationId, tenantId) {
    const result = await pool.query(
      'SELECT * FROM investigations WHERE id = $1 AND tenant_id = $2',
      [investigationId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Investigation ${investigationId} not found`);
    }

    const investigation = result.rows[0];
    const activeInfo = this.activeInvestigations.get(investigationId);

    // Get investigation steps
    const stepsResult = await pool.query(
      'SELECT * FROM investigation_steps WHERE investigation_id = $1 ORDER BY step_order ASC',
      [investigationId]
    );

    return {
      ...investigation,
      steps: stepsResult.rows,
      isActive: !!activeInfo,
      currentAgent: activeInfo?.currentAgent || null,
      progress: this._calculateProgress(stepsResult.rows),
      estimatedCompletion: this._estimateCompletion(investigation, stepsResult.rows)
    };
  }

  /**
   * Pause an active investigation
   * @param {string} investigationId - Investigation ID
   * @param {string} userId - User requesting pause
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<void>}
   */
  async pauseInvestigation(investigationId, userId, tenantId) {
    const investigation = this.activeInvestigations.get(investigationId);
    if (!investigation) {
      throw new Error(`Investigation ${investigationId} is not active`);
    }

    // Update database status
    await pool.query(
      'UPDATE investigations SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['paused', investigationId, tenantId]
    );

    // Remove from active investigations but keep in memory for resume
    investigation.status = 'paused';
    investigation.pausedBy = userId;
    investigation.pausedAt = new Date();

    // Enhanced audit logging
    await auditInvestigationAction(
      investigationId,
      'investigation_paused',
      {
        pausedBy: userId,
        pausedAt: investigation.pausedAt,
        previousStatus: investigation.previousStatus || 'executing',
        traceId: generateTraceId()
      },
      userId,
      tenantId
    );
  }

  /**
   * Resume a paused investigation
   * @param {string} investigationId - Investigation ID
   * @param {string} userId - User requesting resume
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<void>}
   */
  async resumeInvestigation(investigationId, userId, tenantId) {
    const investigation = this.activeInvestigations.get(investigationId);
    if (!investigation || investigation.status !== 'paused') {
      throw new Error(`Investigation ${investigationId} is not paused`);
    }

    // Update database status
    await pool.query(
      'UPDATE investigations SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['executing', investigationId, tenantId]
    );

    investigation.status = 'executing';
    investigation.resumedBy = userId;
    investigation.resumedAt = new Date();

    // Re-queue for processing
    this._queueInvestigation(investigationId, investigation.priority);

    // Enhanced audit logging
    await auditInvestigationAction(
      investigationId,
      'investigation_resumed',
      {
        resumedBy: userId,
        resumedAt: new Date(),
        pausedDuration: investigation.pausedAt ? Date.now() - investigation.pausedAt.getTime() : null,
        traceId: generateTraceId()
      },
      userId,
      tenantId
    );
  }

  /**
   * Add human feedback to an investigation
   * @param {string} investigationId - Investigation ID
   * @param {Object} feedback - Feedback object
   * @param {string} userId - User providing feedback
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<void>}
   */
  async addHumanFeedback(investigationId, feedback, userId, tenantId) {
    const investigation = this.activeInvestigations.get(investigationId);
    if (!investigation) {
      throw new Error(`Investigation ${investigationId} is not active`);
    }

    // Store feedback
    await pool.query(`
      INSERT INTO investigation_feedback (
        investigation_id, user_id, tenant_id, feedback_type, content, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      investigationId,
      userId,
      tenantId,
      feedback.type || 'general',
      JSON.stringify(feedback)
    ]);

    // Update investigation context
    const context = investigation.context || {};
    context.humanFeedback = context.humanFeedback || [];
    context.humanFeedback.push({
      ...feedback,
      userId,
      timestamp: new Date().toISOString()
    });

    await pool.query(
      'UPDATE investigations SET context = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [JSON.stringify(context), investigationId, tenantId]
    );

    investigation.context = context;

    await auditLog(userId, 'investigation_feedback_added', {
      investigationId,
      feedbackType: feedback.type,
      tenantId
    });
  }

  /**
   * Process investigation queue (called by background worker)
   */
  async processQueue() {
    if (this.investigationQueue.length === 0) {
      return;
    }

    // Sort by priority (higher number = higher priority)
    this.investigationQueue.sort((a, b) => b.priority - a.priority);

    const activeCount = Array.from(this.activeInvestigations.values())
      .filter(inv => ['planning', 'executing', 'analyzing', 'responding'].includes(inv.status)).length;

    if (activeCount >= this.maxConcurrentInvestigations) {
      return; // At capacity
    }

    const nextInvestigation = this.investigationQueue.shift();
    if (nextInvestigation) {
      await this._processInvestigation(nextInvestigation.id);
    }
  }

  /**
   * Clean up expired investigations
   */
  async cleanupExpiredInvestigations() {
    const now = new Date();
    
    // Find expired investigations
    const expired = await pool.query(
      'SELECT id, tenant_id FROM investigations WHERE expires_at < $1 AND status NOT IN ($2, $3, $4)',
      [now, 'complete', 'failed', 'expired']
    );

    for (const inv of expired.rows) {
      await this._expireInvestigation(inv.id, inv.tenant_id);
    }
  }

  // Private methods

  _generateInvestigationId() {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _queueInvestigation(investigationId, priority) {
    // Remove if already queued
    this.investigationQueue = this.investigationQueue.filter(item => item.id !== investigationId);
    
    // Add to queue
    this.investigationQueue.push({
      id: investigationId,
      priority,
      queuedAt: new Date()
    });
  }

  _calculateProgress(steps) {
    if (steps.length === 0) return 0;
    
    const completedSteps = steps.filter(step => step.status === 'complete').length;
    return Math.round((completedSteps / steps.length) * 100);
  }

  _estimateCompletion(investigation, steps) {
    if (investigation.status === 'complete' || investigation.status === 'failed') {
      return null;
    }

    const totalSteps = steps.length || 5; // Default estimate
    const completedSteps = steps.filter(step => step.status === 'complete').length;
    const remainingSteps = totalSteps - completedSteps;
    
    if (remainingSteps <= 0) {
      return new Date(Date.now() + 60000); // 1 minute for finalization
    }

    // Estimate 2-5 minutes per remaining step based on complexity
    const avgStepTime = 3 * 60 * 1000; // 3 minutes in milliseconds
    const estimatedMs = remainingSteps * avgStepTime;
    
    return new Date(Date.now() + estimatedMs);
  }

  async _processInvestigation(investigationId) {
    const investigation = this.activeInvestigations.get(investigationId);
    if (!investigation) {
      console.error(`Investigation ${investigationId} not found in active investigations`);
      return;
    }

    try {
      // Update status to executing
      await pool.query(
        'UPDATE investigations SET status = $1, updated_at = NOW() WHERE id = $2',
        ['executing', investigationId]
      );
      investigation.status = 'executing';

      console.log(`Started processing investigation: ${investigationId}`);
      
      // The actual agent coordination will be implemented when specific agents are created
      // For now, we just mark it as ready for agent processing
      
    } catch (error) {
      console.error(`Failed to start processing investigation ${investigationId}:`, error);
      
      // Mark as failed
      await pool.query(
        'UPDATE investigations SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', investigationId]
      );
      investigation.status = 'failed';
    }
  }

  async _expireInvestigation(investigationId, tenantId) {
    await pool.query(
      'UPDATE investigations SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['expired', investigationId, tenantId]
    );

    this.activeInvestigations.delete(investigationId);

    // Record performance metrics for expired investigation
    if (this.performanceEnabled) {
      try {
        await performanceManager.failInvestigation(investigationId, new Error('Investigation expired'));
      } catch (error) {
        console.error(`Failed to record performance metrics for expired investigation ${investigationId}:`, error);
      }
    }

    await auditLog(null, 'investigation_expired', {
      investigationId,
      tenantId
    });
  }

  /**
   * Complete investigation with performance tracking
   * @param {string} investigationId - Investigation ID
   * @param {Object} result - Investigation result
   */
  async completeInvestigation(investigationId, result) {
    const investigation = this.activeInvestigations.get(investigationId);
    if (!investigation) {
      throw new Error(`Investigation ${investigationId} not found in active investigations`);
    }

    try {
      // Update database status
      await pool.query(
        'UPDATE investigations SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2',
        ['complete', investigationId]
      );

      // Record performance metrics
      if (this.performanceEnabled) {
        await performanceManager.completeInvestigation(investigationId, result);
      }

      // Remove from active investigations
      this.activeInvestigations.delete(investigationId);

      // Log completion
      await auditInvestigationAction(
        investigationId,
        'investigation_completed',
        {
          result,
          duration: Date.now() - investigation.startTime.getTime(),
          traceId: generateTraceId()
        },
        investigation.user_id,
        investigation.tenant_id
      );

      console.log(`Investigation ${investigationId} completed successfully`);

    } catch (error) {
      console.error(`Failed to complete investigation ${investigationId}:`, error);
      throw error;
    }
  }

  /**
   * Get performance status for all investigations
   * @param {string} tenantId - Optional tenant filter
   * @returns {Object} Performance status
   */
  getPerformanceStatus(tenantId = null) {
    if (!this.performanceEnabled) {
      return { enabled: false };
    }

    try {
      return performanceManager.getPerformanceStatus(tenantId);
    } catch (error) {
      console.error('Failed to get performance status:', error);
      return { error: error.message };
    }
  }

  /**
   * Get performance analytics
   * @param {string} tenantId - Tenant ID
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Object>} Performance analytics
   */
  async getPerformanceAnalytics(tenantId, days = 7) {
    if (!this.performanceEnabled) {
      throw new Error('Performance monitoring is not enabled');
    }

    return performanceManager.getPerformanceAnalytics(tenantId, days);
  }

  /**
   * Optimize investigation performance
   * @param {Object} options - Optimization options
   * @returns {Promise<Object>} Optimization results
   */
  async optimizePerformance(options = {}) {
    if (!this.performanceEnabled) {
      throw new Error('Performance monitoring is not enabled');
    }

    return performanceManager.optimizePerformance(options);
  }

  // Private methods

  async _initializePerformanceManager() {
    try {
      await performanceManager.initialize();
      console.log('Performance monitoring enabled for Investigation Orchestrator');
    } catch (error) {
      console.error('Failed to initialize performance manager:', error);
      this.performanceEnabled = false;
    }
  }
}

module.exports = { InvestigationOrchestrator };