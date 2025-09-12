const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Ensure new columns exist on existing installations
    try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false'); } catch {}

    // Multi-tenancy core tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        region VARCHAR(50),
        data_residency VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_tenants (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        PRIMARY KEY (user_id, tenant_id)
      )
    `);
    // Seed default tenant and compute default tenant expression (fallback for session setting)
    await pool.query("INSERT INTO tenants (slug, name, region) VALUES ('default','Default','HK') ON CONFLICT (slug) DO NOTHING");
    const _defTenant = await pool.query("SELECT id FROM tenants WHERE slug='default'");
    const defaultTenantId = _defTenant.rows[0]?.id || 1;
    const tenantDefaultExpr = `COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, ${defaultTenantId})`;

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
    // Add tenant to alerts
    try { await pool.query('ALTER TABLE alerts ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE alerts SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE alerts ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE alerts ADD CONSTRAINT fk_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE alerts ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

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
    // Add tenant to audit_logs
    try { await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE audit_logs SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE audit_logs ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE audit_logs ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

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
    // Add tenant to integrations
    try { await pool.query('ALTER TABLE integrations ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE integrations SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE integrations ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE integrations ADD CONSTRAINT fk_integrations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE integrations ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}
    try { await pool.query('DROP INDEX IF EXISTS idx_integrations_user_provider'); } catch {}
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_user_tenant_provider ON integrations (user_id, tenant_id, provider)');

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
    // Add tenant to cases
    try { await pool.query('ALTER TABLE cases ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE cases SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE cases ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE cases ADD CONSTRAINT fk_cases_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE cases ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS case_alerts (
        case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
        alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
        PRIMARY KEY (case_id, alert_id)
      )
    `);
    // Add tenant to case_alerts
    try { await pool.query('ALTER TABLE case_alerts ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE case_alerts SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE case_alerts ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE case_alerts ADD CONSTRAINT fk_case_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE case_alerts ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

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
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS mitre JSONB",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id)",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS priority VARCHAR(20)",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS tags TEXT[]",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS disposition VARCHAR(20)",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT false",
      "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS escalation_reason TEXT"
    ];
    for (const sql of alterSqls) {
      try { await pool.query(sql); } catch {}
    }

    // Basic indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts (fingerprint)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_case_id ON alerts (case_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_tenant_created_at ON alerts (tenant_id, created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts (tenant_id, status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_tenant_assigned ON alerts (tenant_id, assigned_to)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_tenant_priority ON alerts (tenant_id, priority)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_alerts_tenant_disposition ON alerts (tenant_id, disposition)');

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
    // Add tenant to policies
    try { await pool.query('ALTER TABLE policies ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE policies SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE policies ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE policies ADD CONSTRAINT fk_policies_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE policies ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

    // Global settings (key/value JSON)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Tenant-scoped settings (non-breaking)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        key VARCHAR(100) NOT NULL,
        value JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, key)
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
    // Add tenant to approval_requests
    try { await pool.query('ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE approval_requests SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE approval_requests ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE approval_requests ADD CONSTRAINT fk_approval_requests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE approval_requests ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

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
    // Add tenant to action_executions
    try { await pool.query('ALTER TABLE action_executions ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE action_executions SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE action_executions ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE action_executions ADD CONSTRAINT fk_action_executions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE action_executions ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

    // Long-horizon memory: sessions, memories, and case plans
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
        alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
        title VARCHAR(255),
        context JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_case_id ON sessions (case_id)');
    // Add tenant to sessions
    try { await pool.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE sessions SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE sessions ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE sessions ADD CONSTRAINT fk_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE sessions ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
        session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
        type VARCHAR(50),
        key TEXT,
        value JSONB,
        tags TEXT[],
        importance REAL DEFAULT 0.5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_memories_case_id ON memories (case_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories (session_id)');
    // Add tenant to memories
    try { await pool.query('ALTER TABLE memories ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE memories SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE memories ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE memories ADD CONSTRAINT fk_memories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE memories ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS case_plans (
        case_id INTEGER PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
        plan JSONB,
        context_summary TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add tenant to case_plans
    try { await pool.query('ALTER TABLE case_plans ADD COLUMN IF NOT EXISTS tenant_id INTEGER'); } catch {}
    await pool.query('UPDATE case_plans SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultTenantId]);
    try { await pool.query('ALTER TABLE case_plans ALTER COLUMN tenant_id SET NOT NULL'); } catch {}
    try { await pool.query('ALTER TABLE case_plans ADD CONSTRAINT fk_case_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'); } catch {}
    try { await pool.query(`ALTER TABLE case_plans ALTER COLUMN tenant_id SET DEFAULT ${tenantDefaultExpr}`); } catch {}

    // Investigation Engine tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS investigations (
        id VARCHAR(100) PRIMARY KEY,
        alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
        case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(30) DEFAULT 'planning',
        priority INTEGER DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        completed_at TIMESTAMP,
        context JSONB
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigations_alert ON investigations (alert_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigations_tenant_status ON investigations (tenant_id, status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigations_tenant_created ON investigations (tenant_id, created_at)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS investigation_steps (
        id SERIAL PRIMARY KEY,
        investigation_id VARCHAR(100) REFERENCES investigations(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        agent_type VARCHAR(50) NOT NULL,
        step_name VARCHAR(200) NOT NULL,
        status VARCHAR(30) DEFAULT 'pending',
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        input_data JSONB,
        output_data JSONB,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_steps_investigation ON investigation_steps (investigation_id, step_order)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS investigation_feedback (
        id SERIAL PRIMARY KEY,
        investigation_id VARCHAR(100) REFERENCES investigations(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        feedback_type VARCHAR(50),
        content JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_feedback_investigation ON investigation_feedback (investigation_id, created_at)');

    // Evidence Management tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS investigation_evidence (
        id VARCHAR(100) PRIMARY KEY,
        investigation_id VARCHAR(100) REFERENCES investigations(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        source VARCHAR(100) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        data JSONB NOT NULL,
        metadata JSONB DEFAULT '{}',
        entities JSONB DEFAULT '{}',
        quality_score REAL DEFAULT 0.5,
        confidence REAL DEFAULT 0.5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_evidence_investigation ON investigation_evidence (investigation_id, timestamp)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_evidence_tenant_type ON investigation_evidence (tenant_id, type, timestamp)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_evidence_source ON investigation_evidence (source, timestamp)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_investigation_evidence_confidence ON investigation_evidence (confidence DESC)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evidence_relationships (
        id SERIAL PRIMARY KEY,
        evidence_id VARCHAR(100) REFERENCES investigation_evidence(id) ON DELETE CASCADE,
        related_evidence_id VARCHAR(100) REFERENCES investigation_evidence(id) ON DELETE CASCADE,
        relationship_type VARCHAR(50) NOT NULL,
        strength REAL DEFAULT 0.5,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(evidence_id, related_evidence_id)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evidence_relationships_evidence ON evidence_relationships (evidence_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evidence_relationships_related ON evidence_relationships (related_evidence_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evidence_relationships_type ON evidence_relationships (relationship_type, strength DESC)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evidence_tags (
        evidence_id VARCHAR(100) REFERENCES investigation_evidence(id) ON DELETE CASCADE,
        tag VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (evidence_id, tag)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evidence_tags_tag ON evidence_tags (tag)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evidence_correlations (
        id SERIAL PRIMARY KEY,
        investigation_id VARCHAR(100) REFERENCES investigations(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        correlation_type VARCHAR(50) NOT NULL,
        evidence_ids VARCHAR(100)[] NOT NULL,
        strength REAL DEFAULT 0.5,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evidence_correlations_investigation ON evidence_correlations (investigation_id, correlation_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evidence_correlations_strength ON evidence_correlations (strength DESC)');

    // Learning and Adaptation System tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_patterns (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        pattern_type VARCHAR(50) NOT NULL,
        context JSONB NOT NULL,
        impact_score REAL DEFAULT 0.5,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_learning_patterns_tenant_type ON learning_patterns (tenant_id, pattern_type, created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_learning_patterns_impact ON learning_patterns (impact_score DESC)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        accuracy REAL DEFAULT 0,
        mtti_seconds INTEGER DEFAULT 0,
        mttr_seconds INTEGER DEFAULT 0,
        false_positive_rate REAL DEFAULT 0,
        investigation_quality REAL DEFAULT 0,
        response_effectiveness REAL DEFAULT 0,
        total_investigations INTEGER DEFAULT 0,
        correct_verdicts INTEGER DEFAULT 0,
        false_positives INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, date)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_performance_metrics_tenant_date ON performance_metrics (tenant_id, date)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_adaptations (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        adaptation_id VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) NOT NULL,
        description TEXT,
        context VARCHAR(200),
        current_config JSONB,
        proposed_config JSONB,
        expected_impact REAL DEFAULT 0,
        reasoning TEXT,
        metadata JSONB DEFAULT '{}',
        applied BOOLEAN DEFAULT false,
        dry_run BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        applied_at TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_strategy_adaptations_tenant ON strategy_adaptations (tenant_id, created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_strategy_adaptations_type ON strategy_adaptations (type, applied)');

    // Phase B tables: ticketing, collaboration, KPIs, tuning, suppression
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        system VARCHAR(50) NOT NULL,
        external_id VARCHAR(100) NOT NULL,
        status VARCHAR(30),
        priority VARCHAR(30),
        linked_case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
        linked_alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_tenant_system_external ON tickets (tenant_id, system, external_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tickets_tenant_case ON tickets (tenant_id, linked_case_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tickets_tenant_alert ON tickets (tenant_id, linked_alert_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS collab_events (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        channel VARCHAR(30),
        external_id VARCHAR(100),
        type VARCHAR(30),
        author VARCHAR(200),
        message TEXT,
        linked_case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
        linked_alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_collab_tenant_case ON collab_events (tenant_id, linked_case_id, created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_collab_tenant_alert ON collab_events (tenant_id, linked_alert_id, created_at)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpi_snapshots (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        mtta_ms INTEGER,
        mtti_ms INTEGER,
        mttr_ms INTEGER,
        false_positive_rate REAL,
        backlog INTEGER,
        notes TEXT
      )
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_tenant_date ON kpi_snapshots (tenant_id, date)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tuning_suggestions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        source VARCHAR(50),
        rule_id VARCHAR(200),
        suggestion TEXT,
        impact_estimate JSONB,
        state VARCHAR(30) DEFAULT 'proposed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_at TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tuning_tenant_source_rule ON tuning_suggestions (tenant_id, source, rule_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppression_rules (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        scope VARCHAR(50),
        condition JSONB,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_suppress_tenant_scope ON suppression_rules (tenant_id, scope)');

    // Compliance tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS controls (
        id SERIAL PRIMARY KEY,
        framework VARCHAR(50) NOT NULL,
        control_id VARCHAR(50) NOT NULL,
        title TEXT,
        description TEXT
      )
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_controls_framework_id ON controls (framework, control_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS control_mappings (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        control_id INTEGER REFERENCES controls(id) ON DELETE CASCADE,
        implemented_by TEXT,
        status VARCHAR(30),
        evidence_refs JSONB,
        last_verified_at TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ctrlmap_tenant_control ON control_mappings (tenant_id, control_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evidence (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(50),
        location TEXT,
        hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        retained_until TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evidence_tenant_type ON evidence (tenant_id, type, created_at)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS data_assets (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        system VARCHAR(100),
        dataset VARCHAR(200),
        contains_pii BOOLEAN DEFAULT false,
        classification VARCHAR(50),
        owner VARCHAR(200),
        region VARCHAR(50),
        flow JSONB
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_data_assets_tenant_system ON data_assets (tenant_id, system)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS retention_policies (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        object_type VARCHAR(50),
        policy JSONB,
        active BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_tenant_object ON retention_policies (tenant_id, object_type)');

    // Partitioning for new installs (safe if tables are empty)
    const isPartitioned = async (table) => {
      const q = await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON pt.partrelid = c.oid WHERE c.relname = $1) AS exists`, [table]);
      return !!q.rows[0]?.exists;
    };
    const tableCount = async (table) => {
      try {
        const q = await pool.query(`SELECT COUNT(*)::bigint AS c FROM ${table}`);
        return BigInt(q.rows[0]?.c || 0n);
      } catch { return 0n; }
    };
    const ensurePartitionedEmptyCreate = async (table, columnsSql, indexesSqlArr) => {
      const part = await isPartitioned(table);
      if (!part) {
        const cnt = await tableCount(table);
        if (cnt === 0n) {
          try { await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`); } catch {}
          await pool.query(`CREATE TABLE ${table} (${columnsSql}) PARTITION BY RANGE (created_at)`);
          for (const idx of indexesSqlArr) { try { await pool.query(idx); } catch {} }
          const now = new Date();
          const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
          const y = now.getUTCFullYear();
          const m = now.getUTCMonth() + 1;
          const mk = async (year, month) => {
            const start = `${year}-${pad(month)}-01`;
            const nextMonth = month === 12 ? 1 : (month + 1);
            const nextYear = month === 12 ? year + 1 : year;
            const end = `${nextYear}-${pad(nextMonth)}-01`;
            const pname = `${table}_y${year}m${pad(month)}`;
            await pool.query(`CREATE TABLE IF NOT EXISTS ${pname} PARTITION OF ${table} FOR VALUES FROM ('${start}') TO ('${end}')`);
          };
          await mk(y, m);
          await mk(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
        } else {
          console.warn(`Skipping ${table} partition conversion: table not empty`);
        }
      }
    };

    await ensurePartitionedEmptyCreate(
      'audit_logs',
      `
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE
      `,
      [ 'CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs (tenant_id, created_at)' ]
    );
    await ensurePartitionedEmptyCreate(
      'alerts',
      `
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
        user_id INTEGER REFERENCES users(id),
        tenant_id INTEGER NOT NULL DEFAULT ${tenantDefaultExpr} REFERENCES tenants(id) ON DELETE CASCADE,
        embedding_vec vector(64),
        assigned_to INTEGER REFERENCES users(id),
        priority VARCHAR(20),
        tags TEXT[],
        disposition VARCHAR(20),
        escalated BOOLEAN DEFAULT false,
        escalation_reason TEXT
      `,
      [
        'CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts (fingerprint)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_case_id ON alerts (case_id)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_tenant_created_at ON alerts (tenant_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts (tenant_id, status)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_embedding_vec ON alerts USING ivfflat (embedding_vec vector_l2_ops) WITH (lists = 50)'
      ]
    );

    // Backfill user_tenants for existing users
    await pool.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role)
       SELECT id, $1, CASE WHEN is_admin THEN 'admin' ELSE 'member' END FROM users
       ON CONFLICT DO NOTHING`,
      [defaultTenantId]
    );

    // Optional RLS policies (enable by setting ENABLE_RLS=true)
    if ((process.env.ENABLE_RLS || '').toLowerCase() === 'true') {
      const rlsTables = [
        'alerts','audit_logs','integrations','cases','case_alerts','policies',
        'approval_requests','action_executions','sessions','memories','case_plans',
        'tickets','collab_events','kpi_snapshots','tuning_suggestions','suppression_rules',
        'control_mappings','evidence','data_assets','retention_policies','tenant_settings'
      ];
      for (const t of rlsTables) {
        try { await pool.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`); } catch {}
        const policy = `tenant_isolation_${t}`;
        const expr = `(tenant_id = ${tenantDefaultExpr})`;
        try { await pool.query(`DROP POLICY IF EXISTS ${policy} ON ${t}`); } catch {}
        try { await pool.query(`CREATE POLICY ${policy} ON ${t} FOR ALL USING ${expr} WITH CHECK ${expr}`); } catch (e) {
          console.warn(`RLS policy for ${t} failed:`, e.message);
        }
      }
    }
  
    console.log('Database initialized successfully');
    // Ensure default admin user exists
    try {
      const r = await pool.query('SELECT id FROM users WHERE email=$1', ['admin']);
      if (r.rows.length === 0) {
        const hashed = await bcrypt.hash('admin', 10);
        await pool.query('INSERT INTO users (email, password, is_admin) VALUES ($1,$2,true)', ['admin', hashed]);
        console.log('Seeded default admin user: admin / admin');
      }
    } catch (e) {
      console.warn('Failed to ensure default admin user:', e.message);
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

module.exports = { pool, initDatabase };
