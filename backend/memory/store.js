const { pool } = require('../database');

async function createSession({ userId, caseId, alertId = null, title = null, context = {} }) {
  const r = await pool.query(
    `INSERT INTO sessions (user_id, case_id, alert_id, title, context) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, caseId, alertId, title, context]
  );
  return r.rows[0];
}

async function getSession(sessionId, userId) {
  const r = await pool.query('SELECT * FROM sessions WHERE id=$1 AND user_id=$2', [sessionId, userId]);
  return r.rows[0] || null;
}

async function listSessions(caseId, userId) {
  const r = await pool.query('SELECT * FROM sessions WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC', [caseId, userId]);
  return r.rows;
}

async function addMemory({ userId, caseId, sessionId = null, type = 'note', key = null, value = {}, tags = [], importance = 0.5 }) {
  const r = await pool.query(
    `INSERT INTO memories (user_id, case_id, session_id, type, key, value, tags, importance) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, caseId, sessionId, type, key, value, tags, importance]
  );
  return r.rows[0];
}

async function listCaseMemory(caseId, userId, { limit = 100 } = {}) {
  const r = await pool.query('SELECT * FROM memories WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT $3', [caseId, userId, limit]);
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

async function getOrInitCasePlan(caseId, userId, { generatePlanFn, unified, analysis }) {
  // Try existing plan
  const existing = await pool.query('SELECT case_id, plan, context_summary FROM case_plans WHERE case_id=$1', [caseId]);
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return { plan: row.plan, contextSummary: row.context_summary };
  }
  // Build from memory-aware generation
  const mem = await listCaseMemory(caseId, userId, { limit: 50 });
  const summary = summarizeMemoryRows(mem, 1500);
  const plan = await generatePlanFn(unified, analysis, { memorySummary: summary });
  await pool.query('INSERT INTO case_plans (case_id, plan, context_summary) VALUES ($1,$2,$3) ON CONFLICT (case_id) DO UPDATE SET plan=EXCLUDED.plan, context_summary=EXCLUDED.context_summary, updated_at=NOW()', [caseId, JSON.stringify(plan), summary || null]);
  return { plan, contextSummary: summary };
}

async function getCasePlan(caseId) {
  const r = await pool.query('SELECT case_id, plan, context_summary, updated_at FROM case_plans WHERE case_id=$1', [caseId]);
  return r.rows[0] || null;
}

async function updateCasePlan(caseId, plan) {
  await pool.query('INSERT INTO case_plans (case_id, plan) VALUES ($1,$2) ON CONFLICT (case_id) DO UPDATE SET plan=EXCLUDED.plan, updated_at=NOW()', [caseId, JSON.stringify(plan || {})]);
  const r = await pool.query('SELECT case_id, plan, context_summary, updated_at FROM case_plans WHERE case_id=$1', [caseId]);
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

