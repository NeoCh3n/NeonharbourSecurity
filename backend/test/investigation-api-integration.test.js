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
const { auditLog } = require('../middleware/audit');
const app = require('../server');

describe('Investigation API Integration Tests - Complete Workflow', () => {
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
    
    // Default auth middleware mocks
    pool.query
      .mockResolvedValueOnce({ rows: [testUser] }) // User lookup
      .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] }) // Tenant lookup
      .mockResolvedValueOnce({ rows: [{ id: testTenantId }] }); // Default tenant lookup
  });

  describe('Complete Investigation Workflow', () => {
    it('should handle complete investigation lifecycle', async () => {
      // 1. Start investigation
      const mockInvestigation = {
        id: testInvestigationId,
        alert_id: testAlertId,
        priority: 4,
        status: 'planning',
        tenant_id: testTenantId,
        created_at: new Date().toISOString()
      };

      mockOrchestrator.startInvestigation.mockResolvedValue(mockInvestigation);

      const startResponse = await request(app)
        .post('/investigations/start')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send({
          alertId: testAlertId,
          priority: 4,
          timeoutMs: 3600000
        });

      expect(startResponse.status).toBe(200);
      expect(startResponse.body.investigation.id).toBe(testInvestigationId);

      // 2. Check status during execution
      const mockExecutingStatus = {
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
          },
          {
            id: 2,
            step_name: 'Execute Investigation',
            agent_type: 'execution',
            status: 'running',
            started_at: new Date().toISOString(),
            completed_at: null,
            retry_count: 0
          }
        ],
        progress: 50,
        isActive: true,
        currentAgent: 'execution'
      };

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockExecutingStatus);

      // Reset auth mocks for status check
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      const statusResponse = await request(app)
        .get(`/investigations/${testInvestigationId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.status.status).toBe('executing');
      expect(statusResponse.body.status.progress).toBe(50);

      // 3. Add human feedback
      mockOrchestrator.addHumanFeedback.mockResolvedValue();

      // Reset auth mocks for feedback
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      const feedback = {
        type: 'step_feedback',
        stepId: 2,
        feedback: 'Investigation looks good, continue with analysis',
        confidence: 0.8
      };

      const feedbackResponse = await request(app)
        .post(`/investigations/${testInvestigationId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send(feedback);

      expect(feedbackResponse.status).toBe(200);
      expect(feedbackResponse.body.success).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        testUser.id,
        'investigation_feedback_added',
        expect.objectContaining({
          investigationId: testInvestigationId,
          feedbackType: 'step_feedback'
        })
      );

      // 4. Check timeline
      // Reset auth mocks for timeline
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      const timelineResponse = await request(app)
        .get(`/investigations/${testInvestigationId}/timeline`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(timelineResponse.status).toBe(200);
      expect(timelineResponse.body.timeline).toHaveLength(2);
      expect(timelineResponse.body.timeline[0].status).toBe('complete');
      expect(timelineResponse.body.timeline[1].status).toBe('running');

      // 5. Complete investigation and generate report
      const mockCompleteStatus = {
        ...mockExecutingStatus,
        status: 'complete',
        completed_at: new Date().toISOString(),
        steps: mockExecutingStatus.steps.map(step => ({
          ...step,
          status: 'complete',
          completed_at: new Date().toISOString()
        }))
      };

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockCompleteStatus);

      // Reset auth mocks for report
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      // Mock feedback query for report
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            feedback_type: 'step_feedback',
            content: JSON.stringify(feedback),
            created_at: new Date().toISOString(),
            user_email: testUser.email
          }
        ]
      });

      const reportResponse = await request(app)
        .get(`/investigations/${testInvestigationId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(reportResponse.status).toBe(200);
      expect(reportResponse.body.report.status).toBe('complete');
      expect(reportResponse.body.report.feedback).toHaveLength(1);
      expect(reportResponse.body.report.summary.totalSteps).toBe(2);
      expect(reportResponse.body.report.summary.completedSteps).toBe(2);
      expect(auditLog).toHaveBeenCalledWith(
        testUser.id,
        'investigation_report_generated',
        expect.objectContaining({
          investigationId: testInvestigationId
        })
      );
    });
  });

  describe('Investigation Statistics', () => {
    it('should return investigation statistics', async () => {
      const mockStats = {
        total_investigations: '10',
        completed_investigations: '7',
        failed_investigations: '1',
        active_investigations: '2',
        avg_duration_seconds: '1800', // 30 minutes
        avg_priority: '3.2'
      };

      const mockStatusDistribution = [
        { status: 'complete', count: '7' },
        { status: 'active', count: '2' },
        { status: 'failed', count: '1' }
      ];

      // Reset auth mocks for stats
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      // Mock stats queries
      pool.query
        .mockResolvedValueOnce({ rows: [mockStats] })
        .mockResolvedValueOnce({ rows: mockStatusDistribution });

      const statsResponse = await request(app)
        .get('/investigations/stats?timeframe=7d')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.timeframe).toBe('7d');
      expect(statsResponse.body.summary.totalInvestigations).toBe(10);
      expect(statsResponse.body.summary.completedInvestigations).toBe(7);
      expect(statsResponse.body.summary.successRate).toBe(70);
      expect(statsResponse.body.summary.averageDurationMinutes).toBe(30);
      expect(statsResponse.body.distributions.byStatus).toHaveLength(3);
    });
  });

  describe('Investigation List with Filtering', () => {
    it('should list investigations with proper pagination', async () => {
      const mockInvestigations = [
        {
          id: testInvestigationId,
          alert_id: testAlertId,
          status: 'complete',
          priority: 4,
          created_at: new Date().toISOString(),
          alert_summary: 'Test alert',
          alert_severity: 'high'
        }
      ];

      // Reset auth mocks for list
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      // Mock count query and list query
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockInvestigations });

      const listResponse = await request(app)
        .get('/investigations?limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.investigations).toHaveLength(1);
      expect(listResponse.body.total).toBe(1);
      expect(listResponse.body.hasMore).toBe(false);
    });

    it('should filter investigations by status', async () => {
      const mockInvestigations = [
        {
          id: testInvestigationId,
          status: 'complete',
          alert_summary: 'Test alert'
        }
      ];

      // Reset auth mocks for filtered list
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      // Mock count and list queries with status filter
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockInvestigations });

      const filterResponse = await request(app)
        .get('/investigations?status=complete')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(filterResponse.status).toBe(200);
      expect(filterResponse.body.investigations).toHaveLength(1);
      expect(filterResponse.body.investigations[0].status).toBe('complete');
    });
  });

  describe('Error Handling and Validation', () => {
    it('should validate feedback object structure', async () => {
      // Reset auth mocks
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      const invalidFeedback = {
        type: 'invalid_type',
        content: 'test'
      };

      const response = await request(app)
        .post(`/investigations/${testInvestigationId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString())
        .send(invalidFeedback);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid feedback type');
    });

    it('should handle investigation not found errors', async () => {
      mockOrchestrator.getInvestigationStatus.mockRejectedValue(
        new Error('Investigation not found')
      );

      const response = await request(app)
        .get('/investigations/nonexistent/status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Investigation not found');
    });

    it('should prevent report generation for incomplete investigations', async () => {
      const mockIncompleteStatus = {
        id: testInvestigationId,
        status: 'executing'
      };

      mockOrchestrator.getInvestigationStatus.mockResolvedValue(mockIncompleteStatus);

      const response = await request(app)
        .get(`/investigations/${testInvestigationId}/report`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Investigation is not complete');
    });
  });

  describe('Investigation Lifecycle Management', () => {
    it('should pause and resume investigations', async () => {
      // Test pause
      mockOrchestrator.pauseInvestigation.mockResolvedValue();

      // Reset auth mocks for pause
      pool.query
        .mockResolvedValueOnce({ rows: [testUser] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: testTenantId, role: 'admin' }] })
        .mockResolvedValueOnce({ rows: [{ id: testTenantId }] });

      const pauseResponse = await request(app)
        .post(`/investigations/${testInvestigationId}/pause`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(pauseResponse.status).toBe(200);
      expect(pauseResponse.body.success).toBe(true);

      // Test resume
      mockOrchestrator.resumeInvestigation.mockResolvedValue();

      const resumeResponse = await request(app)
        .post(`/investigations/${testInvestigationId}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId.toString());

      expect(resumeResponse.status).toBe(200);
      expect(resumeResponse.body.success).toBe(true);
    });
  });
});