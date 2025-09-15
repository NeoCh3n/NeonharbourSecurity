const { pool } = require('../database');

/**
 * Threat Intelligence Cache
 * 
 * Implements a multi-level caching system for threat intelligence data:
 * - In-memory cache for frequently accessed data
 * - Database cache for persistent storage
 * - TTL-based expiration and refresh
 * - Cache warming and preloading strategies
 */
class ThreatIntelCache {
  constructor() {
    this.memoryCache = new Map();
    this.maxMemoryCacheSize = parseInt(process.env.THREAT_INTEL_CACHE_SIZE || '10000', 10);
    this.defaultTTL = parseInt(process.env.THREAT_INTEL_TTL_SECONDS || '3600', 10); // 1 hour
    this.cleanupInterval = parseInt(process.env.CACHE_CLEANUP_INTERVAL_MS || '300000', 10); // 5 minutes
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      refreshes: 0,
      errors: 0
    };

    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => this._cleanupExpiredEntries(), this.cleanupInterval);
    
    // Initialize database cache table
    this._initializeCacheTable();
  }

  /**
   * Get threat intelligence data with caching
   * @param {string} key - Cache key (e.g., 'ip:1.2.3.4', 'hash:abc123')
   * @param {Function} fetchFunction - Function to fetch data if not cached
   * @param {Object} options - Cache options
   * @returns {Promise<Object>} Cached or fresh data
   */
  async get(key, fetchFunction, options = {}) {
    const { ttl = this.defaultTTL, forceRefresh = false, tenantId } = options;
    
    try {
      // Check memory cache first
      if (!forceRefresh) {
        const memoryResult = this._getFromMemory(key);
        if (memoryResult) {
          this.stats.hits++;
          return memoryResult.data;
        }

        // Check database cache
        const dbResult = await this._getFromDatabase(key, tenantId);
        if (dbResult && !this._isExpired(dbResult.expires_at)) {
          this.stats.hits++;
          
          // Warm memory cache
          this._setInMemory(key, dbResult.data, dbResult.expires_at);
          
          return dbResult.data;
        }
      }

      // Cache miss - fetch fresh data
      this.stats.misses++;
      const freshData = await fetchFunction();
      
      if (freshData) {
        const expiresAt = new Date(Date.now() + (ttl * 1000));
        
        // Store in both caches
        await this._setInDatabase(key, freshData, expiresAt, tenantId);
        this._setInMemory(key, freshData, expiresAt);
        
        this.stats.refreshes++;
      }
      
      return freshData;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache error for key ${key}:`, error);
      
      // Try to return stale data if available
      const staleData = this._getFromMemory(key, true) || 
                       await this._getFromDatabase(key, tenantId, true);
      
      if (staleData) {
        console.warn(`Returning stale data for key ${key} due to fetch error`);
        return staleData.data || staleData;
      }
      
      throw error;
    }
  }

  /**
   * Set data in cache
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   * @param {Object} options - Cache options
   */
  async set(key, data, options = {}) {
    const { ttl = this.defaultTTL, tenantId } = options;
    const expiresAt = new Date(Date.now() + (ttl * 1000));
    
    try {
      await this._setInDatabase(key, data, expiresAt, tenantId);
      this._setInMemory(key, data, expiresAt);
    } catch (error) {
      console.error(`Failed to set cache for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete data from cache
   * @param {string} key - Cache key
   * @param {string} tenantId - Tenant ID
   */
  async delete(key, tenantId) {
    try {
      // Remove from memory cache
      this.memoryCache.delete(key);
      
      // Remove from database cache
      await pool.query(
        'DELETE FROM threat_intel_cache WHERE cache_key = $1 AND (tenant_id = $2 OR tenant_id IS NULL)',
        [key, tenantId]
      );
    } catch (error) {
      console.error(`Failed to delete cache for key ${key}:`, error);
    }
  }

  /**
   * Warm cache with frequently accessed data
   * @param {Array} keys - Array of cache keys to warm
   * @param {Function} fetchFunction - Function to fetch data
   * @param {Object} options - Options
   */
  async warmCache(keys, fetchFunction, options = {}) {
    const { batchSize = 10, tenantId } = options;
    
    console.log(`Warming cache with ${keys.length} keys`);
    
    // Process in batches to avoid overwhelming external APIs
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      const promises = batch.map(async (key) => {
        try {
          // Check if already cached
          const existing = await this._getFromDatabase(key, tenantId);
          if (existing && !this._isExpired(existing.expires_at)) {
            return;
          }
          
          // Fetch and cache
          const data = await fetchFunction(key);
          if (data) {
            await this.set(key, data, { tenantId });
          }
        } catch (error) {
          console.error(`Failed to warm cache for key ${key}:`, error);
        }
      });
      
      await Promise.all(promises);
      
      // Small delay between batches
      if (i + batchSize < keys.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Cache warming completed for ${keys.length} keys`);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
      : 0;
    
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryCacheSize: this.memoryCache.size,
      maxMemoryCacheSize: this.maxMemoryCacheSize
    };
  }

  /**
   * Clear all cache data
   * @param {string} tenantId - Tenant ID (optional, clears all if not provided)
   */
  async clear(tenantId = null) {
    try {
      // Clear memory cache
      this.memoryCache.clear();
      
      // Clear database cache
      if (tenantId) {
        await pool.query('DELETE FROM threat_intel_cache WHERE tenant_id = $1', [tenantId]);
      } else {
        await pool.query('DELETE FROM threat_intel_cache');
      }
      
      console.log(`Cache cleared${tenantId ? ` for tenant ${tenantId}` : ''}`);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache entries by pattern
   * @param {string} pattern - Key pattern (e.g., 'ip:*', 'hash:*')
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Array>} Matching cache entries
   */
  async getByPattern(pattern, tenantId) {
    try {
      const sqlPattern = pattern.replace('*', '%');
      const result = await pool.query(
        'SELECT cache_key, data, expires_at FROM threat_intel_cache WHERE cache_key LIKE $1 AND (tenant_id = $2 OR tenant_id IS NULL) AND expires_at > NOW()',
        [sqlPattern, tenantId]
      );
      
      return result.rows.map(row => ({
        key: row.cache_key,
        data: row.data,
        expiresAt: row.expires_at
      }));
    } catch (error) {
      console.error(`Failed to get cache entries by pattern ${pattern}:`, error);
      return [];
    }
  }

  // Private methods

  async _initializeCacheTable() {
    try {
      // Skip initialization if database is not available
      if (!process.env.DATABASE_URL) {
        console.warn('Database URL not configured, skipping cache table initialization');
        return;
      }
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS threat_intel_cache (
          id SERIAL PRIMARY KEY,
          cache_key VARCHAR(500) NOT NULL,
          tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
          data JSONB NOT NULL,
          data_type VARCHAR(50),
          source VARCHAR(100),
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          access_count INTEGER DEFAULT 1,
          last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create indexes for performance
      await pool.query('CREATE INDEX IF NOT EXISTS idx_threat_intel_cache_key ON threat_intel_cache (cache_key)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_threat_intel_cache_tenant ON threat_intel_cache (tenant_id, cache_key)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_threat_intel_cache_expires ON threat_intel_cache (expires_at)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_threat_intel_cache_type ON threat_intel_cache (data_type, expires_at)');
      // Ensure ON CONFLICT (cache_key, tenant_id) works by adding a unique index
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uniq_threat_intel_cache_key_tenant ON threat_intel_cache (cache_key, tenant_id)');
      
    } catch (error) {
      console.error('Failed to initialize cache table:', error);
    }
  }

  _getFromMemory(key, includeExpired = false) {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      return null;
    }
    
    if (!includeExpired && this._isExpired(entry.expiresAt)) {
      this.memoryCache.delete(key);
      return null;
    }
    
    // Update access time
    entry.lastAccessed = new Date();
    
    return entry;
  }

  _setInMemory(key, data, expiresAt) {
    // Evict oldest entries if cache is full
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      this._evictOldestEntries();
    }
    
    this.memoryCache.set(key, {
      data,
      expiresAt,
      createdAt: new Date(),
      lastAccessed: new Date()
    });
  }

  async _getFromDatabase(key, tenantId, includeExpired = false) {
    try {
      const expiredCondition = includeExpired ? '' : 'AND expires_at > NOW()';
      const result = await pool.query(
        `SELECT data, expires_at FROM threat_intel_cache 
         WHERE cache_key = $1 AND (tenant_id = $2 OR tenant_id IS NULL) 
         ${expiredCondition}
         ORDER BY expires_at DESC LIMIT 1`,
        [key, tenantId]
      );
      
      if (result.rows.length > 0) {
        // Update access statistics
        await pool.query(
          'UPDATE threat_intel_cache SET access_count = access_count + 1, last_accessed = NOW() WHERE cache_key = $1 AND (tenant_id = $2 OR tenant_id IS NULL)',
          [key, tenantId]
        );
        
        return result.rows[0];
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to get from database cache for key ${key}:`, error);
      return null;
    }
  }

  async _setInDatabase(key, data, expiresAt, tenantId) {
    try {
      // Determine data type from key
      const dataType = this._getDataTypeFromKey(key);
      
      await pool.query(`
        INSERT INTO threat_intel_cache (
          cache_key, tenant_id, data, data_type, expires_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (cache_key, tenant_id) DO UPDATE SET
          data = EXCLUDED.data,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW(),
          access_count = threat_intel_cache.access_count + 1
      `, [key, tenantId, JSON.stringify(data), dataType, expiresAt]);
      
    } catch (error) {
      console.error(`Failed to set database cache for key ${key}:`, error);
      throw error;
    }
  }

  _isExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
  }

  _getDataTypeFromKey(key) {
    const [type] = key.split(':');
    return type || 'unknown';
  }

  _evictOldestEntries() {
    // Sort by last accessed time and remove oldest 10%
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    const toEvict = Math.floor(entries.length * 0.1) || 1;
    
    for (let i = 0; i < toEvict; i++) {
      this.memoryCache.delete(entries[i][0]);
      this.stats.evictions++;
    }
  }

  _cleanupExpiredEntries() {
    // Clean up expired memory cache entries
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this._isExpired(entry.expiresAt)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clean up expired database entries (run less frequently)
    if (Math.random() < 0.1) { // 10% chance each cleanup cycle
      this._cleanupExpiredDatabaseEntries();
    }
  }

  async _cleanupExpiredDatabaseEntries() {
    try {
      const result = await pool.query('DELETE FROM threat_intel_cache WHERE expires_at < NOW()');
      if (result.rowCount > 0) {
        console.log(`Cleaned up ${result.rowCount} expired cache entries`);
      }
    } catch (error) {
      console.error('Failed to cleanup expired database entries:', error);
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.memoryCache.clear();
  }
}

module.exports = { ThreatIntelCache };
