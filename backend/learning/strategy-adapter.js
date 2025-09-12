const { pool } = require('../database');
const PatternRecognition = require('./pattern-recognition');
const PerformanceMetrics = require('./performance-metrics');

/**
 * StrategyAdapter service for adapting investigation strategies based on feedback
 * Implements Requirements 5.2, 5.4, 5.5
 */
class StrategyAdapter {
  constructor() {
    this.patternRecognition = new PatternRecognition();
    this.performanceMetrics = new PerformanceMetrics();
    
    this.adaptationTypes = {
      INVESTIGATION_STRATEGY: 'investigation_strategy',
      VERDICT_THRESHOLD: 'verdict_threshold',
      RESPONSE_STRATEGY: 'response_strategy',
      DETECTION_TUNING: 'detection_tuning',
      PRIORITY_ADJUSTMENT: 'priority_adjustment'
    };

    this.confidenceThresholds = {
      HIGH: 0.8,
      MEDIUM: 0.6,
      LOW: 0.4
    };
  }

  /**
   * Analyze and adapt strategies based on feedback patterns
   * @param {number} tenantId - Tenant ID for isolation
   * @param {Object} options - Adaptation options
   */
  async adaptStrategies(tenantId, options = {}) {
    try {
      const {
        analysisWindow = 30, // days
        minPatternConfidence = this.confidenceThresholds.MEDIUM,
        dryRun = false
      } = options;

      // Get recent patterns
      const patterns = await this.patternRecognition.analyzePatterns(tenantId, {
        timeWindow: analysisWindow,
        confidenceThreshold: minPatternConfidence
      });

      // Get current performance metrics
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - analysisWindow);
      
      const currentMetrics = await this.performanceMetrics.calculateMetrics(
        tenantId, startDate, endDate
      );

      // Generate adaptations based on patterns and metrics
      const adaptations = await this.generateAdaptations(tenantId, patterns, currentMetrics);

      // Apply adaptations if not dry run
      if (!dryRun) {
        for (const adaptation of adaptations) {
          await this.applyAdaptation(tenantId, adaptation);
        }
      }

      // Store adaptation history
      await this.storeAdaptationHistory(tenantId, adaptations, dryRun);

      return {
        adaptations,
        patterns: patterns.length,
        currentMetrics,
        dryRun
      };
    } catch (error) {
      console.error('Error adapting strategies:', error);
      throw error;
    }
  }

  /**
   * Generate adaptations based on patterns and metrics
   * @param {number} tenantId - Tenant ID
   * @param {Array} patterns - Identified patterns
   * @param {Object} currentMetrics - Current performance metrics
   */
  async generateAdaptations(tenantId, patterns, currentMetrics) {
    const adaptations = [];

    // Analyze verdict accuracy patterns
    const verdictPatterns = patterns.filter(p => p.type === 'verdict_accuracy');
    if (verdictPatterns.length > 0) {
      const verdictAdaptations = await this.generateVerdictAdaptations(
        tenantId, verdictPatterns, currentMetrics
      );
      adaptations.push(...verdictAdaptations);
    }

    // Analyze investigation strategy patterns
    const strategyPatterns = patterns.filter(p => p.type === 'investigation_strategy');
    if (strategyPatterns.length > 0) {
      const strategyAdaptations = await this.generateStrategyAdaptations(
        tenantId, strategyPatterns, currentMetrics
      );
      adaptations.push(...strategyAdaptations);
    }

    // Analyze false positive patterns
    const fpPatterns = patterns.filter(p => p.type === 'false_positive_pattern');
    if (fpPatterns.length > 0) {
      const fpAdaptations = await this.generateFalsePositiveAdaptations(
        tenantId, fpPatterns, currentMetrics
      );
      adaptations.push(...fpAdaptations);
    }

    // Analyze response strategy patterns
    const responsePatterns = patterns.filter(p => p.type === 'response_strategy');
    if (responsePatterns.length > 0) {
      const responseAdaptations = await this.generateResponseAdaptations(
        tenantId, responsePatterns, currentMetrics
      );
      adaptations.push(...responseAdaptations);
    }

    // Generate performance-based adaptations
    const performanceAdaptations = await this.generatePerformanceAdaptations(
      tenantId, currentMetrics
    );
    adaptations.push(...performanceAdaptations);

    // Sort by priority and impact
    adaptations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return (b.expectedImpact || 0) - (a.expectedImpact || 0);
    });

    return adaptations;
  }

  /**
   * Generate verdict threshold adaptations
   * @param {number} tenantId - Tenant ID
   * @param {Array} patterns - Verdict accuracy patterns
   * @param {Object} metrics - Current metrics
   */
  async generateVerdictAdaptations(tenantId, patterns, metrics) {
    const adaptations = [];

    for (const pattern of patterns) {
      const accuracyInsight = pattern.insights.find(i => i.type === 'accuracy_rate');
      
      if (accuracyInsight && accuracyInsight.value < 0.7) {
        // Get current thresholds
        const currentThresholds = await this.getCurrentVerdictThresholds(tenantId);
        
        adaptations.push({
          id: `verdict_threshold_${pattern.contextKey}_${Date.now()}`,
          type: this.adaptationTypes.VERDICT_THRESHOLD,
          priority: accuracyInsight.value < 0.5 ? 'high' : 'medium',
          description: `Adjust verdict confidence thresholds for ${pattern.contextKey}`,
          context: pattern.contextKey,
          currentConfig: currentThresholds,
          proposedConfig: {
            ...currentThresholds,
            [pattern.contextKey]: {
              truePositiveThreshold: Math.min(0.9, currentThresholds[pattern.contextKey]?.truePositiveThreshold + 0.1),
              falsePositiveThreshold: Math.max(0.1, currentThresholds[pattern.contextKey]?.falsePositiveThreshold - 0.1),
              requiresReviewThreshold: 0.6
            }
          },
          expectedImpact: (0.8 - accuracyInsight.value) * pattern.confidence,
          reasoning: `Current accuracy of ${(accuracyInsight.value * 100).toFixed(1)}% is below target`,
          metadata: {
            patternId: pattern.id,
            currentAccuracy: accuracyInsight.value,
            targetAccuracy: 0.8,
            occurrences: pattern.occurrences
          }
        });
      }
    }

    return adaptations;
  }

  /**
   * Generate investigation strategy adaptations
   * @param {number} tenantId - Tenant ID
   * @param {Array} patterns - Strategy patterns
   * @param {Object} metrics - Current metrics
   */
  async generateStrategyAdaptations(tenantId, patterns, metrics) {
    const adaptations = [];

    for (const pattern of patterns) {
      const effectivenessInsight = pattern.insights.find(i => i.type === 'strategy_effectiveness');
      
      if (effectivenessInsight && effectivenessInsight.value < 6) {
        // Get current strategy configuration
        const currentStrategy = await this.getCurrentInvestigationStrategy(tenantId, pattern.contextKey);
        
        // Generate improved strategy based on successful patterns
        const improvedStrategy = await this.generateImprovedStrategy(
          tenantId, pattern.contextKey, currentStrategy
        );

        adaptations.push({
          id: `investigation_strategy_${pattern.contextKey}_${Date.now()}`,
          type: this.adaptationTypes.INVESTIGATION_STRATEGY,
          priority: effectivenessInsight.value < 4 ? 'high' : 'medium',
          description: `Optimize investigation strategy for ${pattern.contextKey}`,
          context: pattern.contextKey,
          currentConfig: currentStrategy,
          proposedConfig: improvedStrategy,
          expectedImpact: (8 - effectivenessInsight.value) / 10 * pattern.confidence,
          reasoning: `Current effectiveness of ${effectivenessInsight.value}/10 is below target`,
          metadata: {
            patternId: pattern.id,
            currentEffectiveness: effectivenessInsight.value,
            targetEffectiveness: 8,
            occurrences: pattern.occurrences
          }
        });
      }
    }

    return adaptations;
  }

  /**
   * Generate false positive reduction adaptations
   * @param {number} tenantId - Tenant ID
   * @param {Array} patterns - False positive patterns
   * @param {Object} metrics - Current metrics
   */
  async generateFalsePositiveAdaptations(tenantId, patterns, metrics) {
    const adaptations = [];

    for (const pattern of patterns) {
      const commonChars = pattern.insights.find(i => i.type === 'common_characteristics');
      
      if (commonChars && pattern.occurrences >= 3) {
        adaptations.push({
          id: `detection_tuning_${pattern.contextKey}_${Date.now()}`,
          type: this.adaptationTypes.DETECTION_TUNING,
          priority: pattern.occurrences >= 5 ? 'high' : 'medium',
          description: `Tune detection rules to reduce false positives for ${pattern.contextKey}`,
          context: pattern.contextKey,
          currentConfig: null, // Will be populated by specific detection system
          proposedConfig: {
            suppressionRules: [{
              condition: commonChars.value,
              reason: 'Frequent false positive pattern',
              confidence: pattern.confidence
            }],
            thresholdAdjustments: {
              category: pattern.contextKey.split('_')[0],
              adjustmentFactor: 0.8 // Reduce sensitivity by 20%
            }
          },
          expectedImpact: pattern.confidence * (pattern.occurrences / 10),
          reasoning: `Pattern occurs ${pattern.occurrences} times with ${(pattern.confidence * 100).toFixed(1)}% confidence`,
          metadata: {
            patternId: pattern.id,
            commonCharacteristics: commonChars.value,
            occurrences: pattern.occurrences,
            fpRate: metrics.falsePositiveRate?.rate || 0
          }
        });
      }
    }

    return adaptations;
  }

  /**
   * Generate response strategy adaptations
   * @param {number} tenantId - Tenant ID
   * @param {Array} patterns - Response patterns
   * @param {Object} metrics - Current metrics
   */
  async generateResponseAdaptations(tenantId, patterns, metrics) {
    const adaptations = [];

    for (const pattern of patterns) {
      const effectivenessInsight = pattern.insights.find(i => i.type === 'response_effectiveness');
      
      if (effectivenessInsight && effectivenessInsight.value < 6) {
        // Get current response strategy
        const currentStrategy = await this.getCurrentResponseStrategy(tenantId, pattern.contextKey);
        
        adaptations.push({
          id: `response_strategy_${pattern.contextKey}_${Date.now()}`,
          type: this.adaptationTypes.RESPONSE_STRATEGY,
          priority: effectivenessInsight.value < 4 ? 'high' : 'medium',
          description: `Optimize response strategy for ${pattern.contextKey}`,
          context: pattern.contextKey,
          currentConfig: currentStrategy,
          proposedConfig: {
            ...currentStrategy,
            priorityAdjustment: effectivenessInsight.value < 4 ? 'increase' : 'maintain',
            additionalActions: this.suggestAdditionalActions(pattern.contextKey),
            approvalRequired: effectivenessInsight.value < 3
          },
          expectedImpact: (8 - effectivenessInsight.value) / 10 * pattern.confidence,
          reasoning: `Response effectiveness of ${effectivenessInsight.value}/10 needs improvement`,
          metadata: {
            patternId: pattern.id,
            currentEffectiveness: effectivenessInsight.value,
            targetEffectiveness: 8,
            occurrences: pattern.occurrences
          }
        });
      }
    }

    return adaptations;
  }

  /**
   * Generate performance-based adaptations
   * @param {number} tenantId - Tenant ID
   * @param {Object} metrics - Current metrics
   */
  async generatePerformanceAdaptations(tenantId, metrics) {
    const adaptations = [];

    // Check MTTI performance
    if (metrics.timing?.mtti?.averageHours > 2) {
      adaptations.push({
        id: `mtti_optimization_${Date.now()}`,
        type: this.adaptationTypes.PRIORITY_ADJUSTMENT,
        priority: metrics.timing.mtti.averageHours > 4 ? 'high' : 'medium',
        description: 'Optimize investigation prioritization to reduce MTTI',
        context: 'global',
        currentConfig: { mttiHours: metrics.timing.mtti.averageHours },
        proposedConfig: {
          priorityWeights: {
            severity: 0.4,
            confidence: 0.3,
            businessImpact: 0.3
          },
          autoInvestigationThreshold: 0.7
        },
        expectedImpact: 0.6,
        reasoning: `Current MTTI of ${metrics.timing.mtti.averageHours.toFixed(1)} hours exceeds target`,
        metadata: {
          currentMTTI: metrics.timing.mtti.averageHours,
          targetMTTI: 2,
          sampleSize: metrics.timing.mtti.sampleSize
        }
      });
    }

    // Check false positive rate
    if (metrics.falsePositiveRate?.rate > 0.2) {
      adaptations.push({
        id: `fp_reduction_${Date.now()}`,
        type: this.adaptationTypes.DETECTION_TUNING,
        priority: metrics.falsePositiveRate.rate > 0.3 ? 'critical' : 'high',
        description: 'Implement global false positive reduction measures',
        context: 'global',
        currentConfig: { fpRate: metrics.falsePositiveRate.rate },
        proposedConfig: {
          globalThresholdAdjustment: 0.9, // Increase thresholds by 10%
          enableAdaptiveSuppression: true,
          requireHigherConfidence: true
        },
        expectedImpact: 0.8,
        reasoning: `False positive rate of ${(metrics.falsePositiveRate.rate * 100).toFixed(1)}% exceeds acceptable threshold`,
        metadata: {
          currentFPRate: metrics.falsePositiveRate.rate,
          targetFPRate: 0.15,
          totalAlerts: metrics.falsePositiveRate.totalAlerts
        }
      });
    }

    return adaptations;
  }

  /**
   * Apply an adaptation to the system
   * @param {number} tenantId - Tenant ID
   * @param {Object} adaptation - Adaptation to apply
   */
  async applyAdaptation(tenantId, adaptation) {
    try {
      switch (adaptation.type) {
        case this.adaptationTypes.VERDICT_THRESHOLD:
          await this.applyVerdictThresholdAdaptation(tenantId, adaptation);
          break;
        
        case this.adaptationTypes.INVESTIGATION_STRATEGY:
          await this.applyInvestigationStrategyAdaptation(tenantId, adaptation);
          break;
        
        case this.adaptationTypes.DETECTION_TUNING:
          await this.applyDetectionTuningAdaptation(tenantId, adaptation);
          break;
        
        case this.adaptationTypes.RESPONSE_STRATEGY:
          await this.applyResponseStrategyAdaptation(tenantId, adaptation);
          break;
        
        case this.adaptationTypes.PRIORITY_ADJUSTMENT:
          await this.applyPriorityAdjustmentAdaptation(tenantId, adaptation);
          break;
        
        default:
          console.warn(`Unknown adaptation type: ${adaptation.type}`);
      }

      // Mark adaptation as applied
      adaptation.applied = true;
      adaptation.appliedAt = new Date();
      
    } catch (error) {
      console.error(`Error applying adaptation ${adaptation.id}:`, error);
      adaptation.applied = false;
      adaptation.error = error.message;
      throw error;
    }
  }

  /**
   * Apply verdict threshold adaptation
   * @param {number} tenantId - Tenant ID
   * @param {Object} adaptation - Adaptation configuration
   */
  async applyVerdictThresholdAdaptation(tenantId, adaptation) {
    // Store new thresholds in tenant settings
    await pool.query(`
      INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
      VALUES ($1, 'verdict_thresholds', $2, CURRENT_TIMESTAMP)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `, [tenantId, JSON.stringify(adaptation.proposedConfig)]);
  }

  /**
   * Apply investigation strategy adaptation
   * @param {number} tenantId - Tenant ID
   * @param {Object} adaptation - Adaptation configuration
   */
  async applyInvestigationStrategyAdaptation(tenantId, adaptation) {
    // Store new strategy in tenant settings
    await pool.query(`
      INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `, [
      tenantId, 
      `investigation_strategy_${adaptation.context}`, 
      JSON.stringify(adaptation.proposedConfig)
    ]);
  }

  /**
   * Apply detection tuning adaptation
   * @param {number} tenantId - Tenant ID
   * @param {Object} adaptation - Adaptation configuration
   */
  async applyDetectionTuningAdaptation(tenantId, adaptation) {
    // Create suppression rules if specified
    if (adaptation.proposedConfig.suppressionRules) {
      for (const rule of adaptation.proposedConfig.suppressionRules) {
        await pool.query(`
          INSERT INTO suppression_rules (tenant_id, scope, condition, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `, [tenantId, adaptation.context, JSON.stringify(rule.condition)]);
      }
    }

    // Store threshold adjustments
    if (adaptation.proposedConfig.thresholdAdjustments) {
      await pool.query(`
        INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
        VALUES ($1, 'detection_thresholds', $2, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      `, [tenantId, JSON.stringify(adaptation.proposedConfig.thresholdAdjustments)]);
    }
  }

  /**
   * Apply response strategy adaptation
   * @param {number} tenantId - Tenant ID
   * @param {Object} adaptation - Adaptation configuration
   */
  async applyResponseStrategyAdaptation(tenantId, adaptation) {
    // Store new response strategy
    await pool.query(`
      INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `, [
      tenantId, 
      `response_strategy_${adaptation.context}`, 
      JSON.stringify(adaptation.proposedConfig)
    ]);
  }

  /**
   * Apply priority adjustment adaptation
   * @param {number} tenantId - Tenant ID
   * @param {Object} adaptation - Adaptation configuration
   */
  async applyPriorityAdjustmentAdaptation(tenantId, adaptation) {
    // Store new priority configuration
    await pool.query(`
      INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
      VALUES ($1, 'priority_config', $2, CURRENT_TIMESTAMP)
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `, [tenantId, JSON.stringify(adaptation.proposedConfig)]);
  }

  /**
   * Store adaptation history
   * @param {number} tenantId - Tenant ID
   * @param {Array} adaptations - Applied adaptations
   * @param {boolean} dryRun - Whether this was a dry run
   */
  async storeAdaptationHistory(tenantId, adaptations, dryRun) {
    try {
      for (const adaptation of adaptations) {
        await pool.query(`
          INSERT INTO strategy_adaptations 
          (tenant_id, adaptation_id, type, priority, description, context, 
           current_config, proposed_config, expected_impact, reasoning, 
           metadata, applied, dry_run, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        `, [
          tenantId,
          adaptation.id,
          adaptation.type,
          adaptation.priority,
          adaptation.description,
          adaptation.context,
          JSON.stringify(adaptation.currentConfig),
          JSON.stringify(adaptation.proposedConfig),
          adaptation.expectedImpact,
          adaptation.reasoning,
          JSON.stringify(adaptation.metadata),
          adaptation.applied || false,
          dryRun
        ]);
      }
    } catch (error) {
      console.error('Error storing adaptation history:', error);
      throw error;
    }
  }

  // Helper methods for getting current configurations
  async getCurrentVerdictThresholds(tenantId) {
    const result = await pool.query(`
      SELECT value FROM tenant_settings 
      WHERE tenant_id = $1 AND key = 'verdict_thresholds'
    `, [tenantId]);
    
    return result.rows[0] ? JSON.parse(result.rows[0].value) : {
      default: {
        truePositiveThreshold: 0.7,
        falsePositiveThreshold: 0.3,
        requiresReviewThreshold: 0.5
      }
    };
  }

  async getCurrentInvestigationStrategy(tenantId, context) {
    const result = await pool.query(`
      SELECT value FROM tenant_settings 
      WHERE tenant_id = $1 AND key = $2
    `, [tenantId, `investigation_strategy_${context}`]);
    
    return result.rows[0] ? JSON.parse(result.rows[0].value) : {
      steps: ['initial_analysis', 'evidence_collection', 'correlation', 'verdict'],
      parallelExecution: true,
      timeoutMinutes: 30
    };
  }

  async getCurrentResponseStrategy(tenantId, context) {
    const result = await pool.query(`
      SELECT value FROM tenant_settings 
      WHERE tenant_id = $1 AND key = $2
    `, [tenantId, `response_strategy_${context}`]);
    
    return result.rows[0] ? JSON.parse(result.rows[0].value) : {
      autoResponse: false,
      approvalRequired: true,
      escalationThreshold: 'high'
    };
  }

  async generateImprovedStrategy(tenantId, context, currentStrategy) {
    // This would typically use ML or rule-based optimization
    // For now, return a basic improved strategy
    return {
      ...currentStrategy,
      steps: [...currentStrategy.steps, 'enhanced_correlation'],
      parallelExecution: true,
      timeoutMinutes: Math.max(15, currentStrategy.timeoutMinutes - 5),
      adaptiveTimeout: true
    };
  }

  suggestAdditionalActions(context) {
    const [category] = context.split('_');
    
    const actionMap = {
      malware: ['isolate_host', 'scan_network', 'update_signatures'],
      phishing: ['block_sender', 'warn_users', 'update_filters'],
      intrusion: ['block_ip', 'review_logs', 'patch_systems'],
      default: ['investigate_further', 'monitor_closely']
    };
    
    return actionMap[category] || actionMap.default;
  }
}

module.exports = StrategyAdapter;