// Minimal DeepSeek/OpenAI-compatible sanity check using existing AI pipeline
// Usage:
//   export DEEPSEEK_API_KEY=... 
//   export DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
//   export DEEPSEEK_MODEL=deepseek-chat
//   node backend/test_deepseek.js

const { hunterQuery } = require('./ai');

async function main() {
  const { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } = process.env;
  if (!DEEPSEEK_API_KEY) {
    console.error('Missing DEEPSEEK_API_KEY');
    process.exit(1);
  }
  console.log('[info] Base URL:', DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1');
  console.log('[info] Model:', DEEPSEEK_MODEL || '(backend default)');

  const question = '根据以下日志判断是否可能存在可疑的登录行为，并给出结论和证据（中文回答），输出JSON。';
  const logs = [
    '2025-08-30T02:14:21Z auth ok user=bob ip=203.0.113.5 geo=HK device=Chrome-126',
    '2025-08-30T02:15:02Z auth fail user=bob ip=198.51.100.12 geo=US device=Edge-125',
    '2025-08-30T02:16:10Z mfa ok user=bob ip=203.0.113.5 geo=HK device=Chrome-126',
  ];

  try {
    const result = await hunterQuery(question, logs);
    console.log('\nResult:\n', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(2);
  }
}

main();
