/**
 * Evidence Search Service
 * 
 * Provides advanced search and filtering capabilities for evidence across
 * investigations with support for full-text search, entity matching, and faceted filtering.
 */

class EvidenceSearch {
  constructor(database) {
    this.db = database;
  }

  /**
   * Search evidence across investigations with advanced filtering
   */
  async search(tenantId, query, options = {}) {
    const client = await this.db.connect();
    
    try {
      // Set tenant context
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId.toString()]);

      const searchResults = await this._executeSearch(client, query, options);
      const facets = await this._generateFacets(client, query, options);
      const suggestions = await this._generateSuggestions(client, query, options);

      return {
        results: searchResults.results,
        totalCount: searchResults.totalCount,
        facets,
        suggestions,
        query: {
          original: query,
          parsed: this._parseQuery(query),
          options
        },
        metadata: {
          searchTime: searchResults.searchTime,
          resultCount: searchResults.results.length,
          hasMore: searchResults.totalCount > (options.offset || 0) + searchResults.results.length
        }
      };

    } finally {
      client.release();
    }
  }

  /**
   * Search for similar evidence based on an existing evidence item
   */
  async findSimilar(evidenceId, options = {}) {
    const client = await this.db.connect();
    
    try {
      // Get the reference evidence
      const refEvidence = await this._getEvidenceById(client, evidenceId);
      if (!refEvidence) {
        throw new Error('Reference evidence not found');
      }

      // Build similarity query
      const similarityQuery = this._buildSimilarityQuery(refEvidence);
      
      // Execute search
      const results = await this._executeSearch(client, similarityQuery, {
        ...options,
        excludeIds: [evidenceId],
        similarityMode: true
      });

      return {
        referenceEvidence: refEvidence,
        similarEvidence: results.results,
        totalCount: results.totalCount,
        similarityFactors: this._getSimilarityFactors(refEvidence)
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get search suggestions based on partial query
   */
  async getSuggestions(tenantId, partialQuery, options = {}) {
    const client = await this.db.connect();
    
    try {
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId.toString()]);

      const suggestions = [];

      // Entity suggestions
      const entitySuggestions = await this._getEntitySuggestions(client, partialQuery, options);
      suggestions.push(...entitySuggestions);

      // Type suggestions
      const typeSuggestions = await this._getTypeSuggestions(client, partialQuery, options);
      suggestions.push(...typeSuggestions);

      // Source suggestions
      const sourceSuggestions = await this._getSourceSuggestions(client, partialQuery, options);
      suggestions.push(...sourceSuggestions);

      // Tag suggestions
      const tagSuggestions = await this._getTagSuggestions(client, partialQuery, options);
      suggestions.push(...tagSuggestions);

      return suggestions.sort((a, b) => b.score - a.score).slice(0, options.limit || 10);

    } finally {
      client.release();
    }
  }

  /**
   * Execute the main search query
   */
  async _executeSearch(client, query, options) {
    const startTime = Date.now();
    
    let sql = `
      SELECT e.*, 
             array_agg(DISTINCT et.tag) FILTER (WHERE et.tag IS NOT NULL) as tags,
             i.alert_id,
             i.case_id,
             COUNT(*) OVER() as total_count
      FROM investigation_evidence e
      LEFT JOIN evidence_tags et ON e.id = et.evidence_id
      LEFT JOIN investigations i ON e.investigation_id = i.id
      WHERE e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
    `;
    
    const params = [];
    let paramIndex = 1;

    // Parse and apply query filters
    const parsedQuery = this._parseQuery(query);
    const whereConditions = [];

    // Text search
    if (parsedQuery.text && parsedQuery.text.length > 0) {
      const textConditions = [];
      
      for (const term of parsedQuery.text) {
        textConditions.push(`(
          e.data::text ILIKE $${paramIndex} OR
          e.metadata::text ILIKE $${paramIndex} OR
          e.type ILIKE $${paramIndex} OR
          e.source ILIKE $${paramIndex}
        )`);
        params.push(`%${term}%`);
        paramIndex++;
      }
      
      if (textConditions.length > 0) {
        whereConditions.push(`(${textConditions.join(' AND ')})`);
      }
    }

    // Entity filters
    if (parsedQuery.entities && Object.keys(parsedQuery.entities).length > 0) {
      for (const [entityType, entityValues] of Object.entries(parsedQuery.entities)) {
        whereConditions.push(`e.entities->>'${entityType}' ?| $${paramIndex}`);
        params.push(entityValues);
        paramIndex++;
      }
    }

    // Type filter
    if (parsedQuery.types && parsedQuery.types.length > 0) {
      whereConditions.push(`e.type = ANY($${paramIndex})`);
      params.push(parsedQuery.types);
      paramIndex++;
    }

    // Source filter
    if (parsedQuery.sources && parsedQuery.sources.length > 0) {
      whereConditions.push(`e.source = ANY($${paramIndex})`);
      params.push(parsedQuery.sources);
      paramIndex++;
    }

    // Time range filter
    if (parsedQuery.timeRange) {
      if (parsedQuery.timeRange.start) {
        whereConditions.push(`e.timestamp >= $${paramIndex}`);
        params.push(parsedQuery.timeRange.start);
        paramIndex++;
      }
      if (parsedQuery.timeRange.end) {
        whereConditions.push(`e.timestamp <= $${paramIndex}`);
        params.push(parsedQuery.timeRange.end);
        paramIndex++;
      }
    }

    // Confidence filter
    if (parsedQuery.minConfidence !== undefined) {
      whereConditions.push(`e.confidence >= $${paramIndex}`);
      params.push(parsedQuery.minConfidence);
      paramIndex++;
    }

    // Quality filter
    if (parsedQuery.minQuality !== undefined) {
      whereConditions.push(`e.quality_score >= $${paramIndex}`);
      params.push(parsedQuery.minQuality);
      paramIndex++;
    }

    // Investigation filter
    if (options.investigationIds && options.investigationIds.length > 0) {
      whereConditions.push(`e.investigation_id = ANY($${paramIndex})`);
      params.push(options.investigationIds);
      paramIndex++;
    }

    // Exclude specific evidence IDs
    if (options.excludeIds && options.excludeIds.length > 0) {
      whereConditions.push(`e.id != ALL($${paramIndex})`);
      params.push(options.excludeIds);
      paramIndex++;
    }

    // Tag filter
    if (parsedQuery.tags && parsedQuery.tags.length > 0) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM evidence_tags et2 
        WHERE et2.evidence_id = e.id 
        AND et2.tag = ANY($${paramIndex})
      )`);
      params.push(parsedQuery.tags);
      paramIndex++;
    }

    // Apply where conditions
    if (whereConditions.length > 0) {
      sql += ` AND ${whereConditions.join(' AND ')}`;
    }

    // Group by
    sql += ` GROUP BY e.id, i.alert_id, i.case_id`;

    // Ordering
    const orderBy = options.sortBy || 'timestamp';
    const sortOrder = options.sortOrder || 'DESC';
    
    if (orderBy === 'relevance' && parsedQuery.text && parsedQuery.text.length > 0) {
      // Relevance scoring for text search
      sql += ` ORDER BY (
        CASE WHEN e.type ILIKE '%${parsedQuery.text[0]}%' THEN 3 ELSE 0 END +
        CASE WHEN e.source ILIKE '%${parsedQuery.text[0]}%' THEN 2 ELSE 0 END +
        CASE WHEN e.data::text ILIKE '%${parsedQuery.text[0]}%' THEN 1 ELSE 0 END
      ) DESC, e.confidence DESC, e.timestamp DESC`;
    } else {
      sql += ` ORDER BY e.${orderBy} ${sortOrder}`;
    }

    // Pagination
    const limit = Math.min(options.limit || 50, 1000); // Max 1000 results
    const offset = options.offset || 0;
    
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await client.query(sql, params);
    
    const searchTime = Date.now() - startTime;
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      results: result.rows.map(row => ({
        ...row,
        data: row.data,
        metadata: row.metadata,
        entities: row.entities,
        tags: row.tags || []
      })),
      totalCount,
      searchTime
    };
  }

  /**
   * Generate search facets for filtering
   */
  async _generateFacets(client, query, options) {
    const facets = {};

    // Type facets
    const typeResult = await client.query(`
      SELECT e.type, COUNT(*) as count
      FROM investigation_evidence e
      WHERE e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      GROUP BY e.type
      ORDER BY count DESC
      LIMIT 20
    `);
    
    facets.types = typeResult.rows.map(row => ({
      value: row.type,
      label: row.type,
      count: parseInt(row.count)
    }));

    // Source facets
    const sourceResult = await client.query(`
      SELECT e.source, COUNT(*) as count
      FROM investigation_evidence e
      WHERE e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      GROUP BY e.source
      ORDER BY count DESC
      LIMIT 20
    `);
    
    facets.sources = sourceResult.rows.map(row => ({
      value: row.source,
      label: row.source,
      count: parseInt(row.count)
    }));

    // Confidence ranges
    facets.confidence = [
      { value: '0.8-1.0', label: 'High (80-100%)', count: 0 },
      { value: '0.6-0.8', label: 'Medium (60-80%)', count: 0 },
      { value: '0.4-0.6', label: 'Low (40-60%)', count: 0 },
      { value: '0.0-0.4', label: 'Very Low (0-40%)', count: 0 }
    ];

    const confidenceResult = await client.query(`
      SELECT 
        CASE 
          WHEN confidence >= 0.8 THEN '0.8-1.0'
          WHEN confidence >= 0.6 THEN '0.6-0.8'
          WHEN confidence >= 0.4 THEN '0.4-0.6'
          ELSE '0.0-0.4'
        END as range,
        COUNT(*) as count
      FROM investigation_evidence e
      WHERE e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      GROUP BY range
    `);

    confidenceResult.rows.forEach(row => {
      const facet = facets.confidence.find(f => f.value === row.range);
      if (facet) {
        facet.count = parseInt(row.count);
      }
    });

    // Time ranges (last hour, day, week, month)
    facets.timeRanges = [
      { value: '1h', label: 'Last Hour', count: 0 },
      { value: '1d', label: 'Last Day', count: 0 },
      { value: '1w', label: 'Last Week', count: 0 },
      { value: '1m', label: 'Last Month', count: 0 }
    ];

    const timeResult = await client.query(`
      SELECT 
        CASE 
          WHEN timestamp >= NOW() - INTERVAL '1 hour' THEN '1h'
          WHEN timestamp >= NOW() - INTERVAL '1 day' THEN '1d'
          WHEN timestamp >= NOW() - INTERVAL '1 week' THEN '1w'
          WHEN timestamp >= NOW() - INTERVAL '1 month' THEN '1m'
          ELSE 'older'
        END as range,
        COUNT(*) as count
      FROM investigation_evidence e
      WHERE e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      GROUP BY range
    `);

    timeResult.rows.forEach(row => {
      const facet = facets.timeRanges.find(f => f.value === row.range);
      if (facet) {
        facet.count = parseInt(row.count);
      }
    });

    return facets;
  }

  /**
   * Generate search suggestions
   */
  async _generateSuggestions(client, query, options) {
    const suggestions = [];
    
    if (!query || query.length < 2) {
      return suggestions;
    }

    // Suggest common search patterns
    const patterns = [
      { pattern: 'type:', description: 'Search by evidence type (e.g., type:network)' },
      { pattern: 'source:', description: 'Search by data source (e.g., source:siem)' },
      { pattern: 'confidence:', description: 'Filter by confidence level (e.g., confidence:>0.8)' },
      { pattern: 'tag:', description: 'Search by tag (e.g., tag:malware)' },
      { pattern: 'entity:', description: 'Search by entity (e.g., entity:ip:192.168.1.1)' }
    ];

    for (const pattern of patterns) {
      if (pattern.pattern.toLowerCase().includes(query.toLowerCase())) {
        suggestions.push({
          type: 'pattern',
          text: pattern.pattern,
          description: pattern.description,
          score: 0.8
        });
      }
    }

    return suggestions;
  }

  /**
   * Parse search query into structured format
   */
  _parseQuery(query) {
    if (!query || typeof query !== 'string') {
      return { text: [] };
    }

    const parsed = {
      text: [],
      entities: {},
      types: [],
      sources: [],
      tags: [],
      timeRange: {},
      minConfidence: undefined,
      minQuality: undefined
    };

    // Split query into terms
    const terms = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    
    for (const term of terms) {
      const cleanTerm = term.replace(/"/g, '');
      
      // Check for special syntax
      if (cleanTerm.includes(':')) {
        const colonIndex = cleanTerm.indexOf(':');
        const key = cleanTerm.substring(0, colonIndex);
        const value = cleanTerm.substring(colonIndex + 1);
        
        switch (key.toLowerCase()) {
          case 'type':
            parsed.types.push(value);
            break;
          case 'source':
            parsed.sources.push(value);
            break;
          case 'tag':
            parsed.tags.push(value);
            break;
          case 'confidence':
            if (value.startsWith('>')) {
              parsed.minConfidence = parseFloat(value.substring(1));
            } else if (value.startsWith('<')) {
              // Handle less than (would need maxConfidence field)
            } else {
              parsed.minConfidence = parseFloat(value);
            }
            break;
          case 'quality':
            if (value.startsWith('>')) {
              parsed.minQuality = parseFloat(value.substring(1));
            } else {
              parsed.minQuality = parseFloat(value);
            }
            break;
          case 'entity':
            const [entityType, entityValue] = value.split(':', 2);
            if (entityType && entityValue) {
              if (!parsed.entities[entityType]) {
                parsed.entities[entityType] = [];
              }
              parsed.entities[entityType].push(entityValue);
            }
            break;
          case 'after':
          case 'since':
            parsed.timeRange.start = new Date(value);
            break;
          case 'before':
          case 'until':
            parsed.timeRange.end = new Date(value);
            break;
          default:
            parsed.text.push(cleanTerm);
        }
      } else {
        parsed.text.push(cleanTerm);
      }
    }

    return parsed;
  }

  /**
   * Build similarity query based on reference evidence
   */
  _buildSimilarityQuery(refEvidence) {
    const queryParts = [];
    
    // Same type
    if (refEvidence.type) {
      queryParts.push(`type:${refEvidence.type}`);
    }
    
    // Similar entities
    if (refEvidence.entities) {
      for (const [entityType, entities] of Object.entries(refEvidence.entities)) {
        if (Array.isArray(entities) && entities.length > 0) {
          // Use first few entities to avoid overly restrictive queries
          const sampleEntities = entities.slice(0, 3);
          for (const entity of sampleEntities) {
            queryParts.push(`entity:${entityType}:${entity}`);
          }
        }
      }
    }
    
    // Similar time range (within 1 hour)
    if (refEvidence.timestamp) {
      const refTime = new Date(refEvidence.timestamp);
      const startTime = new Date(refTime.getTime() - 60 * 60 * 1000); // 1 hour before
      const endTime = new Date(refTime.getTime() + 60 * 60 * 1000); // 1 hour after
      
      queryParts.push(`after:${startTime.toISOString()}`);
      queryParts.push(`before:${endTime.toISOString()}`);
    }
    
    return queryParts.join(' ');
  }

  /**
   * Get similarity factors for explanation
   */
  _getSimilarityFactors(refEvidence) {
    const factors = [];
    
    if (refEvidence.type) {
      factors.push(`Same evidence type: ${refEvidence.type}`);
    }
    
    if (refEvidence.entities) {
      const entityTypes = Object.keys(refEvidence.entities);
      if (entityTypes.length > 0) {
        factors.push(`Shared entity types: ${entityTypes.join(', ')}`);
      }
    }
    
    if (refEvidence.timestamp) {
      factors.push('Similar time window (±1 hour)');
    }
    
    return factors;
  }

  /**
   * Get entity suggestions
   */
  async _getEntitySuggestions(client, partialQuery, options) {
    const suggestions = [];
    
    // This would typically use a more sophisticated entity extraction
    // For now, return common entity patterns
    const entityPatterns = [
      { pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/, type: 'ip', label: 'IP Address' },
      { pattern: /\b[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}\b/i, type: 'domain', label: 'Domain' },
      { pattern: /\b[a-f0-9]{32,64}\b/i, type: 'hash', label: 'Hash' }
    ];
    
    for (const pattern of entityPatterns) {
      if (pattern.pattern.test(partialQuery)) {
        suggestions.push({
          type: 'entity',
          text: `entity:${pattern.type}:${partialQuery}`,
          description: `Search for ${pattern.label}: ${partialQuery}`,
          score: 0.9
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Get type suggestions
   */
  async _getTypeSuggestions(client, partialQuery, options) {
    const result = await client.query(`
      SELECT DISTINCT type, COUNT(*) as usage_count
      FROM investigation_evidence
      WHERE type ILIKE $1
        AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      GROUP BY type
      ORDER BY usage_count DESC
      LIMIT 5
    `, [`%${partialQuery}%`]);
    
    return result.rows.map(row => ({
      type: 'type',
      text: `type:${row.type}`,
      description: `Evidence type: ${row.type} (${row.usage_count} items)`,
      score: 0.7
    }));
  }

  /**
   * Get source suggestions
   */
  async _getSourceSuggestions(client, partialQuery, options) {
    const result = await client.query(`
      SELECT DISTINCT source, COUNT(*) as usage_count
      FROM investigation_evidence
      WHERE source ILIKE $1
        AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      GROUP BY source
      ORDER BY usage_count DESC
      LIMIT 5
    `, [`%${partialQuery}%`]);
    
    return result.rows.map(row => ({
      type: 'source',
      text: `source:${row.source}`,
      description: `Data source: ${row.source} (${row.usage_count} items)`,
      score: 0.6
    }));
  }

  /**
   * Get tag suggestions
   */
  async _getTagSuggestions(client, partialQuery, options) {
    const result = await client.query(`
      SELECT tag, COUNT(*) as usage_count
      FROM evidence_tags et
      JOIN investigation_evidence e ON et.evidence_id = e.id
      WHERE tag ILIKE $1
        AND e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      GROUP BY tag
      ORDER BY usage_count DESC
      LIMIT 5
    `, [`%${partialQuery}%`]);
    
    return result.rows.map(row => ({
      type: 'tag',
      text: `tag:${row.tag}`,
      description: `Tag: ${row.tag} (${row.usage_count} items)`,
      score: 0.5
    }));
  }

  /**
   * Get evidence by ID
   */
  async _getEvidenceById(client, evidenceId) {
    const result = await client.query(`
      SELECT * FROM investigation_evidence 
      WHERE id = $1 
        AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
    `, [evidenceId]);
    
    return result.rows[0] || null;
  }
}

module.exports = EvidenceSearch;