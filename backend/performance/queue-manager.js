const { pool } = require('../database');
const { auditLog } = require('../middleware/audit');

/**
 * Investigation Queue Manager
 * 
 * Manages investigation queuing with priority-based scheduling:
 * - Priority-based queue with multiple levels
 * - Resource-aware scheduling
 * - Load balancing across tenants
 * - Queue monitoring and metrics
 * - Backpressure handling
 */
class InvestigationQueueManager {
  constructor() {
    // Priority queues (1 = lowest, 5 = highest)
    this.queues = new Map([
      [5, []], // Critical
      [4, []], // High
      [3, []], // Medium
      [2, []], // Low
      [1, []]  // Lowest
    ]);
    
    this.processing = new Map(); // Currently processing investigations
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_INVESTIGATIONS || '10', 10);
    this.maxPerTenant = parseInt(process.env.MAX_INVESTIGATIONS_PER_TENANT || '5', 10);
    this.processingInterval = parseInt(process.env.QUEUE_PROCESSING_INTERVAL_MS || '5000', 10);
    
    // Queue statistics
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      averageWaitTime: 0,
      currentLoad: 0
    };
    
    // Tenant load tracking
    this.tenantLoad = new Map();
    
    // Start queue processor
    this.processingTimer = setInterval(() => this.processQueue(), this.processingInterval);
    
    // Initialize queue persistence
    this._initializeQueueTable();
  }

  /**
   * Add investigation to queue
   * @param {Object} investigation - Investigation details
   * @returns {Promise<Object>} Queue entry
   */
  async enqueue(investigation) {
    const {
      investigationId,
      alertId,
      tenantId,
      userId,
      priority = 3,
      alertSeverity,
      estimatedDuration = 300000 // 5 minutes default
    } = investigation;

    // Validate inputs
    if (!investigationId || !alertId || !tenantId || !userId) {
      throw new Error('Missing required investigation parameters');
    }

    // Check if already queued
    if (this._isQueued(investigationId) || this.processing.has(investigationId)) {
      throw new Error(`Investigation ${investigationId} is already queued or processing`);
    }

    // Check tenant limits
    const tenantCurrentLoad = this.tenantLoad.get(tenantId) || 0;
    if (tenantCurrentLoad >= this.maxPerTenant) {
      throw new Error(`Tenant ${tenantId} has reached maximum concurrent investigations (${this.maxPerTenant})`);
    }

    // Adjust priority based on alert severity
    const adjustedPriority = this._adjustPriorityBySeverity(priority, alertSeverity);

    const queueEntry = {
      investigationId,
      alertId,
      tenantId,
      userId,
      priority: adjustedPriority,
      alertSeverity,
      estimatedDuration,
      queuedAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      metadata: {
        originalPriority: priority,
        adjustedPriority,
        queuePosition: this._calculateQueuePosition(adjustedPriority)
      }
    };

    // Add to appropriate priority queue
    this.queues.get(adjustedPriority).push(queueEntry);
    this.stats.totalQueued++;

    // Persist to database
    await this._persistQueueEntry(queueEntry);

    // Log queuing
    await auditLog(userId, 'investigation_queued', {
      investigationId,
      alertId,
      priority: adjustedPriority,
      queuePosition: queueEntry.metadata.queuePosition,
      tenantId
    });

    console.log(`Investigation ${investigationId} queued with priority ${adjustedPriority} (position: ${queueEntry.metadata.queuePosition})`);

    return queueEntry;
  }

  /**
   * Remove investigation from queue
   * @param {string} investigationId - Investigation ID
   * @param {string} reason - Reason for removal
   * @returns {Promise<boolean>} Success status
   */
  async dequeue(investigationId, reason = 'manual_removal') {
    let removed = false;

    // Remove from all priority queues
    for (const [priority, queue] of this.queues.entries()) {
      const index = queue.findIndex(entry => entry.investigationId === investigationId);
      if (index !== -1) {
        const entry = queue.splice(index, 1)[0];
        removed = true;
        
        // Update database
        await pool.query(
          'UPDATE investigation_queue SET status = $1, removed_at = NOW(), removal_reason = $2 WHERE investigation_id = $3',
          ['removed', reason, investigationId]
        );

        console.log(`Investigation ${investigationId} removed from queue (reason: ${reason})`);
        break;
      }
    }

    return removed;
  }

  /**
   * Get queue status for investigation
   * @param {string} investigationId - Investigation ID
   * @returns {Object|null} Queue status
   */
  getQueueStatus(investigationId) {
    // Check if currently processing
    if (this.processing.has(investigationId)) {
      return {
        status: 'processing',
        startedAt: this.processing.get(investigationId).startedAt,
        estimatedCompletion: this._estimateCompletion(investigationId)
      };
    }

    // Check queues
    for (const [priority, queue] of this.queues.entries()) {
      const index = queue.findIndex(entry => entry.investigationId === investigationId);
      if (index !== -1) {
        const entry = queue[index];
        return {
          status: 'queued',
          priority,
          position: index + 1,
          queuedAt: entry.queuedAt,
          estimatedWaitTime: this._estimateWaitTime(priority, index),
          attempts: entry.attempts
        };
      }
    }

    return null;
  }

  /**
   * Get queue statistics
   * @param {string} tenantId - Optional tenant filter
   * @returns {Object} Queue statistics
   */
  getQueueStats(tenantId = null) {
    const totalQueued = Array.from(this.queues.values())
      .reduce((sum, queue) => sum + queue.length, 0);

    const queuedByPriority = {};
    for (const [priority, queue] of this.queues.entries()) {
      const filtered = tenantId 
        ? queue.filter(entry => entry.tenantId === tenantId)
        : queue;
      queuedByPriority[priority] = filtered.length;
    }

    const processingCount = tenantId
      ? Array.from(this.processing.values()).filter(entry => entry.tenantId === tenantId).length
      : this.processing.size;

    return {
      totalQueued,
      queuedByPriority,
      processing: processingCount,
      maxConcurrent: this.maxConcurrent,
      currentLoad: Math.round((processingCount / this.maxConcurrent) * 100),
      tenantLoad: tenantId ? (this.tenantLoad.get(tenantId) || 0) : Object.fromEntries(this.tenantLoad),
      ...this.stats
    };
  }

  /**
   * Process queue - main scheduling logic
   */
  async processQueue() {
    try {
      // Check if we have capacity
      if (this.processing.size >= this.maxConcurrent) {
        return;
      }

      // Get next investigation to process
      const nextEntry = this._getNextInvestigation();
      if (!nextEntry) {
        return;
      }

      // Check tenant limits
      const tenantLoad = this.tenantLoad.get(nextEntry.tenantId) || 0;
      if (tenantLoad >= this.maxPerTenant) {
        // Skip this tenant for now, try next
        return;
      }

      // Remove from queue and start processing
      this._removeFromQueue(nextEntry);
      await this._startProcessing(nextEntry);

    } catch (error) {
      console.error('Error processing queue:', error);
    }
  }

  /**
   * Mark investigation as completed
   * @param {string} investigationId - Investigation ID
   * @param {Object} result - Processing result
   */
  async completeInvestigation(investigationId, result) {
    const processingEntry = this.processing.get(investigationId);
    if (!processingEntry) {
      console.warn(`Investigation ${investigationId} not found in processing queue`);
      return;
    }

    const duration = Date.now() - processingEntry.startedAt.getTime();
    
    // Update statistics
    this.stats.totalProcessed++;
    this._updateAverageWaitTime(processingEntry.queuedAt, processingEntry.startedAt);

    // Update tenant load
    const tenantLoad = this.tenantLoad.get(processingEntry.tenantId) || 0;
    this.tenantLoad.set(processingEntry.tenantId, Math.max(0, tenantLoad - 1));

    // Remove from processing
    this.processing.delete(investigationId);

    // Update database
    await pool.query(
      'UPDATE investigation_queue SET status = $1, completed_at = NOW(), duration_ms = $2, result = $3 WHERE investigation_id = $4',
      ['completed', duration, JSON.stringify(result), investigationId]
    );

    console.log(`Investigation ${investigationId} completed in ${duration}ms`);
  }

  /**
   * Mark investigation as failed
   * @param {string} investigationId - Investigation ID
   * @param {Error} error - Error that occurred
   */
  async failInvestigation(investigationId, error) {
    const processingEntry = this.processing.get(investigationId);
    if (!processingEntry) {
      console.warn(`Investigation ${investigationId} not found in processing queue`);
      return;
    }

    // Check if we should retry
    const queueEntry = processingEntry.originalEntry;
    queueEntry.attempts++;
    queueEntry.lastError = error.message;

    if (queueEntry.attempts < queueEntry.maxAttempts) {
      // Re-queue with lower priority
      const newPriority = Math.max(1, queueEntry.priority - 1);
      queueEntry.priority = newPriority;
      
      this.queues.get(newPriority).push(queueEntry);
      
      console.log(`Investigation ${investigationId} failed, re-queued with priority ${newPriority} (attempt ${queueEntry.attempts}/${queueEntry.maxAttempts})`);
    } else {
      // Max attempts reached
      this.stats.totalFailed++;
      
      await pool.query(
        'UPDATE investigation_queue SET status = $1, failed_at = NOW(), error_message = $2 WHERE investigation_id = $3',
        ['failed', error.message, investigationId]
      );
      
      console.error(`Investigation ${investigationId} failed permanently after ${queueEntry.attempts} attempts:`, error.message);
    }

    // Update tenant load
    const tenantLoad = this.tenantLoad.get(processingEntry.tenantId) || 0;
    this.tenantLoad.set(processingEntry.tenantId, Math.max(0, tenantLoad - 1));

    // Remove from processing
    this.processing.delete(investigationId);
  }

  /**
   * Cleanup old queue entries
   * @param {number} retentionDays - Days to retain completed entries
   */
  async cleanupOldEntries(retentionDays = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const result = await pool.query(
        'DELETE FROM investigation_queue WHERE (completed_at < $1 OR failed_at < $1) AND status IN ($2, $3)',
        [cutoffDate, 'completed', 'failed']
      );

      if (result.rowCount > 0) {
        console.log(`Cleaned up ${result.rowCount} old queue entries`);
      }
    } catch (error) {
      console.error('Failed to cleanup old queue entries:', error);
    }
  }

  // Private methods

  async _initializeQueueTable() {
    try {
      // Skip initialization if database is not available
      if (!process.env.DATABASE_URL) {
        console.warn('Database URL not configured, skipping queue table initialization');
        return;
      }
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS investigation_queue (
          id SERIAL PRIMARY KEY,
          investigation_id VARCHAR(100) UNIQUE NOT NULL,
          alert_id INTEGER NOT NULL,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          priority INTEGER NOT NULL,
          alert_severity VARCHAR(20),
          estimated_duration_ms INTEGER,
          status VARCHAR(20) DEFAULT 'queued',
          queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          failed_at TIMESTAMP,
          removed_at TIMESTAMP,
          duration_ms INTEGER,
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          error_message TEXT,
          removal_reason VARCHAR(100),
          result JSONB,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Create indexes
      await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_queue_status ON investigation_queue (status, priority DESC, queued_at)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_queue_tenant ON investigation_queue (tenant_id, status)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_queue_priority ON investigation_queue (priority DESC, queued_at)');

    } catch (error) {
      console.error('Failed to initialize queue table:', error);
    }
  }

  _adjustPriorityBySeverity(basePriority, alertSeverity) {
    const severityBoost = {
      'critical': 2,
      'high': 1,
      'medium': 0,
      'low': -1,
      'info': -1
    };

    const boost = severityBoost[alertSeverity?.toLowerCase()] || 0;
    return Math.max(1, Math.min(5, basePriority + boost));
  }

  _calculateQueuePosition(priority) {
    let position = 0;
    
    // Count higher priority items
    for (let p = 5; p > priority; p--) {
      position += this.queues.get(p).length;
    }
    
    // Add current priority queue position
    position += this.queues.get(priority).length;
    
    return position;
  }

  _isQueued(investigationId) {
    for (const queue of this.queues.values()) {
      if (queue.some(entry => entry.investigationId === investigationId)) {
        return true;
      }
    }
    return false;
  }

  _getNextInvestigation() {
    // Process highest priority first
    for (let priority = 5; priority >= 1; priority--) {
      const queue = this.queues.get(priority);
      if (queue.length > 0) {
        // Use FIFO within same priority, but consider tenant load balancing
        return this._selectWithLoadBalancing(queue);
      }
    }
    return null;
  }

  _selectWithLoadBalancing(queue) {
    // Sort by tenant load (ascending) then by queue time (ascending)
    const sorted = queue.slice().sort((a, b) => {
      const loadA = this.tenantLoad.get(a.tenantId) || 0;
      const loadB = this.tenantLoad.get(b.tenantId) || 0;
      
      if (loadA !== loadB) {
        return loadA - loadB; // Lower load first
      }
      
      return a.queuedAt - b.queuedAt; // Older first
    });

    // Return first item that doesn't exceed tenant limits
    for (const entry of sorted) {
      const tenantLoad = this.tenantLoad.get(entry.tenantId) || 0;
      if (tenantLoad < this.maxPerTenant) {
        return entry;
      }
    }

    return null;
  }

  _removeFromQueue(entry) {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(item => item.investigationId === entry.investigationId);
      if (index !== -1) {
        queue.splice(index, 1);
        break;
      }
    }
  }

  async _startProcessing(entry) {
    const processingEntry = {
      ...entry,
      startedAt: new Date(),
      originalEntry: entry
    };

    this.processing.set(entry.investigationId, processingEntry);

    // Update tenant load
    const currentLoad = this.tenantLoad.get(entry.tenantId) || 0;
    this.tenantLoad.set(entry.tenantId, currentLoad + 1);

    // Update database
    await pool.query(
      'UPDATE investigation_queue SET status = $1, started_at = NOW() WHERE investigation_id = $2',
      ['processing', entry.investigationId]
    );

    console.log(`Started processing investigation ${entry.investigationId} (tenant: ${entry.tenantId})`);
  }

  async _persistQueueEntry(entry) {
    try {
      await pool.query(`
        INSERT INTO investigation_queue (
          investigation_id, alert_id, tenant_id, user_id, priority,
          alert_severity, estimated_duration_ms, attempts, max_attempts, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        entry.investigationId,
        entry.alertId,
        entry.tenantId,
        entry.userId,
        entry.priority,
        entry.alertSeverity,
        entry.estimatedDuration,
        entry.attempts,
        entry.maxAttempts,
        JSON.stringify(entry.metadata)
      ]);
    } catch (error) {
      console.error(`Failed to persist queue entry for ${entry.investigationId}:`, error);
    }
  }

  _estimateWaitTime(priority, position) {
    // Estimate based on current processing rate and queue position
    const avgProcessingTime = 300000; // 5 minutes default
    const processingCapacity = this.maxConcurrent;
    
    // Count higher priority items ahead
    let itemsAhead = position;
    for (let p = 5; p > priority; p--) {
      itemsAhead += this.queues.get(p).length;
    }

    return Math.ceil((itemsAhead / processingCapacity) * avgProcessingTime);
  }

  _estimateCompletion(investigationId) {
    const entry = this.processing.get(investigationId);
    if (!entry) return null;

    const elapsed = Date.now() - entry.startedAt.getTime();
    const estimated = entry.estimatedDuration || 300000;
    
    return new Date(Date.now() + Math.max(0, estimated - elapsed));
  }

  _updateAverageWaitTime(queuedAt, startedAt) {
    const waitTime = startedAt.getTime() - queuedAt.getTime();
    
    if (this.stats.totalProcessed === 1) {
      this.stats.averageWaitTime = waitTime;
    } else {
      // Exponential moving average
      const alpha = 0.1;
      this.stats.averageWaitTime = (alpha * waitTime) + ((1 - alpha) * this.stats.averageWaitTime);
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }
    
    // Clear all queues
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    
    this.processing.clear();
    this.tenantLoad.clear();
  }
}

module.exports = { InvestigationQueueManager };