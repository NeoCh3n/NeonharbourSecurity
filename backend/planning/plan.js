function generatePlan(unified, analysis) {
  const now = new Date().toISOString();
  const sev = (unified.severity || 'low').toLowerCase();
  const isHigh = sev === 'high' || sev === 'critical';
  const steps = [
    { id: 'ack', title: 'Acknowledge alert', done: false },
    { id: 'scope', title: 'Scope impacted assets and accounts', done: false },
    { id: 'collect', title: 'Collect supporting evidence (logs, EDR, email)', done: false },
    { id: 'verify', title: 'Verify authenticity (false positive?)', done: false },
    { id: 'contain', title: 'Containment (block IP / isolate endpoint)', done: false, required: isHigh },
    { id: 'eradicate', title: 'Eradication and recovery', done: false, required: isHigh },
    { id: 'report', title: 'Document findings and lessons learned', done: false }
  ];
  const questions = [
    'Is this a real threat or benign? Why?',
    'Which assets/accounts are impacted? How many?',
    'What is the root cause and initial vector?',
    'Any lateral movement or exfiltration observed?',
    'What immediate containment is needed?'
  ];
  const plan = { status: 'pending', createdAt: now, steps, questions };
  // Attach quick queries suggestion shell (logical placeholders)
  plan.suggestedQueries = [
    { source: 'splunk', query: 'index=security earliest=-24h user="' + (unified?.principal?.user || '') + '"' },
    { source: 'edr', query: 'processes where sha256 in entities' },
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

