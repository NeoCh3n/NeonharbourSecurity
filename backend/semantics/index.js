const dict = require('./dictionaries.json');

function lower(s) { return typeof s === 'string' ? s.toLowerCase() : s; }

function mapAction(a) {
  const k = lower(a) || '';
  return dict.action[k] || a || 'UNKNOWN';
}

function mapCategory(c) {
  const k = lower(c) || '';
  return dict.category[k] || c || 'unknown';
}

function mapTechnique(t) {
  if (!t) return null;
  const k = lower(t);
  return dict.technique[k] || t;
}

function normalizeSemantics(alert) {
  const out = { ...alert };
  out.action = mapAction(alert.action);
  out.category = mapCategory(alert.category);
  out.technique = mapTechnique(alert.technique);
  return out;
}

module.exports = { normalizeSemantics };

