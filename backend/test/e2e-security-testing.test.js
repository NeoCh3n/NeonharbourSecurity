const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../database');

describe('Security Testing for Investigation Data Access and Isolation', () => {
  let tenant1Id, tenant2Id;
  let user1Token, user2Token, adminToken, unauthorizedToken;
  let tenant1AlertId, tenant2AlertId;
  let tenant1InvestigationId, tenant2InvestigationId;

  beforeAll(async () => {
    tenant1Id = uuidv4();
    tenant2Id = uuidv4();
    await setupSecurityTestEnvironment();
    await createTestUsers();
  });

  afterAll(async () => {
    await cleanupSecurityTestEnvironment();
  });

  beforeEach(async () => {
    tenant1AlertId = await createTestAlert(tenant1Id, 'Tenant 1 Security Alert');
    tenant2AlertId = await createTestAlert(tenant2Id, 'Tenant 2 Security Alert');
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Authentication and Authorization', () => {
    test('should reject requests without valid authentication tokens', async () => {
      // Test without token
      await request(app)
        .post('/api/investigations/start')
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(401);

      // Test with invalid token
      await request(app)
        .post('/api/investigations/start')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(401);

      // Test with expired token
      const expiredToken = jwt.sign(
        { userId: uuidv4(), tenantId: tenant1Id, exp: Math.floor(Date.now() / 1000) - 3600 },
        process.env.JWT_SECRET || 'test-secret'
      );

      await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(401);
    });

    test('should enforce role-based access control for investigation operations', async () => {
      // Start investigation as admin (should succeed)
      const adminStartResponse = await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      tenant1InvestigationId = adminStartResponse.body.investigationId;

      // Try to delete investigation as regular user (should fail)
      await request(app)
        .delete(`/api/investigations/${tenant1InvestigationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(403);

      // Try to access admin endpoints as regular user (should fail)
      await request(app)
        .get('/api/admin/investigations/all')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(403);

      // Admin should be able to access admin endpoints
      await request(app)
        .get('/api/admin/investigations/all')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    test('should prevent cross-tenant data access', async () => {
      // Start investigations for both tenants
      const tenant1Response = await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      const tenant2Response = await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          alertId: tenant2AlertId,
          tenantId: tenant2Id
        })
        .expect(201);

      tenant1InvestigationId = tenant1Response.body.investigationId;
      tenant2InvestigationId = tenant2Response.body.investigationId;

      // User 1 should not be able to access User 2's investigation
      await request(app)
        .get(`/api/investigations/${tenant2InvestigationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404); // Should return 404, not 403, to avoid information disclosure

      // User 2 should not be able to access User 1's investigation
      await request(app)
        .get(`/api/investigations/${tenant1InvestigationId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);

      // Users should only see their own tenant's investigations
      const user1ListResponse = await request(app)
        .get('/api/investigations')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      const user2ListResponse = await request(app)
        .get('/api/investigations')
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(user1ListResponse.body.investigations).toHaveLength(1);
      expect(user2ListResponse.body.investigations).toHaveLength(1);
      expect(user1ListResponse.body.investigations[0].tenantId).toBe(tenant1Id);
      expect(user2ListResponse.body.investigations[0].tenantId).toBe(tenant2Id);
    });
  });

  describe('Input Validation and Injection Prevention', () => {
    test('should prevent SQL injection in investigation queries', async () => {
      const maliciousInputs = [
        "'; DROP TABLE investigations; --",
        "1' OR '1'='1",
        "1; DELETE FROM alerts WHERE 1=1; --",
        "UNION SELECT * FROM users --",
        "'; INSERT INTO investigations (id) VALUES ('malicious'); --"
      ];

      for (const maliciousInput of maliciousInputs) {
        // Test SQL injection in investigation ID parameter
        await request(app)
          .get(`/api/investigations/${maliciousInput}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(400); // Should return 400 for invalid UUID format

        // Test SQL injection in search parameters
        await request(app)
          .get(`/api/investigations/search?query=${encodeURIComponent(maliciousInput)}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200); // Should handle gracefully without executing SQL

        // Test SQL injection in feedback
        const startResponse = await request(app)
          .post('/api/investigations/start')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({
            alertId: tenant1AlertId,
            tenantId: tenant1Id
          })
          .expect(201);

        const investigationId = startResponse.body.investigationId;

        await request(app)
          .post(`/api/investigations/${investigationId}/feedback`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({
            feedback: {
              type: 'verdict_correction',
              reasoning: maliciousInput
            }
          })
          .expect(200); // Should sanitize input

        // Cleanup
        await db.query('DELETE FROM investigations WHERE id = $1', [investigationId]);
      }

      // Verify database integrity after injection attempts
      const integrityCheck = await db.query('SELECT COUNT(*) FROM investigations WHERE tenant_id = $1', [tenant1Id]);
      expect(parseInt(integrityCheck.rows[0].count)).toBe(0); // Should be clean
    });

    test('should validate and sanitize investigation input data', async () => {
      const invalidInputs = [
        {
          description: 'Missing required fields',
          payload: {},
          expectedStatus: 400
        },
        {
          description: 'Invalid UUID format',
          payload: { alertId: 'not-a-uuid', tenantId: tenant1Id },
          expectedStatus: 400
        },
        {
          description: 'XSS attempt in priority field',
          payload: { 
            alertId: tenant1AlertId, 
            tenantId: tenant1Id, 
            priority: '<script>alert("xss")</script>' 
          },
          expectedStatus: 400
        },
        {
          description: 'Oversized payload',
          payload: { 
            alertId: tenant1AlertId, 
            tenantId: tenant1Id,
            metadata: 'x'.repeat(100000) // 100KB string
          },
          expectedStatus: 413
        }
      ];

      for (const testCase of invalidInputs) {
        await request(app)
          .post('/api/investigations/start')
          .set('Authorization', `Bearer ${user1Token}`)
          .send(testCase.payload)
          .expect(testCase.expectedStatus);
      }
    });

    test('should prevent NoSQL injection in evidence queries', async () => {
      // Start an investigation to have evidence data
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      tenant1InvestigationId = startResponse.body.investigationId;

      const noSqlInjectionAttempts = [
        '{"$ne": null}',
        '{"$gt": ""}',
        '{"$where": "this.password"}',
        '{"$regex": ".*"}',
        '{"$or": [{"a": 1}, {"b": 2}]}'
      ];

      for (const injection of noSqlInjectionAttempts) {
        // Test in evidence search
        await request(app)
          .get(`/api/evidence/search?query=${encodeURIComponent(injection)}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200); // Should handle gracefully

        // Test in evidence filter
        await request(app)
          .get(`/api/investigations/${tenant1InvestigationId}/evidence?filter=${encodeURIComponent(injection)}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200); // Should sanitize and handle safely
      }
    });
  });

  describe('Data Encryption and Protection', () => {
    test('should encrypt sensitive investigation data at rest', async () => {
      // Start investigation with sensitive data
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id,
          sensitiveData: {
            credentials: 'admin:password123',
            apiKeys: ['secret-key-1', 'secret-key-2'],
            personalInfo: 'john.doe@company.com'
          }
        })
        .expect(201);

      tenant1InvestigationId = startResponse.body.investigationId;

      // Check that sensitive data is encrypted in database
      const dbResult = await db.query(
        'SELECT raw_data FROM investigations WHERE id = $1',
        [tenant1InvestigationId]
      );

      const rawData = JSON.stringify(dbResult.rows[0].raw_data);
      
      // Sensitive data should not appear in plaintext
      expect(rawData).not.toContain('admin:password123');
      expect(rawData).not.toContain('secret-key-1');
      expect(rawData).not.toContain('john.doe@company.com');

      // But should be decrypted when accessed via API
      const apiResponse = await request(app)
        .get(`/api/investigations/${tenant1InvestigationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // API should return decrypted data (if user has permission)
      expect(apiResponse.body.investigation).toBeDefined();
    });

    test('should protect investigation data in transit', async () => {
      // This test would typically check HTTPS enforcement
      // For testing purposes, we'll verify security headers
      
      const response = await request(app)
        .get('/api/investigations')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Check security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      
      // In production, would also check:
      // - Strict-Transport-Security header
      // - Content-Security-Policy header
      // - HTTPS enforcement
    });

    test('should implement secure session management', async () => {
      // Test token expiration
      const shortLivedToken = jwt.sign(
        { 
          userId: uuidv4(), 
          tenantId: tenant1Id, 
          exp: Math.floor(Date.now() / 1000) + 1 // 1 second expiry
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      // Token should work initially
      await request(app)
        .get('/api/investigations')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(200);

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Token should be rejected after expiry
      await request(app)
        .get('/api/investigations')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(401);
    });
  });

  describe('Audit Trail Security', () => {
    test('should create immutable audit logs for all investigation actions', async () => {
      // Start investigation
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      tenant1InvestigationId = startResponse.body.investigationId;

      // Perform various actions
      await request(app)
        .post(`/api/investigations/${tenant1InvestigationId}/feedback`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          feedback: { type: 'note', content: 'Test feedback' }
        })
        .expect(200);

      // Get audit trail
      const auditResponse = await request(app)
        .get(`/api/investigations/${tenant1InvestigationId}/audit`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      const auditTrail = auditResponse.body.auditTrail;
      expect(auditTrail.length).toBeGreaterThan(0);

      // Verify audit entries have required security fields
      auditTrail.forEach(entry => {
        expect(entry.timestamp).toBeDefined();
        expect(entry.userId).toBeDefined();
        expect(entry.tenantId).toBe(tenant1Id);
        expect(entry.action).toBeDefined();
        expect(entry.ipAddress).toBeDefined();
        expect(entry.userAgent).toBeDefined();
      });

      // Attempt to modify audit log (should fail)
      const auditEntryId = auditTrail[0].id;
      await request(app)
        .put(`/api/audit/logs/${auditEntryId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ action: 'modified_action' })
        .expect(405); // Method not allowed

      // Attempt to delete audit log (should fail)
      await request(app)
        .delete(`/api/audit/logs/${auditEntryId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(405); // Method not allowed
    });

    test('should detect and prevent audit log tampering', async () => {
      // Start investigation to generate audit logs
      const startResponse = await request(app)
        .post('/api/investigations/start')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          alertId: tenant1AlertId,
          tenantId: tenant1Id
        })
        .expect(201);

      tenant1InvestigationId = startResponse.body.investigationId;

      // Get initial audit trail
      const initialAuditResponse = await request(app)
        .get(`/api/investigations/${tenant1InvestigationId}/audit`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      const initialAuditTrail = initialAuditResponse.body.auditTrail;
      expect(initialAuditTrail.length).toBeGreaterThan(0);

      // Verify audit trail integrity
      const integrityResponse = await request(app)
        .get(`/api/audit/integrity-check/${tenant1InvestigationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(integrityResponse.body.isValid).toBe(true);
      expect(integrityResponse.body.checksum).toBeDefined();

      // Simulate direct database tampering (in real scenario, this would be detected)
      // This test verifies the integrity checking mechanism works
      const tamperResult = await db.query(`
        UPDATE audit_logs 
        SET action = 'tampered_action' 
        WHERE investigation_id = $1 
        AND action = 'investigation_started'
      `, [tenant1InvestigationId]);

      if (tamperResult.rowCount > 0) {
        // Check integrity again - should detect tampering
        const tamperCheckResponse = await request(app)
          .get(`/api/audit/integrity-check/${tenant1InvestigationId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(tamperCheckResponse.body.isValid).toBe(false);
        expect(tamperCheckResponse.body.tamperedEntries).toBeDefined();
      }
    });
  });

  // Helper functions
  async function setupSecurityTestEnvironment() {
    await db.query(`
      INSERT INTO tenants (id, name, created_at) 
      VALUES ($1, 'Security Test Tenant 1', NOW()), ($2, 'Security Test Tenant 2', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [tenant1Id, tenant2Id]);
  }

  async function createTestUsers() {
    const user1Id = uuidv4();
    const user2Id = uuidv4();
    const adminId = uuidv4();

    // Create test users in database
    await db.query(`
      INSERT INTO users (id, email, tenant_id, role, created_at)
      VALUES 
        ($1, 'user1@test.com', $2, 'analyst', NOW()),
        ($3, 'user2@test.com', $4, 'analyst', NOW()),
        ($5, 'admin@test.com', $2, 'admin', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [user1Id, tenant1Id, user2Id, tenant2Id, adminId]);

    // Generate JWT tokens
    const jwtSecret = process.env.JWT_SECRET || 'test-secret';
    
    user1Token = jwt.sign(
      { userId: user1Id, tenantId: tenant1Id, role: 'analyst' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    user2Token = jwt.sign(
      { userId: user2Id, tenantId: tenant2Id, role: 'analyst' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { userId: adminId, tenantId: tenant1Id, role: 'admin' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    unauthorizedToken = jwt.sign(
      { userId: uuidv4(), tenantId: uuidv4(), role: 'unauthorized' },
      jwtSecret,
      { expiresIn: '1h' }
    );
  }

  async function cleanupSecurityTestEnvironment() {
    await db.query('DELETE FROM investigations WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM alerts WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM audit_logs WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await db.query('DELETE FROM users WHERE tenant_id IN ($1, $2)', [tenant1Id, tenant2Id]);
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