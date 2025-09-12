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
    
    if (!feedback || typeof feedback !== 'object') {
      return res.status(400).json({ error: 'Feedback object is required' });
    }

    await orchestrator.addHumanFeedback(id, feedback, req.user.id, req.tenantId);
    
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
    
    const status = await orchestrator.getInvestigationStatus(id, req.tenantId);
    
    if (!['complete', 'failed'].includes(status.status)) {
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
        totalRetries: status.steps.reduce((sum, s) => sum + (s.retry_count || 0), 0)
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
        retries: step.retry_count
      })),
      
      context: status.context,
      
      generatedAt: new Date().toISOString()
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
        content: row.content,
        userEmail: row.user_email,
        createdAt: row.created_at
      }));
    } catch (feedbackError) {
      console.error('Failed to fetch investigation feedback:', feedbackError);
      report.feedback = [];
    }

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

    res.json({ 
      investigations: result.rows,
      total: result.rows.length,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
  } catch (error) {
    console.error('Failed to list investigations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;