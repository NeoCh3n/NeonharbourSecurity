const { pool } = require('../database');
const { auditInvestigationAction, generateTraceId } = require('../middleware/audit');

/**
 * Investigation Timeout and Resource Cleanup Manager
 * 
 * Manages investigation timeouts and resource cleanup:
 * - Investigation timeout enforcement
 * - Resource cleanup for expired investigations
 * - Memory and connection leak prevention
 * - Graceful shutdown handling
 * - Resource monitoring and alerts
 */
class TimeoutManager {
  constructor() {
    this.timeouts = new Map(); // investigationId -> timeout info
    this.cleanupInterval = parseInt(process.env.TIMEOUT_CHECK_INTERVAL_MS || '30000', 10); // 30 seconds
    this.defaultTimeoutMs = parseInt(process.env.INVESTIGATION_TIMEOUT_MS || '1800000', 10); // 30 minutes
    this.gracePeriodMs = parseInt(process.env.TIMEOUT_GRACE_PERIOD_MS || '60000', 10); // 1 minute
    
    // Resource limits
    this.resourceLimits = {
      maxMemoryMB: parseInt(process.env.MAX_INVESTIGATION_MEMORY_MB || '512', 10),
      maxConcurrentApiCalls: parseInt(process.env.MAX_CONCURRENT_API_CALLS || '50', 10),
      maxEvidenceItems: parseInt(process.env.MAX_EVIDENCE_ITEMS || '10000', 10)
    };
    
    // Statistics
    this.stats = {
      timeoutsEnforced: 0,
      resourcesReclaimed: 0,
      gracefulShutdowns: 0,
      forcedTerminations: 0,
      memoryLeaksDetected: 0
    };
    
    // Active resource tracking
    this.resourceUsage = new Map(); // investigationId -> resource info
    
    // Start monitoring
    this.monitoringTimer = setInterval(() => this.checkTimeouts(), this.cleanupInterval);
    this.resourceTimer = setInterval(() => this.monitorResources(), this.cleanupInterval * 2);
    
    // Handle process signals for graceful shutdown
    this._setupSignalHandlers();
  }

  /**
   * Register investigation timeout
   * @param {string} investigationId - Investigation ID
   * @param {Object} options - Timeout options
   */
  registerTimeout(investigationId, options = {}) {
    const {
      timeoutMs = this.defaultTimeoutMs,
      tenantId,
      userId,
      priority = 3,
      onTimeout = null,
      onWarning = null
    } = options;

    const now = Date.now();
    const warningTime = now + (timeoutMs * 0.8); // 80% of timeout
    const timeoutTime = now + timeoutMs;
    const graceTime = timeoutTime + this.gracePeriodMs;

    const timeoutInfo = {
      investigationId,
      tenantId,
      userId,
      priority,
      startTime: now,
      warningTime,
      timeoutTime,
      graceTime,
      timeoutMs,
      onTimeout,
      onWarning,
      warningIssued: false,
      status: 'active'
    };

    this.timeouts.set(investigationId, timeoutInfo);
    
    // Initialize resource tracking
    this.resourceUsage.set(investigationId, {
      memoryUsage: process.memoryUsage(),
      apiCallCount: 0,
      evidenceCount: 0,
      startTime: now,
      lastCheck: now
    });

    console.log(`Registered timeout for investigation ${investigationId}: ${timeoutMs}ms`);
  }

  /**
   * Update investigation timeout
   * @param {string} investigationId - Investigation ID
   * @param {number} additionalMs - Additional time in milliseconds
   */
  extendTimeout(investigationId, additionalMs) {
    const timeoutInfo = this.timeouts.get(investigationId);
    if (!timeoutInfo) {
      console.warn(`No timeout registered for investigation ${investigationId}`);
      return false;
    }

    const now = Date.now();
    timeoutInfo.timeoutTime += additionalMs;
    timeoutInfo.graceTime += additionalMs;
    timeoutInfo.timeoutMs += additionalMs;

    // Reset warning if we're extending significantly
    if (additionalMs > timeoutInfo.timeoutMs * 0.2) {
      timeoutInfo.warningIssued = false;
      timeoutInfo.warningTime = now + (additionalMs * 0.8);
    }

    console.log(`Extended timeout for investigation ${investigationId} by ${additionalMs}ms`);
    return true;
  }

  /**
   * Cancel investigation timeout
   * @param {string} investigationId - Investigation ID
   * @param {string} reason - Reason for cancellation
   */
  cancelTimeout(investigationId, reason = 'completed') {
    const timeoutInfo = this.timeouts.get(investigationId);
    if (timeoutInfo) {
      timeoutInfo.status = 'cancelled';
      timeoutInfo.cancelReason = reason;
      timeoutInfo.cancelTime = Date.now();
      
      // Clean up resources
      this._cleanupInvestigationResources(investigationId);
      
      console.log(`Cancelled timeout for investigation ${investigationId}: ${reason}`);
    }
    
    return !!timeoutInfo;
  }

  /**
   * Record resource usage for investigation
   * @param {string} investigationId - Investigation ID
   * @param {Object} usage - Resource usage data
   */
  recordResourceUsage(investigationId, usage) {
    const resourceInfo = this.resourceUsage.get(investigationId);
    if (!resourceInfo) {
      return;
    }

    const now = Date.now();
    
    // Update counters
    if (usage.apiCall) {
      resourceInfo.apiCallCount++;
    }
    
    if (usage.evidenceAdded) {
      resourceInfo.evidenceCount += usage.evidenceAdded;
    }
    
    // Update memory usage
    resourceInfo.memoryUsage = process.memoryUsage();
    resourceInfo.lastCheck = now;
    
    // Check for resource limit violations
    this._checkResourceLimits(investigationId, resourceInfo);
  }

  /**
   * Get timeout status for investigation
   * @param {string} investigationId - Investigation ID
   * @returns {Object|null} Timeout status
   */
  getTimeoutStatus(investigationId) {
    const timeoutInfo = this.timeouts.get(investigationId);
    if (!timeoutInfo) {
      return null;
    }

    const now = Date.now();
    const elapsed = now - timeoutInfo.startTime;
    const remaining = Math.max(0, timeoutInfo.timeoutTime - now);
    
    return {
      investigationId,
      status: timeoutInfo.status,
      elapsed,
      remaining,
      timeoutMs: timeoutInfo.timeoutMs,
      progress: Math.min(100, (elapsed / timeoutInfo.timeoutMs) * 100),
      warningIssued: timeoutInfo.warningIssued,
      isExpired: now > timeoutInfo.timeoutTime
    };
  }

  /**
   * Check for timed out investigations
   */
  async checkTimeouts() {
    const now = Date.now();
    const expiredInvestigations = [];
    const warningInvestigations = [];

    for (const [investigationId, timeoutInfo] of this.timeouts.entries()) {
      if (timeoutInfo.status !== 'active') {
        continue;
      }

      // Check for grace period expiration (force termination)
      if (now > timeoutInfo.graceTime) {
        expiredInvestigations.push({ ...timeoutInfo, type: 'force' });
        continue;
      }

      // Check for timeout expiration (graceful termination)
      if (now > timeoutInfo.timeoutTime) {
        expiredInvestigations.push({ ...timeoutInfo, type: 'graceful' });
        continue;
      }

      // Check for warning time
      if (!timeoutInfo.warningIssued && now > timeoutInfo.warningTime) {
        warningInvestigations.push(timeoutInfo);
      }
    }

    // Issue warnings
    for (const timeoutInfo of warningInvestigations) {
      await this._issueTimeoutWarning(timeoutInfo);
    }

    // Handle expired investigations
    for (const timeoutInfo of expiredInvestigations) {
      await this._handleTimeout(timeoutInfo);
    }

    // Clean up old timeout records
    this._cleanupOldTimeouts();
  }

  /**
   * Monitor resource usage across all investigations
   */
  async monitorResources() {
    const now = Date.now();
    const memoryUsage = process.memoryUsage();
    
    // Check global memory usage
    const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
    if (memoryMB > this.resourceLimits.maxMemoryMB * 2) {
      console.warn(`High memory usage detected: ${Math.round(memoryMB)}MB`);
      await this._handleMemoryPressure();
    }

    // Check individual investigation resource usage
    for (const [investigationId, resourceInfo] of this.resourceUsage.entries()) {
      const age = now - resourceInfo.startTime;
      
      // Check for stale investigations (no activity for 10 minutes)
      if (now - resourceInfo.lastCheck > 600000) {
        console.warn(`Stale investigation detected: ${investigationId} (${Math.round(age / 60000)} minutes old)`);
        await this._handleStaleInvestigation(investigationId);
      }
      
      // Check for resource leaks
      const investigationMemoryMB = (resourceInfo.memoryUsage.heapUsed - process.memoryUsage().heapUsed) / 1024 / 1024;
      if (investigationMemoryMB > this.resourceLimits.maxMemoryMB) {
        console.warn(`Memory leak detected in investigation ${investigationId}: ${Math.round(investigationMemoryMB)}MB`);
        this.stats.memoryLeaksDetected++;
        await this._handleMemoryLeak(investigationId);
      }
    }
  }

  /**
   * Force cleanup of all resources
   */
  async forceCleanup() {
    console.log('Forcing cleanup of all investigation resources...');
    
    const activeTimeouts = Array.from(this.timeouts.values())
      .filter(timeout => timeout.status === 'active');
    
    for (const timeoutInfo of activeTimeouts) {
      await this._handleTimeout({ ...timeoutInfo, type: 'force' });
    }
    
    // Clear all tracking
    this.timeouts.clear();
    this.resourceUsage.clear();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    console.log('Force cleanup completed');
  }

  /**
   * Get timeout and resource statistics
   */
  getStats() {
    const activeTimeouts = Array.from(this.timeouts.values())
      .filter(timeout => timeout.status === 'active').length;
    
    const totalResourceUsage = Array.from(this.resourceUsage.values())
      .reduce((acc, usage) => ({
        apiCalls: acc.apiCalls + usage.apiCallCount,
        evidence: acc.evidence + usage.evidenceCount
      }), { apiCalls: 0, evidence: 0 });

    return {
      ...this.stats,
      activeTimeouts,
      totalResourceUsage,
      memoryUsage: process.memoryUsage(),
      resourceLimits: this.resourceLimits
    };
  }

  // Private methods

  async _handleTimeout(timeoutInfo) {
    const { investigationId, type, tenantId, userId } = timeoutInfo;
    
    try {
      if (type === 'graceful') {
        console.log(`Investigation ${investigationId} timed out, attempting graceful shutdown...`);
        await this._gracefulShutdown(investigationId, tenantId, userId);
        this.stats.gracefulShutdowns++;
      } else {
        console.log(`Investigation ${investigationId} force terminated after grace period`);
        await this._forceTermination(investigationId, tenantId, userId);
        this.stats.forcedTerminations++;
      }
      
      this.stats.timeoutsEnforced++;
      timeoutInfo.status = 'expired';
      timeoutInfo.expiredAt = Date.now();
      
    } catch (error) {
      console.error(`Failed to handle timeout for investigation ${investigationId}:`, error);
    }
  }

  async _gracefulShutdown(investigationId, tenantId, userId) {
    // Update investigation status
    await pool.query(
      'UPDATE investigations SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['expired', investigationId, tenantId]
    );

    // Log timeout event
    await auditInvestigationAction(
      investigationId,
      'investigation_timeout',
      {
        reason: 'timeout_exceeded',
        graceful: true,
        traceId: generateTraceId()
      },
      userId,
      tenantId
    );

    // Clean up resources
    this._cleanupInvestigationResources(investigationId);
  }

  async _forceTermination(investigationId, tenantId, userId) {
    // Force update investigation status
    await pool.query(
      'UPDATE investigations SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['failed', investigationId, tenantId]
    );

    // Log forced termination
    await auditInvestigationAction(
      investigationId,
      'investigation_force_terminated',
      {
        reason: 'grace_period_exceeded',
        forced: true,
        traceId: generateTraceId()
      },
      userId,
      tenantId
    );

    // Aggressive resource cleanup
    this._cleanupInvestigationResources(investigationId, true);
  }

  async _issueTimeoutWarning(timeoutInfo) {
    const { investigationId, onWarning, tenantId, userId } = timeoutInfo;
    
    timeoutInfo.warningIssued = true;
    
    console.log(`Timeout warning issued for investigation ${investigationId}`);
    
    // Call custom warning handler if provided
    if (onWarning && typeof onWarning === 'function') {
      try {
        await onWarning(investigationId, timeoutInfo);
      } catch (error) {
        console.error(`Warning handler failed for investigation ${investigationId}:`, error);
      }
    }
    
    // Log warning
    await auditInvestigationAction(
      investigationId,
      'investigation_timeout_warning',
      {
        remainingMs: timeoutInfo.timeoutTime - Date.now(),
        traceId: generateTraceId()
      },
      userId,
      tenantId
    );
  }

  _checkResourceLimits(investigationId, resourceInfo) {
    const violations = [];
    
    // Check API call limit
    if (resourceInfo.apiCallCount > this.resourceLimits.maxConcurrentApiCalls) {
      violations.push({
        type: 'api_calls',
        current: resourceInfo.apiCallCount,
        limit: this.resourceLimits.maxConcurrentApiCalls
      });
    }
    
    // Check evidence limit
    if (resourceInfo.evidenceCount > this.resourceLimits.maxEvidenceItems) {
      violations.push({
        type: 'evidence_items',
        current: resourceInfo.evidenceCount,
        limit: this.resourceLimits.maxEvidenceItems
      });
    }
    
    // Check memory usage
    const memoryMB = resourceInfo.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryMB > this.resourceLimits.maxMemoryMB) {
      violations.push({
        type: 'memory',
        current: Math.round(memoryMB),
        limit: this.resourceLimits.maxMemoryMB
      });
    }
    
    if (violations.length > 0) {
      console.warn(`Resource limit violations for investigation ${investigationId}:`, violations);
      this._handleResourceViolations(investigationId, violations);
    }
  }

  async _handleResourceViolations(investigationId, violations) {
    // For now, just log and extend timeout slightly
    // In production, might want to pause or throttle the investigation
    
    const timeoutInfo = this.timeouts.get(investigationId);
    if (timeoutInfo && timeoutInfo.status === 'active') {
      // Extend timeout by 5 minutes to allow cleanup
      this.extendTimeout(investigationId, 300000);
    }
  }

  async _handleMemoryPressure() {
    console.log('Handling memory pressure...');
    
    // Find investigations using the most memory
    const investigations = Array.from(this.resourceUsage.entries())
      .sort((a, b) => b[1].memoryUsage.heapUsed - a[1].memoryUsage.heapUsed)
      .slice(0, 3); // Top 3 memory users
    
    for (const [investigationId, resourceInfo] of investigations) {
      console.log(`Requesting cleanup for high-memory investigation: ${investigationId}`);
      // Could implement investigation-specific cleanup here
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  async _handleStaleInvestigation(investigationId) {
    const timeoutInfo = this.timeouts.get(investigationId);
    if (timeoutInfo && timeoutInfo.status === 'active') {
      console.log(`Marking stale investigation as expired: ${investigationId}`);
      await this._handleTimeout({ ...timeoutInfo, type: 'graceful' });
    }
  }

  async _handleMemoryLeak(investigationId) {
    const timeoutInfo = this.timeouts.get(investigationId);
    if (timeoutInfo && timeoutInfo.status === 'active') {
      console.log(`Terminating investigation with memory leak: ${investigationId}`);
      await this._handleTimeout({ ...timeoutInfo, type: 'force' });
    }
  }

  _cleanupInvestigationResources(investigationId, aggressive = false) {
    // Remove from tracking
    this.timeouts.delete(investigationId);
    this.resourceUsage.delete(investigationId);
    
    this.stats.resourcesReclaimed++;
    
    if (aggressive) {
      // Could implement more aggressive cleanup here
      // e.g., clearing caches, closing connections, etc.
    }
    
    console.log(`Cleaned up resources for investigation ${investigationId}`);
  }

  _cleanupOldTimeouts() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    for (const [investigationId, timeoutInfo] of this.timeouts.entries()) {
      if (timeoutInfo.status !== 'active' && 
          (timeoutInfo.expiredAt || timeoutInfo.cancelTime || timeoutInfo.startTime) < cutoffTime) {
        this.timeouts.delete(investigationId);
      }
    }
  }

  _setupSignalHandlers() {
    const gracefulShutdown = async (signal) => {
      console.log(`Received ${signal}, performing graceful shutdown...`);
      
      // Stop timers
      if (this.monitoringTimer) clearInterval(this.monitoringTimer);
      if (this.resourceTimer) clearInterval(this.resourceTimer);
      
      // Force cleanup
      await this.forceCleanup();
      
      console.log('Timeout manager shutdown complete');
      process.exit(0);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    if (this.resourceTimer) {
      clearInterval(this.resourceTimer);
    }
    
    this.timeouts.clear();
    this.resourceUsage.clear();
  }
}

module.exports = { TimeoutManager };