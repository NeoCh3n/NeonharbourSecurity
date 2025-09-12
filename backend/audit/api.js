const express = require('express');
const { ComplianceService } = require('./compliance');
const { auditMiddleware } = require('../middleware/audit');
const { pool } = require('../database');

const router = express.Router();
const complianceService = new ComplianceService();

/**
 * Generate compliance report for an investigation
 * GET /compliance/reports/:investigationId
 */
router.get('/reports/:investigationId', auditMiddleware('compliance_report_requested'), async (req, res) => {
  try {
    const { investigationId } = req.params;
    const { reportType = 'full', format = 'json' } = req.query;

    // Validate investigation exists and user has access
    const investigationQuery = `
      SELECT id FROM investigations 
      WHERE id = $1 AND tenant_id = $2
    `;
    const investigationResult = await pool.query(investigationQuery, [investigationId, req.tenantId]);
    
    if (investigationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Investigation not found' });
    }

    const report = await complianceService.generateComplianceReport(
      investigationId, 
      req.tenantId, 
      reportType
    );

    // Store the report for future reference
    await pool.query(
      `INSERT INTO compliance_reports 
       (report_id, investigation_id, tenant_id, report_type, generated_by, 
        generated_at, report_data, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        report.metadata.reportId,
        investigationId,
        req.tenantId,
        reportType,
        req.user.id,
        report.metadata.generatedAt,
        JSON.stringify(report),
        report.metadata.checksum || 'pending'
      ]
    );

    res.json({ report });
  } catch (error) {
    console.error('Failed to generate compliance report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Export investigation data for external audit systems
 * POST /compliance/export/:investigationId
 */
router.post('/export/:investigationId', auditMiddleware('investigation_data_export'), async (req, res) => {
  try {
    const { investigationId } = req.params;
    const { format = 'json', destination, purpose } = req.body;

    // Validate investigation exists and user has access
    const investigationQuery = `
      SELECT id FROM investigations 
      WHERE id = $1 AND tenant_id = $2
    `;
    const investigationResult = await pool.query(investigationQuery, [investigationId, req.tenantId]);
    
    if (investigationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Investigation not found' });
    }

    const exportData = await complianceService.exportInvestigationData(
      investigationId,
      req.tenantId,
      format
    );

    // Log the export
    await pool.query(
      `INSERT INTO export_logs 
       (investigation_id, tenant_id, export_type, format, exported_by, 
        exported_at, export_size, checksum, destination, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        investigationId,
        req.tenantId,
        'investigation_data',
        format,
        req.user.id,
        exportData.exportedAt,
        exportData.data ? exportData.data.length : 0,
        exportData.checksum,
        destination || 'unknown',
        purpose || 'audit'
      ]
    );

    res.json({
      investigationId,
      format,
      exportedAt: exportData.exportedAt,
      checksum: exportData.checksum,
      size: exportData.data ? exportData.data.length : 0,
      downloadUrl: `/compliance/download/${investigationId}/${format}`
    });
  } catch (error) {
    console.error('Failed to export investigation data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Download exported investigation data
 * GET /compliance/download/:investigationId/:format
 */
router.get('/download/:investigationId/:format', auditMiddleware('investigation_data_download'), async (req, res) => {
  try {
    const { investigationId, format } = req.params;

    const exportData = await complianceService.exportInvestigationData(
      investigationId,
      req.tenantId,
      format
    );

    // Set appropriate headers based on format
    let contentType = 'application/json';
    let filename = `investigation-${investigationId}.json`;

    switch (format.toLowerCase()) {
      case 'csv':
        contentType = 'text/csv';
        filename = `investigation-${investigationId}.csv`;
        break;
      case 'xml':
        contentType = 'application/xml';
        filename = `investigation-${investigationId}.xml`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Checksum', exportData.checksum);
    
    res.send(exportData.data);
  } catch (error) {
    console.error('Failed to download investigation data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Verify audit trail integrity for an investigation
 * GET /compliance/integrity/:investigationId
 */
router.get('/integrity/:investigationId', auditMiddleware('audit_integrity_check'), async (req, res) => {
  try {
    const { investigationId } = req.params;

    const integrityCheck = await complianceService.verifyAuditIntegrity(
      investigationId,
      req.tenantId
    );

    // Store integrity check results
    await pool.query(
      `INSERT INTO audit_integrity_checks 
       (investigation_id, tenant_id, check_type, checked_at, integrity_score, 
        issues_found, check_results, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        investigationId,
        req.tenantId,
        'full_audit_trail',
        integrityCheck.verifiedAt,
        integrityCheck.overallIntegrityScore,
        Object.values(integrityCheck.tableResults).reduce((sum, r) => sum + r.integrityIssues, 0),
        JSON.stringify(integrityCheck.tableResults),
        req.user.id
      ]
    );

    res.json({ integrityCheck });
  } catch (error) {
    console.error('Failed to verify audit integrity:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get audit trail for an investigation
 * GET /compliance/audit-trail/:investigationId
 */
router.get('/audit-trail/:investigationId', auditMiddleware('audit_trail_accessed'), async (req, res) => {
  try {
    const { investigationId } = req.params;
    const { table, limit = 100, offset = 0 } = req.query;

    // Validate investigation exists and user has access
    const investigationQuery = `
      SELECT id FROM investigations 
      WHERE id = $1 AND tenant_id = $2
    `;
    const investigationResult = await pool.query(investigationQuery, [investigationId, req.tenantId]);
    
    if (investigationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Investigation not found' });
    }

    const auditTrail = await complianceService.getCompleteAuditTrail(investigationId, req.tenantId);

    // Filter by table if specified
    let filteredTrail = auditTrail;
    if (table && auditTrail[table]) {
      filteredTrail = { [table]: auditTrail[table] };
    }

    // Apply pagination
    const paginatedTrail = {};
    for (const [tableName, entries] of Object.entries(filteredTrail)) {
      const startIndex = parseInt(offset, 10);
      const endIndex = startIndex + parseInt(limit, 10);
      paginatedTrail[tableName] = entries.slice(startIndex, endIndex);
    }

    res.json({
      investigationId,
      auditTrail: paginatedTrail,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total: Object.values(auditTrail).reduce((sum, entries) => sum + entries.length, 0)
      }
    });
  } catch (error) {
    console.error('Failed to get audit trail:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Enforce data retention policies
 * POST /compliance/retention/enforce
 */
router.post('/retention/enforce', auditMiddleware('data_retention_enforced'), async (req, res) => {
  try {
    // Only allow admin users to enforce retention
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const results = await complianceService.enforceDataRetention(req.tenantId);

    res.json({
      message: 'Data retention policies enforced',
      results,
      enforcedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to enforce data retention:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get data retention policies
 * GET /compliance/retention/policies
 */
router.get('/retention/policies', async (req, res) => {
  try {
    const query = `
      SELECT data_type, retention_days, policy_description, 
             created_at, updated_at
      FROM data_retention_policies 
      WHERE tenant_id = $1
      ORDER BY data_type
    `;
    
    const result = await pool.query(query, [req.tenantId]);

    // Include default policies if none are configured
    const defaultPolicies = complianceService.retentionPolicies;
    const configuredTypes = result.rows.map(row => row.data_type);
    
    const allPolicies = [
      ...result.rows,
      ...Object.entries(defaultPolicies)
        .filter(([type]) => !configuredTypes.includes(type))
        .map(([type, days]) => ({
          data_type: type,
          retention_days: days,
          policy_description: `Default ${type} retention policy`,
          created_at: null,
          updated_at: null,
          is_default: true
        }))
    ];

    res.json({ policies: allPolicies });
  } catch (error) {
    console.error('Failed to get retention policies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update data retention policy
 * PUT /compliance/retention/policies/:dataType
 */
router.put('/retention/policies/:dataType', auditMiddleware('retention_policy_updated'), async (req, res) => {
  try {
    // Only allow admin users to update policies
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { dataType } = req.params;
    const { retentionDays, description } = req.body;

    if (!retentionDays || retentionDays < 1) {
      return res.status(400).json({ error: 'Valid retention days required' });
    }

    await pool.query(
      `INSERT INTO data_retention_policies 
       (tenant_id, data_type, retention_days, policy_description, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id, data_type) 
       DO UPDATE SET 
         retention_days = EXCLUDED.retention_days,
         policy_description = EXCLUDED.policy_description,
         updated_at = CURRENT_TIMESTAMP`,
      [req.tenantId, dataType, retentionDays, description, req.user.id]
    );

    res.json({
      message: 'Retention policy updated',
      dataType,
      retentionDays,
      description
    });
  } catch (error) {
    console.error('Failed to update retention policy:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get compliance statistics
 * GET /compliance/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get compliance statistics
    const statsQueries = [
      // Total investigations with audit trails
      `SELECT COUNT(*) as total_investigations 
       FROM investigations 
       WHERE tenant_id = $1 AND created_at >= $2`,
      
      // Investigations with complete audit trails
      `SELECT COUNT(DISTINCT ial.investigation_id) as complete_audit_trails
       FROM investigation_audit_logs ial
       JOIN investigations i ON ial.investigation_id = i.id
       WHERE i.tenant_id = $1 AND i.created_at >= $2`,
      
      // Total compliance reports generated
      `SELECT COUNT(*) as compliance_reports
       FROM compliance_reports
       WHERE tenant_id = $1 AND generated_at >= $2`,
      
      // Data exports performed
      `SELECT COUNT(*) as data_exports
       FROM export_logs
       WHERE tenant_id = $1 AND exported_at >= $2`,
      
      // Integrity checks performed
      `SELECT COUNT(*) as integrity_checks,
              AVG(integrity_score) as avg_integrity_score
       FROM audit_integrity_checks
       WHERE tenant_id = $1 AND checked_at >= $2`
    ];

    const results = await Promise.all(
      statsQueries.map(query => pool.query(query, [req.tenantId, startDate]))
    );

    const stats = {
      timeframe,
      period: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      totalInvestigations: parseInt(results[0].rows[0].total_investigations, 10),
      completeAuditTrails: parseInt(results[1].rows[0].complete_audit_trails, 10),
      complianceReports: parseInt(results[2].rows[0].compliance_reports, 10),
      dataExports: parseInt(results[3].rows[0].data_exports, 10),
      integrityChecks: parseInt(results[4].rows[0].integrity_checks, 10),
      averageIntegrityScore: results[4].rows[0].avg_integrity_score 
        ? parseFloat(results[4].rows[0].avg_integrity_score).toFixed(2)
        : null,
      auditCoverage: results[0].rows[0].total_investigations > 0
        ? Math.round((results[1].rows[0].complete_audit_trails / results[0].rows[0].total_investigations) * 100)
        : 0
    };

    res.json({ stats });
  } catch (error) {
    console.error('Failed to get compliance statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;