const { pool } = require('../database');

async function createSession({ tenantId, userId, caseId, alertId = null, title = null, context = {} }) {
  const r = await pool.query(
    `INSERT INTO sessions (user_id, case_id, alert_id, title, context, tenant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [userId, caseId, alertId, title, context, tenantId]
  );
  return r.rows[0];
}

async function getSession(sessionId, tenantId) {
  const r = await pool.query('SELECT * FROM sessions WHERE id=$1 AND tenant_id=$2', [sessionId, tenantId]);
  return r.rows[0] || null;
}

async function listSessions(caseId, tenantId) {
  const r = await pool.query('SELECT * FROM sessions WHERE case_id=$1 AND tenant_id=$2 ORDER BY created_at DESC', [caseId, tenantId]);
  return r.rows;
}

async function addMemory({ tenantId, userId, caseId, sessionId = null, type = 'note', key = null, value = {}, tags = [], importance = 0.5 }) {
  const r = await pool.query(
    `INSERT INTO memories (user_id, case_id, session_id, type, key, value, tags, importance, tenant_id) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [userId, caseId, sessionId, type, key, value, tags, importance, tenantId]
  );
  return r.rows[0];
}

async function listCaseMemory(caseId, tenantId, { limit = 100 } = {}) {
  const r = await pool.query('SELECT * FROM memories WHERE case_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT $3', [caseId, tenantId, limit]);
  return r.rows;
}

function summarizeMemoryRows(rows, maxChars = 1500) {
  const bits = [];
  for (const m of rows) {
    const t = m.type || 'note';
    const k = m.key ? ` ${m.key}` : '';
    const v = m.value ? JSON.stringify(m.value) : '';
    const line = `[${t}]${k}: ${v}`.slice(0, 200);
    bits.push(line);
    if (bits.join('\n').length > maxChars) break;
  }
  return bits.join('\n');
}

async function getOrInitCasePlan(caseId, tenantId, userId, { generatePlanFn, unified, analysis }) {
  // Try existing plan
  const existing = await pool.query('SELECT case_id, plan, context_summary FROM case_plans WHERE case_id=$1 AND tenant_id=$2', [caseId, tenantId]);
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return { plan: row.plan, contextSummary: row.context_summary };
  }
  // Build from memory-aware generation
  const mem = await listCaseMemory(caseId, tenantId, { limit: 50 });
  const summary = summarizeMemoryRows(mem, 1500);
  const plan = await generatePlanFn(unified, analysis, { memorySummary: summary });
  await pool.query('INSERT INTO case_plans (case_id, plan, context_summary, tenant_id) VALUES ($1,$2,$3,$4) ON CONFLICT (case_id) DO UPDATE SET plan=EXCLUDED.plan, context_summary=EXCLUDED.context_summary, updated_at=NOW()', [caseId, JSON.stringify(plan), summary || null, tenantId]);
  return { plan, contextSummary: summary };
}

async function getCasePlan(caseId, tenantId) {
  const r = await pool.query('SELECT case_id, plan, context_summary, updated_at FROM case_plans WHERE case_id=$1 AND tenant_id=$2', [caseId, tenantId]);
  return r.rows[0] || null;
}

async function updateCasePlan(caseId, tenantId, plan) {
  await pool.query('INSERT INTO case_plans (case_id, plan, tenant_id) VALUES ($1,$2,$3) ON CONFLICT (case_id) DO UPDATE SET plan=EXCLUDED.plan, updated_at=NOW()', [caseId, JSON.stringify(plan || {}), tenantId]);
  const r = await pool.query('SELECT case_id, plan, context_summary, updated_at FROM case_plans WHERE case_id=$1 AND tenant_id=$2', [caseId, tenantId]);
  return r.rows[0];
}

module.exports = {
  createSession,
  getSession,
  listSessions,
  addMemory,
  listCaseMemory,
  summarizeMemoryRows,
  getOrInitCasePlan,
  getCasePlan,
  updateCasePlan,
};
