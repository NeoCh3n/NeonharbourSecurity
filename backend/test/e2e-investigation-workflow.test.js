const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../server');
const db = require('../database');

// Mock data sources for testing
const mockDataSources = {
  siem: {
    query: jest.fn(),
    health: jest.fn(() => ({ status: 'healthy' }))
  },
  edr: {
    query: jest.fn(),
    health: jest.fn(() => ({ status: 'healthy' }))
  },
  threatIntel: {
    query: jest.fn(),
    health: jest.fn(() => ({ status: 'healthy' }))
  }
};

describe('End-to-End Investigation Workflow Tests', () => {
  let testTenantId;
  let testAlertId;
  let testInvestigationId;

  beforeAll(async () => {
    // Setup test database and mock data sources
    testTenantId = uuidv4();
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    // Reset mocks and create fresh test data
    jest.clearAllMocks();
    testAlertId = await createTestAlert();
    setupMockResponses();
  });

  afterEach(async () => {
    // Cleanup test data after each test
    await cleanupTestData();
  });

  describe('Complete Investigation Workflow', () => {
    test('should execute full investigation lifecycle from alert to response', async () => {
      // Step 1: Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId,
          priority: 'high'
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;
      expect(startResponse.body.status).toBe('planning');

      // Step 2: Wait for planning phase completion
      await waitForPhaseCompletion('planning', testInvestigationId);

      // Verify planning phase results
      const planResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/plan`)
        .expect(200);

      expect(planResponse.body.plan).toBeDefined();
      expect(planResponse.body.plan.steps).toHaveLength(expect.any(Number));
      expect(planResponse.body.plan.estimatedComplexity).toMatch(/low|medium|high/);

      // Step 3: Wait for execution phase completion
      await waitForPhaseCompletion('executing', testInvestigationId);

      // Verify data source queries were made
      expect(mockDataSources.siem.query).toHaveBeenCalled();
      expect(mockDataSources.edr.query).toHaveBeenCalled();
      expect(mockDataSources.threatIntel.query).toHaveBeenCalled();

      // Step 4: Wait for analysis phase completion
      await waitForPhaseCompletion('analyzing', testInvestigationId);

      // Verify evidence collection and analysis
      const evidenceResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/evidence`)
        .expect(200);

      expect(evidenceResponse.body.evidence).toBeDefined();
      expect(evidenceResponse.body.evidence.entities).toBeDefined();
      expect(evidenceResponse.body.evidence.timeline).toBeDefined();

      // Step 5: Wait for response phase completion
      await waitForPhaseCompletion('responding', testInvestigationId);

      // Verify verdict and recommendations
      const verdictResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/verdict`)
        .expect(200);

      expect(verdictResponse.body.verdict).toBeDefined();
      expect(verdictResponse.body.verdict.classification).toMatch(/true_positive|false_positive|requires_review/);
      expect(verdictResponse.body.verdict.confidence).toBeGreaterThanOrEqual(0);
      expect(verdictResponse.body.verdict.confidence).toBeLessThanOrEqual(1);

      const recommendationsResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/recommendations`)
        .expect(200);

      expect(recommendationsResponse.body.recommendations).toBeDefined();
      expect(Array.isArray(recommendationsResponse.body.recommendations)).toBe(true);

      // Step 6: Wait for investigation completion
      await waitForPhaseCompletion('complete', testInvestigationId);

      // Verify final investigation state
      const finalResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/status`)
        .expect(200);

      expect(finalResponse.body.status).toBe('complete');
      expect(finalResponse.body.metadata.duration).toBeGreaterThan(0);
      expect(finalResponse.body.metadata.dataSourcesQueried).toContain('siem');
    });

    test('should handle investigation with human feedback integration', async () => {
      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: testAlertId,
          tenantId: testTenantId,
          requiresHumanReview: true
        })
        .expect(201);

      testInvestigationId = startResponse.body.investigationId;

      // Wait for initial analysis
      await waitForPhaseCompletion('analyzing', testInvestigationId);

      // Provide human feedback
      const feedbackResponse = await request(app)
        .post(`/api/investigations/${testInvestigationId}/feedback`)
        .send({
          feedback: {
            type: 'verdict_correction',
            originalVerdict: 'false_positive',
            correctedVerdict: 'true_positive',
            reasoning: 'Additional context indicates this is a legitimate threat',
            additionalEvidence: ['Manual analysis of network logs']
          }
        })
        .expect(200);

      expect(feedbackResponse.body.status).toBe('feedback_received');

      // Wait for investigation to incorporate feedback and complete
      await waitForPhaseCompletion('complete', testInvestigationId);

      // Verify feedback was incorporated
      const finalResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}`)
        .expect(200);

      expect(finalResponse.body.metadata.humanInteractions).toBeGreaterThan(0);
      expect(finalResponse.body.verdict.classification).toBe('true_positive');
    });

    test('should generate complete audit trail throughout investigation', async () => {
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
      await waitForPhaseCompletion('complete', testInvestigationId);

      // Verify audit trail
      const auditResponse = await request(app)
        .get(`/api/investigations/${testInvestigationId}/audit`)
        .expect(200);

      expect(auditResponse.body.auditTrail).toBeDefined();
      expect(Array.isArray(auditResponse.body.auditTrail)).toBe(true);
      expect(auditResponse.body.auditTrail.length).toBeGreaterThan(0);

      // Verify audit entries contain required fields
      const auditEntries = auditResponse.body.auditTrail;
      auditEntries.forEach(entry => {
        expect(entry.timestamp).toBeDefined();
        expect(entry.action).toBeDefined();
        expect(entry.actor).toBeDefined();
        expect(entry.tenantId).toBe(testTenantId);
      });

      // Verify specific audit events exist
      const actionTypes = auditEntries.map(entry => entry.action);
      expect(actionTypes).toContain('investigation_started');
      expect(actionTypes).toContain('plan_generated');
      expect(actionTypes).toContain('evidence_collected');
      expect(actionTypes).toContain('verdict_generated');
      expect(actionTypes).toContain('investigation_completed');
    });
  });

  // Helper functions
  async function setupTestEnvironment() {
    // Create test tenant and basic data
    await db.query(`
      INSERT INTO tenants (id, name, created_at) 
      VALUES ($1, 'Test Tenant', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [testTenantId]);
  }

  async function cleanupTestEnvironment() {
    // Cleanup test tenant and all related data
    await db.query('DELETE FROM investigations WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM alerts WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  }

  async function createTestAlert() {
    const alertId = uuidv4();
    await db.query(`
      INSERT INTO alerts (id, tenant_id, title, severity, status, raw_data, created_at)
      VALUES ($1, $2, 'Test Security Alert', 'high', 'open', $3, NOW())
    `, [
      alertId,
      testTenantId,
      JSON.stringify({
        source_ip: '192.168.1.100',
        destination_ip: '10.0.0.5',
        user: 'john.doe',
        hostname: 'workstation-01',
        process: 'powershell.exe',
        command_line: 'powershell -enc <base64_encoded_command>',
        file_hash: 'abc123def456',
        domain: 'suspicious-domain.com'
      })
    ]);
    return alertId;
  }

  function setupMockResponses() {
    // Mock SIEM responses
    mockDataSources.siem.query.mockImplementation((query) => {
      if (query.includes('source_ip')) {
        return Promise.resolve({
          events: [
            {
              timestamp: new Date().toISOString(),
              source_ip: '192.168.1.100',
              event_type: 'network_connection',
              details: { bytes_sent: 1024, bytes_received: 2048 }
            }
          ]
        });
      }
      return Promise.resolve({ events: [] });
    });

    // Mock EDR responses
    mockDataSources.edr.query.mockImplementation((query) => {
      if (query.includes('hostname')) {
        return Promise.resolve({
          processes: [
            {
              timestamp: new Date().toISOString(),
              hostname: 'workstation-01',
              process_name: 'powershell.exe',
              command_line: 'powershell -enc <base64_encoded_command>',
              parent_process: 'explorer.exe'
            }
          ]
        });
      }
      return Promise.resolve({ processes: [] });
    });

    // Mock Threat Intel responses
    mockDataSources.threatIntel.query.mockImplementation((indicator) => {
      if (indicator === 'suspicious-domain.com') {
        return Promise.resolve({
          reputation: 'malicious',
          confidence: 0.9,
          categories: ['malware', 'c2'],
          first_seen: '2024-01-01T00:00:00Z'
        });
      }
      return Promise.resolve({ reputation: 'unknown' });
    });
  }

  async function waitForPhaseCompletion(expectedPhase, investigationId, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const response = await request(app)
        .get(`/api/investigations/${investigationId}/status`)
        .expect(200);

      if (response.body.status === expectedPhase || 
          (expectedPhase === 'complete' && response.body.status === 'complete') ||
          response.body.status === 'failed') {
        return response.body;
      }

      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
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