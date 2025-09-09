-- NeonHarbour Security - Manual Partition Migration (alerts, audit_logs)
-- Use when existing tables are NOT empty and you want declarative monthly partitions.
-- Run during a maintenance window. Test on a snapshot first.

BEGIN;

-- 1) Alerts: rebuild as partitioned by month
DO $$
DECLARE
  has_data boolean;
  has_part boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON pt.partrelid = c.oid WHERE c.relname = 'alerts') INTO has_part;
  IF NOT has_part THEN
    EXECUTE 'SELECT COUNT(*)>0 FROM alerts' INTO has_data;
    IF has_data THEN
      -- Drop FK from case_alerts -> alerts temporarily
      FOR r IN (
        SELECT conname FROM pg_constraint 
        WHERE contype='f' AND conrelid = 'case_alerts'::regclass AND confrelid='alerts'::regclass
      ) LOOP
        EXECUTE format('ALTER TABLE case_alerts DROP CONSTRAINT %I', r.conname);
      END LOOP;

      -- Create new partitioned table
      CREATE TABLE alerts_new (
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
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        embedding_vec vector(64)
      ) PARTITION BY RANGE (created_at);

      -- Indexes on parent (propagate to children)
      CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts_new (fingerprint);
      CREATE INDEX IF NOT EXISTS idx_alerts_case_id ON alerts_new (case_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_tenant_created_at ON alerts_new (tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts_new (tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_alerts_embedding_vec ON alerts_new USING ivfflat (embedding_vec vector_l2_ops) WITH (lists = 50);

      -- Partitions for current and next month
      PERFORM 1;
      -- Create needed partitions in app runtime after swap; minimal pre-create here.

      -- Copy data
      INSERT INTO alerts_new SELECT * FROM alerts;

      -- Swap tables
      ALTER TABLE alerts RENAME TO alerts_old;
      ALTER TABLE alerts_new RENAME TO alerts;

      -- Recreate FK
      ALTER TABLE case_alerts
        ADD CONSTRAINT case_alerts_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE;

      -- Drop old table
      DROP TABLE alerts_old;
    END IF;
  END IF;
END $$;

-- 2) Audit logs: rebuild as partitioned by month
DO $$
DECLARE
  has_data boolean;
  has_part boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON pt.partrelid = c.oid WHERE c.relname = 'audit_logs') INTO has_part;
  IF NOT has_part THEN
    EXECUTE 'SELECT COUNT(*)>0 FROM audit_logs' INTO has_data;
    IF has_data THEN
      CREATE TABLE audit_logs_new (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
      ) PARTITION BY RANGE (created_at);

      CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs_new (tenant_id, created_at);

      INSERT INTO audit_logs_new SELECT * FROM audit_logs;
      ALTER TABLE audit_logs RENAME TO audit_logs_old;
      ALTER TABLE audit_logs_new RENAME TO audit_logs;
      DROP TABLE audit_logs_old;
    END IF;
  END IF;
END $$;

COMMIT;

-- After swap, create partitions for past/current/next months as needed, e.g.:
-- CREATE TABLE IF NOT EXISTS alerts_y2025m09 PARTITION OF alerts FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
-- CREATE TABLE IF NOT EXISTS audit_logs_y2025m09 PARTITION OF audit_logs FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

