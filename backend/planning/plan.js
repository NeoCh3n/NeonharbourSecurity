const { callModel: _callModel } = require('../ai');

async function generatePlan(unified, analysis, opts = {}) {
  const now = new Date().toISOString();
  const sev = (unified.severity || 'low').toLowerCase();
  const isHigh = sev === 'high' || sev === 'critical';

  // Default fallback content
  let steps = [
    { id: 'ack', title: 'Acknowledge alert', done: false },
    { id: 'scope', title: 'Scope impacted assets and accounts', done: false },
    { id: 'collect', title: 'Collect supporting evidence (logs, EDR, email)', done: false },
    { id: 'verify', title: 'Verify authenticity (false positive?)', done: false },
    { id: 'contain', title: 'Containment (block IP / isolate endpoint)', done: false, required: isHigh },
    { id: 'eradicate', title: 'Eradication and recovery', done: false, required: isHigh },
    { id: 'report', title: 'Document findings and lessons learned', done: false }
  ];
  let questions = [
    'Is this a real threat or benign? Why?',
    'Which assets/accounts are impacted? How many?',
    'What is the root cause and initial vector?',
    'Any lateral movement or exfiltration observed?',
    'What immediate containment is needed?'
  ];

  // Attempt AI-driven plan tailoring
  try {
    const prompt = `You are a senior SOC analyst. Given a normalized alert and a brief analysis summary/timeline, produce an investigation plan JSON.
Return ONLY strict JSON with keys: questions (array of 4-8 concise questions tailored to determine if it's a true positive or false positive and what to do next), steps (array of {id,title,required?}).
Prefer actionable, context-aware items referring to user, IP, host, URL, file hash if present.\n\nALERT: ${JSON.stringify(unified)}\nANALYSIS: ${JSON.stringify(analysis)}\n\nPRIOR CONTEXT (optional, memory summary across related alerts/sessions):\n${opts.memorySummary || '(none)'}\n`;
    const ai = await _callModel([
      { role: 'system', content: 'You output only strict JSON. No prose.' },
      { role: 'user', content: prompt }
    ]);
    if (ai) {
      const cleaned = ai.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.questions) && parsed.questions.length) questions = parsed.questions.slice(0, 8);
      if (Array.isArray(parsed.steps) && parsed.steps.length) {
        steps = parsed.steps.map((s, i) => ({ id: s.id || `s${i+1}`, title: s.title || 'Step', required: !!s.required, done: false })).slice(0, 10);
      }
    }
  } catch {}

  const plan = { status: 'pending', createdAt: now, steps, questions };
  // Suggested queries tailored to context
  const user = unified?.principal?.user || unified?.principal?.email || '';
  const ip = unified?.src?.ip || unified?.dst?.ip || '';
  const url = (unified?.entities || []).find(e => e.type === 'url')?.value || '';
  const hash = (unified?.entities || []).find(e => /sha/i.test(e.type || ''))?.value || '';
  plan.suggestedQueries = [
    { source: 'splunk', query: `index=security earliest=-24h ${user ? `user="${user}" `: ''}${ip ? ` (src=${ip} OR dest=${ip}) `:''}${url ? ` url="${url}" `:''}| stats count by source, sourcetype`.trim() },
    { source: 'edr', query: hash ? `processes where sha256 == "${hash}"` : 'processes where reputation in (suspicious, malicious) | top hash' },
  ];
  return plan;
}

function generateRecommendations(unified) {
  const sev = (unified.severity || 'low').toLowerCase();
  const recs = [];
  if (unified?.src?.ip) recs.push({ id: 'block_ip', title: `Block source IP ${unified.src.ip}`, risk: 'low' });
  if (unified?.principal?.user) recs.push({ id: 'disable_account', title: `Temporarily disable user ${unified.principal.user}`, risk: 'medium' });
  if (unified?.asset?.host) recs.push({ id: 'isolate_endpoint', title: `Isolate endpoint ${unified.asset.host}`, risk: 'high' });
  if (sev === 'high' || sev === 'critical') recs.push({ id: 'force_password_reset', title: 'Force password reset for affected users', risk: 'medium' });
  return recs;
}

module.exports = { generatePlan, generateRecommendations };
