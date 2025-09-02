const splunk = require('./splunk');
const defender = require('./defender');
const email = require('./email');
const generic = require('./generic');

const normalizers = [splunk, defender, email, generic];

function selectNormalizer(raw) {
  for (const n of normalizers) {
    try {
      if (n.detect(raw)) return n;
    } catch {}
  }
  return generic;
}

function toUnifiedAlert(raw) {
  const n = selectNormalizer(raw);
  return n.normalize(raw);
}

module.exports = { toUnifiedAlert };

