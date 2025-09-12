const { pool } = require('../database');

/**
 * Database Optimizer
 * 
 * Provides database optimization utilities including:
 * - Index management and optimization
 * - Query performance analysis
 * - Table maintenance and statistics
 * - Connection pool optimization
 * - Automated performance tuning
 */
class DatabaseOptimizer {
  constructor() {
    this.optimizationInterval = parseInt(process.env.DB_OPTIMIZATION_INTERVAL_MS || '3600000', 10); // 1 hour
    this.performanceThresholds = {
      slowQueryMs: parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000', 10),
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
      indexUsageThreshold: 0.1 // 10% minimum usage
    };
    
    // Performance statistics
    this.stats = {
      queriesOptimized: 0,
      indexesCreated: 0,
      indexesDropped: 0,
      tablesAnalyzed: 0,
      lastOptimization: null
    };

    // Start periodic optimization
    this.optimizationTimer = setInterval(() => this.runOptimization(), this.optimizationInterval);
  }

  /**
   * Create optimized indexes for evidence tables
   */
  async createEvidenceIndexes() {
    console.log('Creating optimized indexes for evidence tables...');
    
    const indexes = [
      // Investigation Evidence indexes
      {
        name: 'idx_investigation_evidence_tenant_type_timestamp',
        table: 'investigation_evidence',
        columns: '(tenant_id, type, timestamp DESC)',
        condition: null
      },
      {
        name: 'idx_investigation_evidence_investigation_timestamp',
        table: 'investigation_evidence',
        columns: '(investigation_id, timestamp DESC)',
        condition: null
      },
      {
        name: 'idx_investigation_evidence_source_timestamp',
        table: 'investigation_evidence',
        columns: '(source, timestamp DESC)',
        condition: null
      },
      {
        name: 'idx_investigation_evidence_quality_confidence',
        table: 'investigation_evidence',
        columns: '(quality_score DESC, confidence DESC)',
        condition: 'WHERE quality_score > 0.3'
      },
      {
        name: 'idx_investigation_evidence_entities_gin',
        table: 'investigation_evidence',
        columns: 'USING gin (entities)',
        condition: null
      },
      {
        name: 'idx_investigation_evidence_metadata_gin',
        table: 'investigation_evidence',
        columns: 'USING gin (metadata)',
        condition: null
      },

      // Evidence Relationships indexes
      {
        name: 'idx_evidence_relationships_evidence_type',
        table: 'evidence_relationships',
        columns: '(evidence_id, relationship_type)',
        condition: null
      },
      {
        name: 'idx_evidence_relationships_related_type',
        table: 'evidence_relationships',
        columns: '(related_evidence_id, relationship_type)',
        condition: null
      },
      {
        name: 'idx_evidence_relationships_strength',
        table: 'evidence_relationships',
        columns: '(relationship_type, strength DESC)',
        condition: 'WHERE strength > 0.5'
      },

      // Evidence Correlations indexes
      {
        name: 'idx_evidence_correlations_investigation_type',
        table: 'evidence_correlations',
        columns: '(investigation_id, correlation_type)',
        condition: null
      },
      {
        name: 'idx_evidence_correlations_tenant_strength',
        table: 'evidence_correlations',
        columns: '(tenant_id, strength DESC)',
        condition: null
      },
      {
        name: 'idx_evidence_correlations_evidence_ids_gin',
        table: 'evidence_correlations',
        columns: 'USING gin (evidence_ids)',
        condition: null
      },

      // Investigation Performance indexes
      {
        name: 'idx_investigations_tenant_status_created',
        table: 'investigations',
        columns: '(tenant_id, status, created_at DESC)',
        condition: null
      },
      {
        name: 'idx_investigations_priority_created',
        table: 'investigations',
        columns: '(priority DESC, created_at)',
        condition: 'WHERE status IN (\'planning\', \'executing\', \'analyzing\')'
      },
      {
        name: 'idx_investigations_expires_status',
        table: 'investigations',
        columns: '(expires_at, status)',
        condition: 'WHERE status NOT IN (\'complete\', \'failed\', \'expired\')'
      },

      // API Call Logs indexes (for performance analysis)
      {
        name: 'idx_api_call_logs_investigation_timestamp',
        table: 'api_call_logs',
        columns: '(investigation_id, timestamp DESC)',
        condition: null
      },
      {
        name: 'idx_api_call_logs_tenant_endpoint',
        table: 'api_call_logs',
        columns: '(tenant_id, api_endpoint, timestamp DESC)',
        condition: null
      },
      {
        name: 'idx_api_call_logs_duration',
        table: 'api_call_logs',
        columns: '(duration_ms DESC)',
        condition: 'WHERE duration_ms > 1000'
      },
      {
        name: 'idx_api_call_logs_data_source_performance',
        table: 'api_call_logs',
        columns: '(data_source, response_status, duration_ms)',
        condition: null
      },

      // Performance Metrics indexes
      {
        name: 'idx_performance_metrics_tenant_date',
        table: 'performance_metrics',
        columns: '(tenant_id, date DESC)',
        condition: null
      },

      // Audit Logs indexes for investigation tracking
      {
        name: 'idx_investigation_audit_logs_investigation_timestamp',
        table: 'investigation_audit_logs',
        columns: '(investigation_id, timestamp DESC)',
        condition: null
      },
      {
        name: 'idx_investigation_audit_logs_tenant_action',
        table: 'investigation_audit_logs',
        columns: '(tenant_id, action, timestamp DESC)',
        condition: null
      }
    ];

    let created = 0;
    for (const index of indexes) {
      try {
        const createSql = `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table} ${index.columns} ${index.condition || ''}`;
        await pool.query(createSql);
        created++;
        console.log(`Created index: ${index.name}`);
      } catch (error) {
        console.error(`Failed to create index ${index.name}:`, error.message);
      }
    }

    this.stats.indexesCreated += created;
    console.log(`Created ${created} indexes for evidence tables`);
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQueryPerformance() {
    console.log('Analyzing query performance...');
    
    try {
      // Get slow queries from pg_stat_statements if available
      const slowQueries = await this._getSlowQueries();
      
      // Analyze table statistics
      const tableStats = await this._getTableStatistics();
      
      // Check index usage
      const indexUsage = await this._getIndexUsage();
      
      // Generate optimization recommendations
      const recommendations = this._generateOptimizationRecommendations(slowQueries, tableStats, indexUsage);
      
      return {
        slowQueries,
        tableStats,
        indexUsage,
        recommendations
      };
      
    } catch (error) {
      console.error('Failed to analyze query performance:', error);
      return null;
    }
  }

  /**
   * Optimize database tables and update statistics
   */
  async optimizeTables() {
    console.log('Optimizing database tables...');
    
    const tables = [
      'investigation_evidence',
      'evidence_relationships', 
      'evidence_correlations',
      'investigations',
      'investigation_steps',
      'api_call_logs',
      'investigation_audit_logs',
      'performance_metrics',
      'alerts',
      'cases'
    ];

    let optimized = 0;
    for (const table of tables) {
      try {
        // Update table statistics
        await pool.query(`ANALYZE ${table}`);
        
        // Check if table needs vacuuming
        const needsVacuum = await this._checkVacuumNeeded(table);
        if (needsVacuum) {
          await pool.query(`VACUUM ANALYZE ${table}`);
          console.log(`Vacuumed table: ${table}`);
        }
        
        optimized++;
      } catch (error) {
        console.error(`Failed to optimize table ${table}:`, error.message);
      }
    }

    this.stats.tablesAnalyzed += optimized;
    console.log(`Optimized ${optimized} tables`);
  }

  /**
   * Monitor and optimize connection pool
   */
  async optimizeConnectionPool() {
    try {
      // Get current connection statistics
      const connStats = await pool.query(`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `);

      const stats = connStats.rows[0];
      
      // Log connection pool status
      console.log('Connection Pool Status:', {
        total: parseInt(stats.total_connections),
        active: parseInt(stats.active_connections),
        idle: parseInt(stats.idle_connections),
        idleInTransaction: parseInt(stats.idle_in_transaction),
        maxConnections: this.performanceThresholds.maxConnections
      });

      // Check for connection leaks
      if (parseInt(stats.idle_in_transaction) > 5) {
        console.warn(`High number of idle in transaction connections: ${stats.idle_in_transaction}`);
      }

      return stats;
    } catch (error) {
      console.error('Failed to optimize connection pool:', error);
      return null;
    }
  }

  /**
   * Run comprehensive database optimization
   */
  async runOptimization() {
    console.log('Starting database optimization...');
    const startTime = Date.now();
    
    try {
      // Create missing indexes
      await this.createEvidenceIndexes();
      
      // Optimize tables
      await this.optimizeTables();
      
      // Analyze performance
      const analysis = await this.analyzeQueryPerformance();
      
      // Optimize connection pool
      await this.optimizeConnectionPool();
      
      // Clean up unused indexes
      await this._cleanupUnusedIndexes();
      
      const duration = Date.now() - startTime;
      this.stats.lastOptimization = new Date();
      
      console.log(`Database optimization completed in ${duration}ms`);
      
      return {
        duration,
        analysis,
        stats: this.stats
      };
      
    } catch (error) {
      console.error('Database optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    return {
      ...this.stats,
      thresholds: this.performanceThresholds,
      nextOptimization: this.stats.lastOptimization 
        ? new Date(this.stats.lastOptimization.getTime() + this.optimizationInterval)
        : new Date(Date.now() + this.optimizationInterval)
    };
  }

  // Private methods

  async _getSlowQueries() {
    try {
      // Try to get slow queries from pg_stat_statements
      const result = await pool.query(`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows
        FROM pg_stat_statements 
        WHERE mean_time > $1
        ORDER BY mean_time DESC 
        LIMIT 10
      `, [this.performanceThresholds.slowQueryMs]);
      
      return result.rows;
    } catch (error) {
      // pg_stat_statements not available
      console.warn('pg_stat_statements not available for slow query analysis');
      return [];
    }
  }

  async _getTableStatistics() {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Failed to get table statistics:', error);
      return [];
    }
  }

  async _getIndexUsage() {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch,
          idx_scan
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Failed to get index usage:', error);
      return [];
    }
  }

  async _checkVacuumNeeded(tableName) {
    try {
      const result = await pool.query(`
        SELECT 
          n_dead_tup,
          n_live_tup,
          CASE 
            WHEN n_live_tup > 0 THEN n_dead_tup::float / n_live_tup::float
            ELSE 0
          END as dead_ratio
        FROM pg_stat_user_tables 
        WHERE tablename = $1
      `, [tableName]);
      
      if (result.rows.length > 0) {
        const stats = result.rows[0];
        // Vacuum if dead tuple ratio > 20% or dead tuples > 1000
        return stats.dead_ratio > 0.2 || parseInt(stats.n_dead_tup) > 1000;
      }
      
      return false;
    } catch (error) {
      console.error(`Failed to check vacuum needed for ${tableName}:`, error);
      return false;
    }
  }

  async _cleanupUnusedIndexes() {
    try {
      // Find indexes with very low usage
      const unusedIndexes = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public' 
          AND idx_scan < 10
          AND indexname NOT LIKE '%_pkey'
          AND indexname NOT LIKE '%_unique'
        ORDER BY idx_scan ASC
      `);
      
      // Log unused indexes (don't auto-drop for safety)
      if (unusedIndexes.rows.length > 0) {
        console.log('Unused indexes found (consider manual review):');
        unusedIndexes.rows.forEach(idx => {
          console.log(`  ${idx.indexname} on ${idx.tablename} (${idx.idx_scan} scans)`);
        });
      }
      
      return unusedIndexes.rows;
    } catch (error) {
      console.error('Failed to check unused indexes:', error);
      return [];
    }
  }

  _generateOptimizationRecommendations(slowQueries, tableStats, indexUsage) {
    const recommendations = [];
    
    // Analyze slow queries
    slowQueries.forEach(query => {
      if (query.mean_time > this.performanceThresholds.slowQueryMs * 2) {
        recommendations.push({
          type: 'slow_query',
          priority: 'high',
          description: `Query with mean time ${Math.round(query.mean_time)}ms needs optimization`,
          query: query.query.substring(0, 100) + '...'
        });
      }
    });
    
    // Analyze table statistics
    tableStats.forEach(table => {
      const deadRatio = table.dead_tuples / (table.live_tuples || 1);
      if (deadRatio > 0.3) {
        recommendations.push({
          type: 'vacuum_needed',
          priority: 'medium',
          description: `Table ${table.tablename} has high dead tuple ratio (${Math.round(deadRatio * 100)}%)`,
          table: table.tablename
        });
      }
      
      if (!table.last_analyze || new Date() - new Date(table.last_analyze) > 7 * 24 * 60 * 60 * 1000) {
        recommendations.push({
          type: 'analyze_needed',
          priority: 'low',
          description: `Table ${table.tablename} statistics are outdated`,
          table: table.tablename
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
    }
  }
}

module.exports = { DatabaseOptimizer };