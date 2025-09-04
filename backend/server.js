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
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [payload.id]);
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
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) return res.status(400).json({ error: 'Email exists' });
    
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashed]
    );
    const user = result.rows[0];
    const token = generateToken(user);
    res.json({ token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const result = await pool.query('SELECT id, email, password FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });
    
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });
    
    const token = generateToken(user);
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

const { runPipeline } = require('./pipeline/runPipeline');
const { upsertCaseForFingerprint, linkAlertToCase } = require('./casing/case_linker');
const { findSimilarCaseCandidate } = require('./casing/case_linker');
const { generatePlan, generateRecommendations } = require('./planning/plan');

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
      const plan = await generatePlan(unified, analysis);
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
    const r = await pool.query('SELECT plan, recommendations, ack_time, investigate_start, resolve_time, raw, summary, timeline, evidence FROM alerts WHERE id=$1 AND user_id=$2', [id, req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = r.rows[0];
    row.plan = parseJsonMaybe(row.plan, {});
    row.mitre = parseJsonMaybe(row.mitre, {});
    row.recommendations = parseJsonMaybe(row.recommendations, []);
    const needRegen = !row.plan || !Array.isArray(row.plan.questions) || row.plan.questions.length < 3;
    if (needRegen) {
      try {
        const { toUnifiedAlert } = require('./normalizers');
        const { generatePlan } = require('./planning/plan');
        const unified = toUnifiedAlert(parseJsonMaybe(row.raw, {}));
        const analysis = { summary: row.summary, timeline: parseJsonMaybe(row.timeline, []), evidence: parseJsonMaybe(row.evidence, []) };
        const plan = await generatePlan(unified, analysis);
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
    const r = await pool.query('SELECT plan, ack_time, investigate_start, resolve_time FROM alerts WHERE id=$1 AND user_id=$2', [id, req.user.id]);
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
  const id = parseInt(req.params.id, 10);
  const { action, reason } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing action' });
  try {
    const traceId = Math.random().toString(36).slice(2);
    await pool.query(
      'INSERT INTO audit_logs (action, user_id, details, ip_address) VALUES ($1, $2, $3, $4)',
      ['action_request', req.user.id, { alertId: id, action, reason, traceId }, req.ip]
    );
    res.json({ success: true, traceId });
  } catch (error) {
    console.error('Error creating action request:', error);
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
    
    res.json({
      totalAlerts: parseInt(totalResult.rows[0].total),
      severityCounts,
      statusCounts,
      investigatedCount: parseInt(totalResult.rows[0].total),
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
  const dsKey = !!process.env.DEEPSEEK_API_KEY;
  const dsBase = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const dsModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const vtFlag = (process.env.USE_VIRUSTOTAL || '').toLowerCase();
  const vtEnabled = (vtFlag === '1' || vtFlag === 'true' || vtFlag === 'yes') && !!process.env.VIRUSTOTAL_API_KEY;
  let baseOrigin = dsBase;
  try { const u = new URL(dsBase); baseOrigin = `${u.protocol}//${u.host}` } catch {}

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: {
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
