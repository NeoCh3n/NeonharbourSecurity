const { pool } = require('../database');
const { auditLog } = require('../middleware/audit');

/**
 * Performance Metrics Collector
 * 
 * Collects and analyzes investigation performance metrics including:
 * - Investigation duration and throughput
 * - Agent performance and accuracy
 * - Resource utilization
 * - API call performance
 * - Error rates and patterns
 */
class PerformanceMetricsCollector {
  constructor() {
    this.metricsBuffer = new Map();
    this.flushInterval = parseInt(process.env.METRICS_FLUSH_INTERVAL_MS || '60000', 10); // 1 minute
    this.maxBufferSize = parseInt(process.env.METRICS_BUFFER_SIZE || '1000', 10);
    
    // Start periodic flush
    this.flushTimer = setInterval(() => this.flushMetrics(), this.flushInterval);
  }

  /**
   * Record investigation start metrics
   * @param {string} investigationId - Investigation ID
   * @param {Object} context - Investigation context
   */
  async recordInvestigationStart(investigationId, context) {
    const metrics = {
      investigationId,
      startTime: Date.now(),
      alertSeverity: context.alertSeverity,
      priority: context.priority,
      tenantId: context.tenantId,
      userId: context.userId,
      agentMetrics: new Map(),
      apiCallMetrics: [],
      resourceUsage: {
        memoryStart: process.memoryUsage(),
        cpuStart: process.cpuUsage()
      }
    };

    this.metricsBuffer.set(investigationId, metrics);
  }

  /**
   * Record investigation completion metrics
   * @param {string} investigationId - Investigation ID
   * @param {Object} result - Investigation result
   */
  async recordInvestigationComplete(investigationId, result) {
    const metrics = this.metricsBuffer.get(investigationId);
    if (!metrics) {
      console.warn(`No metrics found for investigation ${investigationId}`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - metrics.startTime;
    
    metrics.endTime = endTime;
    metrics.duration = duration;
    metrics.status = result.status;
    metrics.verdict = result.verdict;
    metrics.confidence = result.confidence;
    metrics.stepsCompleted = result.stepsCompleted;
    metrics.totalSteps = result.totalSteps;
    metrics.resourceUsage.memoryEnd = process.memoryUsage();
    metrics.resourceUsage.cpuEnd = process.cpuUsage();

    // Calculate resource deltas
    const memoryDelta = {
      rss: metrics.resourceUsage.memoryEnd.rss - metrics.resourceUsage.memoryStart.rss,
      heapUsed: metrics.resourceUsage.memoryEnd.heapUsed - metrics.resourceUsage.memoryStart.heapUsed,
      heapTotal: metrics.resourceUsage.memoryEnd.heapTotal - metrics.resourceUsage.memoryStart.heapTotal
    };

    const cpuDelta = {
      user: metrics.resourceUsage.cpuEnd.user - metrics.resourceUsage.memoryStart.user,
      system: metrics.resourceUsage.cpuEnd.system - metrics.resourceUsage.memoryStart.system
    };

    // Store detailed metrics
    await this._storeInvestigationMetrics(investigationId, {
      ...metrics,
      memoryDelta,
      cpuDelta
    });

    // Update daily aggregates
    await this._updateDailyMetrics(metrics.tenantId, {
      duration,
      status: result.status,
      verdict: result.verdict,
      confidence: result.confidence,
      alertSeverity: metrics.alertSeverity
    });

    // Clean up buffer
    this.metricsBuffer.delete(investigationId);
  }

  /**
   * Record agent performance metrics
   * @param {string} investigationId - Investigation ID
   * @param {string} agentType - Type of agent
   * @param {Object} performance - Performance data
   */
  async recordAgentPerformance(investigationId, agentType, performance) {
    const metrics = this.metricsBuffer.get(investigationId);
    if (!metrics) {
      console.warn(`No metrics found for investigation ${investigationId}`);
      return;
    }

    if (!metrics.agentMetrics.has(agentType)) {
      metrics.agentMetrics.set(agentType, []);
    }

    metrics.agentMetrics.get(agentType).push({
      timestamp: Date.now(),
      duration: performance.duration,
      success: performance.success,
      confidence: performance.confidence,
      resourcesUsed: performance.resourcesUsed,
      errorType: performance.errorType,
      retryCount: performance.retryCount
    });
  }

  /**
   * Record API call performance
   * @param {string} investigationId - Investigation ID
   * @param {Object} apiCall - API call details
   */
  async recordApiCall(investigationId, apiCall) {
    const metrics = this.metricsBuffer.get(investigationId);
    if (metrics) {
      metrics.apiCallMetrics.push({
        timestamp: Date.now(),
        endpoint: apiCall.endpoint,
        method: apiCall.method,
        duration: apiCall.duration,
        status: apiCall.status,
        dataSource: apiCall.dataSource,
        recordsReturned: apiCall.recordsReturned,
        error: apiCall.error
      });
    }

    // Also record for immediate analysis
    await this._recordApiCallMetrics(investigationId, apiCall);
  }

  /**
   * Get performance metrics for investigation
   * @param {string} investigationId - Investigation ID
   * @returns {Object} Performance metrics
   */
  getInvestigationMetrics(investigationId) {
    return this.metricsBuffer.get(investigationId) || null;
  }

  /**
   * Get daily performance summary
   * @param {string} tenantId - Tenant ID
   * @param {Date} date - Date to get metrics for
   * @returns {Promise<Object>} Daily metrics
   */
  async getDailyMetrics(tenantId, date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];
    
    const result = await pool.query(
      'SELECT * FROM performance_metrics WHERE tenant_id = $1 AND date = $2',
      [tenantId, dateStr]
    );

    return result.rows[0] || null;
  }

  /**
   * Get performance trends
   * @param {string} tenantId - Tenant ID
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Array>} Performance trends
   */
  async getPerformanceTrends(tenantId, days = 30) {
    const result = await pool.query(`
      SELECT 
        date,
        accuracy,
        mtti_seconds,
        mttr_seconds,
        false_positive_rate,
        investigation_quality,
        total_investigations,
        correct_verdicts,
        false_positives
      FROM performance_metrics 
      WHERE tenant_id = $1 AND date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date ASC
    `, [tenantId]);

    return result.rows;
  }

  /**
   * Flush buffered metrics to database
   */
  async flushMetrics() {
    if (this.metricsBuffer.size === 0) {
      return;
    }

    const metricsToFlush = Array.from(this.metricsBuffer.entries())
      .filter(([_, metrics]) => {
        // Flush metrics older than 5 minutes or if buffer is full
        const age = Date.now() - metrics.startTime;
        return age > 300000 || this.metricsBuffer.size > this.maxBufferSize;
      });

    for (const [investigationId, metrics] of metricsToFlush) {
      try {
        await this._storePartialMetrics(investigationId, metrics);
        this.metricsBuffer.delete(investigationId);
      } catch (error) {
        console.error(`Failed to flush metrics for investigation ${investigationId}:`, error);
      }
    }
  }

  /**
   * Cleanup old metrics data
   * @param {number} retentionDays - Days to retain metrics
   */
  async cleanupOldMetrics(retentionDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      // Clean up detailed investigation metrics
      await pool.query(
        'DELETE FROM investigation_performance_metrics WHERE created_at < $1',
        [cutoffDate]
      );

      // Keep daily aggregates longer (1 year)
      const aggregateCutoff = new Date();
      aggregateCutoff.setDate(aggregateCutoff.getDate() - 365);
      
      await pool.query(
        'DELETE FROM performance_metrics WHERE date < $1',
        [aggregateCutoff.toISOString().split('T')[0]]
      );

      console.log(`Cleaned up metrics older than ${retentionDays} days`);
    } catch (error) {
      console.error('Failed to cleanup old metrics:', error);
    }
  }

  // Private methods

  async _storeInvestigationMetrics(investigationId, metrics) {
    try {
      await pool.query(`
        INSERT INTO investigation_performance_metrics (
          investigation_id, tenant_id, duration_ms, status, verdict, confidence,
          steps_completed, total_steps, memory_delta_mb, cpu_delta_ms,
          agent_metrics, api_call_metrics, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      `, [
        investigationId,
        metrics.tenantId,
        metrics.duration,
        metrics.status,
        metrics.verdict?.classification || null,
        metrics.confidence,
        metrics.stepsCompleted,
        metrics.totalSteps,
        Math.round(metrics.memoryDelta.heapUsed / 1024 / 1024), // Convert to MB
        Math.round((metrics.cpuDelta.user + metrics.cpuDelta.system) / 1000), // Convert to ms
        JSON.stringify(Object.fromEntries(metrics.agentMetrics)),
        JSON.stringify(metrics.apiCallMetrics)
      ]);
    } catch (error) {
      console.error(`Failed to store investigation metrics for ${investigationId}:`, error);
    }
  }

  async _storePartialMetrics(investigationId, metrics) {
    // Store partial metrics for ongoing investigations
    try {
      await pool.query(`
        INSERT INTO investigation_partial_metrics (
          investigation_id, tenant_id, elapsed_ms, agent_metrics, 
          api_call_metrics, memory_usage_mb, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (investigation_id) DO UPDATE SET
          elapsed_ms = EXCLUDED.elapsed_ms,
          agent_metrics = EXCLUDED.agent_metrics,
          api_call_metrics = EXCLUDED.api_call_metrics,
          memory_usage_mb = EXCLUDED.memory_usage_mb,
          created_at = NOW()
      `, [
        investigationId,
        metrics.tenantId,
        Date.now() - metrics.startTime,
        JSON.stringify(Object.fromEntries(metrics.agentMetrics)),
        JSON.stringify(metrics.apiCallMetrics),
        Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      ]);
    } catch (error) {
      console.error(`Failed to store partial metrics for ${investigationId}:`, error);
    }
  }

  async _updateDailyMetrics(tenantId, investigationData) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Get or create today's metrics
      let dailyMetrics = await pool.query(
        'SELECT * FROM performance_metrics WHERE tenant_id = $1 AND date = $2',
        [tenantId, today]
      );

      if (dailyMetrics.rows.length === 0) {
        // Create new daily record
        await pool.query(`
          INSERT INTO performance_metrics (
            tenant_id, date, total_investigations, correct_verdicts, false_positives,
            mtti_seconds, mttr_seconds, accuracy, false_positive_rate, investigation_quality
          ) VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0)
        `, [tenantId, today]);
        
        dailyMetrics = await pool.query(
          'SELECT * FROM performance_metrics WHERE tenant_id = $1 AND date = $2',
          [tenantId, today]
        );
      }

      const current = dailyMetrics.rows[0];
      const newTotal = current.total_investigations + 1;
      
      // Calculate updated metrics
      const isCorrect = investigationData.verdict === 'true_positive' || 
                       investigationData.verdict === 'false_positive';
      const isFalsePositive = investigationData.verdict === 'false_positive';
      
      const newCorrect = current.correct_verdicts + (isCorrect ? 1 : 0);
      const newFalsePositives = current.false_positives + (isFalsePositive ? 1 : 0);
      
      const newAccuracy = newTotal > 0 ? newCorrect / newTotal : 0;
      const newFPRate = newTotal > 0 ? newFalsePositives / newTotal : 0;
      
      // Update MTTI (Mean Time to Investigation) - weighted average
      const newMTTI = current.total_investigations > 0 
        ? Math.round((current.mtti_seconds * current.total_investigations + investigationData.duration / 1000) / newTotal)
        : Math.round(investigationData.duration / 1000);

      // Quality score based on confidence and accuracy
      const qualityScore = investigationData.confidence * newAccuracy;

      await pool.query(`
        UPDATE performance_metrics SET
          total_investigations = $3,
          correct_verdicts = $4,
          false_positives = $5,
          mtti_seconds = $6,
          accuracy = $7,
          false_positive_rate = $8,
          investigation_quality = $9,
          updated_at = NOW()
        WHERE tenant_id = $1 AND date = $2
      `, [
        tenantId, today, newTotal, newCorrect, newFalsePositives,
        newMTTI, newAccuracy, newFPRate, qualityScore
      ]);

    } catch (error) {
      console.error('Failed to update daily metrics:', error);
    }
  }

  async _recordApiCallMetrics(investigationId, apiCall) {
    try {
      await pool.query(`
        INSERT INTO api_performance_metrics (
          investigation_id, endpoint, method, duration_ms, status_code,
          data_source, records_returned, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        investigationId,
        apiCall.endpoint,
        apiCall.method,
        apiCall.duration,
        apiCall.status,
        apiCall.dataSource,
        apiCall.recordsReturned || 0,
        apiCall.error || null
      ]);
    } catch (error) {
      console.error('Failed to record API call metrics:', error);
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }
}

module.exports = { PerformanceMetricsCollector };