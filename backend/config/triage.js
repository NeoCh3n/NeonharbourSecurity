const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  benignActions: ['login_success', 'email_delivered'],
  benignCategories: ['informational', 'info'],
  escalateSeverities: ['high', 'critical'],
  lowSeverity: ['low'],
  vtMaliciousMin: 1,
  mitreConfidenceLow: 0.3,
  mitreConfidenceHigh: 0.6,
  minEntitiesForMultiImpact: 2,
  staleAutoResolveDays: 3,
  stalePendingDays: 7,
};

let cachedConfig = null;

function loadConfigFile() {
  try {
    const customPath = process.env.TRIAGE_CONFIG_PATH || path.join(__dirname, 'triage.json');
    if (fs.existsSync(customPath)) {
      const raw = fs.readFileSync(customPath, 'utf8');
      const obj = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...obj };
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load triage config, using defaults:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

async function getTriageConfig() {
  if (!cachedConfig) cachedConfig = loadConfigFile();
  return cachedConfig;
}

module.exports = { getTriageConfig };

