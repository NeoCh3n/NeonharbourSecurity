function detect(raw) {
  return typeof raw === 'object' && (raw.sourcetype || raw._time || raw.index);
}

function normalize(raw) {
  const eventTs = raw._time || raw._indextime || raw.time;
  const principal = {};
  if (raw.user || raw.username) principal.user = raw.user || raw.username;
  const asset = {};
  if (raw.host) asset.host = raw.host;
  if (raw.app) asset.app = raw.app;
  const src = {};
  if (raw.src || raw.src_ip) src.ip = raw.src || raw.src_ip;
  const dst = {};
  if (raw.dest || raw.dest_ip) dst.ip = raw.dest || raw.dest_ip;
  const entities = [];
  if (src.ip) entities.push({ type: 'ip', value: src.ip });
  if (dst.ip) entities.push({ type: 'ip', value: dst.ip });
  if (raw.url) entities.push({ type: 'url', value: raw.url });

  return {
    source: 'splunk',
    vendorEventId: raw._cd || raw._si || null,
    eventTs: eventTs ? new Date(eventTs).toISOString() : new Date().toISOString(),
    ingestTs: new Date().toISOString(),
    category: raw.tag || raw.sourcetype || 'unknown',
    action: raw.action || raw.eventtype || 'UNKNOWN',
    technique: raw.mitre_technique || null,
    severity: raw.severity || 'low',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.6,
    principal,
    asset,
    src,
    dst,
    entities,
    summary: raw.summary || null,
    evidence: [],
    raw,
  };
}

module.exports = { detect, normalize };

