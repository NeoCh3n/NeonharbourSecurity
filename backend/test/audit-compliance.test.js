const request = require('supertest');
const express = require('express');
const { ComplianceService } = require('../audit/compliance');
const { auditInvestigationAction, auditApiCall, auditAiDecision } = require('../middleware/audit');
const { pool } = require('../database');

// Mock the database
jest.mock('../database', () => ({
  pool: {
    query: jest.fn()
  }
}));

describe('Audit and Compliance System', () => {
  let complianceService;
  
  beforeEach(() => {
    complianceService = new ComplianceService();
    jest.clearAllMocks();
  });

  describe('ComplianceService', () => {
    describe('logInvestigationAction', () => {
      it('should log investigation action with integrity checksum', async () => {
        const mockResult = { rows: [{ id: 1 }] };
        pool.query.mockResolvedValue(mockResult);

        const investigationId = 'test-investigation-123';
        const action = 'investigation_started';
        const details = { 
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          sessionId: 'session-123'
        };
        const userId = 1;
        const tenantId = 1;

        const logId = await complianceService.logInvestigationAction(
          investigationId, action, details, userId, tenantId
        );

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO investigation_audit_logs'),
          expect.arrayContaining([
            investigationId,
            action,
            userId,
            tenantId,
            expect.any(String), // timestamp
            expect.any(String), // details JSON
            expect.any(String)  // checksum
          ])
        );
        expect(logId).toBe(1);
      });

      it('should handle logging errors gracefully', async () => {
        pool.query.mockRejectedValue(new Error('Database error'));

        await expect(
          complianceService.logInvestigationAction('test-id', 'test-action', {}, 1, 1)
        ).rejects.toThrow('Database error');
      });
    });

    describe('logExternalApiCall', () => {
      it('should log API call with all details', async () => {
        pool.query.mockResolvedValue({});

        const investigationId = 'test-investigation-123';
        const apiCall = {
          endpoint: 'https://api.virustotal.com/v3/files',
          method: 'GET',
          requestHeaders: { 'Authorization': 'Bearer token' },
          requestBody: {},
          responseStatus: 200,
          responseHeaders: { 'Content-Type': 'application/json' },
          responseBody: { data: 'test' },
          durationMs: 150,
          dataSource: 'virustotal',
          queryType: 'file_lookup',
          recordsReturned: 1
        };
        const tenantId = 1;

        await complianceService.logExternalApiCall(investigationId, apiCall, tenantId);

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO api_call_logs'),
          expect.arrayContaining([
            investigationId,
            tenantId,
            expect.any(String), // timestamp
            apiCall.endpoint,
            apiCall.method,
            JSON.stringify(apiCall.requestHeaders),
            JSON.stringify(apiCall.requestBody),
            apiCall.responseStatus,
            JSON.stringify(apiCall.responseHeaders),
            JSON.stringify(apiCall.responseBody),
            apiCall.durationMs,
            undefined, // error_message
            apiCall.dataSource,
            apiCall.queryType,
            apiCall.recordsReturned,
            expect.any(String) // checksum
          ])
        );
      });
    });

    describe('logAiDecision', () => {
      it('should log AI decision with reasoning process', async () => {
        pool.query.mockResolvedValue({});

        const investigationId = 'test-investigation-123';
        const decision = {
          type: 'verdict_determination',
          agentType: 'analysis-agent',
          inputData: { alert: 'test-alert' },
          reasoningProcess: 'Analyzed evidence and determined threat level',
          evidenceConsidered: ['evidence-1', 'evidence-2'],
          confidenceScore: 0.85,
          outputData: { verdict: 'true_positive' },
          modelVersion: 'gpt-4',
          promptTemplate: 'analysis-template-v1',
          executionTimeMs: 2500
        };
        const tenantId = 1;

        await complianceService.logAiDecision(investigationId, decision, tenantId);

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO ai_decision_logs'),
          expect.arrayContaining([
            investigationId,
            tenantId,
            expect.any(String), // timestamp
            decision.type,
            decision.agentType,
            JSON.stringify(decision.inputData),
            decision.reasoningProcess,
            JSON.stringify(decision.evidenceConsidered),
            decision.confidenceScore,
            JSON.stringify(decision.outputData),
            decision.modelVersion,
            decision.promptTemplate,
            decision.executionTimeMs,
            expect.any(String) // checksum
          ])
        );
      });
    });

    describe('verifyAuditIntegrity', () => {
      it('should verify integrity across all audit tables', async () => {
        const mockResults = [
          { rows: [{ id: 1, checksum: 'abc123', status: 'valid' }] },
          { rows: [{ id: 2, checksum: 'def456', status: 'valid' }] },
          { rows: [{ id: 3, checksum: null, status: 'missing_checksum' }] },
          { rows: [{ id: 4, checksum: 'ghi789', status: 'valid' }] }
        ];

        pool.query
          .mockResolvedValueOnce(mockResults[0])
          .mockResolvedValueOnce(mockResults[1])
          .mockResolvedValueOnce(mockResults[2])
          .mockResolvedValueOnce(mockResults[3]);

        const investigationId = 'test-investigation-123';
        const tenantId = 1;

        const result = await complianceService.verifyAuditIntegrity(investigationId, tenantId);

        expect(result).toHaveProperty('investigationId', investigationId);
        expect(result).toHaveProperty('tenantId', tenantId);
        expect(result).toHaveProperty('overallIntegrityScore');
        expect(result).toHaveProperty('tableResults');
        expect(result.tableResults).toHaveProperty('investigation_audit_logs');
        expect(result.tableResults).toHaveProperty('api_call_logs');
        expect(result.tableResults).toHaveProperty('ai_decision_logs');
        expect(result.tableResults).toHaveProperty('human_modification_logs');
      });
    });

    describe('generateComplianceReport', () => {
      it('should generate comprehensive compliance report', async () => {
        const mockInvestigation = {
          rows: [{
            id: 'test-investigation-123',
            alert_id: 1,
            case_id: null,
            status: 'complete',
            priority: 3,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T01:00:00Z',
            completed_at: '2023-01-01T01:00:00Z',
            user_email: 'test@example.com',
            alert_summary: 'Test alert',
            alert_severity: 'high'
          }]
        };

        pool.query.mockResolvedValue(mockInvestigation);

        // Mock the helper methods
        complianceService.getCompleteAuditTrail = jest.fn().mockResolvedValue({
          investigation_audit_logs: [],
          api_call_logs: [],
          ai_decision_logs: [],
          human_modification_logs: []
        });
        complianceService.getEvidenceChain = jest.fn().mockResolvedValue([]);
        complianceService.getHumanInteractions = jest.fn().mockResolvedValue([]);
        complianceService.verifyAuditIntegrity = jest.fn().mockResolvedValue({
          overallIntegrityScore: 100,
          tableResults: {}
        });
        complianceService.checkDataRetentionCompliance = jest.fn().mockResolvedValue({ compliant: true });
        complianceService.checkAccessControlCompliance = jest.fn().mockResolvedValue({ compliant: true });
        complianceService.checkGdprCompliance = jest.fn().mockResolvedValue({ compliant: true });
        complianceService.checkSoxCompliance = jest.fn().mockResolvedValue({ compliant: true });
        complianceService.checkHipaaCompliance = jest.fn().mockResolvedValue({ compliant: true });

        const investigationId = 'test-investigation-123';
        const tenantId = 1;

        const report = await complianceService.generateComplianceReport(investigationId, tenantId);

        expect(report).toHaveProperty('metadata');
        expect(report).toHaveProperty('investigation');
        expect(report).toHaveProperty('auditTrail');
        expect(report).toHaveProperty('evidenceChain');
        expect(report).toHaveProperty('humanInteractions');
        expect(report).toHaveProperty('integrityVerification');
        expect(report).toHaveProperty('compliance');
        expect(report.metadata).toHaveProperty('reportId');
        expect(report.metadata).toHaveProperty('investigationId', investigationId);
        expect(report.metadata).toHaveProperty('tenantId', tenantId);
      });

      it('should throw error for non-existent investigation', async () => {
        pool.query.mockResolvedValue({ rows: [] });

        await expect(
          complianceService.generateComplianceReport('non-existent', 1)
        ).rejects.toThrow('Investigation not found');
      });
    });

    describe('exportInvestigationData', () => {
      it('should export investigation data in JSON format', async () => {
        const mockReport = {
          metadata: { reportId: 'test-report-123' },
          investigation: { id: 'test-investigation-123' }
        };

        complianceService.generateComplianceReport = jest.fn().mockResolvedValue(mockReport);

        const investigationId = 'test-investigation-123';
        const tenantId = 1;
        const format = 'json';

        const result = await complianceService.exportInvestigationData(investigationId, tenantId, format);

        expect(result).toHaveProperty('investigationId', investigationId);
        expect(result).toHaveProperty('format', format);
        expect(result).toHaveProperty('exportedAt');
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('checksum');
        expect(typeof result.data).toBe('string');
      });

      it('should throw error for unsupported format', async () => {
        // Mock the generateComplianceReport to avoid "Investigation not found" error
        complianceService.generateComplianceReport = jest.fn().mockResolvedValue({
          metadata: { reportId: 'test-report-123' }
        });

        await expect(
          complianceService.exportInvestigationData('test-id', 1, 'unsupported')
        ).rejects.toThrow('Unsupported export format: unsupported');
      });
    });

    describe('enforceDataRetention', () => {
      it('should enforce retention policies for all data types', async () => {
        const mockResults = [
          { rowCount: 5 },
          { rowCount: 3 },
          { rowCount: 0 },
          { rowCount: 2 },
          { rowCount: 1 }
        ];

        pool.query
          .mockResolvedValueOnce(mockResults[0])
          .mockResolvedValueOnce(mockResults[1])
          .mockResolvedValueOnce(mockResults[2])
          .mockResolvedValueOnce(mockResults[3])
          .mockResolvedValueOnce(mockResults[4]);

        const tenantId = 1;
        const results = await complianceService.enforceDataRetention(tenantId);

        expect(results).toHaveProperty('investigation_logs');
        expect(results).toHaveProperty('audit_logs');
        expect(results).toHaveProperty('evidence_data');
        expect(results).toHaveProperty('feedback_data');
        expect(results).toHaveProperty('performance_metrics');

        expect(results.investigation_logs.recordsDeleted).toBe(5);
        expect(results.audit_logs.recordsDeleted).toBe(3);
        expect(results.evidence_data.recordsDeleted).toBe(0);
        expect(results.feedback_data.recordsDeleted).toBe(2);
        expect(results.performance_metrics.recordsDeleted).toBe(1);
      });
    });
  });

  describe('Audit Middleware Functions', () => {
    describe('auditInvestigationAction', () => {
      it('should log investigation action with checksum', async () => {
        pool.query.mockResolvedValue({});

        const investigationId = 'test-investigation-123';
        const action = 'step_executed';
        const details = { stepName: 'analyze_evidence' };
        const userId = 1;
        const tenantId = 1;

        await auditInvestigationAction(investigationId, action, details, userId, tenantId);

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO investigation_audit_logs'),
          expect.arrayContaining([
            investigationId,
            action,
            userId,
            tenantId,
            expect.any(String), // timestamp
            expect.any(String), // details JSON
            expect.any(String)  // checksum
          ])
        );
      });
    });

    describe('auditApiCall', () => {
      it('should log API call with all parameters', async () => {
        pool.query.mockResolvedValue({});

        const investigationId = 'test-investigation-123';
        const apiCall = {
          endpoint: 'https://api.test.com/data',
          method: 'POST',
          requestHeaders: { 'Content-Type': 'application/json' },
          requestBody: { query: 'test' },
          responseStatus: 200,
          responseHeaders: { 'Content-Type': 'application/json' },
          responseBody: { result: 'success' },
          durationMs: 250,
          dataSource: 'test-source',
          queryType: 'test-query',
          recordsReturned: 5
        };
        const tenantId = 1;

        await auditApiCall(investigationId, apiCall, tenantId);

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO api_call_logs'),
          expect.arrayContaining([
            investigationId,
            tenantId,
            expect.any(String), // timestamp
            apiCall.endpoint,
            apiCall.method,
            JSON.stringify(apiCall.requestHeaders),
            JSON.stringify(apiCall.requestBody),
            apiCall.responseStatus,
            JSON.stringify(apiCall.responseHeaders),
            JSON.stringify(apiCall.responseBody),
            apiCall.durationMs,
            undefined, // error_message
            apiCall.dataSource,
            apiCall.queryType,
            apiCall.recordsReturned,
            expect.any(String) // checksum
          ])
        );
      });
    });

    describe('auditAiDecision', () => {
      it('should log AI decision with reasoning', async () => {
        pool.query.mockResolvedValue({});

        const investigationId = 'test-investigation-123';
        const decision = {
          type: 'evidence_analysis',
          agentType: 'analysis-agent',
          inputData: { evidence: 'test-evidence' },
          reasoningProcess: 'Applied threat intelligence rules',
          evidenceConsidered: ['evidence-1'],
          confidenceScore: 0.9,
          outputData: { threat_level: 'high' },
          modelVersion: 'gpt-4',
          promptTemplate: 'analysis-v2',
          executionTimeMs: 1500
        };
        const tenantId = 1;

        await auditAiDecision(investigationId, decision, tenantId);

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO ai_decision_logs'),
          expect.arrayContaining([
            investigationId,
            tenantId,
            expect.any(String), // timestamp
            decision.type,
            decision.agentType,
            JSON.stringify(decision.inputData),
            decision.reasoningProcess,
            JSON.stringify(decision.evidenceConsidered),
            decision.confidenceScore,
            JSON.stringify(decision.outputData),
            decision.modelVersion,
            decision.promptTemplate,
            decision.executionTimeMs,
            expect.any(String) // checksum
          ])
        );
      });
    });
  });

  describe('Data Immutability and Integrity', () => {
    it('should generate consistent checksums for identical data', () => {
      const data1 = { test: 'data', timestamp: '2023-01-01T00:00:00Z' };
      const data2 = { test: 'data', timestamp: '2023-01-01T00:00:00Z' };
      
      const crypto = require('crypto');
      const checksum1 = crypto.createHash('sha256').update(JSON.stringify(data1)).digest('hex');
      const checksum2 = crypto.createHash('sha256').update(JSON.stringify(data2)).digest('hex');
      
      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', () => {
      const data1 = { test: 'data1', timestamp: '2023-01-01T00:00:00Z' };
      const data2 = { test: 'data2', timestamp: '2023-01-01T00:00:00Z' };
      
      const crypto = require('crypto');
      const checksum1 = crypto.createHash('sha256').update(JSON.stringify(data1)).digest('hex');
      const checksum2 = crypto.createHash('sha256').update(JSON.stringify(data2)).digest('hex');
      
      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      pool.query.mockRejectedValue(new Error('Connection timeout'));

      // Should not throw but log error
      await expect(
        auditInvestigationAction('test-id', 'test-action', {}, 1, 1)
      ).resolves.toBeUndefined();
    });

    it('should handle malformed data gracefully', async () => {
      pool.query.mockResolvedValue({});

      const circularObj = {};
      circularObj.self = circularObj;

      // Should handle circular references
      await expect(
        complianceService.logInvestigationAction('test-id', 'test-action', { circular: circularObj }, 1, 1)
      ).rejects.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large audit logs efficiently', async () => {
      pool.query.mockResolvedValue({});

      const largeDetails = {
        data: new Array(1000).fill('test-data'),
        metadata: new Array(500).fill({ key: 'value' })
      };

      const startTime = Date.now();
      await auditInvestigationAction('test-id', 'test-action', largeDetails, 1, 1);
      const endTime = Date.now();

      // Should complete within reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});

describe('Compliance API Integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    app.use((req, res, next) => {
      req.user = { id: 1, email: 'test@example.com', is_admin: true };
      req.tenantId = 1;
      next();
    });

    app.use('/compliance', require('../audit/api'));
  });

  describe('GET /compliance/reports/:investigationId', () => {
    it('should generate and return compliance report', async () => {
      const mockInvestigation = { rows: [{ id: 'test-investigation-123' }] };
      const mockReport = {
        metadata: { reportId: 'test-report-123' },
        investigation: { id: 'test-investigation-123' }
      };

      pool.query
        .mockResolvedValueOnce(mockInvestigation) // Investigation exists check
        .mockResolvedValueOnce({}); // Store report

      ComplianceService.prototype.generateComplianceReport = jest.fn().mockResolvedValue(mockReport);

      const response = await request(app)
        .get('/compliance/reports/test-investigation-123')
        .expect(200);

      expect(response.body).toHaveProperty('report');
      expect(response.body.report).toEqual(mockReport);
    });

    it('should return 404 for non-existent investigation', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await request(app)
        .get('/compliance/reports/non-existent')
        .expect(404);
    });
  });

  describe('POST /compliance/export/:investigationId', () => {
    it('should return 404 for non-existent investigation', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await request(app)
        .post('/compliance/export/non-existent')
        .send({ format: 'json' })
        .expect(404);
    });
  });

  describe('GET /compliance/integrity/:investigationId', () => {
    it('should verify and return audit integrity', async () => {
      const mockIntegrity = {
        investigationId: 'test-investigation-123',
        overallIntegrityScore: 95.5,
        tableResults: {}
      };

      pool.query.mockResolvedValue({}); // Store integrity check

      ComplianceService.prototype.verifyAuditIntegrity = jest.fn().mockResolvedValue(mockIntegrity);

      const response = await request(app)
        .get('/compliance/integrity/test-investigation-123')
        .expect(200);

      expect(response.body).toHaveProperty('integrityCheck');
      expect(response.body.integrityCheck).toEqual(mockIntegrity);
    });
  });

  describe('POST /compliance/retention/enforce', () => {
    it('should enforce data retention policies for admin users', async () => {
      const mockResults = {
        investigation_logs: { recordsDeleted: 5 },
        audit_logs: { recordsDeleted: 3 }
      };

      ComplianceService.prototype.enforceDataRetention = jest.fn().mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/compliance/retention/enforce')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Data retention policies enforced');
      expect(response.body).toHaveProperty('results', mockResults);
    });

    it('should deny access for non-admin users', async () => {
      // Create a new app instance with non-admin user
      const nonAdminApp = express();
      nonAdminApp.use(express.json());
      
      // Mock auth middleware for non-admin user
      nonAdminApp.use((req, res, next) => {
        req.user = { id: 1, email: 'test@example.com', is_admin: false };
        req.tenantId = 1;
        next();
      });

      nonAdminApp.use('/compliance', require('../audit/api'));

      await request(nonAdminApp)
        .post('/compliance/retention/enforce')
        .expect(403);
    });
  });
});