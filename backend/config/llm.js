const { getSetting } = require('./settings');

async function getLLMConfig() {
  // Single toggle determines provider; defaults to env if not set
  const s = await getSetting('llm_provider', null);
  const provider = (s && typeof s.provider === 'string') ? s.provider : (process.env.AI_PROVIDER || 'deepseek');
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

