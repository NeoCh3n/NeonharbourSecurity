const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock the database for testing
jest.mock('../database', () => ({
  pool: {
    query: jest.fn(),
  },
  initDatabase: jest.fn(),
}));

// Mock the investigation orchestrator
const mockOrchestrator = {
  startInvestigation: jest.fn(),
  getInvestigationStatus: jest.fn(),
  pauseInvestigation: jest.fn(),
  resumeInvestigation: jest.fn(),
  addHumanFeedback: jest.fn(),
};

jest.mock('../investigation/orchestrator', () => ({
  InvestigationOrchestrator: jest.fn().mockImplementation(() => mockOrchestrator)
}));

// Mock audit logging
jest.mock('../middleware/audit', () => ({
  auditLog: jest.fn()
}));

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';

const { pool } = require('../database');
const app = require('../server');

describe('Investigation API Integration Tests', () => {
  let authToken;
  const testUser = { id: 1, email: 'test@example.com', is_admin: false };
  const testTenantId = 1;
  const testAlertId = 1;
  const testInvestigationId = 'inv_test_123';

  beforeAll(() => {
    // Generate auth token
    authToken = jwt.sign(
      { id: testUser.id, email: testUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default auth middleware mocks - need to be set up for each test
    pool.query
      .mockResolvedValueOnce({ rows: [testUser] }) // User lookup
      .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] }) // Tenant lookup
      .mockResolvedValueOnce({ rows: [{ id: testTenantId }] }); // Default tenant lookup
  });

  describe('POST /investigations/start', () => {
    it('should start a new investigation successfully', async () => {
      const mockInvestigation = {
        id: testInvestigationId,
        alert_id: testAlertId,
        priority: 4,
        status: 'planning',
        tenant_id: testTenantId,
        created_at: new Date().toISOString()
      };

      mockOrchestrator.startInvestigation.mockResolvedValue(mockInvestigation);

      const response = await request(app)
        .post('/investigations/start')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send({
          alertId: testAlertId,
          priority: 4,
          timeoutMs: 3600000
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('investigation');
      expect(response.body.investigation.id).toBe(testInvestigationId);
      expect(response.body.investigation.alert_id).toBe(testAlertId);
      expect(response.body.investigation.priority).toBe(4);
      expect(response.body.investigation.status).toBe('planning');

      expect(mockOrchestrator.startInvestigation).toHaveBeenCalledWith(
        testAlertId,
        expect.objectContaining({
          userId: testUser.id,
          tenantId: testTenantId,
          priority: 4,
          timeoutMs: 3600000
        })
      );
    });

    it('should return 400 when alertId is missing', async () => {
      const response = await request(app)
        .post('/investigations/start')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send({
          priority: 3
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('alertId is required');
    });

    it('should return 401 when no auth token provided', async () => {
      const response = await request(app)
        .post('/investigations/start')
        .send({
          alertId: testAlertId,
          priority: 3
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /investigations/:id/status', () => {
    it('should return investigation status successfully', async () => {
      const mockStatus = {
        id: testInvestigationId,
        alert_id: testAlertId,
        status: 'executing',
        steps: [
          {
            id: 1,
            step_name: 'Generate Plan',
            agent_type: 'planning',
            status: 'complete',
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            retry_count: 0
          }
        ],
        progress: 50,
        isActive: true,
        currentAgent: 'execution'
      };

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get(`/investigations/${testInvestigationId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status.id).toBe(testInvestigationId);
      expect(response.body.status.alert_id).toBe(testAlertId);
      expect(response.body.status.status).toBe('executing');
      expect(response.body.status.steps).toHaveLength(1);
      expect(response.body.status.progress).toBe(50);

      expect(mockOrchestrator.getInvestigationStatus).toHaveBeenCalledWith(
        testInvestigationId,
        testTenantId
      );
    });

    it('should return 404 for non-existent investigation', async () => {
      mockOrchestrator.getInvestigationStatus.mockRejectedValue(
        new Error('Investigation inv_nonexistent not found')
      );

      const response = await request(app)
        .get('/investigations/inv_nonexistent/status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /investigations/:id/timeline', () => {
    it('should return investigation timeline successfully', async () => {
      const mockStatus = {
        id: testInvestigationId,
        status: 'executing',
        progress: 66,
        steps: [
          {
            id: 1,
            step_name: 'Generate Investigation Plan',
            agent_type: 'planning',
            status: 'complete',
            started_at: '2023-01-01T10:00:00Z',
            completed_at: '2023-01-01T10:02:00Z',
            retry_count: 0,
            output_data: { plan: 'test' }
          },
          {
            id: 2,
            step_name: 'Query SIEM Data',
            agent_type: 'execution',
            status: 'complete',
            started_at: '2023-01-01T10:02:00Z',
            completed_at: '2023-01-01T10:05:00Z',
            retry_count: 1,
            output_data: { results: [] }
          },
          {
            id: 3,
            step_name: 'Analyze Evidence',
            agent_type: 'analysis',
            status: 'running',
            started_at: '2023-01-01T10:05:00Z',
            completed_at: null,
            retry_count: 0,
            output_data: null
          }
        ]
      };

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get(`/investigations/${testInvestigationId}/timeline`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('investigationId', testInvestigationId);
      expect(response.body).toHaveProperty('status', 'executing');
      expect(response.body).toHaveProperty('progress', 66);
      expect(response.body).toHaveProperty('timeline');
      expect(response.body.timeline).toHaveLength(3);

      const firstStep = response.body.timeline[0];
      expect(firstStep).toHaveProperty('id', 1);
      expect(firstStep).toHaveProperty('name', 'Generate Investigation Plan');
      expect(firstStep).toHaveProperty('agent', 'planning');
      expect(firstStep).toHaveProperty('status', 'complete');
      expect(firstStep).toHaveProperty('startedAt');
      expect(firstStep).toHaveProperty('completedAt');
      expect(firstStep).toHaveProperty('duration');
      expect(firstStep).toHaveProperty('retries', 0);
      expect(firstStep.duration).toBe(120000); // 2 minutes in milliseconds
    });
  });

  describe('POST /investigations/:id/feedback', () => {
    it('should add human feedback successfully', async () => {
      mockOrchestrator.addHumanFeedback.mockResolvedValue();

      const feedback = {
        type: 'verdict_correction',
        verdict: 'false_positive',
        reasoning: 'This appears to be a false positive based on additional context',
        confidence: 0.9
      };

      const response = await request(app)
        .post(`/investigations/${testInvestigationId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send(feedback);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      expect(mockOrchestrator.addHumanFeedback).toHaveBeenCalledWith(
        testInvestigationId,
        feedback,
        testUser.id,
        testTenantId
      );
    });

    it('should return 400 when feedback object is missing', async () => {
      // Add auth mocks for this test
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      const response = await request(app)
        .post(`/investigations/${testInvestigationId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send();

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Feedback object is required');
    });

    it('should return 400 when feedback is not an object', async () => {
      // Add auth mocks for this test
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      const response = await request(app)
        .post(`/investigations/${testInvestigationId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send('invalid feedback');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Feedback object is required');
    });
  });

  describe('GET /investigations/:id/report', () => {
    it('should generate investigation report successfully', async () => {
      const mockStatus = {
        id: testInvestigationId,
        alert_id: testAlertId,
        case_id: 1,
        status: 'complete',
        created_at: '2023-01-01T10:00:00Z',
        completed_at: '2023-01-01T10:30:00Z',
        context: { alertSummary: 'Test alert' },
        steps: [
          {
            step_name: 'Generate Plan',
            agent_type: 'planning',
            status: 'complete',
            started_at: '2023-01-01T10:00:00Z',
            completed_at: '2023-01-01T10:02:00Z',
            retry_count: 0
          },
          {
            step_name: 'Execute Plan',
            agent_type: 'execution',
            status: 'complete',
            started_at: '2023-01-01T10:02:00Z',
            completed_at: '2023-01-01T10:25:00Z',
            retry_count: 1
          }
        ]
      };

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockStatus);

      // Add auth mocks for this test
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      // Mock feedback query
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            feedback_type: 'verdict_correction',
            content: { verdict: 'false_positive', reasoning: 'Test reasoning' },
            created_at: '2023-01-01T10:35:00Z',
            user_email: 'test@example.com'
          }
        ]
      });

      const response = await request(app)
        .get(`/investigations/${testInvestigationId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('report');
      
      const report = response.body.report;
      expect(report).toHaveProperty('investigationId', testInvestigationId);
      expect(report).toHaveProperty('alertId', testAlertId);
      expect(report).toHaveProperty('status', 'complete');
      expect(report).toHaveProperty('createdAt');
      expect(report).toHaveProperty('completedAt');
      expect(report).toHaveProperty('duration', 1800000); // 30 minutes
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('timeline');
      expect(report).toHaveProperty('feedback');
      expect(report).toHaveProperty('generatedAt');

      // Verify summary statistics
      expect(report.summary).toHaveProperty('totalSteps', 2);
      expect(report.summary).toHaveProperty('completedSteps', 2);
      expect(report.summary).toHaveProperty('failedSteps', 0);
      expect(report.summary).toHaveProperty('totalRetries', 1);

      // Verify feedback is included
      expect(Array.isArray(report.feedback)).toBe(true);
      expect(report.feedback.length).toBe(1);
      expect(report.feedback[0]).toHaveProperty('type', 'verdict_correction');
      expect(report.feedback[0]).toHaveProperty('userEmail', 'test@example.com');
    });

    it('should return 400 for incomplete investigation', async () => {
      const mockStatus = {
        id: testInvestigationId,
        status: 'executing'
      };

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get(`/investigations/${testInvestigationId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Investigation is not complete');
    });
  });

  describe('GET /investigations', () => {
    it('should list investigations successfully', async () => {
      const mockInvestigations = [
        {
          id: testInvestigationId,
          alert_id: testAlertId,
          status: 'complete',
          priority: 4,
          created_at: '2023-01-01T10:00:00Z',
          alert_summary: 'Test alert',
          alert_severity: 'high'
        },
        {
          id: 'inv_test_456',
          alert_id: 2,
          status: 'failed',
          priority: 2,
          created_at: '2023-01-01T09:00:00Z',
          alert_summary: 'Another test alert',
          alert_severity: 'low'
        }
      ];

      // Add auth mocks for this test
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      pool.query.mockResolvedValueOnce({ rows: mockInvestigations });

      const response = await request(app)
        .get('/investigations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('investigations');
      expect(response.body).toHaveProperty('total', mockInvestigations.length);
      expect(response.body).toHaveProperty('limit', 50);
      expect(response.body).toHaveProperty('offset', 0);
      expect(Array.isArray(response.body.investigations)).toBe(true);
      expect(response.body.investigations.length).toBe(2);
    });

    it('should filter investigations by status', async () => {
      const mockInvestigations = [
        {
          id: testInvestigationId,
          status: 'complete',
          alert_summary: 'Test alert'
        }
      ];

      // Add auth mocks for this test
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      pool.query.mockResolvedValueOnce({ rows: mockInvestigations });

      const response = await request(app)
        .get('/investigations?status=complete')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(200);
      expect(response.body.investigations.length).toBe(1);
      expect(response.body.investigations[0].status).toBe('complete');
    });

    it('should respect limit and offset parameters', async () => {
      const mockInvestigations = [
        {
          id: testInvestigationId,
          status: 'complete',
          alert_summary: 'Test alert'
        }
      ];

      // Add auth mocks for this test
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      pool.query.mockResolvedValueOnce({ rows: mockInvestigations });

      const response = await request(app)
        .get('/investigations?limit=1&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(200);
      expect(response.body.investigations.length).toBe(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.offset).toBe(0);
    });
  });

  describe('Investigation lifecycle endpoints', () => {
    describe('POST /investigations/:id/pause', () => {
      it('should pause investigation successfully', async () => {
        // Add auth mocks for this test
        pool.query
          .mockResolvedValueOnce({ rows: [testUser] })
          .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
          .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

        mockOrchestrator.pauseInvestigation.mockResolvedValue();

        const response = await request(app)
          .post(`/investigations/${testInvestigationId}/pause`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('x-tenant-id', testTenantId.toString());

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);

        expect(mockOrchestrator.pauseInvestigation).toHaveBeenCalledWith(
          testInvestigationId,
          testUser.id,
          testTenantId
        );
      });
    });

    describe('POST /investigations/:id/resume', () => {
      it('should resume paused investigation successfully', async () => {
        mockOrchestrator.resumeInvestigation.mockResolvedValue();

        const response = await request(app)
          .post(`/investigations/${testInvestigationId}/resume`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('x-tenant-id', testTenantId.toString());

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);

        expect(mockOrchestrator.resumeInvestigation).toHaveBeenCalledWith(
          testInvestigationId,
          testUser.id,
          testTenantId
        );
      });
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle orchestrator errors gracefully', async () => {
      mockOrchestrator.getInvestigationStatus.mockRejectedValue(
        new Error('Investigation not found')
      );

      const response = await request(app)
        .get('/investigations/invalid-id/status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle database errors in report generation', async () => {
      const mockStatus = {
        id: testInvestigationId,
        status: 'complete',
        steps: []
      };

      // Add auth mocks for this test
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockStatus);
      pool.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get(`/investigations/${testInvestigationId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(200);
      expect(response.body.report.feedback).toEqual([]);
    });
  });
});