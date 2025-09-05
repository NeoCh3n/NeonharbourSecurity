const { pool } = require('../database');
const { summarizeCaseMemory } = require('../memory/summarizer');

function startSummarizerCron({ intervalMs = 15 * 60 * 1000 } = {}) {
  const enabled = String(process.env.ENABLE_SUMMARIZER_CRON || 'false').toLowerCase();
  if (!['1','true','yes','on'].includes(enabled)) {
    console.log('[cron] Summarizer cron disabled');
    return;
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[cron] Summarizer cron disabled (no DEEPSEEK_API_KEY)');
    return;
  }
  console.log(`[cron] Summarizer cron enabled, every ${Math.round(intervalMs/60000)} min`);
  setInterval(async () => {
    try {
      const r = await pool.query('SELECT DISTINCT user_id, case_id FROM alerts WHERE case_id IS NOT NULL AND user_id IS NOT NULL');
      for (const row of r.rows) {
        try { await summarizeCaseMemory(row.case_id, row.user_id); } catch (e) { console.warn('[cron] summarize failed for case', row.case_id, e.message); }
      }
    } catch (e) {
      console.error('[cron] job error:', e.message);
    }
  }, intervalMs).unref();
}

module.exports = { startSummarizerCron };

