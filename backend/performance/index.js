const { PerformanceMetricsCollector } = require('./metrics-collector');
const { ThreatIntelCache } = require('./threat-intel-cache');
const { InvestigationQueueManager } = require('./queue-manager');
const { DatabaseOptimizer } = require('./database-optimizer');
const { TimeoutManager } = require('./timeout-manager');

/**
 * Performance Management System
 * 
 * Central coordinator for all performance optimization components:
 * - Metrics collection and analysis
 * - Threat intelligence caching
 * - Investigation queue management
 * - Database optimization
 * - Timeout and resource management
 */
class PerformanceManager {
  constructor() {
    this.metricsCollector = new PerformanceMetricsCollector();
    this.threatIntelCache = new ThreatIntelCache();
    this.queueManager = new InvestigationQueueManager();
    this.databaseOptimizer = new DatabaseOptimizer();
    this.timeoutManager = new TimeoutManager();
    
    this.initialized = false;
    this.healthCheckInterval = parseInt(process.env.PERFORMANCE_HEALTH_CHECK_MS || '60000', 10);
    
    // Performance thresholds for alerts
    this.thresholds = {
      maxQueueWaitTime: parseInt(process.env.MAX_QUEUE_WAIT_TIME_MS || '300000', 10), // 5 minutes
      maxMemoryUsageMB: parseInt(process.env.MAX_MEMORY_USAGE_MB || '1024', 10), // 1GB
      minCacheHitRate: parseFloat(process.env.MIN_CACHE_HIT_RATE || '0.7'), // 70%
      maxActiveInvestigations: parseInt(process.env.MAX_ACTIVE_INVESTIGATIONS || '50', 10)
    };
    
    // Health status
    this.healthStatus = {
      overall: 'healthy',
      components: {},
      lastCheck: null,
      alerts: []
    };
  }

  /**
   * Initialize the performance management system
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    console.log('Initializing Performance Management System...');

    try {
      // Initialize database optimizations
      await this.databaseOptimizer.createEvidenceIndexes();
      
      // Warm up threat intelligence cache with common indicators
      await this._warmupCache();
      
      // Start health monitoring
      this.healthTimer = setInterval(() => this._performHealthCheck(), this.healthCheckInterval);
      
      this.initialized = true;
      console.log('Performance Management System initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Performance Management System:', error);
      throw error;
    }
  }

  /**
   * Start investigation with performance monitoring
   * @param {Object} investigation - Investigation details
   * @returns {Promise<Object>} Investigation with performance tracking
   */
  async startInvestigation(investigation) {
    const { investigationId, alertId, tenantId, userId, priority, alertSeverity, timeoutMs } = investigation;

    try {
      // Queue the investigation
      const queueEntry = await this.queueManager.enqueue({
        investigationId,
        alertId,
        tenantId,
        userId,
        priority,
        alertSeverity
      });

      // Register timeout monitoring
      this.timeoutManager.registerTimeout(investigationId, {
        timeoutMs: timeoutMs || 1800000, // 30 minutes default
        tenantId,
        userId,
        priority,
        onTimeout: async (id) => {
          console.warn(`Investigation ${id} timed out`);
          await this._handleInvestigationTimeout(id);
        },
        onWarning: async (id) => {
          console.warn(`Investigation ${id} approaching timeout`);
        }
      });

      // Start metrics collection
      await this.metricsCollector.recordInvestigationStart(investigationId, {
        alertSeverity,
        priority,
        tenantId,
        userId
      });

      return {
        ...queueEntry,
        performanceTracking: {
          queuePosition: queueEntry.metadata.queuePosition,
          estimatedWaitTime: this._estimateWaitTime(queueEntry),
          timeoutRegistered: true,
          metricsEnabled: true
        }
      };

    } catch (error) {
      console.error(`Failed to start investigation ${investigationId} with performance monitoring:`, error);
      throw error;
    }
  }

  /**
   * Complete investigation with performance recording
   * @param {string} investigationId - Investigation ID
   * @param {Object} result - Investigation result
   */
  async completeInvestigation(investigationId, result) {
    try {
      // Complete in queue manager
      await this.queueManager.completeInvestigation(investigationId, result);
      
      // Record final metrics
      await this.metricsCollector.recordInvestigationComplete(investigationId, result);
      
      // Cancel timeout monitoring
      this.timeoutManager.cancelTimeout(investigationId, 'completed');
      
      console.log(`Investigation ${investigationId} completed with performance tracking`);
      
    } catch (error) {
      console.error(`Failed to complete investigation ${investigationId}:`, error);
      throw error;
    }
  }

  /**
   * Fail investigation with performance recording
   * @param {string} investigationId - Investigation ID
   * @param {Error} error - Error that occurred
   */
  async failInvestigation(investigationId, error) {
    try {
      // Fail in queue manager
      await this.queueManager.failInvestigation(investigationId, error);
      
      // Record failure metrics
      await this.metricsCollector.recordInvestigationComplete(investigationId, {
        status: 'failed',
        error: error.message,
        stepsCompleted: 0,
        totalSteps: 1
      });
      
      // Cancel timeout monitoring
      this.timeoutManager.cancelTimeout(investigationId, 'failed');
      
    } catch (err) {
      console.error(`Failed to record investigation failure for ${investigationId}:`, err);
    }
  }

  /**
   * Get cached threat intelligence with performance tracking
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to fetch if not cached
   * @param {Object} options - Options
   * @returns {Promise<Object>} Threat intelligence data
   */
  async getThreatIntelligence(key, fetchFunction, options = {}) {
    const { investigationId, tenantId } = options;
    
    try {
      const startTime = Date.now();
      
      const data = await this.threatIntelCache.get(key, fetchFunction, {
        tenantId,
        ...options
      });
      
      const duration = Date.now() - startTime;
      
      // Record API call metrics if part of investigation
      if (investigationId) {
        await this.metricsCollector.recordApiCall(investigationId, {
          endpoint: `cache:${key}`,
          method: 'GET',
          duration,
          status: data ? 200 : 404,
          dataSource: 'cache',
          recordsReturned: data ? 1 : 0
        });
        
        this.timeoutManager.recordResourceUsage(investigationId, {
          apiCall: true
        });
      }
      
      return data;
      
    } catch (error) {
      console.error(`Failed to get threat intelligence for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Record agent performance
   * @param {string} investigationId - Investigation ID
   * @param {string} agentType - Type of agent
   * @param {Object} performance - Performance data
   */
  async recordAgentPerformance(investigationId, agentType, performance) {
    try {
      await this.metricsCollector.recordAgentPerformance(investigationId, agentType, performance);
      
      // Update resource usage
      this.timeoutManager.recordResourceUsage(investigationId, {
        evidenceAdded: performance.evidenceCount || 0
      });
      
    } catch (error) {
      console.error(`Failed to record agent performance for ${investigationId}:`, error);
    }
  }

  /**
   * Get comprehensive performance status
   * @param {string} tenantId - Optional tenant filter
   * @returns {Object} Performance status
   */
  getPerformanceStatus(tenantId = null) {
    try {
      const queueStats = this.queueManager.getQueueStats(tenantId);
      const cacheStats = this.threatIntelCache.getStats();
      const timeoutStats = this.timeoutManager.getStats();
      const optimizerStats = this.databaseOptimizer.getOptimizationStats();
      
      return {
        timestamp: new Date().toISOString(),
        overall: this.healthStatus.overall,
        queue: {
          totalQueued: queueStats.totalQueued,
          processing: queueStats.processing,
          currentLoad: queueStats.currentLoad,
          averageWaitTime: queueStats.averageWaitTime
        },
        cache: {
          hitRate: cacheStats.hitRate,
          memoryCacheSize: cacheStats.memoryCacheSize,
          hits: cacheStats.hits,
          misses: cacheStats.misses
        },
        timeouts: {
          activeTimeouts: timeoutStats.activeTimeouts,
          timeoutsEnforced: timeoutStats.timeoutsEnforced,
          resourcesReclaimed: timeoutStats.resourcesReclaimed
        },
        database: {
          lastOptimization: optimizerStats.lastOptimization,
          indexesCreated: optimizerStats.indexesCreated,
          tablesAnalyzed: optimizerStats.tablesAnalyzed
        },
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        alerts: this.healthStatus.alerts
      };
      
    } catch (error) {
      console.error('Failed to get performance status:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get performance trends and analytics
   * @param {string} tenantId - Tenant ID
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Object>} Performance analytics
   */
  async getPerformanceAnalytics(tenantId, days = 7) {
    try {
      const trends = await this.metricsCollector.getPerformanceTrends(tenantId, days);
      const queueStats = this.queueManager.getQueueStats(tenantId);
      const cacheStats = this.threatIntelCache.getStats();
      
      // Calculate performance insights
      const insights = this._calculatePerformanceInsights(trends, queueStats, cacheStats);
      
      return {
        trends,
        currentMetrics: {
          queue: queueStats,
          cache: cacheStats
        },
        insights,
        recommendations: this._generatePerformanceRecommendations(insights)
      };
      
    } catch (error) {
      console.error('Failed to get performance analytics:', error);
      throw error;
    }
  }

  /**
   * Optimize system performance
   * @param {Object} options - Optimization options
   * @returns {Promise<Object>} Optimization results
   */
  async optimizePerformance(options = {}) {
    const { 
      optimizeDatabase = true,
      cleanupCache = true,
      cleanupQueue = true,
      cleanupTimeouts = true
    } = options;

    console.log('Starting performance optimization...');
    const results = {};

    try {
      if (optimizeDatabase) {
        results.database = await this.databaseOptimizer.runOptimization();
      }

      if (cleanupCache) {
        await this.threatIntelCache.clear();
        results.cache = { cleared: true };
      }

      if (cleanupQueue) {
        await this.queueManager.cleanupOldEntries();
        results.queue = { cleaned: true };
      }

      if (cleanupTimeouts) {
        await this.timeoutManager.forceCleanup();
        results.timeouts = { cleaned: true };
      }

      console.log('Performance optimization completed');
      return results;

    } catch (error) {
      console.error('Performance optimization failed:', error);
      throw error;
    }
  }

  // Private methods

  async _warmupCache() {
    try {
      // Common threat intelligence keys to warm up
      const commonKeys = [
        'ip:8.8.8.8',
        'ip:1.1.1.1',
        'domain:google.com',
        'domain:microsoft.com'
      ];

      const mockFetch = (key) => {
        const [type, value] = key.split(':');
        return Promise.resolve({
          [type]: value,
          reputation: 'clean',
          cached: true
        });
      };

      await this.threatIntelCache.warmCache(commonKeys, mockFetch, {
        batchSize: 2,
        tenantId: null // Global cache
      });

      console.log('Threat intelligence cache warmed up');
    } catch (error) {
      console.error('Failed to warm up cache:', error);
    }
  }

  async _performHealthCheck() {
    try {
      const status = this.getPerformanceStatus();
      const alerts = [];

      // Check queue health
      if (status.queue.currentLoad > 90) {
        alerts.push({
          type: 'high_queue_load',
          severity: 'warning',
          message: `Queue load is ${status.queue.currentLoad}%`,
          timestamp: new Date().toISOString()
        });
      }

      // Check cache health
      if (status.cache.hitRate < this.thresholds.minCacheHitRate * 100) {
        alerts.push({
          type: 'low_cache_hit_rate',
          severity: 'warning',
          message: `Cache hit rate is ${status.cache.hitRate}%`,
          timestamp: new Date().toISOString()
        });
      }

      // Check memory usage
      if (status.memory.heapUsed > this.thresholds.maxMemoryUsageMB) {
        alerts.push({
          type: 'high_memory_usage',
          severity: 'critical',
          message: `Memory usage is ${status.memory.heapUsed}MB`,
          timestamp: new Date().toISOString()
        });
      }

      // Update health status
      this.healthStatus = {
        overall: alerts.some(a => a.severity === 'critical') ? 'critical' : 
                alerts.some(a => a.severity === 'warning') ? 'warning' : 'healthy',
        components: {
          queue: status.queue.currentLoad < 80 ? 'healthy' : 'warning',
          cache: status.cache.hitRate >= this.thresholds.minCacheHitRate * 100 ? 'healthy' : 'warning',
          memory: status.memory.heapUsed < this.thresholds.maxMemoryUsageMB ? 'healthy' : 'critical',
          timeouts: status.timeouts.activeTimeouts < this.thresholds.maxActiveInvestigations ? 'healthy' : 'warning'
        },
        lastCheck: new Date().toISOString(),
        alerts
      };

      // Log critical alerts
      alerts.forEach(alert => {
        if (alert.severity === 'critical') {
          console.error(`Performance Alert: ${alert.message}`);
        } else if (alert.severity === 'warning') {
          console.warn(`Performance Warning: ${alert.message}`);
        }
      });

    } catch (error) {
      console.error('Health check failed:', error);
      this.healthStatus.overall = 'error';
    }
  }

  async _handleInvestigationTimeout(investigationId) {
    try {
      // Force fail the investigation
      await this.failInvestigation(investigationId, new Error('Investigation timeout'));
      
      console.log(`Investigation ${investigationId} handled due to timeout`);
    } catch (error) {
      console.error(`Failed to handle timeout for investigation ${investigationId}:`, error);
    }
  }

  _estimateWaitTime(queueEntry) {
    // Simple estimation based on queue position and average processing time
    const avgProcessingTime = 300000; // 5 minutes
    const position = queueEntry.metadata.queuePosition || 1;
    
    return position * avgProcessingTime;
  }

  _calculatePerformanceInsights(trends, queueStats, cacheStats) {
    const insights = {};

    if (trends.length > 1) {
      const latest = trends[trends.length - 1];
      const previous = trends[trends.length - 2];

      insights.accuracyTrend = latest.accuracy - previous.accuracy;
      insights.mttiTrend = latest.mtti_seconds - previous.mtti_seconds;
      insights.fpRateTrend = latest.false_positive_rate - previous.false_positive_rate;
    }

    insights.queueEfficiency = queueStats.currentLoad < 70 ? 'good' : 
                              queueStats.currentLoad < 90 ? 'moderate' : 'poor';
    
    insights.cacheEfficiency = cacheStats.hitRate > 80 ? 'excellent' :
                              cacheStats.hitRate > 60 ? 'good' : 'poor';

    return insights;
  }

  _generatePerformanceRecommendations(insights) {
    const recommendations = [];

    if (insights.queueEfficiency === 'poor') {
      recommendations.push({
        type: 'queue',
        priority: 'high',
        message: 'Consider increasing investigation processing capacity or optimizing investigation steps'
      });
    }

    if (insights.cacheEfficiency === 'poor') {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        message: 'Review cache TTL settings and consider warming up more frequently accessed data'
      });
    }

    if (insights.mttiTrend > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Mean time to investigation is increasing, review investigation efficiency'
      });
    }

    return recommendations;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }

    if (this.metricsCollector) this.metricsCollector.destroy();
    if (this.threatIntelCache) this.threatIntelCache.destroy();
    if (this.queueManager) this.queueManager.destroy();
    if (this.databaseOptimizer) this.databaseOptimizer.destroy();
    if (this.timeoutManager) this.timeoutManager.destroy();

    this.initialized = false;
  }
}

// Create singleton instance
const performanceManager = new PerformanceManager();

module.exports = {
  PerformanceManager,
  performanceManager,
  PerformanceMetricsCollector,
  ThreatIntelCache,
  InvestigationQueueManager,
  DatabaseOptimizer,
  TimeoutManager
};