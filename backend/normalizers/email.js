function detect(raw) {
  return typeof raw === 'object' && (raw.mailFrom || raw.rcptTo || raw.subject);
}

function normalize(raw) {
  const eventTs = raw.timestamp || raw.date || raw.time;
  const principal = {};
  if (raw.mailFrom) principal.email = raw.mailFrom;
  const asset = { app: 'email-gateway' };
  const entities = [];
  if (raw.rcptTo) entities.push({ type: 'email', value: raw.rcptTo });
  if (raw.senderIP) entities.push({ type: 'ip', value: raw.senderIP });
  if (raw.url) entities.push({ type: 'url', value: raw.url });

  return {
    source: 'email',
    vendorEventId: raw.messageId || null,
    eventTs: eventTs ? new Date(eventTs).toISOString() : new Date().toISOString(),
    ingestTs: new Date().toISOString(),
    category: 'email',
    action: raw.disposition || 'EMAIL_DELIVERED',
    technique: null,
    severity: raw.severity || 'low',
    confidence: typeof raw.spamScore === 'number' ? 1 - Math.min(1, raw.spamScore) : 0.5,
    principal,
    asset,
    src: {},
    dst: {},
    entities,
    summary: raw.subject || null,
    evidence: [],
    raw,
  };
}

module.exports = { detect, normalize };

