const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { analyzeAlert, hunterQuery, mapMitre } = require('./ai');
const { pool, initDatabase } = require('./database');

const app = express();
// Behind nginx reverse proxy in docker-compose
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
}));

// Permissive CORS for local + proxy environments
const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true);
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return cb(null, true);
  } catch {}
  if (process.env.NODE_ENV !== 'production') return cb(null, true);
  const allowed = ['https://yourdomain.com'];
  if (allowed.includes(origin)) return cb(null, true);
  return cb(null, true); // default allow for this console
};
app.use(cors({ origin: corsOrigin, credentials: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// More aggressive rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // limit to 5 attempts per window
  message: 'Too many authentication attempts, please try again later.'
});
app.use('/auth/', authLimiter);

app.use(express.json({ limit: '10mb' }));

const upload = multer();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
}

function parseJsonMaybe(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, email, is_admin FROM users WHERE id = $1', [payload.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid token' });
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Auth routes
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  
  try {
    // Enforce self-registration setting (default true)
    try {
      const { getSetting } = require('./config/settings');
      const s = await getSetting('allowSelfRegister', { allowSelfRegister: true });
      if (s && s.allowSelfRegister === false) {
        return res.status(403).json({ error: 'Self-registration is disabled by admin' });
      }
    } catch {}
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) return res.status(400).json({ error: 'Email exists' });
    const hashed = await bcrypt.hash(password, 10);
    // First user becomes admin
    const c = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const isAdmin = (c.rows[0]?.count || 0) === 0;
    const result = await pool.query(
      'INSERT INTO users (email, password, is_admin) VALUES ($1, $2, $3) RETURNING id, email, is_admin',
      [email, hashed, isAdmin]
    );
    const user = result.rows[0];
    const token = generateToken(user);
    res.json({ token, isAdmin: user.is_admin });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const result = await pool.query('SELECT id, email, password, is_admin FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });
    
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });
    
    const token = generateToken(user);
    res.json({ token, isAdmin: user.is_admin });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, isAdmin: !!req.user.is_admin });
});

const { runPipeline } = require('./pipeline/runPipeline');
const { upsertCaseForFingerprint, linkAlertToCase } = require('./casing/case_linker');
const { findSimilarCaseCandidate } = require('./casing/case_linker');
const { generatePlan, generateRecommendations } = require('./planning/plan');
const { getOrInitCasePlan, createSession, addMemory, listCaseMemory, getCasePlan, updateCasePlan, listSessions, getSession } = require('./memory/store');
const { summarizeCaseMemory, summarizeAllCasesForUser } = require('./memory/summarizer');
const { getSetting, setSetting } = require('./config/settings');
const { evaluateAction, checkSegregationOfDuties, getPoliciesForUser, ensureDefaultPolicies } = require('./policy/engine');
const { toolExecutor } = require('./utils/execution');
const { getTool } = require('./tools');
const { auditLog } = require('./middleware/audit');

// Helper to process and persist alert objects
async function processAlertsForUser(alertObjs, userId) {
  const processed = [];
  for (const alert of alertObjs) {
    try {
      // Normalize + semantics + fingerprint + embedding
      const unified = await runPipeline(alert);
      // AI analysis on unified alert for richer summary/timeline
      const analysis = await analyzeAlert(unified);
      const timelineJson = JSON.stringify(Array.isArray(analysis.timeline) ? analysis.timeline : []);
      const evidenceJson = JSON.stringify(Array.isArray(analysis.evidence) ? analysis.evidence : []);
      const rawJson = JSON.stringify(alert ?? {});
      // Link to case by fingerprint
      let caseId;
      try {
        const sim = await findSimilarCaseCandidate(unified.embedding?.vec, userId);
        if (sim?.caseId) caseId = sim.caseId;
      } catch {}
      if (!caseId) {
        caseId = await upsertCaseForFingerprint(unified.fingerprint, unified.severity || 'low');
      }
      // Long-horizon: reuse or create case plan with memory context
      const { plan } = await getOrInitCasePlan(caseId, userId, { generatePlanFn: generatePlan, unified, analysis });
      // MITRE ATT&CK mapping via AI
      let mitre = null; let tactic = null; let techniqueStr = unified.technique || null;
      try {
        mitre = await mapMitre(unified);
        if (mitre && Array.isArray(mitre.techniques) && mitre.techniques[0]) {
          const t0 = mitre.techniques[0];
          techniqueStr = t0.id ? `${t0.id} ${t0.name||''}`.trim() : (t0.name || techniqueStr);
        }
        if (mitre && Array.isArray(mitre.tactics) && mitre.tactics[0]) tactic = mitre.tactics[0].id || mitre.tactics[0].name || null;
      } catch {}
      const recommendations = generateRecommendations(unified);
      const result = await pool.query(
        `INSERT INTO alerts (
           source, status, summary, severity, category, action, technique, confidence,
           tactic,
           principal, asset, entities, fingerprint, case_id, plan, recommendations,
           ack_time, investigate_start, resolve_time,
           embedding, embedding_text, embedding_vec,
           mitre, timeline, evidence, analysis_time, raw, user_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,
           $9,
           $10,$11,$12,$13,$14,$15,$16,
           $17,$18,$19,
           $20,$21,
           $22,$23,$24,
           $25,$26,$27,$28,$29
         ) RETURNING id, created_at, source, status, summary, severity`,
        [
          unified.source || 'ingest',
          'needs_review',
          analysis.summary || unified.summary,
          analysis.severity || unified.severity || 'low',
          unified.category || null,
          unified.action || null,
          techniqueStr || null,
          typeof unified.confidence === 'number' ? unified.confidence : null,
          tactic || null,
          JSON.stringify(unified.principal || {}),
          JSON.stringify(unified.asset || {}),
          JSON.stringify(unified.entities || []),
          unified.fingerprint || null,
          caseId || null,
          JSON.stringify(plan || {}),
          JSON.stringify(recommendations || []),
          null,
          null,
          null,
          unified.embedding ? JSON.stringify(unified.embedding) : null,
          unified.embeddingText || null,
          Array.isArray(unified.embedding?.vec) ? `[${unified.embedding.vec.join(',')}]` : null,
          mitre ? JSON.stringify(mitre) : null,
          timelineJson,
          evidenceJson,
          analysis.analysisTime,
          rawJson,
          userId
        ]
      );
      try { await linkAlertToCase(caseId, result.rows[0].id); } catch {}
      processed.push(result.rows[0]);
    } catch (error) {
      console.error('Error processing alert:', error);
    }
  }
  return processed;
}

// Alerts upload (CSV/JSON file or JSON body)
app.post('/alerts/upload', authMiddleware, upload.single('file'), async (req, res) => {
  let data = [];
  try {
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const content = req.file.buffer.toString('utf8');
      if (ext === '.csv') {
        const records = csvParse(content, { columns: true });
        data = records;
      } else if (ext === '.json') {
        data = JSON.parse(content);
      }
    } else if (Array.isArray(req.body)) {
      data = req.body;
    } else if (req.body.alerts) {
      data = req.body.alerts;
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const processed = await processAlertsForUser(data, req.user.id);
  res.json({ alerts: processed });
});

// Alerts ingest (JSON only) per MVP API contract
app.post('/alerts/ingest', authMiddleware, async (req, res) => {
  let data = [];
  try {
    if (Array.isArray(req.body)) {
      data = req.body;
    } else if (Array.isArray(req.body.alerts)) {
      data = req.body.alerts;
    } else if (req.body && typeof req.body === 'object') {
      data = [req.body];
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  if (!data.length) return res.status(400).json({ error: 'No alerts provided' });
  const processed = await processAlertsForUser(data, req.user.id);
  res.json({ alerts: processed });
});

app.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, created_at as "createdAt", source, status, severity FROM alerts WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/alerts/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await pool.query(
      'SELECT * FROM alerts WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    row.timeline = parseJsonMaybe(row.timeline, []);
    row.evidence = parseJsonMaybe(row.evidence, []);
    row.raw = parseJsonMaybe(row.raw, {});
    row.plan = parseJsonMaybe(row.plan, {});
    row.mitre = parseJsonMaybe(row.mitre, {});
    row.recommendations = parseJsonMaybe(row.recommendations, []);

    // Fallback: if MITRE mapping or recommendations are missing (older alerts), compute on-demand
    if ((!row.mitre || Object.keys(row.mitre).length === 0) || !Array.isArray(row.recommendations) || row.recommendations.length === 0) {
      try {
        const { toUnifiedAlert } = require('./normalizers');
        const unified = toUnifiedAlert(row.raw || {});
        // Recommendations
        const { generateRecommendations } = require('./planning/plan');
        const recs = generateRecommendations(unified);
        // MITRE mapping (best-effort; may be null if AI unavailable)
        let mitre = null; let tactic = row.tactic || null; let technique = row.technique || null;
        try {
          mitre = await mapMitre(unified);
          if (mitre && Array.isArray(mitre.techniques) && mitre.techniques[0]) {
            const t0 = mitre.techniques[0];
            technique = t0.id ? `${t0.id} ${t0.name||''}`.trim() : (t0.name || technique);
          }
          if (mitre && Array.isArray(mitre.tactics) && mitre.tactics[0]) tactic = tactic || mitre.tactics[0].id || mitre.tactics[0].name || null;
        } catch {}
        // Persist if anything computed
        await pool.query('UPDATE alerts SET recommendations=$1, mitre=$2, tactic=$3, technique=$4 WHERE id=$5 AND user_id=$6', [JSON.stringify(recs||[]), mitre ? JSON.stringify(mitre) : row.mitre || null, tactic, technique, id, req.user.id]);
        row.recommendations = recs || row.recommendations;
        row.mitre = mitre || row.mitre;
        row.tactic = tactic || row.tactic;
        row.technique = technique || row.technique;
      } catch (e) {
        // ignore fallback failure
      }
    }
    res.json(row);
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Investigation details endpoint per MVP API
app.get('/alerts/:id/investigation', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await pool.query(
      'SELECT summary, timeline, evidence FROM alerts WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    row.timeline = parseJsonMaybe(row.timeline, []);
    row.evidence = parseJsonMaybe(row.evidence, []);
    res.json(row);
  } catch (error) {
    console.error('Error fetching investigation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get plan for an alert
app.get('/alerts/:id/plan', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const r = await pool.query('SELECT plan, recommendations, ack_time, investigate_start, resolve_time, raw, summary, timeline, evidence, case_id FROM alerts WHERE id=$1 AND user_id=$2', [id, req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = r.rows[0];
    row.plan = parseJsonMaybe(row.plan, {});
    row.mitre = parseJsonMaybe(row.mitre, {});
    row.recommendations = parseJsonMaybe(row.recommendations, []);
    // Prefer case plan if available
    if (row.case_id) {
      try {
        const cp = await getCasePlan(row.case_id);
        if (cp?.plan) row.plan = cp.plan;
      } catch {}
    }
    const needRegen = !row.plan || !Array.isArray(row.plan.questions) || row.plan.questions.length < 3;
    if (needRegen) {
      try {
        const { toUnifiedAlert } = require('./normalizers');
        const { generatePlan } = require('./planning/plan');
        const unified = toUnifiedAlert(parseJsonMaybe(row.raw, {}));
        const analysis = { summary: row.summary, timeline: parseJsonMaybe(row.timeline, []), evidence: parseJsonMaybe(row.evidence, []) };
        let plan;
        if (row.case_id) {
          const res = await getOrInitCasePlan(row.case_id, req.user.id, { generatePlanFn: generatePlan, unified, analysis });
          plan = res.plan;
        } else {
          plan = await generatePlan(unified, analysis);
        }
        await pool.query('UPDATE alerts SET plan=$1 WHERE id=$2 AND user_id=$3', [JSON.stringify(plan), id, req.user.id]);
        row.plan = plan;
      } catch {}
    }
    res.json(row);
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update plan or toggle step
app.post('/alerts/:id/plan', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const r = await pool.query('SELECT plan, ack_time, investigate_start, resolve_time, case_id FROM alerts WHERE id=$1 AND user_id=$2', [id, req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    let plan = parseJsonMaybe(r.rows[0].plan, {});
    const { stepId, done, plan: newPlan } = req.body || {};
    let ack = r.rows[0].ack_time;
    let inv = r.rows[0].investigate_start;
    let reso = r.rows[0].resolve_time;
    if (newPlan) {
      plan = newPlan;
    } else if (stepId) {
      const idx = Array.isArray(plan.steps) ? plan.steps.findIndex(s => s.id === stepId) : -1;
      if (idx >= 0) {
        plan.steps[idx].done = !!done;
        // update timestamps heuristically
        if (stepId === 'ack' && !ack && done) ack = new Date().toISOString();
        if (stepId === 'collect' && !inv && done) inv = new Date().toISOString();
        if (stepId === 'report' && !reso && done) reso = new Date().toISOString();
      }
    }
    const upd = await pool.query(
      'UPDATE alerts SET plan=$1, ack_time=$2, investigate_start=$3, resolve_time=$4 WHERE id=$5 AND user_id=$6 RETURNING plan, ack_time, investigate_start, resolve_time',
      [JSON.stringify(plan || {}), ack, inv, reso, id, req.user.id]
    );
    // Keep case plan in sync if present
    const caseId = r.rows[0].case_id;
    if (caseId) {
      try { await updateCasePlan(caseId, plan); } catch {}
    }
    const row = upd.rows[0];
    row.plan = parseJsonMaybe(row.plan, {});
    row.mitre = parseJsonMaybe(row.mitre, {});
    res.json(row);
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Integrations: list user's configured data sources
app.get('/integrations', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT provider, enabled, settings FROM integrations WHERE user_id=$1 ORDER BY provider',
      [req.user.id]
    );
    res.json({ integrations: r.rows.map(row => ({ provider: row.provider, enabled: !!row.enabled, settings: row.settings || {} })) });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Long-horizon memory: case memory endpoints
app.get('/cases/:id/memory', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  try {
    const mem = await listCaseMemory(caseId, req.user.id, { limit: 200 });
    res.json({ memory: mem });
  } catch (e) {
    console.error('Error listing memory:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/cases/:id/memory', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const { type = 'note', key = null, value = {}, tags = [], importance = 0.5, sessionId = null } = req.body || {};
  try {
    const row = await addMemory({ userId: req.user.id, caseId, sessionId, type, key, value, tags, importance });
    res.json({ success: true, memory: row });
  } catch (e) {
    console.error('Error adding memory:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sessions per case
app.get('/cases/:id/sessions', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  try {
    const rows = await listSessions(caseId, req.user.id);
    res.json({ sessions: rows });
  } catch (e) {
    console.error('Error listing sessions:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/cases/:id/sessions', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const { alertId = null, title = null, context = {} } = req.body || {};
  try {
    const row = await createSession({ userId: req.user.id, caseId, alertId, title, context });
    res.json({ success: true, session: row });
  } catch (e) {
    console.error('Error creating session:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/sessions/:sessionId', authMiddleware, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const row = await getSession(sessionId, req.user.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error('Error fetching session:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Case plan retrieval and updates
app.get('/cases/:id/plan', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  try {
    const row = await getCasePlan(caseId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error('Error fetching case plan:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/cases/:id/plan', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const { plan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'Missing plan' });
  try {
    const row = await updateCasePlan(caseId, plan);
    res.json({ success: true, plan: row.plan, updatedAt: row.updated_at });
  } catch (e) {
    console.error('Error updating case plan:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Summarization jobs to keep context concise
app.post('/cases/:id/summarize', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  try {
    const result = await summarizeCaseMemory(caseId, req.user.id);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('Error summarizing case:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/jobs/summarize-cases', authMiddleware, async (req, res) => {
  try {
    const results = await summarizeAllCasesForUser(req.user.id);
    res.json({ success: true, results });
  } catch (e) {
    console.error('Error running summarize job:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: LLM provider toggle (single option)
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/admin/settings/llm', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const v = await getSetting('llm_provider', { provider: process.env.AI_PROVIDER || 'deepseek' });
    res.json(v);
  } catch (e) {
    console.error('Error reading LLM setting:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/settings/llm', authMiddleware, requireAdmin, async (req, res) => {
  const { provider } = req.body || {};
  const p = String(provider || '').toLowerCase();
  if (!['deepseek', 'local'].includes(p)) return res.status(400).json({ error: 'Invalid provider' });
  try {
    await setSetting('llm_provider', { provider: p });
    await auditLog('admin_llm_provider_update', req.user.id, { provider: p, ipAddress: req.ip });
    res.json({ success: true, provider: p });
  } catch (e) {
    console.error('Error updating LLM setting:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: allow self registration toggle
app.get('/admin/settings/register', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const v = await getSetting('allowSelfRegister', { allowSelfRegister: true });
    res.json({ allowSelfRegister: v && typeof v.allowSelfRegister === 'boolean' ? v.allowSelfRegister : true });
  } catch (e) {
    console.error('Error reading register setting:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/settings/register', authMiddleware, requireAdmin, async (req, res) => {
  const { allowSelfRegister } = req.body || {};
  const val = !!allowSelfRegister;
  try {
    await setSetting('allowSelfRegister', { allowSelfRegister: val });
    await auditLog('admin_register_toggle', req.user.id, { allowSelfRegister: val, ipAddress: req.ip });
    res.json({ success: true, allowSelfRegister: val });
  } catch (e) {
    console.error('Error updating register setting:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upsert integrations for the user
app.post('/integrations', authMiddleware, async (req, res) => {
  const items = Array.isArray(req.body?.integrations) ? req.body.integrations : null;
  if (!items) return res.status(400).json({ error: 'Missing integrations' });
  try {
    for (const it of items) {
      const provider = String(it.provider || '').toLowerCase();
      if (!provider) continue;
      const enabled = !!it.enabled;
      const settings = it.settings && typeof it.settings === 'object' ? it.settings : {};
      // Try update, then insert if not exists
      const upd = await pool.query(
        'UPDATE integrations SET enabled=$1, settings=$2, updated_at=NOW() WHERE user_id=$3 AND provider=$4',
        [enabled, settings, req.user.id, provider]
      );
      if (upd.rowCount === 0) {
        await pool.query(
          'INSERT INTO integrations (user_id, provider, enabled, settings) VALUES ($1,$2,$3,$4)',
          [req.user.id, provider, enabled, settings]
        );
      }
      try {
        await pool.query(
          'INSERT INTO audit_logs (action, user_id, details, ip_address) VALUES ($1, $2, $3, $4)',
          ['integrations_update', req.user.id, { provider, enabled }, req.ip]
        );
      } catch {}
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating integrations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request an action (human approval flow placeholder)
app.post('/actions/:id/request', authMiddleware, async (req, res) => {
  const alertId = parseInt(req.params.id, 10);
  const { action, resource = '*', params = {}, reason } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action' });
  try {
    const decision = await evaluateAction(req.user.id, action, resource, params?.context || {});
    const traceId = Math.random().toString(36).slice(2);
    if (decision.decision === 'deny') {
      await auditLog('action_denied', req.user.id, { alertId, action, resource, reason: decision.reason, policyId: decision.policyId, ipAddress: req.ip });
      return res.status(403).json({ error: 'Denied by policy', reason: decision.reason, policyId: decision.policyId });
    }
    if (decision.decision === 'allow') {
      // Execute immediately
      const tool = getTool(action);
      if (!tool) return res.status(400).json({ error: 'Unsupported action' });
      const result = await toolExecutor(action, () => tool(params));
      await auditLog('action_execute', req.user.id, { alertId, action, resource, result, ipAddress: req.ip });
      return res.json({ success: true, executed: true, result, traceId });
    }
    // require_approval path: create approval request
    const r = await pool.query(
      `INSERT INTO approval_requests (user_id, alert_id, action, parameters, status, reason, trace_id)
       VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING id, status`,
      [req.user.id, alertId, action, JSON.stringify(params || {}), reason || null, traceId]
    );
    await auditLog('action_request', req.user.id, { alertId, action, resource, reason, policyId: decision.policyId, ipAddress: req.ip });
    res.json({ success: true, executed: false, approvalRequestId: r.rows[0].id, status: r.rows[0].status, traceId });
  } catch (error) {
    console.error('Error creating action request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Execute an action explicitly (will run policy evaluation and/or attach to approval request if provided)
app.post('/actions/:id/execute', authMiddleware, async (req, res) => {
  const alertId = parseInt(req.params.id, 10);
  const { action, resource = '*', params = {}, approvalRequestId = null } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action' });
  try {
    const decision = await evaluateAction(req.user.id, action, resource, params?.context || {});
    if (decision.decision === 'deny') {
      await auditLog('action_denied', req.user.id, { alertId, action, resource, reason: decision.reason, policyId: decision.policyId, ipAddress: req.ip });
      return res.status(403).json({ error: 'Denied by policy', reason: decision.reason, policyId: decision.policyId });
    }
    if (decision.decision === 'require_approval') {
      if (!approvalRequestId) return res.status(403).json({ error: 'Approval required', reason: decision.reason, policyId: decision.policyId });
      const r = await pool.query('SELECT id, status, user_id FROM approval_requests WHERE id=$1', [approvalRequestId]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Approval request not found' });
      if (r.rows[0].status !== 'approved') return res.status(403).json({ error: 'Approval not granted' });
    }
    const tool = getTool(action);
    if (!tool) return res.status(400).json({ error: 'Unsupported action' });
    const result = await toolExecutor(action, () => tool(params), { approvalRequestId });
    await auditLog('action_execute', req.user.id, { alertId, action, resource, approvalRequestId, result, ipAddress: req.ip });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approvals list for current user (their requests) and inbox (all pending - simple MVP)
app.get('/approvals', authMiddleware, async (req, res) => {
  try {
    const mine = await pool.query('SELECT * FROM approval_requests WHERE user_id=$1 ORDER BY requested_at DESC', [req.user.id]);
    const pending = await pool.query('SELECT * FROM approval_requests WHERE status = \'pending\' ORDER BY requested_at DESC');
    res.json({ mine: mine.rows, inbox: pending.rows });
  } catch (e) {
    console.error('Error fetching approvals:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/approvals/:approvalId', authMiddleware, async (req, res) => {
  const approvalId = parseInt(req.params.approvalId, 10);
  try {
    const r = await pool.query('SELECT * FROM approval_requests WHERE id=$1', [approvalId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('Error fetching approval:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/approvals/:approvalId/approve', authMiddleware, async (req, res) => {
  const approvalId = parseInt(req.params.approvalId, 10);
  try {
    const r = await pool.query('SELECT * FROM approval_requests WHERE id=$1', [approvalId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const reqRow = r.rows[0];
    if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Request not pending' });
    const sod = checkSegregationOfDuties(reqRow.user_id, req.user.id);
    if (!sod.ok) return res.status(403).json({ error: sod.reason });
    const upd = await pool.query('UPDATE approval_requests SET status=\'approved\', approver_id=$1, decided_at=NOW() WHERE id=$2 RETURNING *', [req.user.id, approvalId]);
    await auditLog('action_approve', req.user.id, { approvalRequestId: approvalId, ipAddress: req.ip });
    res.json({ success: true, approval: upd.rows[0] });
  } catch (e) {
    console.error('Error approving request:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/approvals/:approvalId/deny', authMiddleware, async (req, res) => {
  const approvalId = parseInt(req.params.approvalId, 10);
  const { reason } = req.body || {};
  try {
    const r = await pool.query('SELECT * FROM approval_requests WHERE id=$1', [approvalId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (r.rows[0].status !== 'pending') return res.status(400).json({ error: 'Request not pending' });
    const upd = await pool.query('UPDATE approval_requests SET status=\'denied\', approver_id=$1, decided_at=NOW(), reason=$2 WHERE id=$3 RETURNING *', [req.user.id, reason || null, approvalId]);
    await auditLog('action_deny', req.user.id, { approvalRequestId: approvalId, ipAddress: req.ip, reason });
    res.json({ success: true, approval: upd.rows[0] });
  } catch (e) {
    console.error('Error denying request:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Policies management
app.get('/policies', authMiddleware, async (req, res) => {
  try {
    const rows = await getPoliciesForUser(req.user.id);
    res.json({ policies: rows });
  } catch (e) {
    console.error('Error listing policies:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/policies', authMiddleware, async (req, res) => {
  const { name, description, effect, action_pattern, resource_pattern = '*', conditions = {}, risk = null } = req.body || {};
  if (!name || !effect || !action_pattern) return res.status(400).json({ error: 'Missing required fields' });
  const eff = String(effect).toLowerCase();
  if (!['allow','deny','require_approval'].includes(eff)) return res.status(400).json({ error: 'Invalid effect' });
  try {
    const conds = typeof conditions === 'string' ? JSON.parse(conditions) : (conditions || {});
    const r = await pool.query(
      `INSERT INTO policies (user_id, name, description, effect, action_pattern, resource_pattern, conditions, risk)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, name, description || null, eff, action_pattern, resource_pattern || '*', conds, risk]
    );
    await auditLog('policy_create', req.user.id, { policyId: r.rows[0].id, ipAddress: req.ip });
    res.json({ success: true, policy: r.rows[0] });
  } catch (e) {
    console.error('Error creating policy:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/policies/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, description, effect, action_pattern, resource_pattern, conditions, risk } = req.body || {};
  try {
    const conds = typeof conditions === 'string' ? JSON.parse(conditions) : (conditions || {});
    const eff = effect ? String(effect).toLowerCase() : null;
    if (eff && !['allow','deny','require_approval'].includes(eff)) return res.status(400).json({ error: 'Invalid effect' });
    const r = await pool.query(
      `UPDATE policies SET
         name=COALESCE($1,name),
         description=COALESCE($2,description),
         effect=COALESCE($3,effect),
         action_pattern=COALESCE($4,action_pattern),
         resource_pattern=COALESCE($5,resource_pattern),
         conditions=COALESCE($6,conditions),
         risk=COALESCE($7,risk)
       WHERE id=$8 AND user_id=$9 RETURNING *`,
      [name || null, description || null, eff, action_pattern || null, resource_pattern || null, conds || null, risk || null, id, req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    await auditLog('policy_update', req.user.id, { policyId: id, ipAddress: req.ip });
    res.json({ success: true, policy: r.rows[0] });
  } catch (e) {
    console.error('Error updating policy:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/policies/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const r = await pool.query('DELETE FROM policies WHERE id=$1 AND user_id=$2 RETURNING id', [id, req.user.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    await auditLog('policy_delete', req.user.id, { policyId: id, ipAddress: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting policy:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/policies/reset-defaults', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM policies WHERE user_id=$1', [req.user.id]);
    await ensureDefaultPolicies(req.user.id);
    await auditLog('policy_reset_defaults', req.user.id, { ipAddress: req.ip });
    const rows = await getPoliciesForUser(req.user.id);
    res.json({ success: true, policies: rows });
  } catch (e) {
    console.error('Error resetting policies:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/alerts/:id/feedback', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { feedback } = req.body;
  
  try {
    const result = await pool.query(
      'UPDATE alerts SET feedback = $1 WHERE id = $2 AND user_id = $3 RETURNING id',
      [feedback, id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Threat hunter
app.post('/hunter/query', authMiddleware, async (req, res) => {
  const { question, logs = [] } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing question' });
  const result = await hunterQuery(question, logs);
  res.json(result);
});

// Metrics
app.get('/metrics', authMiddleware, async (req, res) => {
  try {
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM alerts WHERE user_id = $1',
      [req.user.id]
    );
    const severityResult = await pool.query(
      'SELECT severity, COUNT(*) as count FROM alerts WHERE user_id = $1 GROUP BY severity',
      [req.user.id]
    );
    const statusResult = await pool.query(
      'SELECT status, COUNT(*) as count FROM alerts WHERE user_id = $1 GROUP BY status',
      [req.user.id]
    );
    const timeResult = await pool.query(
      'SELECT AVG(analysis_time) as avg_time FROM alerts WHERE user_id = $1 AND analysis_time IS NOT NULL',
      [req.user.id]
    );
    const feedbackResult = await pool.query(
      `SELECT 
         SUM(CASE WHEN feedback = 'accurate' THEN 1 ELSE 0 END) as accurate,
         SUM(CASE WHEN feedback IS NOT NULL THEN 1 ELSE 0 END) as total_feedback
       FROM alerts WHERE user_id = $1`,
      [req.user.id]
    );

    // MTTI: avg(investigate_start - created_at); MTTR: avg(resolve_time - created_at)
    const mttiResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (investigate_start - created_at))) as mtti_sec
       FROM alerts WHERE user_id = $1 AND investigate_start IS NOT NULL`,
      [req.user.id]
    );
    const mttrResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolve_time - created_at))) as mttr_sec
       FROM alerts WHERE user_id = $1 AND resolve_time IS NOT NULL`,
      [req.user.id]
    );
    // Resolved alerts count based on resolve_time
    const resolvedResult = await pool.query(
      'SELECT COUNT(*) as resolved FROM alerts WHERE user_id = $1 AND resolve_time IS NOT NULL',
      [req.user.id]
    );
    // Investigated alerts count based on investigate_start
    const investigatedResult = await pool.query(
      'SELECT COUNT(*) as investigated FROM alerts WHERE user_id = $1 AND investigate_start IS NOT NULL',
      [req.user.id]
    );
    // Acknowledged alerts count based on ack_time
    const acknowledgedResult = await pool.query(
      'SELECT COUNT(*) as acknowledged FROM alerts WHERE user_id = $1 AND ack_time IS NOT NULL',
      [req.user.id]
    );
    
    const severityCounts = {};
    severityResult.rows.forEach(row => {
      severityCounts[row.severity] = parseInt(row.count);
    });
    const statusCounts = {};
    statusResult.rows.forEach(row => {
      statusCounts[row.status] = parseInt(row.count);
    });
    const accurate = parseInt(feedbackResult.rows[0].accurate || 0);
    const totalFeedback = parseInt(feedbackResult.rows[0].total_feedback || 0);
    const feedbackScore = totalFeedback > 0 ? Math.round((accurate / totalFeedback) * 100) : 0;
    
    const totalAlerts = parseInt(totalResult.rows[0].total);
    const resolvedCount = parseInt(resolvedResult.rows[0].resolved || 0);
    const investigatedCount = parseInt(investigatedResult.rows[0].investigated || 0);
    const acknowledgedCount = parseInt(acknowledgedResult.rows[0].acknowledged || 0);
    const backlogCount = Math.max(0, totalAlerts - resolvedCount);

    res.json({
      totalAlerts,
      severityCounts,
      statusCounts,
      investigatedCount,
      investigatingCount: investigatedCount,
      acknowledgedCount,
      resolvedCount,
      backlogCount,
      feedbackScore,
      avgAnalysisTime: timeResult.rows[0].avg_time ? parseFloat(timeResult.rows[0].avg_time) : 0,
      mttiSec: mttiResult.rows[0].mtti_sec ? parseFloat(mttiResult.rows[0].mtti_sec) : 0,
      mttrSec: mttrResult.rows[0].mttr_sec ? parseFloat(mttrResult.rows[0].mttr_sec) : 0
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cases: list and detail (dedup/aggregation view)
app.get('/cases', authMiddleware, async (req, res) => {
  try {
    const sql = `
      SELECT x.id, x.severity, x.status, x.owner, x.alert_count, x.latest
      FROM (
        SELECT c.id, c.severity, c.status, c.owner,
               COUNT(a.id) AS alert_count,
               MAX(a.created_at) AS latest,
               c.created_at AS c_created
        FROM cases c
        JOIN case_alerts ca ON ca.case_id = c.id
        JOIN alerts a ON a.id = ca.alert_id
        WHERE a.user_id = $1
        GROUP BY c.id, c.severity, c.status, c.owner, c.created_at
      ) x
      ORDER BY COALESCE(x.latest, x.c_created) DESC, x.id DESC`;
    const r = await pool.query(sql, [req.user.id]);
    res.json({ cases: r.rows });
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/cases/:id', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  try {
    const caseRow = await pool.query('SELECT id, severity, status, owner, context, created_at FROM cases WHERE id=$1', [caseId]);
    if (caseRow.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const alertsSql = `
      SELECT a.id, a.created_at, a.severity, a.status, a.summary, a.fingerprint, a.source, a.entities
      FROM case_alerts ca JOIN alerts a ON a.id = ca.alert_id
      WHERE ca.case_id = $1 AND a.user_id = $2
      ORDER BY a.created_at DESC`;
    const alerts = await pool.query(alertsSql, [caseId, req.user.id]);
    // Aggregate impacted entities for convenience
    const impacted = new Set();
    for (const row of alerts.rows) {
      try {
        const ents = Array.isArray(row.entities) ? row.entities : JSON.parse(row.entities || '[]');
        ents.slice(0, 20).forEach(e => impacted.add(`${e.type}:${e.value}`));
      } catch {}
    }
    res.json({ case: caseRow.rows[0], alerts: alerts.rows, impacted: Array.from(impacted).slice(0, 100) });
  } catch (error) {
    console.error('Error fetching case detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Detailed health for local testing (no secrets exposed)
app.get('/health/details', (req, res) => {
  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
  const dsKey = !!process.env.DEEPSEEK_API_KEY;
  const dsBase = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const dsModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const localBase = process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:1234/v1';
  const localModel = process.env.LOCAL_LLM_MODEL || 'zysec-ai_-_securityllm';
  const vtFlag = (process.env.USE_VIRUSTOTAL || '').toLowerCase();
  const vtEnabled = (vtFlag === '1' || vtFlag === 'true' || vtFlag === 'yes') && !!process.env.VIRUSTOTAL_API_KEY;
  let baseOrigin = dsBase;
  try { const u = new URL(dsBase); baseOrigin = `${u.protocol}//${u.host}` } catch {}

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: provider === 'local' ? {
      provider: 'local',
      configured: true,
      base: localBase,
      model: localModel,
    } : {
      provider: 'deepseek',
      configured: dsKey,
      base: baseOrigin,
      model: dsModel,
    },
    virustotal: {
      enabled: vtEnabled,
      configured: !!process.env.VIRUSTOTAL_API_KEY,
    }
  });
});

const port = process.env.PORT || 3000;

async function startServer() {
  try {
    await initDatabase();
    // Optional background summarizer cron
    try { require('./jobs/cron').startSummarizerCron(); } catch {}
    return app.listen(port, () => {
      console.log(`Backend listening on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export app for testing; only start server if run directly
module.exports = app;
if (require.main === module) {
  startServer();
}
