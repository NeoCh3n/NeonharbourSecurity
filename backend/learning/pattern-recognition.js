const { pool } = require('../database');

/**
 * PatternRecognition service for identifying patterns in investigation feedback
 * Implements Requirements 5.2, 5.3, 5.4
 */
class PatternRecognition {
  constructor() {
    this.patternTypes = {
      VERDICT_ACCURACY: 'verdict_accuracy',
      INVESTIGATION_STRATEGY: 'investigation_strategy',
      RESPONSE_STRATEGY: 'response_strategy',
      FALSE_POSITIVE_PATTERN: 'false_positive_pattern',
      STRATEGY_IMPROVEMENT: 'strategy_improvement'
    };

    this.confidenceThresholds = {
      HIGH: 0.8,
      MEDIUM: 0.6,
      LOW: 0.4
    };
  }

  /**
   * Analyze patterns from learning data for a tenant
   * @param {number} tenantId - Tenant ID for isolation
   * @param {Object} options - Analysis options
   */
  async analyzePatterns(tenantId, options = {}) {
    try {
      const {
        patternType = null,
        minOccurrences = 3,
        timeWindow = 30, // days
        confidenceThreshold = this.confidenceThresholds.MEDIUM
      } = options;

      const patterns = [];

      // Analyze each pattern type
      const typesToAnalyze = patternType ? [patternType] : Object.values(this.patternTypes);

      for (const type of typesToAnalyze) {
        const typePatterns = await this.analyzePatternType(
          tenantId, 
          type, 
          minOccurrences, 
          timeWindow, 
          confidenceThreshold
        );
        patterns.push(...typePatterns);
      }

      // Sort patterns by confidence and impact
      patterns.sort((a, b) => (b.confidence * b.impact) - (a.confidence * a.impact));

      return patterns;
    } catch (error) {
      console.error('Error analyzing patterns:', error);
      throw error;
    }
  }

  /**
   * Analyze patterns for a specific type
   * @param {number} tenantId - Tenant ID
   * @param {string} patternType - Type of pattern to analyze
   * @param {number} minOccurrences - Minimum occurrences to consider a pattern
   * @param {number} timeWindow - Time window in days
   * @param {number} confidenceThreshold - Minimum confidence threshold
   */
  async analyzePatternType(tenantId, patternType, minOccurrences, timeWindow, confidenceThreshold) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeWindow);

      // Get learning patterns for analysis
      const result = await pool.query(`
        SELECT 
          context,
          impact_score,
          metadata,
          created_at,
          COUNT(*) OVER (PARTITION BY context) as occurrence_count
        FROM learning_patterns
        WHERE tenant_id = $1 
          AND pattern_type = $2
          AND created_at >= $3
        ORDER BY created_at DESC
      `, [tenantId, patternType, cutoffDate]);

      if (result.rows.length === 0) {
        return [];
      }

      // Group patterns by similar context
      const contextGroups = this.groupPatternsByContext(result.rows, patternType);

      const patterns = [];
      for (const [contextKey, group] of Object.entries(contextGroups)) {
        if (group.length >= minOccurrences) {
          const pattern = await this.analyzeContextGroup(
            tenantId,
            patternType,
            contextKey,
            group,
            confidenceThreshold
          );
          
          if (pattern && pattern.confidence >= confidenceThreshold) {
            patterns.push(pattern);
          }
        }
      }

      return patterns;
    } catch (error) {
      console.error(`Error analyzing pattern type ${patternType}:`, error);
      throw error;
    }
  }

  /**
   * Group patterns by similar context
   * @param {Array} patterns - Array of pattern records
   * @param {string} patternType - Type of pattern
   */
  groupPatternsByContext(patterns, patternType) {
    const groups = {};

    for (const pattern of patterns) {
      const context = JSON.parse(pattern.context);
      const contextKey = this.generateContextKey(context, patternType);
      
      if (!groups[contextKey]) {
        groups[contextKey] = [];
      }
      
      groups[contextKey].push({
        ...pattern,
        context: context
      });
    }

    return groups;
  }

  /**
   * Generate a context key for grouping similar patterns
   * @param {Object} context - Pattern context
   * @param {string} patternType - Type of pattern
   */
  generateContextKey(context, patternType) {
    switch (patternType) {
      case this.patternTypes.VERDICT_ACCURACY:
        return `${context.alertCategory || 'unknown'}_${context.severity || 'unknown'}`;
      
      case this.patternTypes.INVESTIGATION_STRATEGY:
        return `${context.alertCategory || 'unknown'}_${context.severity || 'unknown'}`;
      
      case this.patternTypes.RESPONSE_STRATEGY:
        return `${context.alertCategory || 'unknown'}_${context.severity || 'unknown'}`;
      
      case this.patternTypes.FALSE_POSITIVE_PATTERN:
        return `${context.alertCategory || 'unknown'}_${JSON.stringify(context.commonCharacteristics || {})}`;
      
      case this.patternTypes.STRATEGY_IMPROVEMENT:
        return `${context.alertCategory || 'unknown'}_${context.currentStrategy || 'unknown'}`;
      
      default:
        return 'default';
    }
  }

  /**
   * Analyze a group of patterns with similar context
   * @param {number} tenantId - Tenant ID
   * @param {string} patternType - Type of pattern
   * @param {string} contextKey - Context key for the group
   * @param {Array} group - Group of similar patterns
   * @param {number} confidenceThreshold - Confidence threshold
   */
  async analyzeContextGroup(tenantId, patternType, contextKey, group, confidenceThreshold) {
    try {
      const occurrences = group.length;
      const avgImpact = group.reduce((sum, p) => sum + p.impact_score, 0) / occurrences;
      
      // Calculate confidence based on occurrences and consistency
      const impactVariance = this.calculateVariance(group.map(p => p.impact_score));
      const consistency = Math.max(0, 1 - impactVariance);
      const frequency = Math.min(1, occurrences / 10); // Normalize to max 10 occurrences
      const confidence = (consistency * 0.6) + (frequency * 0.4);

      if (confidence < confidenceThreshold) {
        return null;
      }

      // Generate insights based on pattern type
      const insights = await this.generateInsights(patternType, contextKey, group);

      // Calculate trend
      const trend = this.calculateTrend(group);

      return {
        id: `${patternType}_${contextKey}_${Date.now()}`,
        type: patternType,
        contextKey,
        occurrences,
        confidence,
        impact: avgImpact,
        trend,
        insights,
        recommendations: await this.generateRecommendations(patternType, insights, group),
        firstSeen: new Date(Math.min(...group.map(p => new Date(p.created_at)))),
        lastSeen: new Date(Math.max(...group.map(p => new Date(p.created_at)))),
        metadata: {
          tenantId,
          sampleSize: occurrences,
          impactVariance,
          consistency
        }
      };
    } catch (error) {
      console.error('Error analyzing context group:', error);
      throw error;
    }
  }

  /**
   * Calculate variance of an array of numbers
   * @param {Array} values - Array of numeric values
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate trend direction for a group of patterns
   * @param {Array} group - Group of patterns
   */
  calculateTrend(group) {
    if (group.length < 2) return 'stable';

    // Sort by date
    const sorted = group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    // Calculate trend in impact scores
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, p) => sum + p.impact_score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, p) => sum + p.impact_score, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    
    if (difference > 0.1) return 'improving';
    if (difference < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Generate insights for a pattern group
   * @param {string} patternType - Type of pattern
   * @param {string} contextKey - Context key
   * @param {Array} group - Group of patterns
   */
  async generateInsights(patternType, contextKey, group) {
    const insights = [];

    switch (patternType) {
      case this.patternTypes.VERDICT_ACCURACY:
        const correctVerdicts = group.filter(p => 
          p.context.correctVerdict === p.context.originalVerdict
        ).length;
        const accuracy = correctVerdicts / group.length;
        
        insights.push({
          type: 'accuracy_rate',
          value: accuracy,
          description: `Verdict accuracy rate: ${(accuracy * 100).toFixed(1)}%`
        });

        if (accuracy < 0.7) {
          insights.push({
            type: 'improvement_needed',
            description: 'Low verdict accuracy indicates need for model improvement'
          });
        }
        break;

      case this.patternTypes.FALSE_POSITIVE_PATTERN:
        const commonChars = this.findCommonCharacteristics(
          group.map(p => p.context.commonCharacteristics)
        );
        
        insights.push({
          type: 'common_characteristics',
          value: commonChars,
          description: 'Common characteristics in false positives'
        });
        break;

      case this.patternTypes.INVESTIGATION_STRATEGY:
        const avgEffectiveness = group.reduce((sum, p) => 
          sum + (p.context.effectiveness || 0), 0
        ) / group.length;
        
        insights.push({
          type: 'strategy_effectiveness',
          value: avgEffectiveness,
          description: `Average strategy effectiveness: ${avgEffectiveness.toFixed(1)}/10`
        });
        break;
    }

    return insights;
  }

  /**
   * Find common characteristics across multiple objects
   * @param {Array} characteristics - Array of characteristic objects
   */
  findCommonCharacteristics(characteristics) {
    if (characteristics.length === 0) return {};

    const common = {};
    const firstChar = characteristics[0] || {};

    for (const key of Object.keys(firstChar)) {
      const values = characteristics.map(char => char[key]).filter(v => v !== undefined);
      
      if (values.length >= characteristics.length * 0.7) { // 70% threshold
        const uniqueValues = [...new Set(values)];
        if (uniqueValues.length === 1) {
          common[key] = uniqueValues[0];
        } else if (uniqueValues.length <= 3) {
          common[key] = uniqueValues;
        }
      }
    }

    return common;
  }

  /**
   * Generate recommendations based on pattern analysis
   * @param {string} patternType - Type of pattern
   * @param {Array} insights - Generated insights
   * @param {Array} group - Pattern group
   */
  async generateRecommendations(patternType, insights, group) {
    const recommendations = [];

    switch (patternType) {
      case this.patternTypes.VERDICT_ACCURACY:
        const accuracyInsight = insights.find(i => i.type === 'accuracy_rate');
        if (accuracyInsight && accuracyInsight.value < 0.7) {
          recommendations.push({
            type: 'model_retraining',
            priority: 'high',
            description: 'Retrain verdict classification model with recent feedback',
            action: 'retrain_model',
            parameters: {
              patternType: 'verdict_accuracy',
              minAccuracy: 0.8
            }
          });
        }
        break;

      case this.patternTypes.FALSE_POSITIVE_PATTERN:
        recommendations.push({
          type: 'detection_tuning',
          priority: 'medium',
          description: 'Tune detection rules to reduce false positives',
          action: 'tune_detection_rules',
          parameters: {
            commonCharacteristics: insights.find(i => i.type === 'common_characteristics')?.value
          }
        });
        break;

      case this.patternTypes.INVESTIGATION_STRATEGY:
        const effectivenessInsight = insights.find(i => i.type === 'strategy_effectiveness');
        if (effectivenessInsight && effectivenessInsight.value < 6) {
          recommendations.push({
            type: 'strategy_optimization',
            priority: 'medium',
            description: 'Optimize investigation strategy for better effectiveness',
            action: 'optimize_strategy',
            parameters: {
              currentEffectiveness: effectivenessInsight.value,
              targetEffectiveness: 8
            }
          });
        }
        break;
    }

    return recommendations;
  }

  /**
   * Get pattern analysis summary for tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} days - Number of days to analyze
   */
  async getPatternSummary(tenantId, days = 30) {
    try {
      const patterns = await this.analyzePatterns(tenantId, { timeWindow: days });
      
      const summary = {
        totalPatterns: patterns.length,
        highConfidencePatterns: patterns.filter(p => p.confidence >= this.confidenceThresholds.HIGH).length,
        mediumConfidencePatterns: patterns.filter(p => 
          p.confidence >= this.confidenceThresholds.MEDIUM && 
          p.confidence < this.confidenceThresholds.HIGH
        ).length,
        lowConfidencePatterns: patterns.filter(p => p.confidence < this.confidenceThresholds.MEDIUM).length,
        patternsByType: {},
        topRecommendations: []
      };

      // Group by pattern type
      for (const pattern of patterns) {
        if (!summary.patternsByType[pattern.type]) {
          summary.patternsByType[pattern.type] = 0;
        }
        summary.patternsByType[pattern.type]++;
      }

      // Get top recommendations
      const allRecommendations = patterns.flatMap(p => p.recommendations || []);
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      
      summary.topRecommendations = allRecommendations
        .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
        .slice(0, 5);

      return summary;
    } catch (error) {
      console.error('Error getting pattern summary:', error);
      throw error;
    }
  }
}

module.exports = PatternRecognition;