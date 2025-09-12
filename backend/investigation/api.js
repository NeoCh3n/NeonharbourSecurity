const express = require('express');
const { InvestigationOrchestrator } = require('./orchestrator');
const { auditLog } = require('../middleware/audit');
const { pool } = require('../database');

const router = express.Router();
const orchestrator = new InvestigationOrchestrator();

/**
 * Start a new investigation for an alert
 * POST /investigations/start
 */
router.post('/start', async (req, res) => {
  try {
    const { alertId, priority = 3, timeoutMs } = req.body;
    
    if (!alertId) {
      return res.status(400).json({ error: 'alertId is required' });
    }

    const investigation = await orchestrator.startInvestigation(alertId, {
      userId: req.user.id,
      tenantId: req.tenantId,
      priority: parseInt(priority, 10),
      timeoutMs: timeoutMs ? parseInt(timeoutMs, 10) : undefined
    });

    res.json({ investigation });
  } catch (error) {
    console.error('Failed to start investigation:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get investigation status and progress
 * GET /investigations/:id/status
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    
    const status = await orchestrator.getInvestigationStatus(id, req.tenantId);
    
    res.json({ status });
  } catch (error) {
    console.error('Failed to get investigation status:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * Get investigation timeline with detailed steps
 * GET /investigations/:id/timeline
 */
router.get('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    
    const status = await orchestrator.getInvestigationStatus(id, req.tenantId);
    
    // Format timeline for UI consumption
    const timeline = status.steps.map(step => ({
      id: step.id,
      name: step.step_name,
      agent: step.agent_type,
      status: step.status,
      startedAt: step.started_at,
      completedAt: step.completed_at,
      duration: step.started_at && step.completed_at 
        ? new Date(step.completed_at) - new Date(step.started_at)
        : null,
      error: step.error_message,
      retries: step.retry_count,
      output: step.output_data
    }));
    
    res.json({ 
      investigationId: id,
      status: status.status,
      progress: status.progress,
      timeline 
    });
  } catch (error) {
    console.error('Failed to get investigation timeline:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * Add human feedback to an investigation
 * POST /investigations/:id/feedback
 */
router.post('/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const feedback = req.body;
    
    if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) {
      return res.status(400).json({ error: 'Feedback object is required' });
    }

    // Validate feedback structure
    const validTypes = ['verdict_correction', 'step_feedback', 'general', 'quality_assessment'];
    if (feedback.type && !validTypes.includes(feedback.type)) {
      return res.status(400).json({ error: 'Invalid feedback type' });
    }

    await orchestrator.addHumanFeedback(id, feedback, req.user.id, req.tenantId);
    
    // Log the feedback for audit trail
    await auditLog(req.user.id, 'investigation_feedback_added', {
      investigationId: id,
      feedbackType: feedback.type || 'general',
      tenantId: req.tenantId
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to add investigation feedback:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Pause an active investigation
 * POST /investigations/:id/pause
 */
router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    
    await orchestrator.pauseInvestigation(id, req.user.id, req.tenantId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to pause investigation:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Resume a paused investigation
 * POST /investigations/:id/resume
 */
router.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    
    await orchestrator.resumeInvestigation(id, req.user.id, req.tenantId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to resume investigation:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Generate final investigation report
 * GET /investigations/:id/report
 */
router.get('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;
    
    const status = await orchestrator.getInvestigationStatus(id, req.tenantId);
    
    if (!['complete', 'failed', 'expired'].includes(status.status)) {
      return res.status(400).json({ error: 'Investigation is not complete' });
    }

    // Generate comprehensive report
    const report = {
      investigationId: id,
      alertId: status.alert_id,
      caseId: status.case_id,
      status: status.status,
      createdAt: status.created_at,
      completedAt: status.completed_at,
      duration: status.completed_at 
        ? new Date(status.completed_at) - new Date(status.created_at)
        : null,
      
      summary: {
        totalSteps: status.steps.length,
        completedSteps: status.steps.filter(s => s.status === 'complete').length,
        failedSteps: status.steps.filter(s => s.status === 'failed').length,
        totalRetries: status.steps.reduce((sum, s) => sum + (s.retry_count || 0), 0),
        averageStepDuration: status.steps.length > 0 
          ? status.steps
              .filter(s => s.started_at && s.completed_at)
              .reduce((sum, s) => sum + (new Date(s.completed_at) - new Date(s.started_at)), 0) / status.steps.length
          : null
      },
      
      timeline: status.steps.map(step => ({
        stepName: step.step_name,
        agent: step.agent_type,
        status: step.status,
        startedAt: step.started_at,
        completedAt: step.completed_at,
        duration: step.started_at && step.completed_at 
          ? new Date(step.completed_at) - new Date(step.started_at)
          : null,
        error: step.error_message,
        retries: step.retry_count,
        output: step.output_data ? JSON.parse(step.output_data) : null
      })),
      
      context: status.context,
      
      // Performance metrics
      metrics: {
        totalApiCalls: status.steps.reduce((sum, s) => sum + (s.api_calls || 0), 0),
        dataSourcesQueried: [...new Set(status.steps.map(s => s.data_source).filter(Boolean))],
        humanInteractions: status.steps.filter(s => s.requires_human_input).length
      },
      
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.email
    };

    // Get human feedback from investigation_feedback table
    try {
      const feedbackResult = await pool.query(
        `SELECT if.feedback_type, if.content, if.created_at, u.email as user_email
         FROM investigation_feedback if
         LEFT JOIN users u ON if.user_id = u.id
         WHERE if.investigation_id = $1 AND if.tenant_id = $2
         ORDER BY if.created_at ASC`,
        [id, req.tenantId]
      );
      
      report.feedback = feedbackResult.rows.map(row => ({
        type: row.feedback_type,
        content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
        userEmail: row.user_email,
        createdAt: row.created_at
      }));
    } catch (feedbackError) {
      console.error('Failed to fetch investigation feedback:', feedbackError);
      report.feedback = [];
    }

    // Log report generation for audit trail
    await auditLog(req.user.id, 'investigation_report_generated', {
      investigationId: id,
      format,
      tenantId: req.tenantId
    });

    res.json({ report });
  } catch (error) {
    console.error('Failed to generate investigation report:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * List investigations with filtering
 * GET /investigations
 */
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      limit = 50, 
      offset = 0,
      alertId,
      caseId 
    } = req.query;

    let query = `
      SELECT i.*, a.summary as alert_summary, a.severity as alert_severity
      FROM investigations i
      LEFT JOIN alerts a ON i.alert_id = a.id
      WHERE i.tenant_id = $1
    `;
    const params = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND i.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      query += ` AND i.priority = $${paramIndex}`;
      params.push(parseInt(priority, 10));
      paramIndex++;
    }

    if (alertId) {
      query += ` AND i.alert_id = $${paramIndex}`;
      params.push(parseInt(alertId, 10));
      paramIndex++;
    }

    if (caseId) {
      query += ` AND i.case_id = $${paramIndex}`;
      params.push(parseInt(caseId, 10));
      paramIndex++;
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await pool.query(query, params);

    // Get total count for proper pagination
    const countQuery = query.replace(/SELECT i\.\*, a\.summary as alert_summary, a\.severity as alert_severity/, 'SELECT COUNT(*) as total');
    const countResult = await pool.query(countQuery.split('ORDER BY')[0], params.slice(0, -2));
    const totalCount = parseInt(countResult.rows[0].total, 10);

    res.json({ 
      investigations: result.rows,
      total: totalCount,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      hasMore: (parseInt(offset, 10) + result.rows.length) < totalCount
    });
  } catch (error) {
    console.error('Failed to list investigations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get investigation statistics
 * GET /investigations/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    // Calculate date range based on timeframe
    let dateFilter = '';
    const now = new Date();
    let startDate;
    
    switch (timeframe) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    
    dateFilter = 'AND i.created_at >= $2';

    // Get investigation statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_investigations,
        COUNT(CASE WHEN i.status = 'complete' THEN 1 END) as completed_investigations,
        COUNT(CASE WHEN i.status = 'failed' THEN 1 END) as failed_investigations,
        COUNT(CASE WHEN i.status IN ('planning', 'executing', 'analyzing', 'responding') THEN 1 END) as active_investigations,
        AVG(CASE WHEN i.completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (i.completed_at - i.created_at)) END) as avg_duration_seconds,
        AVG(i.priority) as avg_priority
      FROM investigations i
      WHERE i.tenant_id = $1 ${dateFilter}
    `;

    const statsResult = await pool.query(statsQuery, [req.tenantId, startDate]);
    const stats = statsResult.rows[0];

    // Get status distribution
    const statusQuery = `
      SELECT i.status, COUNT(*) as count
      FROM investigations i
      WHERE i.tenant_id = $1 ${dateFilter}
      GROUP BY i.status
      ORDER BY count DESC
    `;

    const statusResult = await pool.query(statusQuery, [req.tenantId, startDate]);

    res.json({
      timeframe,
      period: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      summary: {
        totalInvestigations: parseInt(stats.total_investigations, 10),
        completedInvestigations: parseInt(stats.completed_investigations, 10),
        failedInvestigations: parseInt(stats.failed_investigations, 10),
        activeInvestigations: parseInt(stats.active_investigations, 10),
        averageDurationMinutes: stats.avg_duration_seconds ? Math.round(stats.avg_duration_seconds / 60) : null,
        averagePriority: stats.avg_priority ? parseFloat(stats.avg_priority).toFixed(1) : null,
        successRate: stats.total_investigations > 0 
          ? Math.round((stats.completed_investigations / stats.total_investigations) * 100)
          : 0
      },
      distributions: {
        byStatus: statusResult.rows.map(row => ({
          status: row.status,
          count: parseInt(row.count, 10)
        }))
      }
    });
  } catch (error) {
    console.error('Failed to get investigation statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;