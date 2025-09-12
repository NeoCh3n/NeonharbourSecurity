const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../server');
const db = require('../database');

// Mock connectors for failure simulation
const mockConnectors = {
  siem: {
    query: jest.fn(),
    health: jest.fn()
  },
  edr: {
    query: jest.fn(),
    health: jest.fn()
  },
  threatIntel: {
    query: jest.fn(),
    health: jest.fn()
  }
};

describe('Investigation Failure and Recovery Tests', () => {
  let testTenantId;
  let testAlertId;
  let testInvestigationId;

  beforeAll(async () => {
    testTenantId = uuidv4();
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    testAlertId = await createTestAlert();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Data Source Failures', () => {
    test('should handle single data source failure gracefully', async () => {
      // Setup: SIEM fails, but EDR and ThreatIntel work
      mockConnectors.siem.query.mockRejectedValue(new Error('SIEM connection timeout'));
      mockConnectors.siem.health.mockResolvedValue({ status: 'unhealthy', error: 'Connection timeout' });
      
      mockConnectors.edr.query.mockResolvedValue({
        processes: [{ hostname: 'test-host', process: 'malware.exe' }]
      });
      mockConnectors.edr.health.mockResolvedValue({ status: 'healthy' });
      
      mockConnectors.threatIntel.query.mockResolvedValue({
        reputation: 'malicious',
        confidence: 0.8
      });
      mockConnectors.threatIntel.health.mockResolvedValue({ status: 'healthy' });

      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for completion
      await waitForCompletion(testInvestigationId);

      // Verify investigation completed despite SIEM failure
      const statusResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/status`)
        .expect(200);

      expect(statusResponse.body.status).toBe('complete');

      // Verify evidence was collected from available sources
      const evidenceResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/evidence`)
        .expect(200);

      expect(evidenceResponse.body.evidence).toBeDefined();
      expect(evidenceResponse.body.evidence.sources).toContain('edr');
      expect(evidenceResponse.body.evidence.sources).toContain('threatIntel');
      expect(evidenceResponse.body.evidence.sources).not.toContain('siem');

      // Verify failure was logged
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      const failureEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'data_source_failure'
      );
      expect(failureEvents.length).toBeGreaterThan(0);
      expect(failureEvents[0].details.source).toBe('siem');
    });

    test('should handle multiple data source failures with degraded analysis', async () => {
      // Setup: Both SIEM and EDR fail, only ThreatIntel works
      mockConnectors.siem.query.mockRejectedValue(new Error('SIEM unavailable'));
      mockConnectors.edr.query.mockRejectedValue(new Error('EDR API error'));
      mockConnectors.threatIntel.query.mockResolvedValue({
        reputation: 'unknown',
        confidence: 0.3
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

      // Wait for completion
      await waitForCompletion(testInvestigationId);

      // Verify investigation completed with degraded analysis
      const verdictResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/verdict`)
        .expect(200);

      expect(verdictResponse.body.verdict.classification).toBe('requires_review');
      expect(verdictResponse.body.verdict.confidence).toBeLessThan(0.5);
      expect(verdictResponse.body.verdict.reasoning).toContain('limited data sources');

      // Verify recommendations reflect uncertainty
      const recommendationsResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/recommendations`)
        .expect(200);

      const recommendations = recommendationsResponse.body.recommendations;
      expect(recommendations.some(rec => rec.type === 'manual_investigation')).toBe(true);
    });

    test('should handle complete data source failure with appropriate escalation', async () => {
      // Setup: All data sources fail
      mockConnectors.siem.query.mockRejectedValue(new Error('SIEM down'));
      mockConnectors.edr.query.mockRejectedValue(new Error('EDR down'));
      mockConnectors.threatIntel.query.mockRejectedValue(new Error('ThreatIntel down'));

      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for completion or failure
      await waitForCompletion(testInvestigationId);

      // Verify investigation status reflects data source issues
      const statusResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/status`)
        .expect(200);

      expect(['requires_review', 'failed']).toContain(statusResponse.body.status);

      // Verify escalation recommendations
      const recommendationsResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/recommendations`)
        .expect(200);

      const recommendations = recommendationsResponse.body.recommendations;
      expect(recommendations.some(rec => 
        rec.type === 'escalation' && rec.priority === 'high'
      )).toBe(true);
    });
  });

  describe('Agent Failures', () => {
    test('should handle planning agent failure with fallback strategy', async () => {
      // Mock planning agent failure
      jest.spyOn(require('../investigation/agents/base-agent'), 'execute')
        .mockImplementationOnce(() => {
          throw new Error('Planning agent crashed');
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

      // Wait for recovery and completion
      await waitForCompletion(testInvestigationId, 45000); // Extended timeout

      // Verify fallback plan was used
      const planResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/plan`)
        .expect(200);

      expect(planResponse.body.plan.type).toBe('fallback');
      expect(planResponse.body.plan.steps.length).toBeGreaterThan(0);

      // Verify audit trail shows agent failure and recovery
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      const agentFailureEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'agent_failure'
      );
      expect(agentFailureEvents.length).toBeGreaterThan(0);

      const recoveryEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'fallback_strategy_activated'
      );
      expect(recoveryEvents.length).toBeGreaterThan(0);
    });

    test('should handle analysis agent failure with retry mechanism', async () => {
      let attemptCount = 0;
      
      // Mock analysis agent to fail twice, then succeed
      jest.spyOn(require('../investigation/agents/analysis-agent'), 'analyzeEvidence')
        .mockImplementation(() => {
          attemptCount++;
          if (attemptCount <= 2) {
            throw new Error('Analysis agent temporary failure');
          }
          return Promise.resolve({
            verdict: { classification: 'true_positive', confidence: 0.7 },
            reasoning: 'Recovered analysis'
          });
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

      // Wait for completion
      await waitForCompletion(testInvestigationId, 45000);

      // Verify investigation completed successfully after retries
      const verdictResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/verdict`)
        .expect(200);

      expect(verdictResponse.body.verdict.classification).toBe('true_positive');
      expect(verdictResponse.body.verdict.reasoning).toBe('Recovered analysis');

      // Verify retry attempts were logged
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      const retryEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'agent_retry'
      );
      expect(retryEvents.length).toBe(2); // Two retry attempts
    });
  });

  describe('Resource Exhaustion Recovery', () => {
    test('should handle memory exhaustion with investigation queuing', async () => {
      // Start multiple investigations to simulate resource pressure
      const investigationPromises = [];
      const investigationIds = [];

      for (let i = 0; i < 5; i++) {
        const alertId = await createTestAlert();
        const promise = request(app)
          .post('/api/investigations/start')
          .send({
            alertId: alertId,
            tenantId: testTenantId,
            priority: i < 2 ? 'high' : 'medium'
          })
          .expect(201);
        
        investigationPromises.push(promise);
      }

      const responses = await Promise.all(investigationPromises);
      responses.forEach(response => {
        investigationIds.push(response.body.investigationId);
      });

      // Wait for all investigations to complete or queue
      await Promise.all(investigationIds.map(id => 
        waitForCompletion(id, 60000)
      ));

      // Verify high priority investigations completed first
      const completionTimes = await Promise.all(
        investigationIds.map(async (id, index) => {
          const response = await request(app)
            .get(`/api/investigations/${id}`)
            .expect(200);
          
          return {
            id,
            priority: index < 2 ? 'high' : 'medium',
            completedAt: new Date(response.body.metadata.completedAt)
          };
        })
      );

      const highPriorityTimes = completionTimes
        .filter(item => item.priority === 'high')
        .map(item => item.completedAt);
      
      const mediumPriorityTimes = completionTimes
        .filter(item => item.priority === 'medium')
        .map(item => item.completedAt);

      // High priority should generally complete before medium priority
      const avgHighTime = highPriorityTimes.reduce((sum, time) => sum + time.getTime(), 0) / highPriorityTimes.length;
      const avgMediumTime = mediumPriorityTimes.reduce((sum, time) => sum + time.getTime(), 0) / mediumPriorityTimes.length;

      expect(avgHighTime).toBeLessThanOrEqual(avgMediumTime);

      // Cleanup
      await Promise.all(investigationIds.map(id => 
        db.query('DELETE FROM investigations WHERE id = $1', [id])
      ));
    });

    test('should handle investigation timeout with graceful termination', async () => {
      // Start investigation with very short timeout
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId,
          timeout: 1000 // 1 second timeout
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for timeout to occur
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify investigation was terminated due to timeout
      const statusResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/status`)
        .expect(200);

      expect(['timeout', 'failed']).toContain(statusResponse.body.status);

      // Verify timeout was logged
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      const timeoutEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'investigation_timeout'
      );
      expect(timeoutEvents.length).toBeGreaterThan(0);

      // Verify cleanup occurred
      const cleanupEvents = auditResponse.body.auditTrail.filter(
        event => event.action === 'investigation_cleanup'
      );
      expect(cleanupEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Network and Connectivity Failures', () => {
    test('should handle intermittent network failures with circuit breaker', async () => {
      let callCount = 0;
      
      // Mock intermittent network failures
      mockConnectors.siem.query.mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          return Promise.resolve({ events: [{ test: 'data' }] });
        }
        return Promise.reject(new Error('Network timeout'));
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

      // Wait for completion
      await waitForCompletion(testInvestigationId, 45000);

      // Verify circuit breaker behavior was logged
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      const circuitBreakerEvents = auditResponse.body.auditTrail.filter(
        event => event.action.includes('circuit_breaker')
      );
      expect(circuitBreakerEvents.length).toBeGreaterThan(0);

      // Verify investigation still completed
      const statusResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/status`)
        .expect(200);

      expect(statusResponse.body.status).toBe('complete');
    });
  });

  // Helper functions
  async function setupTestEnvironment() {
    await db.query(`
      INSERT INTO tenants (id, name, created_at) 
      VALUES ($1, 'Test Tenant', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [testTenantId]);
  }

  async function cleanupTestEnvironment() {
    await db.query('DELETE FROM investigations WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM alerts WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  }

  async function createTestAlert() {
    const alertId = uuidv4();
    await db.query(`
      INSERT INTO alerts (id, tenant_id, title, severity, status, raw_data, created_at)
      VALUES ($1, $2, 'Test Failure Recovery Alert', 'high', 'open', $3, NOW())
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

  async function waitForCompletion(investigationId, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const response = await request(app)
        .get(`/api/investigations/${investigationId}/status`)
        .expect(200);

      if (['complete', 'failed', 'timeout', 'requires_review'].includes(response.body.status)) {
        return response.body;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Investigation did not complete within ${timeout}ms`);
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