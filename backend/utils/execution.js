const { pool } = require('../database');

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function expBackoffDelay({ base = 200, factor = 2, attempt = 1, jitter = true, max = 10000 } = {}) {
  const exp = Math.min(max, base * Math.pow(factor, attempt - 1));
  if (!jitter) return exp;
  const rand = Math.random() * 0.4 + 0.8; // 0.8–1.2 jitter
  return Math.floor(exp * rand);
}

function isAxiosError(err) {
  return !!(err && err.config && (err.response || err.request));
}

function classifyError(err) {
  // Normalize basic classes for routing decisions
  if (!err) return { class: 'unknown', retryable: false, message: 'Unknown error' };
  if (isAxiosError(err)) {
    const status = err.response ? err.response.status : null;
    const code = err.code || (err.response && err.response.data && err.response.data.code) || null;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return { class: 'timeout', retryable: true, message: err.message };
    if (!err.response) return { class: 'network', retryable: true, message: err.message };
    if (status === 429) return { class: 'rate_limit', retryable: true, message: 'Rate limited' };
    if (status >= 500) return { class: 'server_error', retryable: true, message: `Server error ${status}` };
    if (status === 401 || status === 403) return { class: 'auth', retryable: false, message: `Auth error ${status}` };
    if (status === 404) return { class: 'not_found', retryable: false, message: 'Not found' };
    return { class: 'invalid_request', retryable: false, message: `HTTP ${status}` };
  }
  if (err && (err.name === 'TimeoutError' || /timeout/i.test(err.message || ''))) return { class: 'timeout', retryable: true, message: err.message };
  return { class: 'unknown', retryable: false, message: err.message || 'Unknown error' };
}

async function withRetry(fn, { retries = 3, base = 250, factor = 2, jitter = true, shouldRetry } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn(attempt + 1);
    } catch (err) {
      lastErr = err;
      const info = classifyError(err);
      const retryable = typeof shouldRetry === 'function' ? !!shouldRetry(err, info, attempt) : info.retryable;
      if (attempt === retries || !retryable) {
        err.__errorClass = info.class;
        throw err;
      }
      attempt += 1;
      const delay = expBackoffDelay({ base, factor, attempt, jitter });
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function parallelMap(items, mapper, { concurrency = 5 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const results = new Array(items.length);
  let idx = 0;
  let active = 0;
  return new Promise((resolve, reject) => {
    const next = () => {
      if (idx >= items.length && active === 0) return resolve(results);
      while (active < concurrency && idx < items.length) {
        const cur = idx++;
        active++;
        Promise.resolve()
          .then(() => mapper(items[cur], cur))
          .then((res) => { results[cur] = res; active--; next(); })
          .catch((err) => reject(err));
      }
    };
    next();
  });
}

async function recordExecution({ tenantId = null, approvalRequestId = null, tool, request, response, status, errorClass, retries = 0, startedAt = new Date(), finishedAt = new Date() }) {
  try {
    if (tenantId) {
      await pool.query(
        `INSERT INTO action_executions (approval_request_id, tool, request, response, status, error_class, retries, started_at, finished_at, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [approvalRequestId, tool, request ? JSON.stringify(request) : null, response ? JSON.stringify(response) : null, status, errorClass || null, retries, startedAt, finishedAt, tenantId]
      );
    } else {
      await pool.query(
        `INSERT INTO action_executions (approval_request_id, tool, request, response, status, error_class, retries, started_at, finished_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [approvalRequestId, tool, request ? JSON.stringify(request) : null, response ? JSON.stringify(response) : null, status, errorClass || null, retries, startedAt, finishedAt]
      );
    }
  } catch (e) {
    // Do not throw; logging failure shouldn't break flow
    // eslint-disable-next-line no-console
    console.error('Failed to record action execution:', e.message);
  }
}

async function toolExecutor(toolName, execFn, { retries = 3, base = 300, factor = 2, jitter = true, approvalRequestId = null, tenantId = null } = {}) {
  const started = new Date();
  let attempts = 0;
  try {
    const result = await withRetry(async (attempt) => {
      attempts = attempt;
      return execFn();
    }, { retries, base, factor, jitter });
    await recordExecution({ tenantId, approvalRequestId, tool: toolName, request: null, response: result, status: 'success', retries: attempts - 1, startedAt: started, finishedAt: new Date() });
    return result;
  } catch (err) {
    const errorClass = err.__errorClass || classifyError(err).class;
    await recordExecution({ tenantId, approvalRequestId, tool: toolName, request: null, response: { error: err.message }, status: 'failure', errorClass, retries: attempts - 1, startedAt: started, finishedAt: new Date() });
    throw err;
  }
}

module.exports = {
  sleep,
  expBackoffDelay,
  classifyError,
  withRetry,
  parallelMap,
  toolExecutor,
};
