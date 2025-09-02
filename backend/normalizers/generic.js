function detect(_raw) {
  return true; // fallback
}

function normalize(raw) {
  const nowIso = new Date().toISOString();
  const eventTs = raw._time || raw.timestamp || raw.eventTime || raw.time || nowIso;
  const principal = {};
  if (raw.user || raw.username || raw.account) principal.user = raw.user || raw.username || raw.account;
  if (raw.email) principal.email = raw.email;
  const asset = {};
  if (raw.host || raw.hostname) asset.host = raw.host || raw.hostname;
  if (raw.app || raw.application) asset.app = raw.app || raw.application;
  const src = {};
  if (raw.src_ip || raw.source_ip || raw.ip) src.ip = raw.src_ip || raw.source_ip || raw.ip;
  const dst = {};
  if (raw.dst_ip || raw.dest_ip) dst.ip = raw.dst_ip || raw.dest_ip;
  const entities = [];
  if (src.ip) entities.push({ type: 'ip', value: src.ip });
  if (dst.ip) entities.push({ type: 'ip', value: dst.ip });
  if (raw.url) entities.push({ type: 'url', value: raw.url });

  return {
    source: raw.source || 'ingest',
    vendorEventId: raw.event_id || raw.id || raw._id || null,
    eventTs: new Date(eventTs).toISOString(),
    ingestTs: nowIso,
    category: raw.category || 'unknown',
    action: raw.action || raw.event || 'UNKNOWN',
    technique: raw.technique || null,
    severity: raw.severity || 'low',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
    principal,
    asset,
    src,
    dst,
    entities,
    summary: raw.summary || null,
    evidence: raw.evidence || [],
    raw,
  };
}

module.exports = { detect, normalize };

