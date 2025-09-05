const { pool } = require('../database');
const { DEFAULT_POLICIES } = require('./defaults');

function wildcardMatch(pattern, value) {
  if (!pattern || pattern === '*') return true;
  const regex = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return regex.test(String(value || ''));
}

function severityRank(sev) {
  const map = { low: 1, medium: 2, high: 3, critical: 4 };
  return map[String(sev || '').toLowerCase()] || 0;
}

async function ensureDefaultPolicies(userId) {
  // Install defaults only if user has no policies
  const r = await pool.query('SELECT COUNT(*)::int as count FROM policies WHERE user_id=$1', [userId]);
  if ((r.rows[0]?.count || 0) > 0) return;
  for (const p of DEFAULT_POLICIES) {
    await pool.query(
      `INSERT INTO policies (user_id, name, description, effect, action_pattern, resource_pattern, conditions, risk)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, p.name, p.description, p.effect, p.action_pattern, p.resource_pattern || '*', p.conditions || {}, p.risk || null]
    );
  }
}

async function getPoliciesForUser(userId) {
  await ensureDefaultPolicies(userId);
  const r = await pool.query('SELECT * FROM policies WHERE user_id=$1 ORDER BY id ASC', [userId]);
  return r.rows || [];
}

function conditionsMatch(conds, context = {}) {
  if (!conds || typeof conds !== 'object') return true;
  // Examples: { principal_privileged: true, max_severity: 'high' }
  if (Object.prototype.hasOwnProperty.call(conds, 'principal_privileged')) {
    const want = !!conds.principal_privileged;
    const got = !!context?.principal?.privileged;
    if (want !== got) return false;
  }
  if (conds.max_severity) {
    const max = severityRank(conds.max_severity);
    const sev = severityRank(context?.severity);
    if (sev > max) return false;
  }
  if (conds.min_severity) {
    const min = severityRank(conds.min_severity);
    const sev = severityRank(context?.severity);
    if (sev < min) return false;
  }
  // Extend with time windows, environment, change windows, etc.
  return true;
}

async function evaluateAction(userId, action, resource, context = {}) {
  const policies = await getPoliciesForUser(userId);
  let decision = { decision: 'require_approval', reason: 'Default', risk: 'medium', policyId: null };
  for (const p of policies) {
    if (!wildcardMatch(p.action_pattern, action)) continue;
    if (p.resource_pattern && !wildcardMatch(p.resource_pattern, resource || '*')) continue;
    if (!conditionsMatch(p.conditions, context)) continue;
    decision = { decision: p.effect, reason: p.description || p.name, risk: p.risk || 'medium', policyId: p.id };
    // First match wins (ordered insert)
    break;
  }
  return decision;
}

function checkSegregationOfDuties(requestorId, approverId) {
  // Simple SOD: requestor cannot approve their own request
  return requestorId && approverId && requestorId === approverId ? { ok: false, reason: 'Segregation of duties: self-approval prohibited' } : { ok: true };
}

module.exports = {
  wildcardMatch,
  severityRank,
  getPoliciesForUser,
  ensureDefaultPolicies,
  evaluateAction,
  checkSegregationOfDuties,
};

