const { pool } = require('../database');

async function upsertCaseForFingerprint(fingerprint, severity = 'low') {
  // Try to find existing case with same anchor
  const findSql = 'SELECT id FROM cases WHERE anchor_fingerprint = $1 ORDER BY id DESC LIMIT 1';
  const found = await pool.query(findSql, [fingerprint]);
  if (found.rows.length > 0) return found.rows[0].id;
  // Create new case
  const insert = await pool.query(
    `INSERT INTO cases (anchor_fingerprint, severity, status) VALUES ($1, $2, $3) RETURNING id`,
    [fingerprint, severity, 'open']
  );
  return insert.rows[0].id;
}

async function linkAlertToCase(caseId, alertId) {
  await pool.query(`INSERT INTO case_alerts (case_id, alert_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [caseId, alertId]);
}

module.exports = { upsertCaseForFingerprint, linkAlertToCase };

