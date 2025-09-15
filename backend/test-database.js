const { Pool } = require('pg');

// Create a separate test database pool with proper configuration
const testPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neonharbour:neonharbour123@localhost:5432/neonharbour',
  ssl: false,
  max: 5, // Limit connections for tests
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Clean up function for tests
async function cleanupTestData() {
  const client = await testPool.connect();
  try {
    // Clean up test data in reverse dependency order
    await client.query('DELETE FROM evidence_correlations WHERE investigation_id LIKE \'test-%\'');
    await client.query('DELETE FROM evidence_relationships WHERE evidence_id LIKE \'test-%\'');
    await client.query('DELETE FROM evidence_tags WHERE evidence_id LIKE \'test-%\'');
    await client.query('DELETE FROM investigation_evidence WHERE investigation_id LIKE \'test-%\'');
    await client.query('DELETE FROM investigation_steps WHERE investigation_id LIKE \'test-%\'');
    await client.query('DELETE FROM investigation_feedback WHERE investigation_id LIKE \'test-%\'');
    await client.query('DELETE FROM investigations WHERE id LIKE \'test-%\'');
    await client.query('DELETE FROM performance_metrics WHERE tenant_id = 999');
    await client.query('DELETE FROM threat_intel_cache WHERE tenant_id = 999');
    await client.query('DELETE FROM investigation_queue WHERE tenant_id = 999');
  } finally {
    client.release();
  }
}

// Setup test database
async function setupTestDatabase() {
  const client = await testPool.connect();
  try {
    // Create test tenant if it doesn't exist
    await client.query(`
      INSERT INTO tenants (id, slug, name, region) 
      VALUES (999, 'test-tenant', 'Test Tenant', 'TEST') 
      ON CONFLICT (id) DO NOTHING
    `);

    // Create performance optimization tables for tests
    await client.query(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS threat_intel_cache (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(500) NOT NULL,
        tenant_id INTEGER NOT NULL,
        data JSONB NOT NULL,
        data_type VARCHAR(100),
        expires_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cache_key, tenant_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_queue (
        id SERIAL PRIMARY KEY,
        investigation_id VARCHAR(100) UNIQUE NOT NULL,
        tenant_id INTEGER NOT NULL,
        user_id INTEGER,
        alert_id INTEGER,
        priority INTEGER DEFAULT 3,
        status VARCHAR(30) DEFAULT 'queued',
        queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        removed_at TIMESTAMP,
        removal_reason VARCHAR(100),
        estimated_duration INTEGER,
        max_attempts INTEGER DEFAULT 3,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        metadata JSONB DEFAULT '{}'
      )
    `);

  } finally {
    client.release();
  }
}

module.exports = {
  testPool,
  cleanupTestData,
  setupTestDatabase
};