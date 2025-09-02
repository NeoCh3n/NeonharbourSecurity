const crypto = require('crypto');

function stableKey(obj) {
  try { return JSON.stringify(obj, Object.keys(obj).sort()); } catch { return String(obj); }
}

function timeBucket(tsIso) {
  try {
    const d = new Date(tsIso);
    d.setMinutes(0, 0, 0); // hourly bucket
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function computeFingerprint(unified) {
  const keyEntities = (unified.entities || [])
    .filter(e => ['ip','hash','email','domain','url'].includes(e.type))
    .map(e => `${e.type}:${e.value}`)
    .sort();

  const key = stableKey({
    p: unified.principal || {},
    a: unified.asset || {},
    act: unified.action || 'UNKNOWN',
    tech: unified.technique || null,
    ents: keyEntities,
    win: timeBucket(unified.eventTs)
  });
  return crypto.createHash('sha1').update(key).digest('hex');
}

module.exports = { computeFingerprint };

