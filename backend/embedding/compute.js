// Placeholder embedding computation. In production, replace with real model
// and pgvector storage. Returns null or a small numeric array for demo.

function buildText(unified) {
  const parts = [];
  if (unified.summary) parts.push(unified.summary);
  parts.push(
    `action:${unified.action}`,
    `category:${unified.category}`,
    `principal:${JSON.stringify(unified.principal || {})}`,
    `asset:${JSON.stringify(unified.asset || {})}`
  );
  (unified.entities || []).slice(0, 10).forEach(e => parts.push(`${e.type}:${e.value}`));
  return parts.join(' ');
}

// Simple feature-hashing embedding to 64-d vector for demo/local use.
// Not semantic but stable and enables pgvector demos without external deps.
function hash64(str) {
  let h = 1469598103934665603n; // FNV-1a 64-bit offset
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * 1099511628211n) & ((1n << 64n) - 1n);
  }
  return Number(h & 0xffffffffn) ^ Number((h >> 32n) & 0xffffffffn);
}

function toVec64(text) {
  const dim = 64;
  const vec = new Array(dim).fill(0);
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_:\-\.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 512);
  for (const t of tokens) {
    const idx = Math.abs(hash64(t)) % dim;
    vec[idx] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

async function computeEmbedding(unified) {
  const text = buildText(unified);
  const vec = toVec64(text);
  return { vec, dim: 64, method: 'feature-hash-64' };
}

module.exports = { computeEmbedding, buildText, toVec64 };
