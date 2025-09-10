const { getSetting } = require('./settings');

async function getLLMConfig() {
  // Single toggle determines provider; defaults to env if not set
  const s = await getSetting('llm_provider', null);
  // Support legacy values where the stored setting was a plain string
  const settingProvider = (typeof s === 'string') ? s : (s && typeof s.provider === 'string' ? s.provider : null);
  const provider = (settingProvider || process.env.AI_PROVIDER || 'deepseek').toLowerCase();
  if (provider === 'local') {
    return {
      provider: 'local',
      baseUrl: (process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:1234/v1').replace(/\/$/, ''),
      model: process.env.LOCAL_LLM_MODEL || 'zysec-ai_-_securityllm',
      apiKey: null,
    };
  }
  // deepseek default
  return {
    provider: 'deepseek',
    baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY || null,
  };
}

module.exports = { getLLMConfig };
