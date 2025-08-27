const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const path = require('path');
const { analyzeAlert, hunterQuery } = require('./ai');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer();

// In-memory storage
const users = [];
const alerts = [];
let nextUserId = 1;
let nextAlertId = 1;

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = users.find((u) => u.id === payload.id);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Auth routes
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  if (users.find((u) => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  const hashed = await bcrypt.hash(password, 10);
  const user = { id: nextUserId++, email, password: hashed };
  users.push(user);
  const token = generateToken(user);
  res.json({ token });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: 'Invalid credentials' });
  const token = generateToken(user);
  res.json({ token });
});

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// Alerts upload
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

  const processed = [];
  for (const alert of data) {
    const analysis = await analyzeAlert(alert);
    const newAlert = {
      id: nextAlertId++,
      createdAt: new Date().toISOString(),
      source: alert.source || 'upload',
      status: 'new',
      summary: analysis.summary,
      severity: analysis.severity,
      timeline: analysis.timeline,
      evidence: analysis.evidence,
      analysisTime: analysis.analysisTime,
      raw: alert,
      feedback: null
    };
    alerts.push(newAlert);
    processed.push(newAlert);
  }
  res.json({ alerts: processed });
});

app.get('/alerts', authMiddleware, (req, res) => {
  const list = alerts.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    source: a.source,
    status: a.status,
    severity: a.severity
  }));
  res.json({ alerts: list });
});

app.get('/alerts/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const alert = alerts.find((a) => a.id === id);
  if (!alert) return res.status(404).json({ error: 'Not found' });
  res.json(alert);
});

app.post('/alerts/:id/feedback', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const alert = alerts.find((a) => a.id === id);
  if (!alert) return res.status(404).json({ error: 'Not found' });
  const { feedback } = req.body;
  alert.feedback = feedback;
  res.json({ success: true });
});

// Threat hunter
app.post('/hunter/query', authMiddleware, async (req, res) => {
  const { question, logs = [] } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing question' });
  const result = await hunterQuery(question, logs);
  res.json(result);
});

// Metrics
app.get('/metrics', authMiddleware, (req, res) => {
  const total = alerts.length;
  const severityCounts = alerts.reduce((acc, a) => {
    acc[a.severity] = (acc[a.severity] || 0) + 1;
    return acc;
  }, {});
  const avgTime = total ? alerts.reduce((sum, a) => sum + (a.analysisTime || 0), 0) / total : 0;
  res.json({ totalAlerts: total, severityCounts, avgAnalysisTime: avgTime });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

