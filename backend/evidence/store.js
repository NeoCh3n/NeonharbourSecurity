/**
 * Evidence Storage Service
 * 
 * Handles structured storage and retrieval of investigation evidence with
 * support for different evidence types, metadata, and relationships.
 */

const { randomUUID } = require('crypto');

class EvidenceStore {
  constructor(database) {
    this.db = database;
  }

  /**
   * Store evidence with structured data handling
   */
  async store(investigationId, evidence, options = {}) {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Validate evidence structure
      this._validateEvidence(evidence);

      // Generate evidence ID if not provided
      const evidenceId = evidence.id || randomUUID();
      
      // Extract and normalize evidence data
      const normalizedEvidence = this._normalizeEvidence(evidence);

      // Store main evidence record
      const evidenceRecord = await client.query(`
        INSERT INTO investigation_evidence (
          id, investigation_id, type, source, timestamp, 
          data, metadata, entities, quality_score, confidence,
          created_at, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 
          COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1))
        RETURNING *
      `, [
        evidenceId,
        investigationId,
        normalizedEvidence.type,
        normalizedEvidence.source,
        normalizedEvidence.timestamp,
        JSON.stringify(normalizedEvidence.data),
        JSON.stringify(normalizedEvidence.metadata),
        JSON.stringify(normalizedEvidence.entities),
        normalizedEvidence.qualityScore?.overall || 0.5,
        normalizedEvidence.confidence || 0.5
      ]);

      // Store evidence relationships if provided
      if (normalizedEvidence.relationships && normalizedEvidence.relationships.length > 0) {
        await this._storeRelationships(client, evidenceId, normalizedEvidence.relationships);
      }

      // Store evidence tags if provided
      if (normalizedEvidence.tags && normalizedEvidence.tags.length > 0) {
        await this._storeTags(client, evidenceId, normalizedEvidence.tags);
      }

      await client.query('COMMIT');

      return {
        id: evidenceId,
        ...evidenceRecord.rows[0],
        data: normalizedEvidence.data,
        metadata: normalizedEvidence.metadata,
        entities: normalizedEvidence.entities
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Failed to store evidence: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve evidence with optional filtering
   */
  async getEvidence(investigationId, filters = {}) {
    const client = await this.db.connect();
    
    try {
      let query = `
        SELECT e.*, 
               array_agg(DISTINCT et.tag) FILTER (WHERE et.tag IS NOT NULL) as tags,
               array_agg(DISTINCT er.related_evidence_id) FILTER (WHERE er.related_evidence_id IS NOT NULL) as related_ids
        FROM investigation_evidence e
        LEFT JOIN evidence_tags et ON e.id = et.evidence_id
        LEFT JOIN evidence_relationships er ON e.id = er.evidence_id
        WHERE e.investigation_id = $1
          AND e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      `;
      
      const params = [investigationId];
      let paramIndex = 2;

      // Apply filters
      if (filters.type) {
        query += ` AND e.type = $${paramIndex}`;
        params.push(filters.type);
        paramIndex++;
      }

      if (filters.source) {
        query += ` AND e.source = $${paramIndex}`;
        params.push(filters.source);
        paramIndex++;
      }

      if (filters.minConfidence) {
        query += ` AND e.confidence >= $${paramIndex}`;
        params.push(filters.minConfidence);
        paramIndex++;
      }

      if (filters.minQuality) {
        query += ` AND e.quality_score >= $${paramIndex}`;
        params.push(filters.minQuality);
        paramIndex++;
      }

      if (filters.timeRange) {
        if (filters.timeRange.start) {
          query += ` AND e.timestamp >= $${paramIndex}`;
          params.push(filters.timeRange.start);
          paramIndex++;
        }
        if (filters.timeRange.end) {
          query += ` AND e.timestamp <= $${paramIndex}`;
          params.push(filters.timeRange.end);
          paramIndex++;
        }
      }

      if (filters.tags && filters.tags.length > 0) {
        query += ` AND EXISTS (
          SELECT 1 FROM evidence_tags et2 
          WHERE et2.evidence_id = e.id 
          AND et2.tag = ANY($${paramIndex})
        )`;
        params.push(filters.tags);
        paramIndex++;
      }

      query += ` GROUP BY e.id ORDER BY e.timestamp DESC`;

      if (filters.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }

      const result = await client.query(query, params);

      return result.rows.map(row => ({
        ...row,
        data: row.data,
        metadata: row.metadata,
        entities: row.entities,
        tags: row.tags || [],
        relatedIds: row.related_ids || []
      }));

    } finally {
      client.release();
    }
  }

  /**
   * Get evidence by ID
   */
  async getEvidenceById(evidenceId) {
    const client = await this.db.connect();
    
    try {
      const result = await client.query(`
        SELECT e.*, 
               array_agg(DISTINCT et.tag) FILTER (WHERE et.tag IS NOT NULL) as tags,
               array_agg(DISTINCT er.related_evidence_id) FILTER (WHERE er.related_evidence_id IS NOT NULL) as related_ids
        FROM investigation_evidence e
        LEFT JOIN evidence_tags et ON e.id = et.evidence_id
        LEFT JOIN evidence_relationships er ON e.id = er.evidence_id
        WHERE e.id = $1
          AND e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
        GROUP BY e.id
      `, [evidenceId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        ...row,
        data: row.data,
        metadata: row.metadata,
        entities: row.entities,
        tags: row.tags || [],
        relatedIds: row.related_ids || []
      };

    } finally {
      client.release();
    }
  }

  /**
   * Update evidence
   */
  async updateEvidence(evidenceId, updates) {
    const client = await this.db.connect();
    
    try {
      const setClause = [];
      const params = [evidenceId];
      let paramIndex = 2;

      if (updates.confidence !== undefined) {
        setClause.push(`confidence = $${paramIndex}`);
        params.push(updates.confidence);
        paramIndex++;
      }

      if (updates.qualityScore !== undefined) {
        setClause.push(`quality_score = $${paramIndex}`);
        params.push(updates.qualityScore);
        paramIndex++;
      }

      if (updates.metadata !== undefined) {
        setClause.push(`metadata = $${paramIndex}`);
        params.push(JSON.stringify(updates.metadata));
        paramIndex++;
      }

      if (setClause.length === 0) {
        throw new Error('No valid updates provided');
      }

      setClause.push('updated_at = NOW()');

      const result = await client.query(`
        UPDATE investigation_evidence 
        SET ${setClause.join(', ')}
        WHERE id = $1 
          AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
        RETURNING *
      `, params);

      return result.rows[0];

    } finally {
      client.release();
    }
  }

  /**
   * Get evidence statistics for an investigation
   */
  async getStats(investigationId) {
    const client = await this.db.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_evidence,
          COUNT(DISTINCT type) as evidence_types,
          COUNT(DISTINCT source) as data_sources,
          AVG(confidence) as avg_confidence,
          AVG(quality_score) as avg_quality,
          MIN(timestamp) as earliest_evidence,
          MAX(timestamp) as latest_evidence,
          COUNT(*) FILTER (WHERE confidence >= 0.8) as high_confidence_count,
          COUNT(*) FILTER (WHERE quality_score >= 0.7) as high_quality_count
        FROM investigation_evidence 
        WHERE investigation_id = $1
          AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      `, [investigationId]);

      const typeStats = await client.query(`
        SELECT type, COUNT(*) as count, AVG(confidence) as avg_confidence
        FROM investigation_evidence 
        WHERE investigation_id = $1
          AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
        GROUP BY type
        ORDER BY count DESC
      `, [investigationId]);

      const sourceStats = await client.query(`
        SELECT source, COUNT(*) as count, AVG(quality_score) as avg_quality
        FROM investigation_evidence 
        WHERE investigation_id = $1
          AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
        GROUP BY source
        ORDER BY count DESC
      `, [investigationId]);

      return {
        ...result.rows[0],
        typeBreakdown: typeStats.rows,
        sourceBreakdown: sourceStats.rows
      };

    } finally {
      client.release();
    }
  }

  /**
   * Delete evidence
   */
  async deleteEvidence(evidenceId) {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Delete related data first
      await client.query('DELETE FROM evidence_tags WHERE evidence_id = $1', [evidenceId]);
      await client.query('DELETE FROM evidence_relationships WHERE evidence_id = $1 OR related_evidence_id = $1', [evidenceId]);
      
      // Delete main evidence record
      const result = await client.query(`
        DELETE FROM investigation_evidence 
        WHERE id = $1 
          AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
        RETURNING id
      `, [evidenceId]);

      await client.query('COMMIT');

      return result.rows.length > 0;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate evidence structure
   */
  _validateEvidence(evidence) {
    if (!evidence.type) {
      throw new Error('Evidence type is required');
    }

    if (!evidence.source) {
      throw new Error('Evidence source is required');
    }

    if (!evidence.data) {
      throw new Error('Evidence data is required');
    }

    if (!evidence.timestamp) {
      throw new Error('Evidence timestamp is required');
    }

    // Validate timestamp format
    if (!(evidence.timestamp instanceof Date) && !Date.parse(evidence.timestamp)) {
      throw new Error('Invalid timestamp format');
    }
  }

  /**
   * Normalize evidence data structure
   */
  _normalizeEvidence(evidence) {
    return {
      type: evidence.type,
      source: evidence.source,
      timestamp: evidence.timestamp instanceof Date ? evidence.timestamp : new Date(evidence.timestamp),
      data: evidence.data,
      metadata: evidence.metadata || {},
      entities: evidence.entities || {},
      qualityScore: evidence.qualityScore,
      confidence: evidence.confidence,
      relationships: evidence.relationships || [],
      tags: evidence.tags || []
    };
  }

  /**
   * Store evidence relationships
   */
  async _storeRelationships(client, evidenceId, relationships) {
    for (const relationship of relationships) {
      await client.query(`
        INSERT INTO evidence_relationships (evidence_id, related_evidence_id, relationship_type, strength, metadata)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (evidence_id, related_evidence_id) DO UPDATE SET
          relationship_type = EXCLUDED.relationship_type,
          strength = EXCLUDED.strength,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        evidenceId,
        relationship.relatedEvidenceId,
        relationship.type,
        relationship.strength || 0.5,
        JSON.stringify(relationship.metadata || {})
      ]);
    }
  }

  /**
   * Store evidence tags
   */
  async _storeTags(client, evidenceId, tags) {
    for (const tag of tags) {
      await client.query(`
        INSERT INTO evidence_tags (evidence_id, tag)
        VALUES ($1, $2)
        ON CONFLICT (evidence_id, tag) DO NOTHING
      `, [evidenceId, tag]);
    }
  }
}

module.exports = EvidenceStore;