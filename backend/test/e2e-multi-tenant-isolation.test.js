const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../server');
const db = require('../database');

describe('Multi-Tenant Investigation Isolation Tests', () => {
  let tenant1Id, tenant2Id;
  let tenant1AlertId, tenant2AlertId;
  let tenant1InvestigationId, tenant2InvestigationId;

  beforeAll(async () => {
    // Setup two separate test tenants
    tenant1Id = uuidv4();
    tenant2Id = uuidv4();
    
    await setupMultiTenantEnvironment();
  });

  afterAll(async () => {
    await cleanupMultiTenantEnvironment();
  });

  beforeEach(async () => {
    // Create test alerts for both tenants
    tenant1AlertId = await createTestAlert(tenant1Id, 'Tenant 1 Alert');
    tenant2AlertId = await createTestAlert(tenant2Id, 'Tenant 2 Alert');
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Data Isolation', () => {
    test('should isolate investigation data between tenants', async () => {
      // Start investigations for both tenants
      const tenant1Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      const tenant2Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant2AlertId,
          tenantId: tenant2Id
        })
        .expect(201);

      tenant1InvestigationId = tenant1Response.body.investigationId;
      tenant2InvestigationId = tenant2Response.body.investigationId;

      // Wait for both investigations to complete
      await Promise.all([
        waitForCompletion(tenant1InvestigationId),
        waitForCompletion(tenant2InvestigationId)
      ]);

      // Verify tenant 1 cannot access tenant 2's investigation
      await request(app)
        .get(`/api/investigations/${tenant2InvestigationId}`)
        .set('X-Tenant-ID', tenant1Id)
        .expect(404);

      // Verify tenant 2 cannot access tenant 1's investigation
      await request(app)
        .get(`/api/investigations/${tenant1InvestigationId}`)
        .set('X-Tenant-ID', tenant2Id)
        .expect(404);

      // Verify each tenant can only see their own investigations
      const tenant1ListResponse = await request(app)
        .get('/api/investigations')
        .set('X-Tenant-ID', tenant1Id)
        .expect(200);

      const tenant2ListResponse = await request(app)
        .get('/api/investigations')
        .set('X-Tenant-ID', tenant2Id)
        .expect(200);

      expect(tenant1ListResponse.body.investigations).toHaveLength(1);
      expect(tenant2ListResponse.body.investigations).toHaveLength(1);
      expect(tenant1ListResponse.body.investigations[0].id).toBe(tenant1InvestigationId);
      expect(tenant2ListResponse.body.investigations[0].id).toBe(tenant2InvestigationId);
    });

    test('should isolate evidence data between tenants', async () => {
      // Start investigations for both tenants
      const tenant1Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      const tenant2Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant2AlertId,
          tenantId: tenant2Id
        })
        .expect(201);

      tenant1InvestigationId = tenant1Response.body.investigationId;
      tenant2InvestigationId = tenant2Response.body.investigationId;

      // Wait for evidence collection
      await Promise.all([
        waitForPhase('analyzing', tenant1InvestigationId),
        waitForPhase('analyzing', tenant2InvestigationId)
      ]);

      // Verify tenant 1 cannot access tenant 2's evidence
      await request(app)
        .get(`/api/investigations/${tenant2InvestigationId}/evidence`)
        .set('X-Tenant-ID', tenant1Id)
        .expect(404);

      // Verify tenant 2 cannot access tenant 1's evidence
      await request(app)
        .get(`/api/investigations/${tenant1InvestigationId}/evidence`)
        .set('X-Tenant-ID', tenant2Id)
        .expect(404);

      // Verify evidence search is tenant-isolated
      const tenant1SearchResponse = await request(app)
        .get('/api/evidence/search?query=test')
        .set('X-Tenant-ID', tenant1Id)
        .expect(200);

      const tenant2SearchResponse = await request(app)
        .get('/api/evidence/search?query=test')
        .set('X-Tenant-ID', tenant2Id)
        .expect(200);

      // Evidence should not cross tenant boundaries
      const tenant1Evidence = tenant1SearchResponse.body.evidence;
      const tenant2Evidence = tenant2SearchResponse.body.evidence;

      tenant1Evidence.forEach(evidence => {
        expect(evidence.tenantId).toBe(tenant1Id);
      });

      tenant2Evidence.forEach(evidence => {
        expect(evidence.tenantId).toBe(tenant2Id);
      });
    });

    test('should isolate audit logs between tenants', async () => {
      // Start investigations for both tenants
      const tenant1Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      const tenant2Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant2AlertId,
          tenantId: tenant2Id
        })
        .expect(201);

      tenant1InvestigationId = tenant1Response.body.investigationId;
      tenant2InvestigationId = tenant2Response.body.investigationId;

      // Wait for some audit events to be generated
      await Promise.all([
        waitForPhase('executing', tenant1InvestigationId),
        waitForPhase('executing', tenant2InvestigationId)
      ]);

      // Verify audit log isolation
      const tenant1AuditResponse = await request(app)
        .get('/api/audit/logs')
        .set('X-Tenant-ID', tenant1Id)
        .expect(200);

      const tenant2AuditResponse = await request(app)
        .get('/api/audit/logs')
        .set('X-Tenant-ID', tenant2Id)
        .expect(200);

      // All audit logs should belong to the correct tenant
      tenant1AuditResponse.body.logs.forEach(log => {
        expect(log.tenantId).toBe(tenant1Id);
      });

      tenant2AuditResponse.body.logs.forEach(log => {
        expect(log.tenantId).toBe(tenant2Id);
      });

      // Verify no cross-tenant audit log access
      const tenant1Logs = tenant1AuditResponse.body.logs;
      const tenant2Logs = tenant2AuditResponse.body.logs;

      const tenant1InvestigationLogs = tenant1Logs.filter(log => 
        log.resourceId === tenant1InvestigationId
      );
      const tenant2InvestigationLogs = tenant2Logs.filter(log => 
        log.resourceId === tenant2InvestigationId
      );

      expect(tenant1InvestigationLogs.length).toBeGreaterThan(0);
      expect(tenant2InvestigationLogs.length).toBeGreaterThan(0);

      // Ensure no cross-contamination
      expect(tenant1Logs.some(log => log.tenantId === tenant2Id)).toBe(false);
      expect(tenant2Logs.some(log => log.tenantId === tenant1Id)).toBe(false);
    });
  });

  describe('Resource Isolation', () => {
    test('should isolate connector configurations between tenants', async () => {
      // Create connector configurations for both tenants
      const tenant1ConnectorResponse = await request(app)
        .post('/api/connectors')
        .set('X-Tenant-ID', tenant1Id)
        .send({
          type: 'siem',
          name: 'Tenant 1 SIEM',
          config: {
            baseUrl: 'https://tenant1-siem.example.com',
            authentication: { type: 'api_key', apiKey: 'tenant1-key' }
          }
        })
        .expect(201);

      const tenant2ConnectorResponse = await request(app)
        .post('/api/connectors')
        .set('X-Tenant-ID', tenant2Id)
        .send({
          type: 'siem',
          name: 'Tenant 2 SIEM',
          config: {
            baseUrl: 'https://tenant2-siem.example.com',
            authentication: { type: 'api_key', apiKey: 'tenant2-key' }
          }
        })
        .expect(201);

      // Verify tenant 1 cannot see tenant 2's connectors
      const tenant1ConnectorsResponse = await request(app)
        .get('/api/connectors')
        .set('X-Tenant-ID', tenant1Id)
        .expect(200);

      const tenant2ConnectorsResponse = await request(app)
        .get('/api/connectors')
        .set('X-Tenant-ID', tenant2Id)
        .expect(200);

      expect(tenant1ConnectorsResponse.body.connectors).toHaveLength(1);
      expect(tenant2ConnectorsResponse.body.connectors).toHaveLength(1);

      expect(tenant1ConnectorsResponse.body.connectors[0].name).toBe('Tenant 1 SIEM');
      expect(tenant2ConnectorsResponse.body.connectors[0].name).toBe('Tenant 2 SIEM');

      // Verify cross-tenant connector access is denied
      await request(app)
        .get(`/api/connectors/${tenant2ConnectorResponse.body.connectorId}`)
        .set('X-Tenant-ID', tenant1Id)
        .expect(404);

      await request(app)
        .get(`/api/connectors/${tenant1ConnectorResponse.body.connectorId}`)
        .set('X-Tenant-ID', tenant2Id)
        .expect(404);
    });

    test('should isolate learning data between tenants', async () => {
      // Generate feedback for both tenants
      const tenant1Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      const tenant2Response = await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant2AlertId,
          tenantId: tenant2Id
        })
        .expect(201);

      tenant1InvestigationId = tenant1Response.body.investigationId;
      tenant2InvestigationId = tenant2Response.body.investigationId;

      // Wait for completion and provide feedback
      await waitForCompletion(tenant1InvestigationId);
      await waitForCompletion(tenant2InvestigationId);

      // Provide different feedback for each tenant
      await request(app)
        .post(`/api/investigations/${tenant1InvestigationId}/feedback`)
        .set('X-Tenant-ID', tenant1Id)
        .send({
          feedback: {
            type: 'verdict_correction',
            originalVerdict: 'false_positive',
            correctedVerdict: 'true_positive',
            reasoning: 'Tenant 1 specific context'
          }
        })
        .expect(200);

      await request(app)
        .post(`/api/investigations/${tenant2InvestigationId}/feedback`)
        .set('X-Tenant-ID', tenant2Id)
        .send({
          feedback: {
            type: 'verdict_correction',
            originalVerdict: 'true_positive',
            correctedVerdict: 'false_positive',
            reasoning: 'Tenant 2 specific context'
          }
        })
        .expect(200);

      // Verify learning metrics are tenant-isolated
      const tenant1MetricsResponse = await request(app)
        .get('/api/learning/metrics')
        .set('X-Tenant-ID', tenant1Id)
        .expect(200);

      const tenant2MetricsResponse = await request(app)
        .get('/api/learning/metrics')
        .set('X-Tenant-ID', tenant2Id)
        .expect(200);

      // Metrics should be different for each tenant
      expect(tenant1MetricsResponse.body.tenantId).toBe(tenant1Id);
      expect(tenant2MetricsResponse.body.tenantId).toBe(tenant2Id);

      // Verify feedback patterns are tenant-specific
      expect(tenant1MetricsResponse.body.feedbackPatterns).toBeDefined();
      expect(tenant2MetricsResponse.body.feedbackPatterns).toBeDefined();
    });
  });

  // Helper functions
  async function setupMultiTenantEnvironment() {
    await db.query(`
      INSERT INTO tenants (id, name, created_at) 
      VALUES ($1, 'Test Tenant 1', NOW()), ($2, 'Test Tenant 2', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [tenant1Id, tenant2Id]);
  }

  async function cleanupMultiTenantEnvironment() {
    await db.query('DELETE FROM investigations WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM alerts WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM connectors WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM audit_logs WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM tenants WHERE id IN ($1, $2)', [tenant1Id, tenant2Id]);
  }

  async function createTestAlert(tenantId, title) {
    const alertId = uuidv4();
    await db.query(`
      INSERT INTO alerts (id, tenant_id, title, severity, status, raw_data, created_at)
      VALUES ($1, $2, $3, 'high', 'open', $4, NOW())
    `, [
      alertId,
      tenantId,
      title,
      JSON.stringify({
        source_ip: '192.168.1.100',
        user: 'test.user',
        hostname: 'test-workstation'
      })
    ]);
    return alertId;
  }

  async function waitForCompletion(investigationId, timeout = 30000) {
    return waitForPhase('complete', investigationId, timeout);
  }

  async function waitForPhase(expectedPhase, investigationId, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const response = await request(app)
        .get(`/api/investigations/${investigationId}/status`)
        .expect(200);

      if (response.body.status === expectedPhase || response.body.status === 'complete' || response.body.status === 'failed') {
        return response.body;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Investigation did not reach ${expectedPhase} phase within ${timeout}ms`);
  }

  async function cleanupTestData() {
    if (tenant1InvestigationId) {
      await db.query('DELETE FROM investigations WHERE id = $1', [tenant1InvestigationId]);
    }
    if (tenant2InvestigationId) {
      await db.query('DELETE FROM investigations WHERE id = $1', [tenant2InvestigationId]);
    }
    if (tenant1AlertId) {
      await db.query('DELETE FROM alerts WHERE id = $1', [tenant1AlertId]);
    }
    if (tenant2AlertId) {
      await db.query('DELETE FROM alerts WHERE id = $1', [tenant2AlertId]);
    }
  }
});