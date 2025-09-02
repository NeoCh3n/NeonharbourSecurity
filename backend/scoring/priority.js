function scorePriority(unified) {
  const sev = (unified.severity || 'low').toLowerCase();
  const sevScore = sev === 'critical' ? 4 : sev === 'high' ? 3 : sev === 'medium' ? 2 : 1;
  const assetCriticality = 1; // TODO: look up CMDB/asset table
  const repeatBurst = 0; // TODO: compute from history
  const conf = typeof unified.confidence === 'number' ? unified.confidence : 0.5;
  return 0.4 * sevScore + 0.3 * assetCriticality + 0.2 * repeatBurst + 0.1 * conf;
}

module.exports = { scorePriority };

