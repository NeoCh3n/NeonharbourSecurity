const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { analyzeAlert, hunterQuery } = require('./ai');
const { pool, initDatabase } = require('./database');

const app = express();

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

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3001', 'http://localhost:3000'],
  credentials: true
}));

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

// Helper to process and persist alert objects
async function processAlertsForUser(alertObjs, userId) {
  const processed = [];
  for (const alert of alertObjs) {
    try {
      const analysis = await analyzeAlert(alert);
      const result = await pool.query(
        `INSERT INTO alerts (source, status, summary, severity, timeline, evidence, analysis_time, raw, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at, source, status, summary, severity`,
        [
          alert.source || 'ingest',
          'needs_review',
          analysis.summary,
          analysis.severity,
          analysis.timeline,
          analysis.evidence,
          analysis.analysisTime,
          alert,
          userId
        ]
      );
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
    res.json(result.rows[0]);
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
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching investigation:', error);
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
      avgAnalysisTime: timeResult.rows[0].avg_time ? parseFloat(timeResult.rows[0].avg_time) : 0
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
