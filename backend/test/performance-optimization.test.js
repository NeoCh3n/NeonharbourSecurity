const { PerformanceMetricsCollector } = require('../performance/metrics-collector');
const { ThreatIntelCache } = require('../performance/threat-intel-cache');
const { InvestigationQueueManager } = require('../performance/queue-manager');
const { DatabaseOptimizer } = require('../performance/database-optimizer');
const { TimeoutManager } = require('../performance/timeout-manager');
const { pool } = require('../database');

describe('Performance Optimization System', () => {
  let metricsCollector;
  let threatIntelCache;
  let queueManager;
  let databaseOptimizer;
  let timeoutManager;

  beforeAll(async () => {
    // Initialize performance components
    metricsCollector = new PerformanceMetricsCollector();
    threatIntelCache = new ThreatIntelCache();
    queueManager = new InvestigationQueueManager();
    databaseOptimizer = new DatabaseOptimizer();
    timeoutManager = new TimeoutManager();

    // Ensure test database tables exist
    await databaseOptimizer.createEvidenceIndexes();
  });

  afterAll(async () => {
    // Cleanup
    if (metricsCollector) metricsCollector.destroy();
    if (threatIntelCache) threatIntelCache.destroy();
    if (queueManager) queueManager.destroy();
    if (databaseOptimizer) databaseOptimizer.destroy();
    if (timeoutManager) timeoutManager.destroy();
  });

  describe('Performance Metrics Collection', () => {
    test('should record investigation metrics', async () => {
      const investigationId = 'test_inv_001';
      const context = {
        alertSeverity: 'high',
        priority: 4,
        tenantId: 1,
        userId: 1
      };

      // Record start
      await metricsCollector.recordInvestigationStart(investigationId, context);
      
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Record agent performance
      await metricsCollector.recordAgentPerformance(investigationId, 'analysis', {
        duration: 50,
        success: true,
        confidence: 0.85,
        resourcesUsed: ['virustotal', 'siem'],
        retryCount: 0
      });

      // Record API call
      await metricsCollector.recordApiCall(investigationId, {
        endpoint: 'https://api.virustotal.com/v3/ip_addresses/1.2.3.4',
        method: 'GET',
        duration: 250,
        status: 200,
        dataSource: 'virustotal',
        recordsReturned: 1
      });

      // Record completion
      const result = {
        status: 'complete',
        verdict: { classification: 'true_positive' },
        confidence: 0.85,
        stepsCompleted: 5,
        totalSteps: 5
      };
      
      await metricsCollector.recordInvestigationComplete(investigationId, result);

      // Verify metrics were recorded
      const metrics = metricsCollector.getInvestigationMetrics(investigationId);
      expect(metrics).toBeNull(); // Should be cleared after completion

      // Check if daily metrics were updated
      const dailyMetrics = await metricsCollector.getDailyMetrics(1);
      expect(dailyMetrics).toBeTruthy();
      expect(dailyMetrics.total_investigations).toBeGreaterThan(0);
    });

    test('should track performance trends', async () => {
      const trends = await metricsCollector.getPerformanceTrends(1, 7);
      expect(Array.isArray(trends)).toBe(true);
    });

    test('should flush metrics periodically', async () => {
      const investigationId = 'test_inv_002';
      const context = {
        alertSeverity: 'medium',
        priority: 3,
        tenantId: 1,
        userId: 1
      };

      await metricsCollector.recordInvestigationStart(investigationId, context);
      
      // Force flush
      await metricsCollector.flushMetrics();
      
      // Metrics should still be available for ongoing investigation
      const metrics = metricsCollector.getInvestigationMetrics(investigationId);
      expect(metrics).toBeTruthy();
    });
  });

  describe('Threat Intelligence Cache', () => {
    test('should cache and retrieve threat intelligence data', async () => {
      const key = 'ip:192.168.1.100';
      const testData = {
        ip: '192.168.1.100',
        reputation: 'clean',
        country: 'US',
        asn: 'AS12345'
      };

      // Mock fetch function
      const fetchFunction = jest.fn().mockResolvedValue(testData);

      // First call should fetch and cache
      const result1 = await threatIntelCache.get(key, fetchFunction, { tenantId: 1 });
      expect(result1).toEqual(testData);
      expect(fetchFunction).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await threatIntelCache.get(key, fetchFunction, { tenantId: 1 });
      expect(result2).toEqual(testData);
      expect(fetchFunction).toHaveBeenCalledTimes(1); // No additional calls

      // Verify cache stats
      const stats = threatIntelCache.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    test('should handle cache expiration', async () => {
      const key = 'hash:abc123def456';
      const testData = { hash: 'abc123def456', malicious: false };
      const fetchFunction = jest.fn().mockResolvedValue(testData);

      // Cache with very short TTL
      await threatIntelCache.set(key, testData, { ttl: 1, tenantId: 1 });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should fetch fresh data
      const result = await threatIntelCache.get(key, fetchFunction, { tenantId: 1 });
      expect(result).toEqual(testData);
      expect(fetchFunction).toHaveBeenCalled();
    });

    test('should warm cache with multiple keys', async () => {
      const keys = ['ip:1.1.1.1', 'ip:8.8.8.8', 'ip:9.9.9.9'];
      const fetchFunction = jest.fn().mockImplementation((key) => {
        const ip = key.split(':')[1];
        return Promise.resolve({ ip, reputation: 'clean' });
      });

      await threatIntelCache.warmCache(keys, fetchFunction, { 
        batchSize: 2, 
        tenantId: 1 
      });

      expect(fetchFunction).toHaveBeenCalledTimes(3);

      // Verify all keys are cached
      for (const key of keys) {
        const mockFetch = jest.fn();
        const result = await threatIntelCache.get(key, mockFetch, { tenantId: 1 });
        expect(result).toBeTruthy();
        expect(mockFetch).not.toHaveBeenCalled(); // Should use cache
      }
    });

    test('should handle cache patterns', async () => {
      // Set up some test data
      await threatIntelCache.set('ip:10.0.0.1', { ip: '10.0.0.1' }, { tenantId: 1 });
      await threatIntelCache.set('ip:10.0.0.2', { ip: '10.0.0.2' }, { tenantId: 1 });
      await threatIntelCache.set('hash:test123', { hash: 'test123' }, { tenantId: 1 });

      const ipEntries = await threatIntelCache.getByPattern('ip:*', 1);
      expect(ipEntries.length).toBeGreaterThanOrEqual(2);
      expect(ipEntries.every(entry => entry.key.startsWith('ip:'))).toBe(true);
    });
  });

  describe('Investigation Queue Manager', () => {
    test('should queue investigations with priority', async () => {
      const investigation1 = {
        investigationId: 'queue_test_001',
        alertId: 1001,
        tenantId: 1,
        userId: 1,
        priority: 3,
        alertSeverity: 'medium'
      };

      const investigation2 = {
        investigationId: 'queue_test_002',
        alertId: 1002,
        tenantId: 1,
        userId: 1,
        priority: 5,
        alertSeverity: 'critical'
      };

      // Queue investigations
      const entry1 = await queueManager.enqueue(investigation1);
      const entry2 = await queueManager.enqueue(investigation2);

      expect(entry1.priority).toBe(5); // Should be boosted due to medium severity
      expect(entry2.priority).toBe(5); // Critical severity

      // Check queue status
      const status1 = queueManager.getQueueStatus('queue_test_001');
      const status2 = queueManager.getQueueStatus('queue_test_002');

      expect(status1.status).toBe('queued');
      expect(status2.status).toBe('queued');

      // Higher priority should have better position
      expect(status2.position).toBeLessThanOrEqual(status1.position);
    });

    test('should enforce tenant limits', async () => {
      const investigations = [];
      
      // Create investigations up to tenant limit
      for (let i = 0; i < 6; i++) { // Assuming maxPerTenant is 5
        const investigation = {
          investigationId: `tenant_limit_${i}`,
          alertId: 2000 + i,
          tenantId: 2,
          userId: 1,
          priority: 3
        };

        if (i < 5) {
          const entry = await queueManager.enqueue(investigation);
          investigations.push(entry);
        } else {
          // This should fail due to tenant limit
          await expect(queueManager.enqueue(investigation))
            .rejects.toThrow(/maximum concurrent investigations/);
        }
      }

      expect(investigations.length).toBe(5);
    });

    test('should provide queue statistics', async () => {
      const stats = queueManager.getQueueStats();
      
      expect(stats).toHaveProperty('totalQueued');
      expect(stats).toHaveProperty('queuedByPriority');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('currentLoad');
      expect(typeof stats.currentLoad).toBe('number');
    });

    test('should handle investigation completion', async () => {
      const investigationId = 'completion_test_001';
      const investigation = {
        investigationId,
        alertId: 3001,
        tenantId: 1,
        userId: 1,
        priority: 3
      };

      await queueManager.enqueue(investigation);
      
      // Simulate completion
      const result = { status: 'complete', verdict: 'true_positive' };
      await queueManager.completeInvestigation(investigationId, result);

      // Should no longer be in queue
      const status = queueManager.getQueueStatus(investigationId);
      expect(status).toBeNull();
    });
  });

  describe('Database Optimizer', () => {
    test('should create evidence indexes', async () => {
      await databaseOptimizer.createEvidenceIndexes();
      
      // Verify some indexes exist
      const result = await pool.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename IN ('investigation_evidence', 'evidence_relationships')
        AND indexname LIKE 'idx_%'
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('should analyze query performance', async () => {
      const analysis = await databaseOptimizer.analyzeQueryPerformance();
      
      if (analysis) {
        expect(analysis).toHaveProperty('tableStats');
        expect(analysis).toHaveProperty('indexUsage');
        expect(analysis).toHaveProperty('recommendations');
        expect(Array.isArray(analysis.tableStats)).toBe(true);
      }
    });

    test('should optimize tables', async () => {
      await databaseOptimizer.optimizeTables();
      
      const stats = databaseOptimizer.getOptimizationStats();
      expect(stats.tablesAnalyzed).toBeGreaterThan(0);
    });

    test('should monitor connection pool', async () => {
      const connStats = await databaseOptimizer.optimizeConnectionPool();
      
      if (connStats) {
        expect(connStats).toHaveProperty('total_connections');
        expect(connStats).toHaveProperty('active_connections');
        expect(connStats).toHaveProperty('idle_connections');
      }
    });
  });

  describe('Timeout Manager', () => {
    test('should register and track investigation timeouts', async () => {
      const investigationId = 'timeout_test_001';
      
      timeoutManager.registerTimeout(investigationId, {
        timeoutMs: 5000, // 5 seconds
        tenantId: 1,
        userId: 1,
        priority: 3
      });

      const status = timeoutManager.getTimeoutStatus(investigationId);
      expect(status).toBeTruthy();
      expect(status.investigationId).toBe(investigationId);
      expect(status.status).toBe('active');
      expect(status.remaining).toBeGreaterThan(0);
    });

    test('should extend investigation timeout', async () => {
      const investigationId = 'timeout_test_002';
      
      timeoutManager.registerTimeout(investigationId, {
        timeoutMs: 1000,
        tenantId: 1,
        userId: 1
      });

      const initialStatus = timeoutManager.getTimeoutStatus(investigationId);
      const initialRemaining = initialStatus.remaining;

      // Extend timeout
      const extended = timeoutManager.extendTimeout(investigationId, 2000);
      expect(extended).toBe(true);

      const newStatus = timeoutManager.getTimeoutStatus(investigationId);
      expect(newStatus.remaining).toBeGreaterThan(initialRemaining);
    });

    test('should cancel investigation timeout', async () => {
      const investigationId = 'timeout_test_003';
      
      timeoutManager.registerTimeout(investigationId, {
        timeoutMs: 5000,
        tenantId: 1,
        userId: 1
      });

      const cancelled = timeoutManager.cancelTimeout(investigationId, 'completed');
      expect(cancelled).toBe(true);

      const status = timeoutManager.getTimeoutStatus(investigationId);
      expect(status).toBeNull();
    });

    test('should record resource usage', async () => {
      const investigationId = 'resource_test_001';
      
      timeoutManager.registerTimeout(investigationId, {
        timeoutMs: 10000,
        tenantId: 1,
        userId: 1
      });

      // Record some resource usage
      timeoutManager.recordResourceUsage(investigationId, {
        apiCall: true
      });

      timeoutManager.recordResourceUsage(investigationId, {
        evidenceAdded: 5
      });

      const stats = timeoutManager.getStats();
      expect(stats.totalResourceUsage.apiCalls).toBeGreaterThan(0);
      expect(stats.totalResourceUsage.evidence).toBeGreaterThan(0);
    });

    test('should provide timeout statistics', async () => {
      const stats = timeoutManager.getStats();
      
      expect(stats).toHaveProperty('activeTimeouts');
      expect(stats).toHaveProperty('totalResourceUsage');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('resourceLimits');
      expect(typeof stats.activeTimeouts).toBe('number');
    });
  });

  describe('Concurrent Investigation Performance', () => {
    test('should handle multiple concurrent investigations', async () => {
      const concurrentCount = 5;
      const investigations = [];

      // Create multiple investigations
      for (let i = 0; i < concurrentCount; i++) {
        const investigationId = `concurrent_${i}`;
        const investigation = {
          investigationId,
          alertId: 4000 + i,
          tenantId: 1,
          userId: 1,
          priority: Math.floor(Math.random() * 5) + 1,
          alertSeverity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)]
        };

        investigations.push(investigation);
      }

      // Queue all investigations
      const startTime = Date.now();
      const queuePromises = investigations.map(inv => queueManager.enqueue(inv));
      const queueResults = await Promise.all(queuePromises);
      const queueTime = Date.now() - startTime;

      expect(queueResults.length).toBe(concurrentCount);
      expect(queueTime).toBeLessThan(1000); // Should queue quickly

      // Register timeouts for all
      const timeoutPromises = investigations.map(inv => {
        timeoutManager.registerTimeout(inv.investigationId, {
          timeoutMs: 30000,
          tenantId: inv.tenantId,
          userId: inv.userId,
          priority: inv.priority
        });
        
        return metricsCollector.recordInvestigationStart(inv.investigationId, {
          alertSeverity: inv.alertSeverity,
          priority: inv.priority,
          tenantId: inv.tenantId,
          userId: inv.userId
        });
      });

      await Promise.all(timeoutPromises);

      // Verify all are tracked
      const queueStats = queueManager.getQueueStats();
      const timeoutStats = timeoutManager.getStats();

      expect(queueStats.totalQueued).toBeGreaterThanOrEqual(concurrentCount);
      expect(timeoutStats.activeTimeouts).toBeGreaterThanOrEqual(concurrentCount);

      // Cleanup
      for (const inv of investigations) {
        timeoutManager.cancelTimeout(inv.investigationId, 'test_cleanup');
        await queueManager.dequeue(inv.investigationId, 'test_cleanup');
      }
    });

    test('should maintain performance under load', async () => {
      const loadTestCount = 20;
      const operations = [];

      // Mix of different operations
      for (let i = 0; i < loadTestCount; i++) {
        const opType = i % 4;
        
        switch (opType) {
          case 0: // Cache operations
            operations.push(async () => {
              const key = `load_test_ip:10.0.${Math.floor(i/256)}.${i%256}`;
              const data = { ip: key.split(':')[1], reputation: 'unknown' };
              await threatIntelCache.set(key, data, { tenantId: 1 });
              return threatIntelCache.get(key, () => Promise.resolve(data), { tenantId: 1 });
            });
            break;
            
          case 1: // Queue operations
            operations.push(async () => {
              const investigation = {
                investigationId: `load_test_${i}`,
                alertId: 5000 + i,
                tenantId: 1,
                userId: 1,
                priority: (i % 5) + 1
              };
              
              try {
                await queueManager.enqueue(investigation);
                await queueManager.dequeue(investigation.investigationId, 'load_test');
              } catch (error) {
                // May fail due to limits, that's ok
              }
            });
            break;
            
          case 2: // Metrics operations
            operations.push(async () => {
              const investigationId = `metrics_load_${i}`;
              await metricsCollector.recordInvestigationStart(investigationId, {
                alertSeverity: 'medium',
                priority: 3,
                tenantId: 1,
                userId: 1
              });
              
              await metricsCollector.recordInvestigationComplete(investigationId, {
                status: 'complete',
                verdict: { classification: 'false_positive' },
                confidence: 0.7,
                stepsCompleted: 3,
                totalSteps: 3
              });
            });
            break;
            
          case 3: // Timeout operations
            operations.push(async () => {
              const investigationId = `timeout_load_${i}`;
              timeoutManager.registerTimeout(investigationId, {
                timeoutMs: 1000,
                tenantId: 1,
                userId: 1
              });
              
              // Simulate some activity
              timeoutManager.recordResourceUsage(investigationId, { apiCall: true });
              
              // Cancel quickly
              setTimeout(() => {
                timeoutManager.cancelTimeout(investigationId, 'load_test');
              }, 100);
            });
            break;
        }
      }

      // Execute all operations concurrently
      const startTime = Date.now();
      await Promise.all(operations.map(op => op()));
      const totalTime = Date.now() - startTime;

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds max

      console.log(`Load test completed: ${loadTestCount} operations in ${totalTime}ms`);
    });
  });

  describe('Performance Monitoring Integration', () => {
    test('should integrate all performance components', async () => {
      const investigationId = 'integration_test_001';
      
      // Start investigation with all components
      const investigation = {
        investigationId,
        alertId: 6001,
        tenantId: 1,
        userId: 1,
        priority: 4,
        alertSeverity: 'high'
      };

      // Queue investigation
      await queueManager.enqueue(investigation);
      
      // Register timeout
      timeoutManager.registerTimeout(investigationId, {
        timeoutMs: 30000,
        tenantId: 1,
        userId: 1,
        priority: 4
      });

      // Start metrics collection
      await metricsCollector.recordInvestigationStart(investigationId, {
        alertSeverity: 'high',
        priority: 4,
        tenantId: 1,
        userId: 1
      });

      // Simulate investigation activities
      const cacheKey = 'integration:test.domain.com';
      const threatData = await threatIntelCache.get(
        cacheKey,
        () => Promise.resolve({ domain: 'test.domain.com', reputation: 'suspicious' }),
        { tenantId: 1 }
      );

      // Record activities
      await metricsCollector.recordAgentPerformance(investigationId, 'analysis', {
        duration: 150,
        success: true,
        confidence: 0.9,
        resourcesUsed: ['cache'],
        retryCount: 0
      });

      timeoutManager.recordResourceUsage(investigationId, {
        apiCall: true,
        evidenceAdded: 3
      });

      // Complete investigation
      await queueManager.completeInvestigation(investigationId, {
        status: 'complete',
        verdict: 'true_positive'
      });

      await metricsCollector.recordInvestigationComplete(investigationId, {
        status: 'complete',
        verdict: { classification: 'true_positive' },
        confidence: 0.9,
        stepsCompleted: 4,
        totalSteps: 4
      });

      timeoutManager.cancelTimeout(investigationId, 'completed');

      // Verify integration worked
      expect(threatData).toBeTruthy();
      
      const queueStatus = queueManager.getQueueStatus(investigationId);
      expect(queueStatus).toBeNull(); // Should be completed

      const timeoutStatus = timeoutManager.getTimeoutStatus(investigationId);
      expect(timeoutStatus).toBeNull(); // Should be cancelled

      const cacheStats = threatIntelCache.getStats();
      expect(cacheStats.hits).toBeGreaterThan(0);
    });
  });
});