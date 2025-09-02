const { toUnifiedAlert } = require('../normalizers');
const { normalizeSemantics } = require('../semantics');
const { computeFingerprint } = require('../casing/fingerprint');
const { computeEmbedding, buildText } = require('../embedding/compute');
const { scorePriority } = require('../scoring/priority');

async function runPipeline(raw) {
  // Step 1: Format normalization
  let unified = toUnifiedAlert(raw);
  // Step 2: Semantic normalization
  unified = normalizeSemantics(unified);
  // Step 3: Fingerprint (for dedup/casing)
  const fingerprint = computeFingerprint(unified);
  unified.fingerprint = fingerprint;
  // Step 4: Build summary if missing
  if (!unified.summary) {
    const ents = (unified.entities || []).slice(0, 3).map(e => `${e.type}:${e.value}`).join(', ');
    unified.summary = `${unified.action} by ${unified.principal?.user || unified.principal?.email || 'unknown'} @ ${unified.asset?.host || unified.asset?.app || 'unknown'} [${ents}]`;
  }
  // Step 5: Priority score
  unified.priority = scorePriority(unified);
  // Step 6: Embedding (async placeholder)
  unified.embedding = await computeEmbedding(unified); // may be null
  unified.embeddingText = buildText(unified); // store text for future embedding job
  return unified;
}

module.exports = { runPipeline };

