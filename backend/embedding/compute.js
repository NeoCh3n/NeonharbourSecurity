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

async function computeEmbedding(unified) {
  // For now return null to avoid heavy deps; keep API async for future swap-in
  void buildText(unified);
  return null;
}

module.exports = { computeEmbedding, buildText };

