const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(100),
        status VARCHAR(20) DEFAULT 'new',
        summary TEXT,
        severity VARCHAR(20),
        category VARCHAR(50),
        action VARCHAR(100),
        technique VARCHAR(100),
        tactic VARCHAR(100),
        confidence REAL,
        principal JSONB,
        asset JSONB,
        entities JSONB,
        fingerprint TEXT,
        case_id INTEGER,
        plan JSONB,
        recommendations JSONB,
        ack_time TIMESTAMP,
        investigate_start TIMESTAMP,
        resolve_time TIMESTAMP,
        embedding JSONB,
        embedding_text TEXT,
        mitre JSONB,
        timeline JSONB,
        evidence JSONB,
        analysis_time INTEGER,
        raw JSONB,
        feedback VARCHAR(100),
        user_id INTEGER REFERENCES users(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Integrations per user (data source connections)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS integrations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(100) NOT NULL,
        enabled BOOLEAN DEFAULT false,
        settings JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_user_provider ON integrations (user_id, provider)');

    // Cases and mapping table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        anchor_fingerprint TEXT UNIQUE,
        severity VARCHAR(20),
        status VARCHAR(20) DEFAULT 'open',
        owner VARCHAR(100),
        context JSONB
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS case_alerts (
        case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
        alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
        PRIMARY KEY (case_id, alert_id)
      )
    `);

    // Add missing columns if upgrading from earlier schema
    const alterSqls = [
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS category VARCHAR(50)",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS action VARCHAR(100)",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS technique VARCHAR(100)",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS tactic VARCHAR(100)",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS confidence REAL",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS principal JSONB",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS asset JSONB",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS entities JSONB",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS fingerprint TEXT",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS case_id INTEGER",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS plan JSONB",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS recommendations JSONB",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ack_time TIMESTAMP",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS investigate_start TIMESTAMP",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolve_time TIMESTAMP",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS embedding JSONB",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS embedding_text TEXT",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS mitre JSONB"
    ];
    for (const sql of alterSqls) {
      try { await pool.query(sql); } catch {}
    }

    // Basic indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts (fingerprint)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_case_id ON alerts (case_id)');

    // Try to enable pgvector if available (optional)
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      // Optional vector column for similarity
      await pool.query('ALTER TABLE alerts ADD COLUMN IF NOT EXISTS embedding_vec vector(64)');
      // Optional index
      await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_embedding_vec ON alerts USING ivfflat (embedding_vec vector_l2_ops) WITH (lists = 50)');
    } catch (e) {
      console.warn('pgvector not available or cannot be enabled:', e.message);
    }

    // Policy and approval workflow tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS policies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        effect VARCHAR(30) NOT NULL, -- allow | deny | require_approval
        action_pattern VARCHAR(200) NOT NULL, -- e.g., disable_account, isolate_*
        resource_pattern VARCHAR(200),
        conditions JSONB, -- arbitrary conditions (severity>=high, business_hours, etc.)
        risk VARCHAR(30), -- low|medium|high|critical
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        parameters JSONB,
        status VARCHAR(30) DEFAULT 'pending', -- pending|approved|denied|cancelled|expired
        reason TEXT,
        trace_id VARCHAR(64),
        approver_id INTEGER REFERENCES users(id),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS action_executions (
        id SERIAL PRIMARY KEY,
        approval_request_id INTEGER REFERENCES approval_requests(id) ON DELETE SET NULL,
        tool VARCHAR(100),
        request JSONB,
        response JSONB,
        status VARCHAR(30), -- success|failure
        error_class VARCHAR(50),
        retries INTEGER DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

module.exports = { pool, initDatabase };
