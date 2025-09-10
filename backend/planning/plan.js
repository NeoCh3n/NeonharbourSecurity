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
  // Default decision heuristic (overridden by LLM if present)
  const decision = { status: isHigh ? 'needs_review' : 'needs_review', disposition: 'uncertain', rationale: 'Requires analyst review' };

  // Attempt AI-driven plan tailoring
  try {
    const prompt = `You are a senior SOC analyst.
Given a normalized alert and a brief analysis summary/timeline, produce an investigation plan JSON.
Return ONLY strict JSON with keys:
- steps: array of 5-10 concise steps as {id,title,required?} tailored to THIS alert (prefer concrete, context-aware actions using available entities: user, IP, host, URL, file hash).
- questions: array of 4-8 concise questions to confirm true/false positive and containment.
- decision: { status: one of [resolved, needs_review, escalate], disposition: one of [true_positive,false_positive,uncertain], rationale: string (<=200 chars) }.
Rules: 1) Do not include prose or backticks. 2) JSON only. 3) If evidence strongly indicates false positive and low severity, you may set decision.status="resolved" and disposition="false_positive"; if critical indicators present, set status="escalate" and disposition="true_positive".
\nALERT: ${JSON.stringify(unified)}\nANALYSIS: ${JSON.stringify(analysis)}\nPRIOR CONTEXT: ${opts.memorySummary || '(none)'}\n`;
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
      if (parsed.decision && typeof parsed.decision === 'object') {
        decision.status = ['resolved','needs_review','escalate'].includes(String(parsed.decision.status||'').toLowerCase()) ? String(parsed.decision.status).toLowerCase() : decision.status;
        decision.disposition = ['true_positive','false_positive','uncertain'].includes(String(parsed.decision.disposition||'').toLowerCase()) ? String(parsed.decision.disposition).toLowerCase() : decision.disposition;
        decision.rationale = parsed.decision.rationale || decision.rationale;
      }
    }
  } catch {}

  // Heuristic override if LLM did not set a decisive outcome
  if (!decision || !decision.status || !decision.disposition) {
    const category = String(unified?.category || '').toLowerCase();
    const action = String(unified?.action || '').toLowerCase();
    const benignActions = new Set(['login_success','email_delivered']);
    const benignCategories = new Set(['informational','info']);
    if (!isHigh && (benignActions.has(action) || benignCategories.has(category))) {
      decision.status = 'resolved';
      decision.disposition = 'false_positive';
      decision.rationale = decision.rationale || 'Benign low-severity pattern';
    } else if (isHigh) {
      decision.status = 'escalate';
      decision.disposition = 'true_positive';
      decision.rationale = decision.rationale || 'High severity indicators present';
    }
  }

  const plan = { status: 'pending', createdAt: now, steps, questions, decision };
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

  // Heuristics based on entities (covers email normalizer)
  const entities = Array.isArray(unified?.entities) ? unified.entities : [];
  const ipEnt = entities.find(e => String(e.type||'').toLowerCase() === 'ip');
  const urlEnt = entities.find(e => String(e.type||'').toLowerCase() === 'url');
  const emailEnt = entities.find(e => String(e.type||'').toLowerCase() === 'email');
  if (!unified?.src?.ip && ipEnt?.value) recs.push({ id: 'block_ip', title: `Block source IP ${ipEnt.value}`, risk: 'low' });
  // For email alerts with suspicious URL or sender, propose recall
  const isEmail = (String(unified?.source||'').toLowerCase() === 'email') || (String(unified?.category||'').toLowerCase() === 'email');
  if (isEmail && (urlEnt || unified?.principal?.email || emailEnt)) {
    const target = emailEnt?.value || 'affected recipients';
    recs.push({ id: 'email_recall', title: `Recall suspicious email for ${target}`, risk: 'medium' });
  }
  if (sev === 'high' || sev === 'critical') recs.push({ id: 'force_password_reset', title: 'Force password reset for affected users', risk: 'medium' });
  return recs;
}

module.exports = { generatePlan, generateRecommendations };
