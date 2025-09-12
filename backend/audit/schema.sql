-- Audit and Compliance Database Schema
-- Implements comprehensive audit logging for investigation actions

-- Investigation audit logs - tracks every investigation action
CREATE TABLE IF NOT EXISTS investigation_audit_logs (
    id SERIAL PRIMARY KEY,
    investigation_id VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investigation_audit_logs_investigation ON investigation_audit_logs (investigation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_investigation_audit_logs_tenant ON investigation_audit_logs (tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_investigation_audit_logs_action ON investigation_audit_logs (action, timestamp);
CREATE INDEX IF NOT EXISTS idx_investigation_audit_logs_user ON investigation_audit_logs (user_id, timestamp);

-- API call logs - tracks all external API interactions
CREATE TABLE IF NOT EXISTS api_call_logs (
    id SERIAL PRIMARY KEY,
    investigation_id VARCHAR(100) NOT NULL,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    api_endpoint VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_headers JSONB DEFAULT '{}',
    request_body JSONB DEFAULT '{}',
    response_status INTEGER,
    response_headers JSONB DEFAULT '{}',
    response_body JSONB DEFAULT '{}',
    duration_ms INTEGER,
    error_message TEXT,
    data_source VARCHAR(100),
    query_type VARCHAR(100),
    records_returned INTEGER DEFAULT 0,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_call_logs_investigation ON api_call_logs (investigation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_tenant ON api_call_logs (tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_endpoint ON api_call_logs (api_endpoint, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_data_source ON api_call_logs (data_source, timestamp);

-- AI decision logs - tracks AI reasoning and decision-making
CREATE TABLE IF NOT EXISTS ai_decision_logs (
    id SERIAL PRIMARY KEY,
    investigation_id VARCHAR(100) NOT NULL,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    decision_type VARCHAR(100) NOT NULL,
    agent_type VARCHAR(100) NOT NULL,
    input_data JSONB DEFAULT '{}',
    reasoning_process TEXT,
    evidence_considered JSONB DEFAULT '[]',
    confidence_score REAL,
    output_data JSONB DEFAULT '{}',
    model_version VARCHAR(100),
    prompt_template TEXT,
    execution_time_ms INTEGER,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_investigation ON ai_decision_logs (investigation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_tenant ON ai_decision_logs (tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_decision_type ON ai_decision_logs (decision_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_agent_type ON ai_decision_logs (agent_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_confidence ON ai_decision_logs (confidence_score DESC);

-- Human modification logs - tracks human changes to investigations
CREATE TABLE IF NOT EXISTS human_modification_logs (
    id SERIAL PRIMARY KEY,
    investigation_id VARCHAR(100) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    modification_type VARCHAR(100) NOT NULL,
    field_changed VARCHAR(200),
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    approval_required BOOLEAN DEFAULT false,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_human_modification_logs_investigation ON human_modification_logs (investigation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_human_modification_logs_tenant ON human_modification_logs (tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_human_modification_logs_user ON human_modification_logs (user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_human_modification_logs_type ON human_modification_logs (modification_type, timestamp);

-- Compliance reports - stores generated compliance reports
CREATE TABLE IF NOT EXISTS compliance_reports (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(100) UNIQUE NOT NULL,
    investigation_id VARCHAR(100),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL,
    generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    generated_at TIMESTAMP NOT NULL,
    report_data JSONB NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    retention_until DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_investigation ON compliance_reports (investigation_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_tenant ON compliance_reports (tenant_id, generated_at);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_type ON compliance_reports (report_type, generated_at);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_retention ON compliance_reports (retention_until);

-- Data retention policies - configurable retention settings
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    data_type VARCHAR(100) NOT NULL,
    retention_days INTEGER NOT NULL,
    policy_description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, data_type)
);

CREATE INDEX IF NOT EXISTS idx_data_retention_policies_tenant ON data_retention_policies (tenant_id);

-- Audit integrity checks - tracks integrity verification results
CREATE TABLE IF NOT EXISTS audit_integrity_checks (
    id SERIAL PRIMARY KEY,
    investigation_id VARCHAR(100),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    check_type VARCHAR(50) NOT NULL,
    checked_at TIMESTAMP NOT NULL,
    integrity_score REAL NOT NULL,
    issues_found INTEGER DEFAULT 0,
    check_results JSONB NOT NULL,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_integrity_checks_investigation ON audit_integrity_checks (investigation_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_audit_integrity_checks_tenant ON audit_integrity_checks (tenant_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_audit_integrity_checks_score ON audit_integrity_checks (integrity_score DESC);

-- Export logs - tracks data exports for external audit systems
CREATE TABLE IF NOT EXISTS export_logs (
    id SERIAL PRIMARY KEY,
    investigation_id VARCHAR(100),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    export_type VARCHAR(50) NOT NULL,
    format VARCHAR(20) NOT NULL,
    exported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    exported_at TIMESTAMP NOT NULL,
    export_size INTEGER,
    checksum VARCHAR(64),
    destination VARCHAR(200),
    purpose TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_export_logs_investigation ON export_logs (investigation_id, exported_at);
CREATE INDEX IF NOT EXISTS idx_export_logs_tenant ON export_logs (tenant_id, exported_at);
CREATE INDEX IF NOT EXISTS idx_export_logs_type ON export_logs (export_type, exported_at);

-- Compliance violations - tracks detected compliance issues
CREATE TABLE IF NOT EXISTS compliance_violations (
    id SERIAL PRIMARY KEY,
    investigation_id VARCHAR(100),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    violation_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    detected_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compliance_violations_investigation ON compliance_violations (investigation_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_tenant ON compliance_violations (tenant_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_type ON compliance_violations (violation_type, severity);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_unresolved ON compliance_violations (resolved_at) WHERE resolved_at IS NULL;