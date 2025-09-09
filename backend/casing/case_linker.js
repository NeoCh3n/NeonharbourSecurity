const { pool } = require('../database');

async function upsertCaseForFingerprint(tenantId, fingerprint, severity = 'low') {
  // Try to find existing case with same anchor
  const findSql = 'SELECT id FROM cases WHERE anchor_fingerprint = $1 AND tenant_id=$2 ORDER BY id DESC LIMIT 1';
  const found = await pool.query(findSql, [fingerprint, tenantId]);
  if (found.rows.length > 0) return found.rows[0].id;
  // Create new case
  const insert = await pool.query(
    `INSERT INTO cases (anchor_fingerprint, severity, status, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [fingerprint, severity, 'open', tenantId]
  );
  return insert.rows[0].id;
}

async function linkAlertToCase(tenantId, caseId, alertId) {
  await pool.query(`INSERT INTO case_alerts (case_id, alert_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [caseId, alertId, tenantId]);
}

// Optional: find similar alert by vector for cross-case linking
async function findSimilarCaseCandidate(vec, tenantId) {
  if (!Array.isArray(vec) || vec.length === 0) return null;
  try {
    const sql = `
      SELECT id, case_id, (embedding_vec <-> $1::vector) AS dist
      FROM alerts
      WHERE tenant_id = $2 AND embedding_vec IS NOT NULL
      ORDER BY embedding_vec <-> $1::vector
      LIMIT 1`;
    const param = `[${vec.join(',')}]`;
    const r = await pool.query(sql, [param, tenantId]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    // Heuristic threshold for demo (lower is more similar)
    if (row.dist <= 0.8 && row.case_id) return { caseId: row.case_id, dist: row.dist };
  } catch (e) {
    // pgvector might be unavailable; ignore
  }
  return null;
}

module.exports = { upsertCaseForFingerprint, linkAlertToCase, findSimilarCaseCandidate };
