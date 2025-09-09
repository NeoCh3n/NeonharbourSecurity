const { pool } = require('../database');
const { callModel } = require('../ai');
const { withRetry } = require('../utils/execution');

async function fetchMemories(caseId, tenantId, limit = 200) {
  const r = await pool.query('SELECT id, type, key, value, tags, created_at FROM memories WHERE case_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT $3', [caseId, tenantId, limit]);
  return r.rows;
}

function makeSummaryPrompt(memories) {
  const lines = memories.map(m => {
    let v = '';
    try { v = JSON.stringify(m.value); } catch {}
    return `- [${m.type}] ${m.key || ''} ${v}`;
  }).join('\n').slice(0, 6000);
  return `You are a senior SOC analyst. Summarize the following investigation memory into a concise context summary for the case.
Return ONLY plain text in <= 10 bullet points, <= 1000 characters total. Focus on: key facts, IOCs, decisions taken, remaining questions.
Avoid PII leakage. Use neutral, professional tone.
\nMEMORY:\n${lines}`;
}

async function summarizeCaseMemory(caseId, tenantId) {
  const mem = await fetchMemories(caseId, tenantId, 200);
  if (!mem.length) {
    await pool.query('UPDATE case_plans SET context_summary=NULL, updated_at=NOW() WHERE case_id=$1 AND tenant_id=$2', [caseId, tenantId]);
    return { caseId, summary: null };
  }
  const prompt = makeSummaryPrompt(mem);
  const content = await withRetry(() => callModel([
    { role: 'system', content: 'You output only the summary text as instructed.' },
    { role: 'user', content: prompt }
  ]), { retries: 2 });
  const summary = String(content || '').slice(0, 1200);
  await pool.query('INSERT INTO case_plans (case_id, context_summary, tenant_id) VALUES ($1,$2,$3) ON CONFLICT (case_id) DO UPDATE SET context_summary=EXCLUDED.context_summary, updated_at=NOW()', [caseId, summary, tenantId]);
  return { caseId, summary };
}

async function summarizeAllCasesForUser(tenantId) {
  const cases = await pool.query('SELECT DISTINCT case_id FROM alerts WHERE tenant_id=$1 AND case_id IS NOT NULL', [tenantId]);
  const results = [];
  for (const row of cases.rows) {
    try { results.push(await summarizeCaseMemory(row.case_id, tenantId)); } catch (e) { results.push({ caseId: row.case_id, error: e.message }); }
  }
  return results;
}

module.exports = {
  summarizeCaseMemory,
  summarizeAllCasesForUser,
};
