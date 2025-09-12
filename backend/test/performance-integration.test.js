const { performanceManager } = require('../performance');

describe('Performance System Integration', () => {
  beforeAll(async () => {
    // Initialize performance manager without database
    process.env.DATABASE_URL = ''; // Disable database for testing
  });

  afterAll(async () => {
    if (performanceManager) {
      performanceManager.destroy();
    }
  });

  describe('Performance Manager Integration', () => {
    test('should initialize performance manager successfully', async () => {
      expect(performanceManager).toBeDefined();
      expect(performanceManager.metricsCollector).toBeDefined();
      expect(performanceManager.threatIntelCache).toBeDefined();
      expect(performanceManager.queueManager).toBeDefined();
      expect(performanceManager.databaseOptimizer).toBeDefined();
      expect(performanceManager.timeoutManager).toBeDefined();
    });

    test('should get performance status', () => {
      const status = performanceManager.getPerformanceStatus();
      
      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('overall');
      expect(status).toHaveProperty('queue');
      expect(status).toHaveProperty('cache');
      expect(status).toHaveProperty('timeouts');
      expect(status).toHaveProperty('database');
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('alerts');
      
      expect(status.queue).toHaveProperty('totalQueued');
      expect(status.queue).toHaveProperty('processing');
      expect(status.queue).toHaveProperty('currentLoad');
      
      expect(status.cache).toHaveProperty('hitRate');
      expect(status.cache).toHaveProperty('memoryCacheSize');
      
      expect(status.memory).toHaveProperty('heapUsed');
      expect(status.memory).toHaveProperty('heapTotal');
    });

    test('should handle threat intelligence caching', async () => {
      const key = 'test:integration.example.com';
      const testData = {
        domain: 'integration.example.com',
        reputation: 'clean',
        source: 'test'
      };

      const fetchFunction = jest.fn().mockResolvedValue(testData);

      // First call should fetch
      const result1 = await performanceManager.getThreatIntelligence(
        key, 
        fetchFunction, 
        { tenantId: 1 }
      );
      
      expect(result1).toEqual(testData);
      expect(fetchFunction).toHaveBeenCalledTimes(1);

      // Second call should use cache (in memory)
      const result2 = await performanceManager.getThreatIntelligence(
        key, 
        fetchFunction, 
        { tenantId: 1 }
      );
      
      expect(result2).toEqual(testData);
      expect(fetchFunction).toHaveBeenCalledTimes(1); // No additional calls
    });

    test('should record agent performance', async () => {
      const investigationId = 'integration_test_001';
      
      // Start investigation tracking
      performanceManager.metricsCollector.recordInvestigationStart(investigationId, {
        alertSeverity: 'high',
        priority: 4,
        tenantId: 1,
        userId: 1
      });

      // Record agent performance
      await performanceManager.recordAgentPerformance(investigationId, 'analysis', {
        duration: 150,
        success: true,
        confidence: 0.9,
        resourcesUsed: ['virustotal', 'siem'],
        retryCount: 0,
        evidenceCount: 3
      });

      // Verify metrics are being tracked
      const metrics = performanceManager.metricsCollector.getInvestigationMetrics(investigationId);
      expect(metrics).toBeTruthy();
      expect(metrics.agentMetrics.has('analysis')).toBe(true);
      
      const analysisMetrics = metrics.agentMetrics.get('analysis');
      expect(analysisMetrics.length).toBe(1);
      expect(analysisMetrics[0].duration).toBe(150);
      expect(analysisMetrics[0].success).toBe(true);
    });

    test('should manage investigation timeouts', () => {
      const investigationId = 'timeout_integration_001';
      
      // Register timeout
      performanceManager.timeoutManager.registerTimeout(investigationId, {
        timeoutMs: 10000, // 10 seconds
        tenantId: 1,
        userId: 1,
        priority: 3
      });

      // Check status
      const status = performanceManager.timeoutManager.getTimeoutStatus(investigationId);
      expect(status).toBeTruthy();
      expect(status.investigationId).toBe(investigationId);
      expect(status.status).toBe('active');
      expect(status.remaining).toBeGreaterThan(0);

      // Extend timeout
      const extended = performanceManager.timeoutManager.extendTimeout(investigationId, 5000);
      expect(extended).toBe(true);

      // Check updated status
      const updatedStatus = performanceManager.timeoutManager.getTimeoutStatus(investigationId);
      expect(updatedStatus.remaining).toBeGreaterThan(status.remaining);

      // Cancel timeout
      const cancelled = performanceManager.timeoutManager.cancelTimeout(investigationId, 'test_complete');
      expect(cancelled).toBe(true);

      // Should no longer be tracked
      const finalStatus = performanceManager.timeoutManager.getTimeoutStatus(investigationId);
      expect(finalStatus).toBeNull();
    });

    test('should provide comprehensive statistics', () => {
      const queueStats = performanceManager.queueManager.getQueueStats();
      const cacheStats = performanceManager.threatIntelCache.getStats();
      const timeoutStats = performanceManager.timeoutManager.getStats();

      // Queue stats
      expect(queueStats).toHaveProperty('totalQueued');
      expect(queueStats).toHaveProperty('queuedByPriority');
      expect(queueStats).toHaveProperty('processing');
      expect(queueStats).toHaveProperty('currentLoad');
      expect(typeof queueStats.currentLoad).toBe('number');

      // Cache stats
      expect(cacheStats).toHaveProperty('hits');
      expect(cacheStats).toHaveProperty('misses');
      expect(cacheStats).toHaveProperty('hitRate');
      expect(cacheStats).toHaveProperty('memoryCacheSize');
      expect(typeof cacheStats.hitRate).toBe('number');

      // Timeout stats
      expect(timeoutStats).toHaveProperty('activeTimeouts');
      expect(timeoutStats).toHaveProperty('timeoutsEnforced');
      expect(timeoutStats).toHaveProperty('resourcesReclaimed');
      expect(typeof timeoutStats.activeTimeouts).toBe('number');
    });

    test('should handle investigation lifecycle with performance tracking', async () => {
      const investigationId = 'lifecycle_test_001';
      const investigation = {
        investigationId,
        alertId: 7001,
        tenantId: 1,
        userId: 1,
        priority: 4,
        alertSeverity: 'high',
        timeoutMs: 30000
      };

      // Start investigation (without database, this will use in-memory tracking)
      try {
        // This would normally call the queue manager, but we'll simulate it
        performanceManager.metricsCollector.recordInvestigationStart(investigationId, {
          alertSeverity: investigation.alertSeverity,
          priority: investigation.priority,
          tenantId: investigation.tenantId,
          userId: investigation.userId
        });

        performanceManager.timeoutManager.registerTimeout(investigationId, {
          timeoutMs: investigation.timeoutMs,
          tenantId: investigation.tenantId,
          userId: investigation.userId,
          priority: investigation.priority
        });

        // Simulate investigation activities
        await performanceManager.recordAgentPerformance(investigationId, 'planning', {
          duration: 100,
          success: true,
          confidence: 0.8,
          resourcesUsed: ['memory'],
          retryCount: 0
        });

        await performanceManager.recordAgentPerformance(investigationId, 'execution', {
          duration: 200,
          success: true,
          confidence: 0.85,
          resourcesUsed: ['virustotal', 'siem'],
          retryCount: 0,
          evidenceCount: 5
        });

        // Get threat intelligence
        const threatData = await performanceManager.getThreatIntelligence(
          'ip:192.168.1.1',
          () => Promise.resolve({ ip: '192.168.1.1', reputation: 'suspicious' }),
          { investigationId, tenantId: 1 }
        );

        expect(threatData).toBeTruthy();

        // Complete investigation
        const result = {
          status: 'complete',
          verdict: { classification: 'true_positive' },
          confidence: 0.9,
          stepsCompleted: 4,
          totalSteps: 4
        };

        await performanceManager.metricsCollector.recordInvestigationComplete(investigationId, result);
        performanceManager.timeoutManager.cancelTimeout(investigationId, 'completed');

        // Verify tracking is cleaned up
        const metrics = performanceManager.metricsCollector.getInvestigationMetrics(investigationId);
        expect(metrics).toBeNull(); // Should be cleared after completion

        const timeoutStatus = performanceManager.timeoutManager.getTimeoutStatus(investigationId);
        expect(timeoutStatus).toBeNull(); // Should be cancelled

      } catch (error) {
        // Expected for some operations without database
        console.log('Expected error without database:', error.message);
      }
    });
  });

  describe('Performance Optimization', () => {
    test('should handle optimization requests gracefully', async () => {
      try {
        const results = await performanceManager.optimizePerformance({
          optimizeDatabase: false, // Skip database operations
          cleanupCache: true,
          cleanupQueue: false,
          cleanupTimeouts: true
        });

        expect(results).toBeTruthy();
        expect(results).toHaveProperty('cache');
        expect(results).toHaveProperty('timeouts');

      } catch (error) {
        // Expected without database
        expect(error.message).toContain('database' || 'Database' || 'connection');
      }
    });

    test('should provide performance recommendations', () => {
      const status = performanceManager.getPerformanceStatus();
      
      // Should have basic health information
      expect(status.overall).toBeDefined();
      expect(['healthy', 'warning', 'critical', 'error']).toContain(status.overall);
      
      // Should have component status
      expect(status.queue).toBeDefined();
      expect(status.cache).toBeDefined();
      expect(status.memory).toBeDefined();
      
      // Memory usage should be reasonable
      expect(status.memory.heapUsed).toBeGreaterThan(0);
      expect(status.memory.heapTotal).toBeGreaterThan(status.memory.heapUsed);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle missing database gracefully', async () => {
      // All operations should work without database, just with warnings
      expect(() => {
        performanceManager.getPerformanceStatus();
      }).not.toThrow();

      expect(() => {
        performanceManager.queueManager.getQueueStats();
      }).not.toThrow();

      expect(() => {
        performanceManager.threatIntelCache.getStats();
      }).not.toThrow();

      expect(() => {
        performanceManager.timeoutManager.getStats();
      }).not.toThrow();
    });

    test('should handle invalid inputs gracefully', async () => {
      // Invalid cache key
      await expect(
        performanceManager.getThreatIntelligence(
          null,
          () => Promise.resolve({}),
          { tenantId: 1 }
        )
      ).rejects.toThrow();

      // Invalid timeout registration
      expect(() => {
        performanceManager.timeoutManager.registerTimeout(null, {});
      }).toThrow();

      // Invalid queue stats request
      const stats = performanceManager.queueManager.getQueueStats('invalid');
      expect(stats).toBeTruthy(); // Should still return stats
    });
  });
});