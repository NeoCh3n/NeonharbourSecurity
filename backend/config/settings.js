const { pool } = require('../database');

async function getSetting(key, defaultValue = null) {
  const r = await pool.query('SELECT value FROM settings WHERE key=$1', [key]);
  if (!r.rows.length) return defaultValue;
  return r.rows[0].value ?? defaultValue;
}

async function setSetting(key, value) {
  await pool.query('INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()', [key, value]);
}

module.exports = { getSetting, setSetting };

