/**
 * Evidence Quality Scorer
 * 
 * Calculates quality scores and confidence levels for evidence based on
 * multiple factors including source reliability, data completeness, and validation.
 */

class EvidenceScorer {
  constructor() {
    // Source reliability scores (can be configured per tenant)
    this.sourceReliability = {
      'siem': 0.9,
      'edr': 0.95,
      'firewall': 0.8,
      'ids': 0.85,
      'threat_intel': 0.7,
      'manual': 0.6,
      'user_report': 0.4,
      'honeypot': 0.95,
      'sandbox': 0.9,
      'dns': 0.8,
      'email_security': 0.85,
      'web_proxy': 0.8,
      'vulnerability_scanner': 0.7,
      'default': 0.5
    };

    // Evidence type importance weights
    this.typeWeights = {
      'network': 0.8,
      'process': 0.9,
      'file': 0.85,
      'authentication': 0.9,
      'alert': 0.7,
      'log': 0.6,
      'threat_intel': 0.8,
      'indicator': 0.75,
      'artifact': 0.8,
      'default': 0.5
    };
  }

  /**
   * Score evidence quality based on multiple factors
   */
  async scoreEvidence(evidence) {
    const scores = {
      source: this._scoreSource(evidence),
      completeness: this._scoreCompleteness(evidence),
      freshness: this._scoreFreshness(evidence),
      validation: this._scoreValidation(evidence),
      consistency: this._scoreConsistency(evidence),
      relevance: this._scoreRelevance(evidence)
    };

    // Calculate weighted overall score
    const weights = {
      source: 0.25,
      completeness: 0.20,
      freshness: 0.15,
      validation: 0.15,
      consistency: 0.15,
      relevance: 0.10
    };

    const overall = Object.keys(scores).reduce((sum, key) => {
      return sum + (scores[key] * weights[key]);
    }, 0);

    return {
      overall: Math.max(0, Math.min(1, overall)),
      breakdown: scores,
      weights,
      factors: this._getQualityFactors(evidence, scores)
    };
  }

  /**
   * Update evidence quality based on feedback
   */
  async updateFromFeedback(evidenceId, feedback) {
    // This would typically update ML models or scoring parameters
    // based on analyst feedback about evidence quality
    
    const adjustments = {};
    
    if (feedback.accuracy !== undefined) {
      // Adjust source reliability based on accuracy feedback
      adjustments.sourceReliability = feedback.accuracy;
    }
    
    if (feedback.relevance !== undefined) {
      // Adjust relevance scoring
      adjustments.relevance = feedback.relevance;
    }
    
    if (feedback.completeness !== undefined) {
      // Adjust completeness scoring
      adjustments.completeness = feedback.completeness;
    }

    // In a real implementation, this would update persistent scoring models
    return {
      evidenceId,
      adjustments,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Score evidence source reliability
   */
  _scoreSource(evidence) {
    const source = evidence.source?.toLowerCase() || 'default';
    
    // Check for exact match first
    if (this.sourceReliability[source]) {
      return this.sourceReliability[source];
    }
    
    // Check for partial matches
    for (const [key, score] of Object.entries(this.sourceReliability)) {
      if (source.includes(key) || key.includes(source)) {
        return score;
      }
    }
    
    return this.sourceReliability.default;
  }

  /**
   * Score evidence completeness
   */
  _scoreCompleteness(evidence) {
    let score = 0;
    let maxScore = 0;

    // Required fields
    const requiredFields = ['type', 'source', 'timestamp', 'data'];
    for (const field of requiredFields) {
      maxScore += 0.2;
      if (evidence[field] !== undefined && evidence[field] !== null) {
        score += 0.2;
      }
    }

    // Important optional fields
    const optionalFields = ['entities', 'metadata'];
    for (const field of optionalFields) {
      maxScore += 0.1;
      if (evidence[field] && Object.keys(evidence[field]).length > 0) {
        score += 0.1;
      }
    }

    // Data richness
    maxScore += 0.2;
    if (evidence.data && typeof evidence.data === 'object') {
      const dataKeys = Object.keys(evidence.data);
      if (dataKeys.length >= 5) {
        score += 0.2;
      } else if (dataKeys.length >= 3) {
        score += 0.15;
      } else if (dataKeys.length >= 1) {
        score += 0.1;
      }
    }

    // Entity richness
    maxScore += 0.1;
    if (evidence.entities && typeof evidence.entities === 'object') {
      const entityCount = Object.values(evidence.entities).reduce((sum, arr) => {
        return sum + (Array.isArray(arr) ? arr.length : 0);
      }, 0);
      
      if (entityCount >= 3) {
        score += 0.1;
      } else if (entityCount >= 1) {
        score += 0.05;
      }
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Score evidence freshness (how recent it is)
   */
  _scoreFreshness(evidence) {
    if (!evidence.timestamp) {
      return 0.1;
    }

    const now = new Date();
    const evidenceTime = new Date(evidence.timestamp);
    const ageInHours = (now - evidenceTime) / (1000 * 60 * 60);

    // Fresher evidence gets higher scores
    if (ageInHours < 1) {
      return 1.0;
    } else if (ageInHours < 6) {
      return 0.9;
    } else if (ageInHours < 24) {
      return 0.8;
    } else if (ageInHours < 72) {
      return 0.6;
    } else if (ageInHours < 168) { // 1 week
      return 0.4;
    } else if (ageInHours < 720) { // 1 month
      return 0.2;
    } else {
      return 0.1;
    }
  }

  /**
   * Score evidence validation (format correctness, data integrity)
   */
  _scoreValidation(evidence) {
    let score = 0;
    let checks = 0;

    // Timestamp validation
    checks++;
    if (evidence.timestamp && !isNaN(Date.parse(evidence.timestamp))) {
      score += 0.2;
    }

    // Type validation
    checks++;
    if (evidence.type && typeof evidence.type === 'string' && evidence.type.length > 0) {
      score += 0.2;
    }

    // Source validation
    checks++;
    if (evidence.source && typeof evidence.source === 'string' && evidence.source.length > 0) {
      score += 0.2;
    }

    // Data structure validation
    checks++;
    if (evidence.data && typeof evidence.data === 'object') {
      score += 0.2;
    }

    // Entity validation
    checks++;
    if (evidence.entities) {
      if (typeof evidence.entities === 'object') {
        let validEntities = true;
        for (const [key, value] of Object.entries(evidence.entities)) {
          if (!Array.isArray(value)) {
            validEntities = false;
            break;
          }
        }
        if (validEntities) {
          score += 0.2;
        }
      }
    } else {
      score += 0.1; // Partial credit for missing but optional field
    }

    return checks > 0 ? score / checks : 0;
  }

  /**
   * Score evidence consistency (internal logical consistency)
   */
  _scoreConsistency(evidence) {
    let score = 1.0;
    const issues = [];

    // Check timestamp consistency
    if (evidence.timestamp) {
      const evidenceTime = new Date(evidence.timestamp);
      const now = new Date();
      
      // Evidence from the future is suspicious
      if (evidenceTime > now) {
        score -= 0.3;
        issues.push('Future timestamp detected');
      }
      
      // Very old evidence might be stale
      const ageInDays = (now - evidenceTime) / (1000 * 60 * 60 * 24);
      if (ageInDays > 365) {
        score -= 0.1;
        issues.push('Very old evidence');
      }
    }

    // Check data consistency
    if (evidence.data && evidence.entities) {
      // Check if entities mentioned in data are reflected in entities field
      const dataStr = JSON.stringify(evidence.data).toLowerCase();
      const entities = evidence.entities;
      
      // Look for IP addresses in data
      const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
      const ipsInData = (dataStr.match(ipRegex) || []).length;
      const ipsInEntities = (entities.ips || []).length;
      
      if (ipsInData > 0 && ipsInEntities === 0) {
        score -= 0.1;
        issues.push('IP addresses in data but not in entities');
      }
      
      // Look for domain names
      const domainRegex = /\b[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}\b/g;
      const domainsInData = (dataStr.match(domainRegex) || []).length;
      const domainsInEntities = (entities.domains || []).length;
      
      if (domainsInData > 0 && domainsInEntities === 0) {
        score -= 0.1;
        issues.push('Domains in data but not in entities');
      }
    }

    // Check confidence vs quality consistency
    if (evidence.confidence !== undefined) {
      const sourceScore = this._scoreSource(evidence);
      const confidenceGap = Math.abs(evidence.confidence - sourceScore);
      
      if (confidenceGap > 0.5) {
        score -= 0.1;
        issues.push('Confidence level inconsistent with source reliability');
      }
    }

    return Math.max(0, score);
  }

  /**
   * Score evidence relevance to investigation
   */
  _scoreRelevance(evidence) {
    let score = 0.5; // Base relevance
    
    // Type-based relevance
    const type = evidence.type?.toLowerCase() || 'default';
    const typeWeight = this.typeWeights[type] || this.typeWeights.default;
    score = typeWeight;

    // Entity-based relevance boost
    if (evidence.entities && typeof evidence.entities === 'object') {
      const criticalEntityTypes = ['ips', 'domains', 'hashes', 'users', 'hosts'];
      let hasCriticalEntities = false;
      
      for (const entityType of criticalEntityTypes) {
        if (evidence.entities[entityType] && evidence.entities[entityType].length > 0) {
          hasCriticalEntities = true;
          break;
        }
      }
      
      if (hasCriticalEntities) {
        score = Math.min(1.0, score * 1.2); // 20% boost
      }
    }

    // Threat intelligence relevance
    if (evidence.data && evidence.data.threatIntel) {
      score = Math.min(1.0, score * 1.1); // 10% boost
    }

    // MITRE ATT&CK mapping relevance
    if (evidence.data && evidence.data.mitre) {
      score = Math.min(1.0, score * 1.15); // 15% boost
    }

    return score;
  }

  /**
   * Get human-readable quality factors
   */
  _getQualityFactors(evidence, scores) {
    const factors = [];
    
    // Source factors
    if (scores.source >= 0.8) {
      factors.push('High-reliability source');
    } else if (scores.source <= 0.4) {
      factors.push('Low-reliability source');
    }
    
    // Completeness factors
    if (scores.completeness >= 0.8) {
      factors.push('Complete data set');
    } else if (scores.completeness <= 0.5) {
      factors.push('Incomplete data');
    }
    
    // Freshness factors
    if (scores.freshness >= 0.9) {
      factors.push('Very recent evidence');
    } else if (scores.freshness <= 0.3) {
      factors.push('Stale evidence');
    }
    
    // Validation factors
    if (scores.validation >= 0.9) {
      factors.push('Well-formatted data');
    } else if (scores.validation <= 0.6) {
      factors.push('Data format issues');
    }
    
    // Consistency factors
    if (scores.consistency >= 0.9) {
      factors.push('Internally consistent');
    } else if (scores.consistency <= 0.6) {
      factors.push('Consistency issues detected');
    }
    
    // Relevance factors
    if (scores.relevance >= 0.8) {
      factors.push('Highly relevant to investigation');
    } else if (scores.relevance <= 0.4) {
      factors.push('Limited relevance');
    }
    
    return factors;
  }

  /**
   * Get scoring configuration (for admin/tuning purposes)
   */
  getConfiguration() {
    return {
      sourceReliability: { ...this.sourceReliability },
      typeWeights: { ...this.typeWeights }
    };
  }

  /**
   * Update scoring configuration
   */
  updateConfiguration(config) {
    if (config.sourceReliability) {
      this.sourceReliability = { ...this.sourceReliability, ...config.sourceReliability };
    }
    
    if (config.typeWeights) {
      this.typeWeights = { ...this.typeWeights, ...config.typeWeights };
    }
  }
}

module.exports = EvidenceScorer;