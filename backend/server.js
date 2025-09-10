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

// Rate limiting (configurable)
function toBool(v) { const s = String(v || '').toLowerCase(); return ['1','true','yes','on'].includes(s); }
const GLOBAL_RATE_LIMIT_WINDOW_MS = parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || '900000', 10);
// Disable global rate limit by default to avoid 429 during pilots; set GLOBAL_RATE_LIMIT_MAX env to re-enable
const GLOBAL_RATE_LIMIT_MAX = parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '0', 10);
const AUTH_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10);
// Disable auth rate limit by default; set AUTH_RATE_LIMIT_MAX env to re-enable
const AUTH_RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '0', 10);

if (!toBool(process.env.DISABLE_GLOBAL_RATE_LIMIT) && GLOBAL_RATE_LIMIT_MAX > 0) {
  const limiter = rateLimit({
    windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
    max: GLOBAL_RATE_LIMIT_MAX,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use(limiter);
}

if (!toBool(process.env.DISABLE_AUTH_RATE_LIMIT) && AUTH_RATE_LIMIT_MAX > 0) {
  const authLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    message: 'Too many authentication attempts, please try again later.'
  });
  app.use('/auth/', authLimiter);
}

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
    // Resolve tenant for this user (per-request scoping for team views)
    try {
      const override = req.headers['x-tenant-id'] || req.headers['x-tenant'];
      let desiredTenantId = override ? parseInt(String(override), 10) : null;
      let tenantRow;
      if (desiredTenantId && !Number.isNaN(desiredTenantId)) {
        const check = await pool.query('SELECT tenant_id, role FROM user_tenants WHERE user_id=$1 AND tenant_id=$2', [req.user.id, desiredTenantId]);
        if (check.rows.length) tenantRow = { id: check.rows[0].tenant_id, role: check.rows[0].role };
      }
      if (!tenantRow) {
        const map = await pool.query(
          "SELECT ut.tenant_id, ut.role FROM user_tenants ut JOIN tenants t ON t.id = ut.tenant_id WHERE ut.user_id=$1 ORDER BY CASE WHEN ut.role='admin' THEN 0 ELSE 1 END, t.id ASC",
          [req.user.id]
        );
        if (map.rows.length) tenantRow = { id: map.rows[0].tenant_id, role: map.rows[0].role };
      }
      if (!tenantRow) {
        const def = await pool.query("SELECT id FROM tenants WHERE slug='default' ORDER BY id ASC LIMIT 1");
        if (def.rows.length) tenantRow = { id: def.rows[0].id, role: 'member' };
      }
      req.tenantId = tenantRow?.id || null;
      req.tenantRole = tenantRow?.role || null;
    } catch (e) {
      console.warn('Tenant resolution error:', e.message);
      req.tenantId = null;
      req.tenantRole = null;
    }
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
    // Map user to default tenant
    try {
      const def = await pool.query("SELECT id FROM tenants WHERE slug='default' ORDER BY id ASC LIMIT 1");
      if (def.rows.length) {
        await pool.query('INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [user.id, def.rows[0].id, isAdmin ? 'admin' : 'member']);
      }
    } catch {}
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

app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ut.tenant_id as id, t.name, t.slug, ut.role
       FROM user_tenants ut JOIN tenants t ON t.id = ut.tenant_id
       WHERE ut.user_id = $1
       ORDER BY CASE WHEN ut.role='admin' THEN 0 ELSE 1 END, t.id ASC`,
      [req.user.id]
    );
    res.json({
      id: req.user.id,
      email: req.user.email,
      isAdmin: !!req.user.is_admin,
      currentTenantId: req.tenantId || null,
      currentTenantRole: req.tenantRole || null,
      tenants: r.rows || []
    });
  } catch (e) {
    res.json({ id: req.user.id, email: req.user.email, isAdmin: !!req.user.is_admin, currentTenantId: req.tenantId || null, currentTenantRole: req.tenantRole || null, tenants: [] });
  }
});

const { runPipeline } = require('./pipeline/runPipeline');
const { upsertCaseForFingerprint, linkAlertToCase } = require('./casing/case_linker');
const { findSimilarCaseCandidate } = require('./casing/case_linker');
const { generatePlan, generateRecommendations } = require('./planning/plan');
const { getOrInitCasePlan, createSession, addMemory, listCaseMemory, getCasePlan, updateCasePlan, listSessions, getSession } = require('./memory/store');
const { summarizeCaseMemory, summarizeAllCasesForUser } = require('./memory/summarizer');
const { getSetting, setSetting } = require('./config/settings');
const { evaluateAction, checkSegregationOfDuties, getPoliciesForUser, ensureDefaultPolicies } = require('./policy/engine');
const { toolExecutor, classifyError } = require('./utils/execution');
const { getTool } = require('./tools');
const { auditLog } = require('./middleware/audit');

function severityOrder(sev) {
  switch (String(sev || '').toLowerCase()) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

async function decideAutoTriage(unified, analysis, mitre = null) {
  const { getTriageConfig } = require('./config/triage');
  const cfg = await getTriageConfig();
  const sev = String((analysis?.severity || unified?.severity || 'low')).toLowerCase();
  const action = String(unified?.action || '').toLowerCase();
  const category = String(unified?.category || '').toLowerCase();
  const benignActions = new Set(cfg.benignActions || []);
  const benignCategories = new Set(cfg.benignCategories || []);
  const escalateSev = new Set(cfg.escalateSeverities || ['high','critical']);
  const mitreConf = (mitre && typeof mitre.confidence === 'number') ? mitre.confidence : null;

  // High-risk indicators (keep strict to avoid blocking benign auto-close)
  function hasHighRiskIndicators() {
    try {
      const entities = Array.isArray(unified?.entities) ? unified.entities : [];
      // File hashes strongly indicate potential malware
      const hash = entities.find(e => /sha\d*/i.test(String(e.type||'')) || /^[a-f0-9]{32,64}$/i.test(String(e.value||'')));
      if (hash) return true;
      // VirusTotal malicious count above threshold
      const vt = (analysis?.evidence || []).find((e) => e && (e.type === 'virustotal' || (e.data && typeof e.data === 'object')));
      const malicious = vt && ((vt.malicious ?? vt?.data?.attributes?.last_analysis_stats?.malicious) || 0);
      if (malicious >= (cfg.vtMaliciousMin || 1)) return true;
      // Do NOT treat multiple entity types in a single alert as high-risk by itself.
    } catch {}
    return false;
  }

  // 1) Escalate severe
  if (escalateSev.has(sev)) {
    return { disposition: 'true_positive', status: 'needs_review', priority: 'high', needEscalate: true, reason: `Auto escalate ${sev}` };
  }
  // 1b) Escalate on high MITRE confidence
  if (typeof mitreConf === 'number' && mitreConf >= (cfg.mitreConfidenceHigh ?? 0.6)) {
    return { disposition: 'true_positive', status: 'needs_review', priority: 'high', needEscalate: true, reason: `MITRE confidence ${mitreConf.toFixed(2)} ≥ ${(cfg.mitreConfidenceHigh ?? 0.6)}` };
  }
  // 2) Auto-resolve benign low without high-risk indicators
  const isLow = (cfg.lowSeverity || ['low']).includes(sev);
  if (isLow && (benignActions.has(action) || benignCategories.has(category)) && !hasHighRiskIndicators() && (mitreConf == null || mitreConf <= (cfg.mitreConfidenceLow ?? 0.3))) {
    return { disposition: 'false_positive', status: 'closed', priority: 'low', needEscalate: false, reason: 'Benign low-severity pattern' };
  }
  // 3) Default: human review
  const priority = sev === 'medium' ? 'medium' : 'low';
  return { disposition: 'uncertain', status: 'needs_review', priority, needEscalate: false, reason: 'Requires analyst review' };
}

// Helper to process and persist alert objects
async function processAlertsForUser(alertObjs, userId, tenantId) {
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
        const sim = await findSimilarCaseCandidate(unified.embedding?.vec, tenantId);
        if (sim?.caseId) caseId = sim.caseId;
      } catch {}
      if (!caseId) {
        caseId = await upsertCaseForFingerprint(tenantId, unified.fingerprint, unified.severity || 'low');
      }
      // Long-horizon: reuse or create case plan with memory context
      const { plan } = await getOrInitCasePlan(caseId, tenantId, userId, { generatePlanFn: generatePlan, unified, analysis });
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
           embedding, embedding_text,
           mitre, timeline, evidence, analysis_time, raw, user_id, tenant_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,
           $9,
           $10,$11,$12,$13,$14,$15,$16,
           $17,$18,$19,
           $20,$21,
           $22,$23,$24,$25,$26,$27,$28
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
          mitre ? JSON.stringify(mitre) : null,
          timelineJson,
          evidenceJson,
          analysis.analysisTime,
          rawJson,
          userId,
          tenantId
        ]
      );
      try { await linkAlertToCase(tenantId, caseId, result.rows[0].id); } catch {}
      // Auto-triage (plan decision takes precedence when present)
      try {
        let triage = await decideAutoTriage(unified, analysis, mitre);
        const dec = plan && plan.decision ? plan.decision : null;
        if (dec && typeof dec === 'object') {
          const dStatus = String(dec.status || '').toLowerCase();
          const dDisp = String(dec.disposition || '').toLowerCase();
          if (['resolved','needs_review','escalate'].includes(dStatus)) {
            if (dStatus === 'resolved') {
              triage = { disposition: ['true_positive','false_positive','uncertain'].includes(dDisp)?dDisp:'false_positive', status: 'resolved', priority: 'low', needEscalate: false, reason: dec.rationale || 'Plan decision' };
            } else if (dStatus === 'escalate') {
              triage = { disposition: ['true_positive','false_positive','uncertain'].includes(dDisp)?dDisp:'true_positive', status: 'needs_review', priority: 'high', needEscalate: true, reason: dec.rationale || 'Plan decision escalate' };
            } else {
              triage = { disposition: ['true_positive','false_positive','uncertain'].includes(dDisp)?dDisp:'uncertain', status: 'needs_review', priority: triage.priority || 'medium', needEscalate: false, reason: dec.rationale || 'Plan decision review' };
            }
          }
        }

        const setResolveTime = (triage.status === 'closed' || triage.status === 'resolved');
        await pool.query(
          setResolveTime
            ? 'UPDATE alerts SET status=$1, priority=$2, disposition=$3, escalated=$4, feedback=COALESCE(feedback,$5), resolve_time=COALESCE(resolve_time, NOW()) WHERE id=$6 AND tenant_id=$7'
            : 'UPDATE alerts SET status=$1, priority=$2, disposition=$3, escalated=$4, feedback=COALESCE(feedback,$5) WHERE id=$6 AND tenant_id=$7',
          [triage.status, triage.priority, triage.disposition, triage.needEscalate, triage.reason, result.rows[0].id, tenantId]
        );
        // Auto-suppress fingerprint for false positives (time-boxed)
        if (triage.disposition === 'false_positive' && unified?.fingerprint) {
          const exists = await pool.query(
            "SELECT 1 FROM suppression_rules WHERE tenant_id=$1 AND scope='alert' AND condition->>'fingerprint' = $2",
            [tenantId, unified.fingerprint]
          );
          if (exists.rows.length === 0) {
            const cond = { fingerprint: unified.fingerprint };
            const exp = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days
            try { await pool.query(
              `INSERT INTO suppression_rules (tenant_id, scope, condition, expires_at)
               VALUES ($1,'alert',$2,$3)`,
              [tenantId, JSON.stringify(cond), exp]
            ); } catch {}
          }
        }
        // Create approval request for severe cases (example: disable account or isolate endpoint)
        if (triage.needEscalate) {
          const rec = Array.isArray(recommendations) && recommendations.length ? recommendations[0] : null;
          const suggestedAction = rec?.action || (unified?.principal ? 'disable-account' : (unified?.asset ? 'isolate-endpoint' : 'containment')); 
          try {
            await pool.query(
              `INSERT INTO approval_requests (user_id, alert_id, action, parameters, status, reason, trace_id, tenant_id)
               VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)`,
              [userId, result.rows[0].id, suggestedAction, JSON.stringify({ context: { severity: sevFrom(analysis, unified), principal: unified?.principal, asset: unified?.asset } }), 'Auto escalation', Math.random().toString(36).slice(2), tenantId]
            );
          } catch {}
        }
      } catch {}
      processed.push(result.rows[0]);
    } catch (error) {
      console.error('Error processing alert:', error);
    }
  }
  return processed;
}

function sevFrom(analysis, unified) {
  return String(analysis?.severity || unified?.severity || 'low').toLowerCase();
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

  const processed = await processAlertsForUser(data, req.user.id, req.tenantId);
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
  const processed = await processAlertsForUser(data, req.user.id, req.tenantId);
  res.json({ alerts: processed });
});

app.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, created_at as "createdAt", source, status, severity, assigned_to as "assignedTo", escalated, disposition FROM alerts WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Team triage queue with filters and ordering by severity and recency
app.get('/alerts/queue', authMiddleware, async (req, res) => {
  const { status, severity, assigned, limit = 100, offset = 0, disposition, escalated, handled, active } = req.query;
  const where = ['tenant_id = $1'];
  const params = [req.tenantId];
  let p = 2;
  if (status) { where.push(`status = $${p++}`); params.push(String(status)); }
  if (severity) { where.push(`severity = $${p++}`); params.push(String(severity)); }
  if (assigned === 'unassigned') { where.push('assigned_to IS NULL'); }
  else if (assigned === 'me') { where.push(`assigned_to = $${p++}`); params.push(req.user.id); }
  if (disposition) { where.push(`disposition = $${p++}`); params.push(String(disposition)); }
  if (String(escalated || '').toLowerCase() === '1' || String(escalated || '').toLowerCase() === 'true') { where.push('escalated = TRUE'); }
  if (String(handled || '').toLowerCase() === '1' || String(handled || '').toLowerCase() === 'true') { where.push(`status IN ('resolved','closed')`); }
  if (String(active || '').toLowerCase() === '1' || String(active || '').toLowerCase() === 'true') { where.push(`COALESCE(status,'') NOT IN ('resolved','closed')`); }
  const sql = `
    SELECT id, created_at as "createdAt", source, status, severity, summary, assigned_to as "assignedTo"
    FROM alerts
    WHERE ${where.join(' AND ')}
    ORDER BY CASE LOWER(severity) WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
             created_at DESC
    LIMIT $${p++} OFFSET $${p++}`;
  params.push(Math.max(1, parseInt(String(limit), 10)));
  params.push(Math.max(0, parseInt(String(offset), 10)));
  try {
    const r = await pool.query(sql, params);
    res.json({ alerts: r.rows });
  } catch (e) {
    console.error('Error fetching triage queue:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign alert to a user within the same tenant
app.post('/alerts/:id/assign', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  try {
    const check = await pool.query('SELECT 1 FROM user_tenants WHERE user_id=$1 AND tenant_id=$2', [userId, req.tenantId]);
    if (check.rows.length === 0) return res.status(400).json({ error: 'User not in this tenant' });
    const upd = await pool.query('UPDATE alerts SET assigned_to=$1 WHERE id=$2 AND tenant_id=$3 RETURNING id, assigned_to as "assignedTo"', [userId, id, req.tenantId]);
    if (upd.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    await auditLog('alert_assign', req.user.id, { alertId: id, assignedTo: userId, ipAddress: req.ip }, req.tenantId);
    res.json({ success: true, alert: upd.rows[0] });
  } catch (e) {
    console.error('Error assigning alert:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk acknowledge alerts in tenant
app.post('/alerts/bulk/ack', authMiddleware, async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Missing ids' });
  try {
    const r = await pool.query(
      `UPDATE alerts SET ack_time=COALESCE(ack_time, NOW()), status='acknowledged' 
       WHERE tenant_id=$1 AND id = ANY($2::int[]) RETURNING id`,
      [req.tenantId, ids.map((x) => parseInt(x, 10)).filter(Number.isFinite)]
    );
    await auditLog('alerts_bulk_ack', req.user.id, { count: r.rows.length, ipAddress: req.ip }, req.tenantId);
    res.json({ success: true, count: r.rows.length });
  } catch (e) {
    console.error('Error bulk ack:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update alert status; auto-stamp key lifecycle times
app.post('/alerts/:id/status', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'Missing status' });
  const s = String(status).toLowerCase();
  const allowed = new Set(['new','needs_review','acknowledged','investigating','resolved','closed']);
  if (!allowed.has(s)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const row = await pool.query('SELECT ack_time, investigate_start, resolve_time FROM alerts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    if (row.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    let { ack_time: ack, investigate_start: inv, resolve_time: reso } = row.rows[0];
    if (s === 'acknowledged' && !ack) ack = new Date();
    if (s === 'investigating' && !inv) inv = new Date();
    if (s === 'resolved' && !reso) reso = new Date();
    const upd = await pool.query(
      'UPDATE alerts SET status=$1, ack_time=$2, investigate_start=$3, resolve_time=$4 WHERE id=$5 AND tenant_id=$6 RETURNING id, status, ack_time as "ackTime", investigate_start as "investigateStart", resolve_time as "resolveTime"',
      [s, ack, inv, reso, id, req.tenantId]
    );
    await auditLog('alert_status_update', req.user.id, { alertId: id, status: s, ipAddress: req.ip }, req.tenantId);
    res.json({ success: true, alert: upd.rows[0] });
  } catch (e) {
    console.error('Error updating status:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/alerts/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await pool.query(
      'SELECT * FROM alerts WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
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
        await pool.query('UPDATE alerts SET recommendations=$1, mitre=$2, tactic=$3, technique=$4 WHERE id=$5 AND tenant_id=$6', [JSON.stringify(recs||[]), mitre ? JSON.stringify(mitre) : row.mitre || null, tactic, technique, id, req.tenantId]);
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

// Bulk re-triage open alerts using current rules (admin only)
app.post('/alerts/auto-triage', authMiddleware, requireAdmin, async (req, res) => {
  const limit = Math.min(1000, parseInt(String(req.body?.limit || '200'), 10) || 200);
  const mode = String(req.body?.mode || 'triage').toLowerCase(); // triage | close_low_benign
  try {
    const r = await pool.query(
      "SELECT id, raw, severity, category, action, entities, mitre FROM alerts WHERE tenant_id=$1 AND COALESCE(status,'') NOT IN ('resolved','closed') ORDER BY id DESC LIMIT $2",
      [req.tenantId, limit]
    );
    let updated = 0;
    let closed = 0;
    for (const row of r.rows) {
      try {
        const raw = typeof row.raw === 'object' ? row.raw : (row.raw ? JSON.parse(row.raw) : {});
        const { toUnifiedAlert } = require('./normalizers');
        const unified = toUnifiedAlert(raw || {});
        const analysis = { severity: row.severity || unified.severity || 'low', evidence: [] };
        const mitreObj = typeof row.mitre === 'object' ? row.mitre : (row.mitre ? JSON.parse(row.mitre) : null);
        let triage;
        if (mode === 'close_low_benign') {
          const { getTriageConfig } = require('./config/triage');
          const cfg = await getTriageConfig();
          const sev = String(analysis.severity || unified.severity || 'low').toLowerCase();
          const action = String(unified?.action || '').toLowerCase();
          const category = String(unified?.category || '').toLowerCase();
          const isLow = (cfg.lowSeverity || ['low']).includes(sev);
          const benignActions = new Set(cfg.benignActions || []);
          const benignCategories = new Set(cfg.benignCategories || []);
          if (isLow && (benignActions.has(action) || benignCategories.has(category))) {
            triage = { disposition: 'false_positive', status: 'resolved', priority: 'low', needEscalate: false, reason: 'Force-close low benign (bulk)' };
          } else {
            triage = await decideAutoTriage(unified, analysis, mitreObj);
          }
        } else {
          triage = await decideAutoTriage(unified, analysis, mitreObj);
        }
        const setResolveTime = (triage.status === 'closed' || triage.status === 'resolved');
        await pool.query(
          setResolveTime
            ? 'UPDATE alerts SET status=$1, priority=$2, disposition=$3, escalated=$4, feedback=COALESCE(feedback,$5), resolve_time=COALESCE(resolve_time, NOW()) WHERE id=$6 AND tenant_id=$7'
            : 'UPDATE alerts SET status=$1, priority=$2, disposition=$3, escalated=$4, feedback=COALESCE(feedback,$5) WHERE id=$6 AND tenant_id=$7',
          [triage.status, triage.priority, triage.disposition, triage.needEscalate, triage.reason, row.id, req.tenantId]
        );
        updated++;
        if (setResolveTime) closed++;
      } catch {}
    }
    res.json({ success: true, updated, closed, mode });
  } catch (e) {
    console.error('Auto-triage bulk error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Re-run AI analysis on an alert with current provider settings
app.post('/alerts/:id/reanalyze', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const r = await pool.query('SELECT raw FROM alerts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const { toUnifiedAlert } = require('./normalizers');
    const { generateRecommendations } = require('./planning/plan');
    const raw = r.rows[0].raw;
    const unified = toUnifiedAlert(typeof raw === 'object' ? raw : JSON.parse(raw || '{}'));
    const analysis = await analyzeAlert(unified);
    // Best-effort MITRE map; non-blocking
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
    await pool.query(
      'UPDATE alerts SET summary=$1, severity=$2, timeline=$3, evidence=$4, analysis_time=$5, recommendations=$6, mitre=$7, tactic=$8, technique=$9 WHERE id=$10 AND tenant_id=$11',
      [
        analysis.summary,
        analysis.severity || unified.severity || 'low',
        JSON.stringify(analysis.timeline || []),
        JSON.stringify(analysis.evidence || []),
        analysis.analysisTime || null,
        JSON.stringify(recommendations || []),
        mitre ? JSON.stringify(mitre) : null,
        tactic || null,
        techniqueStr || null,
        id,
        req.tenantId,
      ]
    );
    const updated = await pool.query('SELECT * FROM alerts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    res.json({ success: true, alert: updated.rows[0] });
  } catch (error) {
    console.error('Error reanalyzing alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Investigation details endpoint per MVP API
app.get('/alerts/:id/investigation', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await pool.query(
      'SELECT summary, timeline, evidence FROM alerts WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
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
    const r = await pool.query('SELECT plan, recommendations, ack_time, investigate_start, resolve_time, raw, summary, timeline, evidence, case_id FROM alerts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = r.rows[0];
    row.plan = parseJsonMaybe(row.plan, {});
    row.mitre = parseJsonMaybe(row.mitre, {});
    row.recommendations = parseJsonMaybe(row.recommendations, []);
    // Prefer case plan if available
    if (row.case_id) {
      try {
        const cp = await getCasePlan(row.case_id, req.tenantId);
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
          const res = await getOrInitCasePlan(row.case_id, req.tenantId, req.user.id, { generatePlanFn: generatePlan, unified, analysis });
          plan = res.plan;
        } else {
          plan = await generatePlan(unified, analysis);
        }
        await pool.query('UPDATE alerts SET plan=$1 WHERE id=$2 AND tenant_id=$3', [JSON.stringify(plan), id, req.tenantId]);
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
    const r = await pool.query('SELECT plan, ack_time, investigate_start, resolve_time, case_id FROM alerts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
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
      'UPDATE alerts SET plan=$1, ack_time=$2, investigate_start=$3, resolve_time=$4 WHERE id=$5 AND tenant_id=$6 RETURNING plan, ack_time, investigate_start, resolve_time',
      [JSON.stringify(plan || {}), ack, inv, reso, id, req.tenantId]
    );
    // Keep case plan in sync if present
    const caseId = r.rows[0].case_id;
    if (caseId) {
      try { await updateCasePlan(caseId, req.tenantId, plan); } catch {}
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

// Apply automated decision to the alert (from plan.decision if present; else triage rules)
app.post('/alerts/:id/auto-decide', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const r = await pool.query('SELECT raw, plan, summary, severity, category, action, entities, principal, asset, mitre FROM alerts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = r.rows[0];
    const raw = typeof row.raw === 'object' ? row.raw : (row.raw ? JSON.parse(row.raw) : {});
    const plan = typeof row.plan === 'object' ? row.plan : (row.plan ? JSON.parse(row.plan) : {});
    const { toUnifiedAlert } = require('./normalizers');
    const { generateRecommendations } = require('./planning/plan');
    const unified = toUnifiedAlert(raw || {});
    const mitre = typeof row.mitre === 'object' ? row.mitre : (row.mitre ? JSON.parse(row.mitre) : null);
    let triage = await decideAutoTriage(unified, { severity: row.severity || unified.severity }, mitre);
    const dec = plan && plan.decision ? plan.decision : null;
    if (dec && typeof dec === 'object') {
      const dStatus = String(dec.status || '').toLowerCase();
      const dDisp = String(dec.disposition || '').toLowerCase();
      if (['resolved','needs_review','escalate'].includes(dStatus)) {
        if (dStatus === 'resolved') {
          triage = { disposition: ['true_positive','false_positive','uncertain'].includes(dDisp)?dDisp:'false_positive', status: 'resolved', priority: 'low', needEscalate: false, reason: dec.rationale || 'Plan decision' };
        } else if (dStatus === 'escalate') {
          triage = { disposition: ['true_positive','false_positive','uncertain'].includes(dDisp)?dDisp:'true_positive', status: 'needs_review', priority: 'high', needEscalate: true, reason: dec.rationale || 'Plan decision escalate' };
        } else {
          triage = { disposition: ['true_positive','false_positive','uncertain'].includes(dDisp)?dDisp:'uncertain', status: 'needs_review', priority: triage.priority || 'medium', needEscalate: false, reason: dec.rationale || 'Plan decision review' };
        }
      }
    }
    const setResolveTime = (triage.status === 'closed' || triage.status === 'resolved');
    await pool.query(
      setResolveTime
        ? 'UPDATE alerts SET status=$1, priority=$2, disposition=$3, escalated=$4, feedback=COALESCE(feedback,$5), resolve_time=COALESCE(resolve_time, NOW()) WHERE id=$6 AND tenant_id=$7'
        : 'UPDATE alerts SET status=$1, priority=$2, disposition=$3, escalated=$4, feedback=COALESCE(feedback,$5) WHERE id=$6 AND tenant_id=$7',
      [triage.status, triage.priority, triage.disposition, triage.needEscalate, triage.reason, id, req.tenantId]
    );
    if (triage.needEscalate) {
      const recs = generateRecommendations(unified) || [];
      const rec = Array.isArray(recs) && recs.length ? recs[0] : null;
      const suggestedAction = rec?.action || (unified?.principal ? 'disable-account' : (unified?.asset ? 'isolate-endpoint' : 'containment'));
      try {
        await pool.query(
          `INSERT INTO approval_requests (user_id, alert_id, action, parameters, status, reason, trace_id, tenant_id)
           VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)`,
          [req.user.id, id, suggestedAction, JSON.stringify({ context: { severity: sevFrom({ severity: row.severity }, unified), principal: unified?.principal, asset: unified?.asset } }), 'Auto escalation', Math.random().toString(36).slice(2), req.tenantId]
        );
      } catch {}
    }
    const updated = await pool.query('SELECT * FROM alerts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    res.json({ success: true, alert: updated.rows[0], triage });
  } catch (e) {
    console.error('Auto-decision error:', e);
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
    const mem = await listCaseMemory(caseId, req.tenantId, { limit: 200 });
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
    const row = await addMemory({ tenantId: req.tenantId, userId: req.user.id, caseId, sessionId, type, key, value, tags, importance });
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
    const rows = await listSessions(caseId, req.tenantId);
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
    const row = await createSession({ tenantId: req.tenantId, userId: req.user.id, caseId, alertId, title, context });
    res.json({ success: true, session: row });
  } catch (e) {
    console.error('Error creating session:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/sessions/:sessionId', authMiddleware, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const row = await getSession(sessionId, req.tenantId);
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
    const row = await getCasePlan(caseId, req.tenantId);
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
    const row = await updateCasePlan(caseId, req.tenantId, plan);
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
    const result = await summarizeCaseMemory(caseId, req.tenantId);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('Error summarizing case:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/jobs/summarize-cases', authMiddleware, async (req, res) => {
  try {
    const results = await summarizeAllCasesForUser(req.tenantId);
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
    // Normalize legacy string values to an object shape for the UI
    const obj = (typeof v === 'string') ? { provider: v } : v;
    res.json(obj);
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
    await auditLog('admin_llm_provider_update', req.user.id, { provider: p, ipAddress: req.ip }, req.tenantId);
    res.json({ success: true, provider: p });
  } catch (e) {
    console.error('Error updating LLM setting:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: validate LLM connectivity using provided inputs (does not persist)
app.post('/admin/settings/llm/validate', authMiddleware, requireAdmin, async (req, res) => {
  const { provider, baseUrl, model, apiKey } = req.body || {};
  const p = String(provider || '').toLowerCase();
  if (!['deepseek', 'local'].includes(p)) return res.status(400).json({ error: 'Invalid provider' });
  const axios = require('axios');
  const base = String(baseUrl || (p === 'deepseek' ? (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1') : (process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:1234/v1'))).replace(/\/$/, '');
  const mdl = String(model || (p === 'deepseek' ? (process.env.DEEPSEEK_MODEL || 'deepseek-chat') : (process.env.LOCAL_LLM_MODEL || 'zysec-ai_-_securityllm')));
  const key = p === 'deepseek' ? (apiKey || process.env.DEEPSEEK_API_KEY || '') : '';
  if (p === 'deepseek' && !key) return res.status(400).json({ error: 'DeepSeek API key is required for validation' });
  try {
    const headers = key ? { Authorization: `Bearer ${key}` } : {};
    const payload = { model: mdl, messages: [{ role: 'user', content: 'ping' }], temperature: 0, max_tokens: 5 };
    const r = await axios.post(`${base}/chat/completions`, payload, { headers, timeout: 7000 });
    const content = r?.data?.choices?.[0]?.message?.content || '';
    res.json({ ok: true, provider: p, base, model: mdl, sample: String(content).slice(0, 60) });
  } catch (e) {
    const info = classifyError(e);
    const msg = e && e.response && e.response.data && (e.response.data.error || e.response.data.message) ? (e.response.data.error || e.response.data.message) : (e.message || 'Validation failed');
    res.status(400).json({ ok: false, provider: p, base, model: mdl, errorClass: info.class, error: msg });
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
    await auditLog('admin_register_toggle', req.user.id, { allowSelfRegister: val, ipAddress: req.ip }, req.tenantId);
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
          'INSERT INTO audit_logs (action, user_id, details, ip_address, tenant_id) VALUES ($1, $2, $3, $4, $5)',
          ['integrations_update', req.user.id, { provider, enabled }, req.ip, req.tenantId]
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
      await auditLog('action_denied', req.user.id, { alertId, action, resource, reason: decision.reason, policyId: decision.policyId, ipAddress: req.ip }, req.tenantId);
      return res.status(403).json({ error: 'Denied by policy', reason: decision.reason, policyId: decision.policyId });
    }
    if (decision.decision === 'allow') {
      // Execute immediately
      const tool = getTool(action);
      if (!tool) return res.status(400).json({ error: 'Unsupported action' });
      const result = await toolExecutor(action, () => tool(params), { tenantId: req.tenantId });
      await auditLog('action_execute', req.user.id, { alertId, action, resource, result, ipAddress: req.ip }, req.tenantId);
      return res.json({ success: true, executed: true, result, traceId });
    }
    // require_approval path: create approval request
    const r = await pool.query(
      `INSERT INTO approval_requests (user_id, alert_id, action, parameters, status, reason, trace_id, tenant_id)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7) RETURNING id, status`,
      [req.user.id, alertId, action, JSON.stringify(params || {}), reason || null, traceId, req.tenantId]
    );
    await auditLog('action_request', req.user.id, { alertId, action, resource, reason, policyId: decision.policyId, ipAddress: req.ip }, req.tenantId);
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
      await auditLog('action_denied', req.user.id, { alertId, action, resource, reason: decision.reason, policyId: decision.policyId, ipAddress: req.ip }, req.tenantId);
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
    const result = await toolExecutor(action, () => tool(params), { approvalRequestId, tenantId: req.tenantId });
    await auditLog('action_execute', req.user.id, { alertId, action, resource, approvalRequestId, result, ipAddress: req.ip }, req.tenantId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approvals list for current user (their requests) and inbox (all pending - simple MVP)
app.get('/approvals', authMiddleware, async (req, res) => {
  try {
    const mine = await pool.query('SELECT * FROM approval_requests WHERE tenant_id=$1 AND user_id=$2 ORDER BY requested_at DESC', [req.tenantId, req.user.id]);
    const pending = await pool.query('SELECT * FROM approval_requests WHERE tenant_id=$1 AND status = \'pending\' ORDER BY requested_at DESC', [req.tenantId]);
    res.json({ mine: mine.rows, inbox: pending.rows });
  } catch (e) {
    console.error('Error fetching approvals:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/approvals/:approvalId', authMiddleware, async (req, res) => {
  const approvalId = parseInt(req.params.approvalId, 10);
  try {
    const r = await pool.query('SELECT * FROM approval_requests WHERE id=$1 AND tenant_id=$2', [approvalId, req.tenantId]);
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
    const r = await pool.query('SELECT * FROM approval_requests WHERE id=$1 AND tenant_id=$2', [approvalId, req.tenantId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const reqRow = r.rows[0];
    if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Request not pending' });
    const sod = checkSegregationOfDuties(reqRow.user_id, req.user.id);
    if (!sod.ok) return res.status(403).json({ error: sod.reason });
    const upd = await pool.query('UPDATE approval_requests SET status=\'approved\', approver_id=$1, decided_at=NOW() WHERE id=$2 RETURNING *', [req.user.id, approvalId]);
    await auditLog('action_approve', req.user.id, { approvalRequestId: approvalId, ipAddress: req.ip }, req.tenantId);
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
    const r = await pool.query('SELECT * FROM approval_requests WHERE id=$1 AND tenant_id=$2', [approvalId, req.tenantId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (r.rows[0].status !== 'pending') return res.status(400).json({ error: 'Request not pending' });
    const upd = await pool.query('UPDATE approval_requests SET status=\'denied\', approver_id=$1, decided_at=NOW(), reason=$2 WHERE id=$3 RETURNING *', [req.user.id, reason || null, approvalId]);
    await auditLog('action_deny', req.user.id, { approvalRequestId: approvalId, ipAddress: req.ip, reason }, req.tenantId);
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
    await auditLog('policy_create', req.user.id, { policyId: r.rows[0].id, ipAddress: req.ip }, req.tenantId);
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
    await auditLog('policy_update', req.user.id, { policyId: id, ipAddress: req.ip }, req.tenantId);
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
    await auditLog('policy_delete', req.user.id, { policyId: id, ipAddress: req.ip }, req.tenantId);
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
    await auditLog('policy_reset_defaults', req.user.id, { ipAddress: req.ip }, req.tenantId);
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
      'UPDATE alerts SET feedback = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id',
      [feedback, id, req.tenantId]
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
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM alerts WHERE tenant_id = $1', [req.tenantId]);
    const severityResult = await pool.query('SELECT severity, COUNT(*) as count FROM alerts WHERE tenant_id = $1 GROUP BY severity', [req.tenantId]);
    const statusResult = await pool.query('SELECT status, COUNT(*) as count FROM alerts WHERE tenant_id = $1 GROUP BY status', [req.tenantId]);
    const timeResult = await pool.query('SELECT AVG(analysis_time) as avg_time FROM alerts WHERE tenant_id = $1 AND analysis_time IS NOT NULL', [req.tenantId]);
    const feedbackResult = await pool.query(
      `SELECT 
         SUM(CASE WHEN feedback = 'accurate' THEN 1 ELSE 0 END) as accurate,
         SUM(CASE WHEN feedback IS NOT NULL THEN 1 ELSE 0 END) as total_feedback
       FROM alerts WHERE tenant_id = $1`,
      [req.tenantId]
    );

    // MTTI: avg(investigate_start - created_at); MTTR: avg(resolve_time - created_at)
    const mttiResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (investigate_start - created_at))) as mtti_sec
       FROM alerts WHERE tenant_id = $1 AND investigate_start IS NOT NULL`,
      [req.tenantId]
    );
    const mttrResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolve_time - created_at))) as mttr_sec
       FROM alerts WHERE tenant_id = $1 AND resolve_time IS NOT NULL`,
      [req.tenantId]
    );
    // Resolved alerts count based on resolve_time
    const resolvedResult = await pool.query('SELECT COUNT(*) as resolved FROM alerts WHERE tenant_id = $1 AND resolve_time IS NOT NULL', [req.tenantId]);
    // Investigated alerts count based on investigate_start
    const investigatedResult = await pool.query('SELECT COUNT(*) as investigated FROM alerts WHERE tenant_id = $1 AND investigate_start IS NOT NULL', [req.tenantId]);
    // Acknowledged alerts count based on ack_time
    const acknowledgedResult = await pool.query('SELECT COUNT(*) as acknowledged FROM alerts WHERE tenant_id = $1 AND ack_time IS NOT NULL', [req.tenantId]);
    
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

    // New: disposition and escalation metrics
    const dispositionCounts = {};
    try {
      const disp = await pool.query('SELECT disposition, COUNT(*)::int AS count FROM alerts WHERE tenant_id=$1 GROUP BY disposition', [req.tenantId]);
      disp.rows.forEach(r => { dispositionCounts[r.disposition || 'unknown'] = r.count; });
    } catch {}
    const handledCount = resolvedCount; // treat resolved as handled (closed also included below)
    const closedResult = await pool.query("SELECT COUNT(*)::int AS c FROM alerts WHERE tenant_id=$1 AND status='closed'", [req.tenantId]);
    const handledTotal = handledCount + (closedResult.rows[0]?.c || 0);
    const escalatedResult = await pool.query('SELECT COUNT(*)::int AS c FROM alerts WHERE tenant_id=$1 AND escalated=TRUE', [req.tenantId]);
    const escalatedCount = escalatedResult.rows[0]?.c || 0;
    const uncertainCount = (dispositionCounts['uncertain'] || 0);

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
      mttrSec: mttrResult.rows[0].mttr_sec ? parseFloat(mttrResult.rows[0].mttr_sec) : 0,
      dispositionCounts,
      handledCount: handledTotal,
      escalatedCount,
      uncertainCount
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Lightweight counts for sidebar badges
app.get('/nav/counts', authMiddleware, async (req, res) => {
  try {
    const approvals = await pool.query('SELECT COUNT(*)::int AS c FROM approval_requests WHERE tenant_id=$1 AND status=\'pending\'', [req.tenantId]);
    const cases = await pool.query("SELECT COUNT(*)::int AS c FROM cases WHERE tenant_id=$1 AND COALESCE(status,'open')='open'", [req.tenantId]);
    const triageTotal = await pool.query("SELECT COUNT(*)::int AS c FROM alerts WHERE tenant_id=$1 AND COALESCE(status,'') NOT IN ('resolved','closed')", [req.tenantId]);
    const triageUnassigned = await pool.query("SELECT COUNT(*)::int AS c FROM alerts WHERE tenant_id=$1 AND COALESCE(status,'') NOT IN ('resolved','closed') AND assigned_to IS NULL", [req.tenantId]);
    const triageMine = await pool.query("SELECT COUNT(*)::int AS c FROM alerts WHERE tenant_id=$1 AND COALESCE(status,'') NOT IN ('resolved','closed') AND assigned_to=$2", [req.tenantId, req.user.id]);
    res.json({
      approvalsPending: approvals.rows[0]?.c || 0,
      casesOpen: cases.rows[0]?.c || 0,
      triageTotal: triageTotal.rows[0]?.c || 0,
      triageUnassigned: triageUnassigned.rows[0]?.c || 0,
      triageAssignedToMe: triageMine.rows[0]?.c || 0,
    });
  } catch (e) {
    console.error('Error fetching nav counts:', e);
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
        WHERE a.tenant_id = $1 AND c.tenant_id = $1 AND ca.tenant_id = $1
        GROUP BY c.id, c.severity, c.status, c.owner, c.created_at
      ) x
      ORDER BY COALESCE(x.latest, x.c_created) DESC, x.id DESC`;
    const r = await pool.query(sql, [req.tenantId]);
    res.json({ cases: r.rows });
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/cases/:id', authMiddleware, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  try {
    const caseRow = await pool.query('SELECT id, severity, status, owner, context, created_at FROM cases WHERE id=$1 AND tenant_id=$2', [caseId, req.tenantId]);
    if (caseRow.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const alertsSql = `
      SELECT a.id, a.created_at, a.severity, a.status, a.summary, a.fingerprint, a.source, a.entities
      FROM case_alerts ca JOIN alerts a ON a.id = ca.alert_id
      WHERE ca.case_id = $1 AND a.tenant_id = $2 AND ca.tenant_id = $2
      ORDER BY a.created_at DESC`;
    const alerts = await pool.query(alertsSql, [caseId, req.tenantId]);
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
app.get('/health/details', async (req, res) => {
  try {
    const { getLLMConfig } = require('./config/llm');
    const cfg = await getLLMConfig();
    const vtFlag = (process.env.USE_VIRUSTOTAL || '').toLowerCase();
    const vtEnabled = (vtFlag === '1' || vtFlag === 'true' || vtFlag === 'yes') && !!process.env.VIRUSTOTAL_API_KEY;
    let baseOrigin = cfg.baseUrl;
    try { const u = new URL(cfg.baseUrl); baseOrigin = `${u.protocol}//${u.host}` } catch {}

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ai: {
        provider: cfg.provider,
        configured: cfg.provider === 'deepseek' ? !!cfg.apiKey : true,
        base: baseOrigin,
        model: cfg.model,
      },
      virustotal: {
        enabled: vtEnabled,
        configured: !!process.env.VIRUSTOTAL_API_KEY,
      }
    });
  } catch (e) {
    console.error('Health details error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
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
