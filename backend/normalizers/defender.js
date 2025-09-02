function detect(raw) {
  return typeof raw === 'object' && (
    raw.MachineId || raw.DeviceId || raw.ThreatName || raw.ServiceSource === 'Microsoft Defender'
  );
}

function normalize(raw) {
  const eventTs = raw.Timestamp || raw.EventTime || raw.TimeGenerated;
  const principal = {};
  if (raw.AccountName || raw.UserPrincipalName) principal.user = raw.AccountName || raw.UserPrincipalName;
  const asset = {};
  if (raw.MachineName || raw.DeviceName) asset.host = raw.MachineName || raw.DeviceName;
  const src = {};
  if (raw.RemoteIp) src.ip = raw.RemoteIp;
  const entities = [];
  if (src.ip) entities.push({ type: 'ip', value: src.ip });
  if (raw.SHA256) entities.push({ type: 'hash', value: raw.SHA256 });

  return {
    source: 'defender',
    vendorEventId: raw.ReportId || raw.AlertId || null,
    eventTs: eventTs ? new Date(eventTs).toISOString() : new Date().toISOString(),
    ingestTs: new Date().toISOString(),
    category: raw.Category || 'endpoint',
    action: raw.ActionType || 'UNKNOWN',
    technique: raw.DetectionTechniques || null,
    severity: raw.Severity || 'medium',
    confidence: typeof raw.ConfidenceLevel === 'number' ? raw.ConfidenceLevel : 0.7,
    principal,
    asset,
    src,
    dst: {},
    entities,
    summary: raw.ThreatName || null,
    evidence: [],
    raw,
  };
}

module.exports = { detect, normalize };

