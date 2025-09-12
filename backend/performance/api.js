const express = require('express');
const { performanceManager } = require('./index');
const { auditLog } = require('../middleware/audit');

const router = express.Router();

/**
 * Performance Monitoring API Endpoints
 * 
 * Provides REST API access to performance monitoring and optimization features
 */

/**
 * GET /performance/status
 * Get current performance status
 */
router.get('/status', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const status = performanceManager.getPerformanceStatus(tenantId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Failed to get performance status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/analytics
 * Get performance analytics and trends
 */
router.get('/analytics', async (req, res) => {
  try {
    const { tenantId, days = 7 } = req.query;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId is required'
      });
    }
    
    const analytics = await performanceManager.getPerformanceAnalytics(
      parseInt(tenantId), 
      parseInt(days)
    );
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Failed to get performance analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/metrics/:investigationId
 * Get metrics for specific investigation
 */
router.get('/metrics/:investigationId', async (req, res) => {
  try {
    const { investigationId } = req.params;
    const metrics = performanceManager.metricsCollector.getInvestigationMetrics(investigationId);
    
    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: 'Investigation metrics not found'
      });
    }
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Failed to get investigation metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/queue
 * Get investigation queue status
 */
router.get('/queue', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const queueStats = performanceManager.queueManager.getQueueStats(tenantId);
    
    res.json({
      success: true,
      data: queueStats
    });
  } catch (error) {
    console.error('Failed to get queue status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/queue/:investigationId
 * Get queue status for specific investigation
 */
router.get('/queue/:investigationId', async (req, res) => {
  try {
    const { investigationId } = req.params;
    const queueStatus = performanceManager.queueManager.getQueueStatus(investigationId);
    
    if (!queueStatus) {
      return res.status(404).json({
        success: false,
        error: 'Investigation not found in queue'
      });
    }
    
    res.json({
      success: true,
      data: queueStatus
    });
  } catch (error) {
    console.error('Failed to get investigation queue status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/cache/stats
 * Get threat intelligence cache statistics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const cacheStats = performanceManager.threatIntelCache.getStats();
    
    res.json({
      success: true,
      data: cacheStats
    });
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /performance/cache
 * Clear threat intelligence cache
 */
router.delete('/cache', async (req, res) => {
  try {
    const { tenantId } = req.query;
    await performanceManager.threatIntelCache.clear(tenantId);
    
    // Log cache clear action
    await auditLog(req.user?.id, 'cache_cleared', {
      tenantId,
      clearedBy: req.user?.email
    });
    
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('Failed to clear cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/timeouts
 * Get timeout manager statistics
 */
router.get('/timeouts', async (req, res) => {
  try {
    const timeoutStats = performanceManager.timeoutManager.getStats();
    
    res.json({
      success: true,
      data: timeoutStats
    });
  } catch (error) {
    console.error('Failed to get timeout stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/timeouts/:investigationId
 * Get timeout status for specific investigation
 */
router.get('/timeouts/:investigationId', async (req, res) => {
  try {
    const { investigationId } = req.params;
    const timeoutStatus = performanceManager.timeoutManager.getTimeoutStatus(investigationId);
    
    if (!timeoutStatus) {
      return res.status(404).json({
        success: false,
        error: 'Investigation timeout not found'
      });
    }
    
    res.json({
      success: true,
      data: timeoutStatus
    });
  } catch (error) {
    console.error('Failed to get investigation timeout status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /performance/timeouts/:investigationId/extend
 * Extend investigation timeout
 */
router.put('/timeouts/:investigationId/extend', async (req, res) => {
  try {
    const { investigationId } = req.params;
    const { additionalMs } = req.body;
    
    if (!additionalMs || additionalMs <= 0) {
      return res.status(400).json({
        success: false,
        error: 'additionalMs must be a positive number'
      });
    }
    
    const extended = performanceManager.timeoutManager.extendTimeout(investigationId, additionalMs);
    
    if (!extended) {
      return res.status(404).json({
        success: false,
        error: 'Investigation timeout not found'
      });
    }
    
    // Log timeout extension
    await auditLog(req.user?.id, 'investigation_timeout_extended', {
      investigationId,
      additionalMs,
      extendedBy: req.user?.email
    });
    
    res.json({
      success: true,
      message: 'Timeout extended successfully'
    });
  } catch (error) {
    console.error('Failed to extend investigation timeout:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /performance/optimize
 * Run performance optimization
 */
router.post('/optimize', async (req, res) => {
  try {
    const options = req.body || {};
    const results = await performanceManager.optimizePerformance(options);
    
    // Log optimization action
    await auditLog(req.user?.id, 'performance_optimization_run', {
      options,
      results,
      optimizedBy: req.user?.email
    });
    
    res.json({
      success: true,
      data: results,
      message: 'Performance optimization completed'
    });
  } catch (error) {
    console.error('Failed to run performance optimization:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/database/analysis
 * Get database performance analysis
 */
router.get('/database/analysis', async (req, res) => {
  try {
    const analysis = await performanceManager.databaseOptimizer.analyzeQueryPerformance();
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Failed to get database analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /performance/database/optimize
 * Run database optimization
 */
router.post('/database/optimize', async (req, res) => {
  try {
    const results = await performanceManager.databaseOptimizer.runOptimization();
    
    // Log database optimization
    await auditLog(req.user?.id, 'database_optimization_run', {
      results,
      optimizedBy: req.user?.email
    });
    
    res.json({
      success: true,
      data: results,
      message: 'Database optimization completed'
    });
  } catch (error) {
    console.error('Failed to run database optimization:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /performance/health
 * Get overall system health status
 */
router.get('/health', async (req, res) => {
  try {
    const status = performanceManager.getPerformanceStatus();
    
    // Determine overall health
    const isHealthy = status.overall === 'healthy';
    const hasWarnings = status.alerts && status.alerts.some(alert => alert.severity === 'warning');
    const hasCritical = status.alerts && status.alerts.some(alert => alert.severity === 'critical');
    
    res.status(isHealthy ? 200 : (hasCritical ? 503 : 200)).json({
      success: true,
      healthy: isHealthy,
      status: status.overall,
      warnings: hasWarnings,
      critical: hasCritical,
      data: {
        timestamp: status.timestamp,
        components: status,
        alerts: status.alerts || []
      }
    });
  } catch (error) {
    console.error('Failed to get health status:', error);
    res.status(500).json({
      success: false,
      healthy: false,
      error: error.message
    });
  }
});

module.exports = router;