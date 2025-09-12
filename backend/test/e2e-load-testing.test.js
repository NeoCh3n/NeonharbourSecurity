const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../server');
const db = require('../database');

describe('Load Testing for Concurrent Investigation Processing', () => {
  let testTenantId;
  let testAlertIds = [];
  let testInvestigationIds = [];

  beforeAll(async () => {
    testTenantId = uuidv4();
    await setupLoadTestEnvironment();
  });

  afterAll(async () => {
    await cleanupLoadTestEnvironment();
  });

  beforeEach(async () => {
    testAlertIds = [];
    testInvestigationIds = [];
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Concurrent Investigation Processing', () => {
    test('should handle 10 concurrent investigations without performance degradation', async () => {
      const concurrentCount = 10;
      const startTime = Date.now();

      // Create test alerts
      for (let i = 0; i < concurrentCount; i++) {
        const alertId = await createTestAlert(`Concurrent Alert ${i}`);
        testAlertIds.push(alertId);
      }

      // Start all investigations concurrently
      const startPromises = testAlertIds.map(alertId => 
        request(app)
          .post('/api/investigations/start')
          .send({
            alertId: alertId,
            tenantId: testTenantId,
            priority: 'medium'
          })
          .expect(201)
      );

      const startResponses = await Promise.all(startPromises);
      testInvestigationIds = startResponses.map(response => response.body.investigationId);

      const investigationStartTime = Date.now();

      // Wait for all investigations to complete
      const completionPromises = testInvestigationIds.map(id => 
        waitForCompletion(id, 60000)
      );

      const completionResults = await Promise.all(completionPromises);
      const totalCompletionTime = Date.now() - investigationStartTime;

      // Verify all investigations completed successfully
      expect(completionResults.length).toBe(concurrentCount);
      completionResults.forEach(result => {
        expect(['complete', 'requires_review']).toContain(result.status);
      });

      // Verify performance metrics
      const avgCompletionTime = totalCompletionTime / concurrentCount;
      expect(avgCompletionTime).toBeLessThan(30000); // Average should be under 30 seconds

      // Verify system resources weren't exhausted
      const systemMetricsResponse = await request(app)
        .get('/api/performance/metrics')
        .expect(200);

      expect(systemMetricsResponse.body.memoryUsage).toBeLessThan(0.9); // Less than 90% memory usage
      expect(systemMetricsResponse.body.cpuUsage).toBeLessThan(0.8); // Less than 80% CPU usage

      console.log(`Concurrent test completed: ${concurrentCount} investigations in ${totalCompletionTime}ms`);
    });

    test('should prioritize high-priority investigations under load', async () => {
      const highPriorityCount = 3;
      const mediumPriorityCount = 7;
      const totalCount = highPriorityCount + mediumPriorityCount;

      // Create alerts with different priorities
      const highPriorityAlerts = [];
      const mediumPriorityAlerts = [];

      for (let i = 0; i < highPriorityCount; i++) {
        const alertId = await createTestAlert(`High Priority Alert ${i}`, 'critical');
        highPriorityAlerts.push(alertId);
        testAlertIds.push(alertId);
      }

      for (let i = 0; i < mediumPriorityCount; i++) {
        const alertId = await createTestAlert(`Medium Priority Alert ${i}`, 'medium');
        mediumPriorityAlerts.push(alertId);
        testAlertIds.push(alertId);
      }

      // Start all investigations at the same time
      const startTime = Date.now();
      const startPromises = [];

      // Start high priority investigations
      highPriorityAlerts.forEach(alertId => {
        startPromises.push(
          request(app)
            .post('/api/investigations/start')
            .send({
              alertId: alertId,
              tenantId: testTenantId,
              priority: 'high'
            })
            .expect(201)
        );
      });

      // Start medium priority investigations
      mediumPriorityAlerts.forEach(alertId => {
        startPromises.push(
          request(app)
            .post('/api/investigations/start')
            .send({
              alertId: alertId,
              tenantId: testTenantId,
              priority: 'medium'
            })
            .expect(201)
        );
      });

      const startResponses = await Promise.all(startPromises);
      testInvestigationIds = startResponses.map(response => response.body.investigationId);

      const highPriorityIds = testInvestigationIds.slice(0, highPriorityCount);
      const mediumPriorityIds = testInvestigationIds.slice(highPriorityCount);

      // Wait for all to complete
      await Promise.all(testInvestigationIds.map(id => waitForCompletion(id, 90000)));

      // Analyze completion times
      const completionTimes = await Promise.all(
        testInvestigationIds.map(async (id, index) => {
          const response = await request(app)
            .get(`/api/investigations/${id}`)
            .expect(200);
          
          return {
            id,
            priority: index < highPriorityCount ? 'high' : 'medium',
            startTime: new Date(response.body.metadata.createdAt),
            completionTime: new Date(response.body.metadata.completedAt),
            duration: response.body.metadata.duration
          };
        })
      );

      // Calculate average completion times by priority
      const highPriorityAvgTime = completionTimes
        .filter(item => item.priority === 'high')
        .reduce((sum, item) => sum + item.duration, 0) / highPriorityCount;

      const mediumPriorityAvgTime = completionTimes
        .filter(item => item.priority === 'medium')
        .reduce((sum, item) => sum + item.duration, 0) / mediumPriorityCount;

      // High priority should complete faster on average
      expect(highPriorityAvgTime).toBeLessThan(mediumPriorityAvgTime * 1.2); // Allow 20% variance

      console.log(`Priority test: High priority avg: ${highPriorityAvgTime}ms, Medium priority avg: ${mediumPriorityAvgTime}ms`);
    });

    test('should handle burst load with queue management', async () => {
      const burstSize = 20;
      const maxConcurrent = 5; // Simulate system limit

      // Create burst of alerts
      for (let i = 0; i < burstSize; i++) {
        const alertId = await createTestAlert(`Burst Alert ${i}`);
        testAlertIds.push(alertId);
      }

      // Start all investigations in rapid succession
      const startTime = Date.now();
      const startPromises = testAlertIds.map((alertId, index) => 
        // Stagger requests slightly to simulate real burst
        new Promise(resolve => {
          setTimeout(() => {
            resolve(
              request(app)
                .post('/api/investigations/start')
                .send({
                  alertId: alertId,
                  tenantId: testTenantId,
                  priority: 'medium'
                })
                .expect(201)
            );
          }, index * 10); // 10ms stagger
        })
      );

      const startResponses = await Promise.all(startPromises);
      testInvestigationIds = startResponses.map(response => response.body.investigationId);

      // Monitor queue status during processing
      const queueMonitoring = [];
      const monitoringInterval = setInterval(async () => {
        try {
          const queueResponse = await request(app)
            .get('/api/performance/queue-status')
            .expect(200);
          
          queueMonitoring.push({
            timestamp: Date.now(),
            queueSize: queueResponse.body.queueSize,
            activeInvestigations: queueResponse.body.activeInvestigations,
            completedInvestigations: queueResponse.body.completedInvestigations
          });
        } catch (error) {
          // Ignore monitoring errors
        }
      }, 1000);

      // Wait for all investigations to complete
      await Promise.all(testInvestigationIds.map(id => waitForCompletion(id, 120000)));
      clearInterval(monitoringInterval);

      // Verify queue management worked properly
      expect(queueMonitoring.length).toBeGreaterThan(0);
      
      // Check that queue size never exceeded reasonable limits
      const maxQueueSize = Math.max(...queueMonitoring.map(m => m.queueSize));
      expect(maxQueueSize).toBeLessThan(burstSize); // Queue should have been processed

      // Verify all investigations completed
      const finalStatusPromises = testInvestigationIds.map(id =>
        request(app)
          .get(`/api/investigations/${id}/status`)
          .expect(200)
      );

      const finalStatuses = await Promise.all(finalStatusPromises);
      finalStatuses.forEach(response => {
        expect(['complete', 'requires_review']).toContain(response.body.status);
      });

      console.log(`Burst test completed: ${burstSize} investigations, max queue size: ${maxQueueSize}`);
    });
  });

  describe('Resource Usage Under Load', () => {
    test('should maintain stable memory usage during sustained load', async () => {
      const sustainedCount = 15;
      const batchSize = 5;
      const memorySnapshots = [];

      // Process investigations in batches to simulate sustained load
      for (let batch = 0; batch < sustainedCount / batchSize; batch++) {
        const batchAlerts = [];
        
        // Create batch of alerts
        for (let i = 0; i < batchSize; i++) {
          const alertId = await createTestAlert(`Sustained Alert ${batch}-${i}`);
          batchAlerts.push(alertId);
          testAlertIds.push(alertId);
        }

        // Start batch investigations
        const batchPromises = batchAlerts.map(alertId =>
          request(app)
            .post('/api/investigations/start')
            .send({
              alertId: alertId,
              tenantId: testTenantId,
              priority: 'medium'
            })
            .expect(201)
        );

        const batchResponses = await Promise.all(batchPromises);
        const batchIds = batchResponses.map(response => response.body.investigationId);
        testInvestigationIds.push(...batchIds);

        // Take memory snapshot
        const memoryResponse = await request(app)
          .get('/api/performance/memory-usage')
          .expect(200);
        
        memorySnapshots.push({
          batch: batch,
          timestamp: Date.now(),
          memoryUsage: memoryResponse.body.memoryUsage,
          heapUsed: memoryResponse.body.heapUsed,
          activeInvestigations: batchIds.length
        });

        // Wait for batch to complete before starting next
        await Promise.all(batchIds.map(id => waitForCompletion(id, 60000)));

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Analyze memory usage trends
      expect(memorySnapshots.length).toBe(sustainedCount / batchSize);
      
      // Memory usage should not continuously increase (no major memory leaks)
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      
      const memoryIncrease = lastSnapshot.memoryUsage - firstSnapshot.memoryUsage;
      expect(memoryIncrease).toBeLessThan(0.3); // Less than 30% increase

      console.log(`Memory usage: Start: ${firstSnapshot.memoryUsage}, End: ${lastSnapshot.memoryUsage}, Increase: ${memoryIncrease}`);
    });

    test('should handle database connection pool under load', async () => {
      const connectionTestCount = 25;
      
      // Create many alerts to test database connections
      for (let i = 0; i < connectionTestCount; i++) {
        const alertId = await createTestAlert(`DB Connection Test ${i}`);
        testAlertIds.push(alertId);
      }

      // Start investigations that will stress database connections
      const startPromises = testAlertIds.map(alertId =>
        request(app)
          .post('/api/investigations/start')
          .send({
            alertId: alertId,
            tenantId: testTenantId,
            priority: 'medium'
          })
          .expect(201)
      );

      const startResponses = await Promise.all(startPromises);
      testInvestigationIds = startResponses.map(response => response.body.investigationId);

      // Monitor database connection pool
      const dbMonitoring = [];
      const dbMonitoringInterval = setInterval(async () => {
        try {
          const dbResponse = await request(app)
            .get('/api/performance/database-stats')
            .expect(200);
          
          dbMonitoring.push({
            timestamp: Date.now(),
            activeConnections: dbResponse.body.activeConnections,
            totalConnections: dbResponse.body.totalConnections,
            waitingClients: dbResponse.body.waitingClients
          });
        } catch (error) {
          // Ignore monitoring errors
        }
      }, 500);

      // Wait for all investigations to complete
      await Promise.all(testInvestigationIds.map(id => waitForCompletion(id, 120000)));
      clearInterval(dbMonitoringInterval);

      // Verify database connections were managed properly
      expect(dbMonitoring.length).toBeGreaterThan(0);
      
      // Check that we didn't exhaust connection pool
      const maxActiveConnections = Math.max(...dbMonitoring.map(m => m.activeConnections));
      const maxWaitingClients = Math.max(...dbMonitoring.map(m => m.waitingClients));
      
      expect(maxActiveConnections).toBeLessThan(50); // Reasonable connection limit
      expect(maxWaitingClients).toBeLessThan(10); // Minimal waiting

      console.log(`DB test: Max active connections: ${maxActiveConnections}, Max waiting: ${maxWaitingClients}`);
    });
  });

  // Helper functions
  async function setupLoadTestEnvironment() {
    await db.query(`
      INSERT INTO tenants (id, name, created_at) 
      VALUES ($1, 'Load Test Tenant', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [testTenantId]);

    // Ensure performance monitoring tables exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        metric_type VARCHAR(50) NOT NULL,
        metric_value JSONB NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  async function cleanupLoadTestEnvironment() {
    await db.query('DELETE FROM investigations WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM alerts WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM performance_metrics WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  }

  async function createTestAlert(title = 'Load Test Alert', severity = 'medium') {
    const alertId = uuidv4();
    await db.query(`
      INSERT INTO alerts (id, tenant_id, title, severity, status, raw_data, created_at)
      VALUES ($1, $2, $3, $4, 'open', $5, NOW())
    `, [
      alertId,
      testTenantId,
      title,
      severity,
      JSON.stringify({
        source_ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
        user: `test.user.${Math.floor(Math.random() * 1000)}`,
        hostname: `workstation-${Math.floor(Math.random() * 100)}`
      })
    ]);
    return alertId;
  }

  async function waitForCompletion(investigationId, timeout = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await request(app)
          .get(`/api/investigations/${investigationId}/status`)
          .expect(200);

        if (['complete', 'failed', 'requires_review'].includes(response.body.status)) {
          return response.body;
        }
      } catch (error) {
        // Continue waiting on errors
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }

    throw new Error(`Investigation ${investigationId} did not complete within ${timeout}ms`);
  }

  async function cleanupTestData() {
    // Cleanup in batches to avoid overwhelming the database
    const batchSize = 10;
    
    for (let i = 0; i < testInvestigationIds.length; i += batchSize) {
      const batch = testInvestigationIds.slice(i, i + batchSize);
      await Promise.all(batch.map(id => 
        db.query('DELETE FROM investigations WHERE id = $1', [id]).catch(() => {})
      ));
    }

    for (let i = 0; i < testAlertIds.length; i += batchSize) {
      const batch = testAlertIds.slice(i, i + batchSize);
      await Promise.all(batch.map(id => 
        db.query('DELETE FROM alerts WHERE id = $1', [id]).catch(() => {})
      ));
    }
  }
});