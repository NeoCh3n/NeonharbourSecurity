/**
 * Evidence Correlation Engine
 * 
 * Analyzes evidence to identify temporal, spatial, and behavioral patterns
 * that help build a comprehensive understanding of security incidents.
 */

class EvidenceCorrelator {
  constructor(database) {
    this.db = database;
  }

  /**
   * Analyze correlations for newly added evidence
   */
  async analyzeCorrelations(investigationId, evidenceId) {
    const client = await this.db.connect();
    
    try {
      // Get the new evidence
      const newEvidence = await this._getEvidenceById(client, evidenceId);
      if (!newEvidence) {
        throw new Error('Evidence not found');
      }

      // Get all other evidence for this investigation
      const allEvidence = await this._getInvestigationEvidence(client, investigationId);
      
      // Find correlations
      const correlations = [];
      
      for (const evidence of allEvidence) {
        if (evidence.id === evidenceId) continue;

        // Temporal correlation
        const temporalCorr = this._analyzeTemporalCorrelation(newEvidence, evidence);
        if (temporalCorr.strength > 0.3) {
          correlations.push({
            type: 'temporal',
            evidenceIds: [evidenceId, evidence.id],
            strength: temporalCorr.strength,
            description: temporalCorr.description,
            metadata: temporalCorr.metadata
          });
        }

        // Entity correlation
        const entityCorr = this._analyzeEntityCorrelation(newEvidence, evidence);
        if (entityCorr.strength > 0.3) {
          correlations.push({
            type: 'entity',
            evidenceIds: [evidenceId, evidence.id],
            strength: entityCorr.strength,
            description: entityCorr.description,
            metadata: entityCorr.metadata
          });
        }

        // Behavioral correlation
        const behavioralCorr = this._analyzeBehavioralCorrelation(newEvidence, evidence);
        if (behavioralCorr.strength > 0.3) {
          correlations.push({
            type: 'behavioral',
            evidenceIds: [evidenceId, evidence.id],
            strength: behavioralCorr.strength,
            description: behavioralCorr.description,
            metadata: behavioralCorr.metadata
          });
        }

        // Causal correlation
        const causalCorr = this._analyzeCausalCorrelation(newEvidence, evidence);
        if (causalCorr.strength > 0.3) {
          correlations.push({
            type: 'causal',
            evidenceIds: [evidenceId, evidence.id],
            strength: causalCorr.strength,
            description: causalCorr.description,
            metadata: causalCorr.metadata
          });
        }
      }

      // Store correlations
      for (const correlation of correlations) {
        await this._storeCorrelation(client, investigationId, correlation);
      }

      // Analyze multi-evidence patterns
      await this._analyzeMultiEvidencePatterns(client, investigationId, allEvidence);

      return correlations;

    } finally {
      client.release();
    }
  }

  /**
   * Get all correlations for an investigation
   */
  async getCorrelations(investigationId, options = {}) {
    const client = await this.db.connect();
    
    try {
      let query = `
        SELECT c.*, 
               array_agg(e.id) as evidence_details
        FROM evidence_correlations c
        LEFT JOIN investigation_evidence e ON e.id = ANY(c.evidence_ids)
        WHERE c.investigation_id = $1
          AND c.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      `;
      
      const params = [investigationId];
      let paramIndex = 2;

      if (options.type) {
        query += ` AND c.correlation_type = $${paramIndex}`;
        params.push(options.type);
        paramIndex++;
      }

      if (options.minStrength) {
        query += ` AND c.strength >= $${paramIndex}`;
        params.push(options.minStrength);
        paramIndex++;
      }

      query += ` GROUP BY c.id ORDER BY c.strength DESC, c.created_at DESC`;

      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
      }

      const result = await client.query(query, params);
      return result.rows;

    } finally {
      client.release();
    }
  }

  /**
   * Get correlation network for visualization
   */
  async getCorrelationNetwork(investigationId) {
    const client = await this.db.connect();
    
    try {
      // Get all evidence as nodes
      const evidenceResult = await client.query(`
        SELECT id, type, source, timestamp, confidence, quality_score, entities
        FROM investigation_evidence
        WHERE investigation_id = $1
          AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
        ORDER BY timestamp
      `, [investigationId]);

      // Get all correlations as edges
      const correlationResult = await client.query(`
        SELECT correlation_type, evidence_ids, strength, description
        FROM evidence_correlations
        WHERE investigation_id = $1
          AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
        ORDER BY strength DESC
      `, [investigationId]);

      const nodes = evidenceResult.rows.map(evidence => ({
        id: evidence.id,
        type: evidence.type,
        source: evidence.source,
        timestamp: evidence.timestamp,
        confidence: evidence.confidence,
        qualityScore: evidence.quality_score,
        entities: evidence.entities,
        size: Math.max(10, evidence.confidence * 30) // Size based on confidence
      }));

      const edges = [];
      correlationResult.rows.forEach(correlation => {
        const evidenceIds = correlation.evidence_ids;
        for (let i = 0; i < evidenceIds.length - 1; i++) {
          for (let j = i + 1; j < evidenceIds.length; j++) {
            edges.push({
              source: evidenceIds[i],
              target: evidenceIds[j],
              type: correlation.correlation_type,
              strength: correlation.strength,
              description: correlation.description,
              width: Math.max(1, correlation.strength * 5) // Width based on strength
            });
          }
        }
      });

      return { nodes, edges };

    } finally {
      client.release();
    }
  }

  /**
   * Analyze temporal correlation between two pieces of evidence
   */
  _analyzeTemporalCorrelation(evidence1, evidence2) {
    const time1 = new Date(evidence1.timestamp);
    const time2 = new Date(evidence2.timestamp);
    const timeDiff = Math.abs(time1 - time2) / 1000; // seconds

    let strength = 0;
    let description = '';
    const metadata = { timeDifference: timeDiff };

    // Very close in time (within 1 minute)
    if (timeDiff <= 60) {
      strength = 0.9;
      description = 'Events occurred within 1 minute of each other';
    }
    // Close in time (within 5 minutes)
    else if (timeDiff <= 300) {
      strength = 0.7;
      description = 'Events occurred within 5 minutes of each other';
    }
    // Moderately close (within 1 hour)
    else if (timeDiff <= 3600) {
      strength = 0.5;
      description = 'Events occurred within 1 hour of each other';
    }
    // Same day
    else if (timeDiff <= 86400) {
      strength = 0.3;
      description = 'Events occurred on the same day';
    }
    // Too far apart
    else {
      strength = 0.1;
      description = 'Events are temporally distant';
    }

    return { strength, description, metadata };
  }

  /**
   * Analyze entity correlation between two pieces of evidence
   */
  _analyzeEntityCorrelation(evidence1, evidence2) {
    const entities1 = evidence1.entities || {};
    const entities2 = evidence2.entities || {};

    let commonEntities = 0;
    let totalEntities = 0;
    const sharedEntities = {};

    // Check for common entities across all types
    const entityTypes = new Set([...Object.keys(entities1), ...Object.keys(entities2)]);
    
    for (const type of entityTypes) {
      const set1 = new Set(entities1[type] || []);
      const set2 = new Set(entities2[type] || []);
      
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      
      if (intersection.size > 0) {
        sharedEntities[type] = [...intersection];
        commonEntities += intersection.size;
      }
      
      totalEntities += union.size;
    }

    const jaccardIndex = totalEntities > 0 ? commonEntities / totalEntities : 0;
    let strength = jaccardIndex;
    
    // Boost strength for critical entity types
    const criticalTypes = ['ips', 'domains', 'hashes', 'users'];
    let hasCriticalOverlap = false;
    
    for (const type of criticalTypes) {
      if (sharedEntities[type] && sharedEntities[type].length > 0) {
        hasCriticalOverlap = true;
        strength = Math.min(1.0, strength * 1.5); // Boost by 50%
        break;
      }
    }

    let description = '';
    if (strength > 0.7) {
      description = 'High entity overlap - likely related events';
    } else if (strength > 0.4) {
      description = 'Moderate entity overlap - possibly related events';
    } else if (strength > 0.1) {
      description = 'Some shared entities detected';
    } else {
      description = 'No significant entity overlap';
    }

    return {
      strength,
      description,
      metadata: {
        jaccardIndex,
        sharedEntities,
        hasCriticalOverlap,
        commonEntityCount: commonEntities,
        totalEntityCount: totalEntities
      }
    };
  }

  /**
   * Analyze behavioral correlation between two pieces of evidence
   */
  _analyzeBehavioralCorrelation(evidence1, evidence2) {
    let strength = 0;
    let description = '';
    const metadata = {};

    // Check for similar attack techniques or tactics
    const data1 = evidence1.data || {};
    const data2 = evidence2.data || {};

    // MITRE ATT&CK technique correlation
    if (data1.mitre && data2.mitre) {
      const techniques1 = new Set(data1.mitre.techniques || []);
      const techniques2 = new Set(data2.mitre.techniques || []);
      const commonTechniques = new Set([...techniques1].filter(x => techniques2.has(x)));
      
      if (commonTechniques.size > 0) {
        strength += 0.4;
        metadata.commonTechniques = [...commonTechniques];
      }

      const tactics1 = new Set(data1.mitre.tactics || []);
      const tactics2 = new Set(data2.mitre.tactics || []);
      const commonTactics = new Set([...tactics1].filter(x => tactics2.has(x)));
      
      if (commonTactics.size > 0) {
        strength += 0.3;
        metadata.commonTactics = [...commonTactics];
      }
    }

    // Similar event types or categories
    if (evidence1.type === evidence2.type) {
      strength += 0.2;
      metadata.sameType = true;
    }

    // Similar severity or risk indicators
    if (data1.severity && data2.severity && data1.severity === data2.severity) {
      strength += 0.1;
      metadata.sameSeverity = data1.severity;
    }

    // Pattern matching in event data
    const patternScore = this._analyzeDataPatterns(data1, data2);
    strength += patternScore * 0.3;
    metadata.patternScore = patternScore;

    strength = Math.min(1.0, strength);

    if (strength > 0.7) {
      description = 'Strong behavioral correlation - likely part of same attack campaign';
    } else if (strength > 0.4) {
      description = 'Moderate behavioral correlation - possibly related attack activities';
    } else if (strength > 0.1) {
      description = 'Some behavioral similarities detected';
    } else {
      description = 'No significant behavioral correlation';
    }

    return { strength, description, metadata };
  }

  /**
   * Analyze causal correlation (one event potentially causing another)
   */
  _analyzeCausalCorrelation(evidence1, evidence2) {
    const time1 = new Date(evidence1.timestamp);
    const time2 = new Date(evidence2.timestamp);
    const timeDiff = (time2 - time1) / 1000; // seconds (positive if evidence2 is after evidence1)

    let strength = 0;
    let description = '';
    const metadata = { timeDifference: timeDiff };

    // Only consider causal if evidence2 comes after evidence1
    if (timeDiff <= 0) {
      return { strength: 0, description: 'No causal relationship - wrong temporal order', metadata };
    }

    // Check for logical causal relationships
    const type1 = evidence1.type;
    const type2 = evidence2.type;
    const data1 = evidence1.data || {};
    const data2 = evidence2.data || {};

    // Define causal patterns
    const causalPatterns = [
      // Network -> Process
      { from: 'network', to: 'process', maxDelay: 300, strength: 0.8 },
      // Authentication -> File Access
      { from: 'authentication', to: 'file', maxDelay: 600, strength: 0.7 },
      // Process -> Network
      { from: 'process', to: 'network', maxDelay: 120, strength: 0.6 },
      // Alert -> Investigation Action
      { from: 'alert', to: 'action', maxDelay: 3600, strength: 0.5 }
    ];

    for (const pattern of causalPatterns) {
      if (type1.includes(pattern.from) && type2.includes(pattern.to) && timeDiff <= pattern.maxDelay) {
        strength = Math.max(strength, pattern.strength * (1 - timeDiff / pattern.maxDelay));
        description = `Potential causal relationship: ${pattern.from} event may have triggered ${pattern.to} event`;
        metadata.causalPattern = pattern;
        break;
      }
    }

    // Entity-based causality (same entities involved in sequence)
    const entityCorr = this._analyzeEntityCorrelation(evidence1, evidence2);
    if (entityCorr.strength > 0.5 && timeDiff <= 1800) { // 30 minutes
      strength = Math.max(strength, entityCorr.strength * 0.6);
      if (!description) {
        description = 'Potential causal relationship based on shared entities and timing';
      }
      metadata.entityCausality = true;
    }

    return { strength, description, metadata };
  }

  /**
   * Analyze patterns in event data
   */
  _analyzeDataPatterns(data1, data2) {
    let score = 0;
    
    // Check for similar command patterns
    if (data1.command && data2.command) {
      const similarity = this._calculateStringSimilarity(data1.command, data2.command);
      score += similarity * 0.5;
    }

    // Check for similar file paths
    if (data1.filePath && data2.filePath) {
      const similarity = this._calculateStringSimilarity(data1.filePath, data2.filePath);
      score += similarity * 0.3;
    }

    // Check for similar network patterns
    if (data1.destination && data2.destination) {
      if (data1.destination === data2.destination) {
        score += 0.4;
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  _calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    const distance = this._levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  _levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Analyze multi-evidence patterns (3+ pieces of evidence)
   */
  async _analyzeMultiEvidencePatterns(client, investigationId, allEvidence) {
    if (allEvidence.length < 3) return;

    // Look for attack chains (sequences of related events)
    const chains = this._findAttackChains(allEvidence);
    
    for (const chain of chains) {
      if (chain.evidence.length >= 3 && chain.strength > 0.5) {
        await this._storeCorrelation(client, investigationId, {
          type: 'attack_chain',
          evidenceIds: chain.evidence.map(e => e.id),
          strength: chain.strength,
          description: `Attack chain detected: ${chain.description}`,
          metadata: { chainType: chain.type, steps: chain.steps }
        });
      }
    }

    // Look for lateral movement patterns
    const lateralMovement = this._findLateralMovementPatterns(allEvidence);
    
    for (const pattern of lateralMovement) {
      if (pattern.evidence.length >= 2 && pattern.strength > 0.6) {
        await this._storeCorrelation(client, investigationId, {
          type: 'lateral_movement',
          evidenceIds: pattern.evidence.map(e => e.id),
          strength: pattern.strength,
          description: `Lateral movement pattern: ${pattern.description}`,
          metadata: { hosts: pattern.hosts, timeline: pattern.timeline }
        });
      }
    }
  }

  /**
   * Find attack chains in evidence
   */
  _findAttackChains(evidence) {
    const chains = [];
    
    // Sort evidence by timestamp
    const sortedEvidence = [...evidence].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Look for common attack patterns
    const patterns = [
      {
        type: 'credential_access',
        steps: ['authentication_failure', 'credential_dump', 'privilege_escalation'],
        description: 'Credential access attack chain'
      },
      {
        type: 'data_exfiltration',
        steps: ['file_access', 'data_staging', 'network_transfer'],
        description: 'Data exfiltration attack chain'
      },
      {
        type: 'malware_execution',
        steps: ['file_creation', 'process_execution', 'network_communication'],
        description: 'Malware execution chain'
      }
    ];

    for (const pattern of patterns) {
      const matchingEvidence = [];
      let currentStep = 0;
      
      for (const ev of sortedEvidence) {
        const eventType = ev.type || '';
        const eventData = ev.data || {};
        
        if (currentStep < pattern.steps.length) {
          const expectedStep = pattern.steps[currentStep];
          
          if (eventType.includes(expectedStep) || 
              (eventData.category && eventData.category.includes(expectedStep))) {
            matchingEvidence.push(ev);
            currentStep++;
          }
        }
      }
      
      if (matchingEvidence.length >= 2) {
        const strength = matchingEvidence.length / pattern.steps.length;
        chains.push({
          type: pattern.type,
          evidence: matchingEvidence,
          strength,
          description: pattern.description,
          steps: pattern.steps
        });
      }
    }
    
    return chains;
  }

  /**
   * Find lateral movement patterns
   */
  _findLateralMovementPatterns(evidence) {
    const patterns = [];
    
    // Group evidence by host/system
    const hostGroups = {};
    
    for (const ev of evidence) {
      const entities = ev.entities || {};
      const hosts = entities.hosts || entities.systems || [];
      
      for (const host of hosts) {
        if (!hostGroups[host]) {
          hostGroups[host] = [];
        }
        hostGroups[host].push(ev);
      }
    }
    
    // Look for evidence spanning multiple hosts in sequence
    const hosts = Object.keys(hostGroups);
    
    if (hosts.length >= 2) {
      const timeline = [];
      
      for (const host of hosts) {
        const hostEvidence = hostGroups[host].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        timeline.push({
          host,
          firstActivity: hostEvidence[0].timestamp,
          lastActivity: hostEvidence[hostEvidence.length - 1].timestamp,
          evidence: hostEvidence
        });
      }
      
      // Sort by first activity time
      timeline.sort((a, b) => new Date(a.firstActivity) - new Date(b.firstActivity));
      
      // Check for progression across hosts
      let isLateralMovement = true;
      const allEvidence = [];
      
      for (let i = 1; i < timeline.length; i++) {
        const prevHost = timeline[i - 1];
        const currentHost = timeline[i];
        
        const timeDiff = (new Date(currentHost.firstActivity) - new Date(prevHost.firstActivity)) / 1000;
        
        // Should be reasonable time gap (not too fast, not too slow)
        if (timeDiff < 60 || timeDiff > 86400) { // 1 minute to 1 day
          isLateralMovement = false;
          break;
        }
        
        allEvidence.push(...prevHost.evidence);
      }
      
      if (isLateralMovement && timeline.length >= 2) {
        allEvidence.push(...timeline[timeline.length - 1].evidence);
        
        patterns.push({
          evidence: allEvidence,
          strength: Math.min(1.0, timeline.length / 3), // Stronger with more hosts
          description: `Activity progression across ${timeline.length} hosts`,
          hosts: hosts,
          timeline: timeline.map(t => ({ host: t.host, firstActivity: t.firstActivity }))
        });
      }
    }
    
    return patterns;
  }

  /**
   * Store correlation in database
   */
  async _storeCorrelation(client, investigationId, correlation) {
    await client.query(`
      INSERT INTO evidence_correlations (
        investigation_id, correlation_type, evidence_ids, strength, description, metadata, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1))
      ON CONFLICT DO NOTHING
    `, [
      investigationId,
      correlation.type,
      correlation.evidenceIds,
      correlation.strength,
      correlation.description,
      JSON.stringify(correlation.metadata || {})
    ]);
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

  /**
   * Get all evidence for an investigation
   */
  async _getInvestigationEvidence(client, investigationId) {
    const result = await client.query(`
      SELECT * FROM investigation_evidence 
      WHERE investigation_id = $1 
        AND tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
      ORDER BY timestamp
    `, [investigationId]);
    
    return result.rows;
  }
}

module.exports = EvidenceCorrelator;