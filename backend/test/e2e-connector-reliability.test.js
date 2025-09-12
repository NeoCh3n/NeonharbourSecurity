const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../server');
const db = require('../database');

// Mock external services for testing
const mockExternalServices = {
  siem: {
    healthy: true,
    responseTime: 100,
    errorRate: 0,
    responses: new Map()
  },
  edr: {
    healthy: true,
    responseTime: 150,
    errorRate: 0,
    responses: new Map()
  },
  threatIntel: {
    healthy: true,
    responseTime: 200,
    errorRate: 0.1,
    responses: new Map()
  }
};

describe('External Connector Reliability and Failover Tests', () => {
  let testTenantId;
  let testAlertId;
  let testInvestigationId;
  let connectorIds = {};

  beforeAll(async () => {
    testTenantId = uuidv4();
    await setupConnectorTestEnvironment();
    await setupTestConnectors();
  });

  afterAll(async () => {
    await cleanupConnectorTestEnvironment();
  });

  beforeEach(async () => {
    // Reset mock services to healthy state
    Object.values(mockExternalServices).forEach(service => {
      service.healthy = true;
      service.errorRate = 0;
      service.responses.clear();
    });
    
    testAlertId = await createTestAlert();
    setupMockResponses();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Connector Health Monitoring', () => {
    test('should continuously monitor connector health status', async () => {
      // Get initial health status
      const initialHealthResponse = await request(app)
        .get('/api/connectors/health')
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      expect(initialHealthResponse.body.connectors).toBeDefined();
      expect(Array.isArray(initialHealthResponse.body.connectors)).toBe(true);

      // All connectors should initially be healthy
      initialHealthResponse.body.connectors.forEach(connector => {
        expect(connector.status).toBe('healthy');
        expect(connector.lastHealthCheck).toBeDefined();
        expect(connector.responseTime).toBeGreaterThan(0);
      });

      // Simulate SIEM going unhealthy
      mockExternalServices.siem.healthy = false;
      mockExternalServices.siem.errorRate = 1.0;

      // Wait for health check cycle
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check health status again
      const updatedHealthResponse = await request(app)
        .get('/api/connectors/health')
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      const siemConnector = updatedHealthResponse.body.connectors.find(c => c.type === 'siem');
      expect(siemConnector.status).toBe('unhealthy');
      expect(siemConnector.errorDetails).toBeDefined();
    });

    test('should detect degraded performance and adjust accordingly', async () => {
      // Simulate slow SIEM responses
      mockExternalServices.siem.responseTime = 10000; // 10 seconds
      mockExternalServices.siem.errorRate = 0.3; // 30% error rate

      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for investigation to adapt to slow connector
      await waitForPhaseCompletion('executing', testInvestigationId, 30000);

      // Check connector performance metrics
      const metricsResponse = await request(app)
        .get(`/api/connectors/${connectorIds.siem}/metrics`)
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      expect(metricsResponse.body.metrics.avgResponseTime).toBeGreaterThan(5000);
      expect(metricsResponse.body.metrics.errorRate).toBeGreaterThan(0.2);
      expect(metricsResponse.body.metrics.status).toBe('degraded');

      // Verify investigation adapted by using alternative data sources
      const evidenceResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/evidence`)
        .expect(200);

      const dataSources = evidenceResponse.body.evidence.sources || [];
      expect(dataSources).toContain('edr');
      expect(dataSources).toContain('threatIntel');
      // SIEM might be included but with reduced reliance
    });

    test('should implement circuit breaker pattern for failing connectors', async () => {
      // Configure SIEM to fail consistently
      mockExternalServices.siem.healthy = false;
      mockExternalServices.siem.errorRate = 1.0;

      const failureCount = 10;
      const startTime = Date.now();

      // Make multiple requests to trigger circuit breaker
      for (let i = 0; i < failureCount; i++) {
        try {
          await request(app)
            .post(`/api/connectors/${connectorIds.siem}/test`)
            .set('X-Tenant-ID', testTenantId)
            .send({ query: 'test query' });
        } catch (error) {
          // Expected to fail
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check circuit breaker status
      const circuitBreakerResponse = await request(app)
        .get(`/api/connectors/${connectorIds.siem}/circuit-breaker-status`)
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      expect(circuitBreakerResponse.body.state).toBe('open');
      expect(circuitBreakerResponse.body.failureCount).toBeGreaterThanOrEqual(5);
      expect(circuitBreakerResponse.body.lastFailureTime).toBeDefined();

      // Subsequent requests should fail fast (circuit breaker open)
      const fastFailStart = Date.now();
      
      try {
        await request(app)
          .post(`/api/connectors/${connectorIds.siem}/test`)
          .set('X-Tenant-ID', testTenantId)
          .send({ query: 'test query' });
      } catch (error) {
        // Expected to fail fast
      }

      const fastFailTime = Date.now() - fastFailStart;
      expect(fastFailTime).toBeLessThan(100); // Should fail very quickly
    });
  });

  describe('Failover Mechanisms', () => {
    test('should failover to backup connectors when primary fails', async () => {
      // Setup primary and backup SIEM connectors
      const backupSiemResponse = await request(app)
        .post('/api/connectors')
        .set('X-Tenant-ID', testTenantId)
        .send({
          type: 'siem',
          name: 'Backup SIEM',
          config: {
            baseUrl: 'https://backup-siem.example.com',
            authentication: { type: 'api_key', apiKey: 'backup-key' },
            priority: 2 // Lower priority than primary
          }
        })
        .expect(201);

      const backupConnectorId = backupSiemResponse.body.connectorId;

      // Configure primary SIEM to fail
      mockExternalServices.siem.healthy = false;
      mockExternalServices.siem.errorRate = 1.0;

      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for investigation to complete
      await waitForPhaseCompletion('complete', testInvestigationId, 45000);

      // Verify failover occurred
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      const failoverEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'connector_failover'
      );
      expect(failoverEvents.length).toBeGreaterThan(0);

      const failoverEvent = failoverEvents[0];
      expect(failoverEvent.details.fromConnector).toBe(connectorIds.siem);
      expect(failoverEvent.details.toConnector).toBe(backupConnectorId);

      // Cleanup backup connector
      await db.query('DELETE FROM connectors WHERE id = $1', [backupConnectorId]);
    });

    test('should gracefully degrade when no backup connectors available', async () => {
      // Configure all SIEM connectors to fail
      mockExternalServices.siem.healthy = false;
      mockExternalServices.siem.errorRate = 1.0;

      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for investigation to complete
      await waitForPhaseCompletion('complete', testInvestigationId, 45000);

      // Verify graceful degradation
      const statusResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/status`)
        .expect(200);

      expect(['complete', 'requires_review']).toContain(statusResponse.body.status);

      // Check that investigation noted the missing data source
      const evidenceResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/evidence`)
        .expect(200);

      expect(evidenceResponse.body.evidence.limitations).toBeDefined();
      expect(evidenceResponse.body.evidence.limitations).toContain('siem_unavailable');

      // Verify verdict reflects uncertainty due to missing data
      const verdictResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/verdict`)
        .expect(200);

      expect(verdictResponse.body.verdict.confidence).toBeLessThan(0.8);
      expect(verdictResponse.body.verdict.reasoning).toContain('limited data sources');
    });

    test('should implement intelligent retry with exponential backoff', async () => {
      // Configure intermittent failures
      let attemptCount = 0;
      mockExternalServices.edr.errorRate = 0.7; // 70% failure rate initially

      // Mock the connector to succeed after several retries
      const originalQuery = mockExternalServices.edr.query;
      mockExternalServices.edr.query = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve({ processes: [{ test: 'data' }] });
      });

      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for investigation to complete with retries
      await waitForPhaseCompletion('complete', testInvestigationId, 60000);

      // Verify retry attempts were made
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      const retryEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'connector_retry'
      );
      expect(retryEvents.length).toBeGreaterThanOrEqual(3);

      // Verify exponential backoff was used
      const retryTimes = retryEvents.map(event => new Date(event.timestamp).getTime());
      for (let i = 1; i < retryTimes.length; i++) {
        const delay = retryTimes[i] - retryTimes[i - 1];
        const expectedMinDelay = Math.pow(2, i - 1) * 1000; // Exponential backoff
        expect(delay).toBeGreaterThanOrEqual(expectedMinDelay * 0.8); // Allow some variance
      }
    });
  });

  describe('Load Balancing and Performance', () => {
    test('should distribute load across multiple connectors of same type', async () => {
      // Create multiple threat intel connectors
      const connector2Response = await request(app)
        .post('/api/connectors')
        .set('X-Tenant-ID', testTenantId)
        .send({
          type: 'threatIntel',
          name: 'ThreatIntel 2',
          config: {
            baseUrl: 'https://threatintel2.example.com',
            authentication: { type: 'api_key', apiKey: 'key2' }
          }
        })
        .expect(201);

      const connector3Response = await request(app)
        .post('/api/connectors')
        .set('X-Tenant-ID', testTenantId)
        .send({
          type: 'threatIntel',
          name: 'ThreatIntel 3',
          config: {
            baseUrl: 'https://threatintel3.example.com',
            authentication: { type: 'api_key', apiKey: 'key3' }
          }
        })
        .expect(201);

      const connector2Id = connector2Response.body.connectorId;
      const connector3Id = connector3Response.body.connectorId;

      // Start multiple investigations to test load balancing
      const investigationPromises = [];
      for (let i = 0; i < 6; i++) {
        const alertId = await createTestAlert();
        investigationPromises.push(
          request(app)
            .post('/api/investigations/start')
            .send({
              alertId: alertId,
              tenantId: testTenantId
            })
            .expect(201)
        );
      }

      const investigations = await Promise.all(investigationPromises);
      const investigationIds = investigations.map(inv => inv.body.investigationId);

      // Wait for all investigations to complete
      await Promise.all(investigationIds.map(id => 
        waitForPhaseCompletion('complete', id, 60000)
      ));

      // Check load distribution across connectors
      const connector1Metrics = await request(app)
        .get(`/api/connectors/${connectorIds.threatIntel}/metrics`)
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      const connector2Metrics = await request(app)
        .get(`/api/connectors/${connector2Id}/metrics`)
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      const connector3Metrics = await request(app)
        .get(`/api/connectors/${connector3Id}/metrics`)
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      // Verify load was distributed (each connector should have been used)
      expect(connector1Metrics.body.metrics.totalQueries).toBeGreaterThan(0);
      expect(connector2Metrics.body.metrics.totalQueries).toBeGreaterThan(0);
      expect(connector3Metrics.body.metrics.totalQueries).toBeGreaterThan(0);

      // Load should be relatively balanced (within 50% of average)
      const totalQueries = connector1Metrics.body.metrics.totalQueries + 
                          connector2Metrics.body.metrics.totalQueries + 
                          connector3Metrics.body.metrics.totalQueries;
      const avgQueries = totalQueries / 3;

      expect(connector1Metrics.body.metrics.totalQueries).toBeGreaterThan(avgQueries * 0.5);
      expect(connector2Metrics.body.metrics.totalQueries).toBeGreaterThan(avgQueries * 0.5);
      expect(connector3Metrics.body.metrics.totalQueries).toBeGreaterThan(avgQueries * 0.5);

      // Cleanup
      await Promise.all(investigationIds.map(id => 
        db.query('DELETE FROM investigations WHERE id = $1', [id])
      ));
      await db.query('DELETE FROM connectors WHERE id IN ($1, $2)', [connector2Id, connector3Id]);
    });

    test('should respect rate limits and queue requests appropriately', async () => {
      // Configure connector with strict rate limits
      await request(app)
        .put(`/api/connectors/${connectorIds.threatIntel}`)
        .set('X-Tenant-ID', testTenantId)
        .send({
          config: {
            rateLimits: {
              requestsPerMinute: 5,
              requestsPerHour: 50
            }
          }
        })
        .expect(200);

      // Start multiple investigations that will hit rate limits
      const investigationPromises = [];
      for (let i = 0; i < 10; i++) {
        const alertId = await createTestAlert();
        investigationPromises.push(
          request(app)
            .post('/api/investigations/start')
            .send({
              alertId: alertId,
              tenantId: testTenantId
            })
            .expect(201)
        );
      }

      const investigations = await Promise.all(investigationPromises);
      const investigationIds = investigations.map(inv => inv.body.investigationId);

      // Wait for all investigations to complete (should take longer due to rate limiting)
      const startTime = Date.now();
      await Promise.all(investigationIds.map(id => 
        waitForPhaseCompletion('complete', id, 120000)
      ));
      const totalTime = Date.now() - startTime;

      // Should take longer than normal due to rate limiting
      expect(totalTime).toBeGreaterThan(30000); // At least 30 seconds

      // Check rate limiting metrics
      const metricsResponse = await request(app)
        .get(`/api/connectors/${connectorIds.threatIntel}/metrics`)
        .set('X-Tenant-ID', testTenantId)
        .expect(200);

      expect(metricsResponse.body.metrics.rateLimitHits).toBeGreaterThan(0);
      expect(metricsResponse.body.metrics.queuedRequests).toBeGreaterThan(0);

      // Cleanup
      await Promise.all(investigationIds.map(id => 
        db.query('DELETE FROM investigations WHERE id = $1', [id])
      ));
    });
  });

  // Helper functions
  async function setupConnectorTestEnvironment() {
    await db.query(`
      INSERT INTO tenants (id, name, created_at) 
      VALUES ($1, 'Connector Test Tenant', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [testTenantId]);
  }

  async function setupTestConnectors() {
    // Create SIEM connector
    const siemResponse = await request(app)
      .post('/api/connectors')
      .set('X-Tenant-ID', testTenantId)
      .send({
        type: 'siem',
        name: 'Test SIEM',
        config: {
          baseUrl: 'https://siem.example.com',
          authentication: { type: 'api_key', apiKey: 'siem-key' }
        }
      })
      .expect(201);

    // Create EDR connector
    const edrResponse = await request(app)
      .post('/api/connectors')
      .set('X-Tenant-ID', testTenantId)
      .send({
        type: 'edr',
        name: 'Test EDR',
        config: {
          baseUrl: 'https://edr.example.com',
          authentication: { type: 'api_key', apiKey: 'edr-key' }
        }
      })
      .expect(201);

    // Create Threat Intel connector
    const threatIntelResponse = await request(app)
      .post('/api/connectors')
      .set('X-Tenant-ID', testTenantId)
      .send({
        type: 'threatIntel',
        name: 'Test ThreatIntel',
        config: {
          baseUrl: 'https://threatintel.example.com',
          authentication: { type: 'api_key', apiKey: 'threatintel-key' }
        }
      })
      .expect(201);

    connectorIds = {
      siem: siemResponse.body.connectorId,
      edr: edrResponse.body.connectorId,
      threatIntel: threatIntelResponse.body.connectorId
    };
  }

  function setupMockResponses() {
    // Setup default mock responses for healthy connectors
    mockExternalServices.siem.responses.set('default', {
      events: [
        {
          timestamp: new Date().toISOString(),
          source_ip: '192.168.1.100',
          event_type: 'network_connection'
        }
      ]
    });

    mockExternalServices.edr.responses.set('default', {
      processes: [
        {
          timestamp: new Date().toISOString(),
          hostname: 'test-workstation',
          process_name: 'test.exe'
        }
      ]
    });

    mockExternalServices.threatIntel.responses.set('default', {
      reputation: 'clean',
      confidence: 0.8
    });
  }

  async function cleanupConnectorTestEnvironment() {
    await db.query('DELETE FROM investigations WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM alerts WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM connectors WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  }

  async function createTestAlert() {
    const alertId = uuidv4();
    await db.query(`
      INSERT INTO alerts (id, tenant_id, title, severity, status, raw_data, created_at)
      VALUES ($1, $2, 'Connector Test Alert', 'medium', 'open', $3, NOW())
    `, [
      alertId,
      testTenantId,
      JSON.stringify({
        source_ip: '192.168.1.100',
        user: 'test.user',
        hostname: 'test-workstation'
      })
    ]);
    return alertId;
  }

  async function waitForPhaseCompletion(expectedPhase, investigationId, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await request(app)
          .get(`/api/investigations/${investigationId}/status`)
          .expect(200);

        if (response.body.status === expectedPhase || 
            response.body.status === 'complete' || 
            response.body.status === 'failed') {
          return response.body;
        }
      } catch (error) {
        // Continue waiting on errors
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Investigation did not reach ${expectedPhase} phase within ${timeout}ms`);
  }

  async function cleanupTestData() {
    if (testInvestigationId) {
      await db.query('DELETE FROM investigations WHERE id = $1', [testInvestigationId]);
    }
    if (testAlertId) {
      await db.query('DELETE FROM alerts WHERE id = $1', [testAlertId]);
    }
  }
});