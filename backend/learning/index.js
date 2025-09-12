const FeedbackProcessor = require('./feedback-processor');
const PatternRecognition = require('./pattern-recognition');
const PerformanceMetrics = require('./performance-metrics');
const StrategyAdapter = require('./strategy-adapter');

/**
 * Main Learning and Adaptation system coordinator
 * Implements Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
class LearningSystem {
  constructor() {
    this.feedbackProcessor = new FeedbackProcessor();
    this.patternRecognition = new PatternRecognition();
    this.performanceMetrics = new PerformanceMetrics();
    this.strategyAdapter = new StrategyAdapter();
  }

  /**
   * Process feedback and trigger learning pipeline
   * @param {string} investigationId - Investigation ID
   * @param {number} userId - User providing feedback
   * @param {string} feedbackType - Type of feedback
   * @param {Object} content - Feedback content
   * @param {number} tenantId - Tenant ID for isolation
   */
  async processFeedback(investigationId, userId, feedbackType, content, tenantId) {
    try {
      // Collect and process feedback
      const feedback = await this.feedbackProcessor.collectFeedback(
        investigationId, userId, feedbackType, content, tenantId
      );

      // Trigger pattern analysis if enough feedback accumulated
      const shouldAnalyze = await this.shouldTriggerAnalysis(tenantId);
      if (shouldAnalyze) {
        await this.runLearningPipeline(tenantId);
      }

      return feedback;
    } catch (error) {
      console.error('Error in learning system feedback processing:', error);
      throw error;
    }
  }

  /**
   * Run the complete learning pipeline for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Pipeline options
   */
  async runLearningPipeline(tenantId, options = {}) {
    try {
      const {
        analysisWindow = 30,
        dryRun = false,
        forceRun = false
      } = options;

      console.log(`Running learning pipeline for tenant ${tenantId}`);

      // Step 1: Calculate current performance metrics
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - analysisWindow);

      const metrics = await this.performanceMetrics.calculateMetrics(
        tenantId, startDate, endDate
      );

      // Step 2: Analyze patterns from feedback
      const patterns = await this.patternRecognition.analyzePatterns(tenantId, {
        timeWindow: analysisWindow,
        minOccurrences: 2,
        confidenceThreshold: 0.5
      });

      // Step 3: Generate and apply strategy adaptations
      const adaptationResult = await this.strategyAdapter.adaptStrategies(tenantId, {
        analysisWindow,
        minPatternConfidence: 0.6,
        dryRun
      });

      // Step 4: Update learning metadata
      await this.updateLearningMetadata(tenantId, {
        lastRun: new Date(),
        metricsCalculated: metrics,
        patternsFound: patterns.length,
        adaptationsGenerated: adaptationResult.adaptations.length,
        adaptationsApplied: adaptationResult.adaptations.filter(a => a.applied).length
      });

      return {
        success: true,
        tenantId,
        analysisWindow,
        metrics,
        patterns: patterns.length,
        adaptations: adaptationResult.adaptations.length,
        applied: adaptationResult.adaptations.filter(a => a.applied).length,
        dryRun
      };
    } catch (error) {
      console.error('Error in learning pipeline:', error);
      throw error;
    }
  }

  /**
   * Get learning system status for a tenant
   * @param {number} tenantId - Tenant ID
   */
  async getLearningStatus(tenantId) {
    try {
      // Get recent feedback count
      const feedbackResult = await this.feedbackProcessor.getFeedbackStatistics(
        tenantId, 
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        new Date()
      );

      // Get performance summary
      const performanceSummary = await this.performanceMetrics.getPerformanceSummary(tenantId);

      // Get pattern summary
      const patternSummary = await this.patternRecognition.getPatternSummary(tenantId, 30);

      // Get recent adaptations
      const adaptationHistory = await this.getRecentAdaptations(tenantId, 10);

      // Get learning metadata
      const learningMetadata = await this.getLearningMetadata(tenantId);

      return {
        tenantId,
        feedback: {
          total: feedbackResult.reduce((sum, f) => sum + parseInt(f.count), 0),
          byType: feedbackResult
        },
        performance: performanceSummary,
        patterns: patternSummary,
        adaptations: {
          recent: adaptationHistory,
          total: adaptationHistory.length
        },
        lastLearningRun: learningMetadata?.lastRun,
        learningEnabled: true,
        status: 'active'
      };
    } catch (error) {
      console.error('Error getting learning status:', error);
      throw error;
    }
  }

  /**
   * Check if learning analysis should be triggered
   * @param {number} tenantId - Tenant ID
   */
  async shouldTriggerAnalysis(tenantId) {
    try {
      // Get learning metadata
      const metadata = await this.getLearningMetadata(tenantId);
      
      // Check if enough time has passed since last run
      const lastRun = metadata?.lastRun ? new Date(metadata.lastRun) : null;
      const hoursSinceLastRun = lastRun ? 
        (Date.now() - lastRun.getTime()) / (1000 * 60 * 60) : Infinity;

      // Trigger if more than 24 hours since last run
      if (hoursSinceLastRun >= 24) {
        return true;
      }

      // Check if enough new feedback has been collected
      const recentFeedbackCount = await this.getRecentFeedbackCount(tenantId, lastRun);
      
      // Trigger if more than 10 new feedback items
      return recentFeedbackCount >= 10;
    } catch (error) {
      console.error('Error checking if analysis should be triggered:', error);
      return false;
    }
  }

  /**
   * Get recent feedback count since last run
   * @param {number} tenantId - Tenant ID
   * @param {Date} since - Date to count from
   */
  async getRecentFeedbackCount(tenantId, since) {
    try {
      const { pool } = require('../database');
      
      const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM investigation_feedback
        WHERE tenant_id = $1 AND created_at > $2
      `, [tenantId, sinceDate]);

      return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      console.error('Error getting recent feedback count:', error);
      return 0;
    }
  }

  /**
   * Update learning metadata for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} metadata - Metadata to store
   */
  async updateLearningMetadata(tenantId, metadata) {
    try {
      const { pool } = require('../database');
      
      await pool.query(`
        INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
        VALUES ($1, 'learning_metadata', $2, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      `, [tenantId, JSON.stringify(metadata)]);
    } catch (error) {
      console.error('Error updating learning metadata:', error);
      throw error;
    }
  }

  /**
   * Get learning metadata for tenant
   * @param {number} tenantId - Tenant ID
   */
  async getLearningMetadata(tenantId) {
    try {
      const { pool } = require('../database');
      
      const result = await pool.query(`
        SELECT value FROM tenant_settings
        WHERE tenant_id = $1 AND key = 'learning_metadata'
      `, [tenantId]);

      return result.rows[0] ? JSON.parse(result.rows[0].value) : null;
    } catch (error) {
      console.error('Error getting learning metadata:', error);
      return null;
    }
  }

  /**
   * Get recent adaptations for tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} limit - Number of adaptations to return
   */
  async getRecentAdaptations(tenantId, limit = 10) {
    try {
      const { pool } = require('../database');
      
      const result = await pool.query(`
        SELECT 
          adaptation_id,
          type,
          priority,
          description,
          context,
          applied,
          dry_run,
          created_at
        FROM strategy_adaptations
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [tenantId, limit]);

      return result.rows;
    } catch (error) {
      console.error('Error getting recent adaptations:', error);
      return [];
    }
  }

  /**
   * Run learning pipeline for all tenants (scheduled job)
   */
  async runScheduledLearning() {
    try {
      const { pool } = require('../database');
      
      // Get all active tenants
      const tenantsResult = await pool.query(`
        SELECT DISTINCT tenant_id 
        FROM investigation_feedback 
        WHERE created_at > NOW() - INTERVAL '7 days'
      `);

      const results = [];
      
      for (const row of tenantsResult.rows) {
        const tenantId = row.tenant_id;
        
        try {
          const shouldRun = await this.shouldTriggerAnalysis(tenantId);
          
          if (shouldRun) {
            console.log(`Running scheduled learning for tenant ${tenantId}`);
            const result = await this.runLearningPipeline(tenantId);
            results.push(result);
          }
        } catch (error) {
          console.error(`Error in scheduled learning for tenant ${tenantId}:`, error);
          results.push({
            success: false,
            tenantId,
            error: error.message
          });
        }
      }

      return {
        totalTenants: tenantsResult.rows.length,
        processed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      console.error('Error in scheduled learning:', error);
      throw error;
    }
  }

  /**
   * Get learning insights for tenant dashboard
   * @param {number} tenantId - Tenant ID
   * @param {number} days - Number of days to analyze
   */
  async getLearningInsights(tenantId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get performance trends
      const trends = await this.performanceMetrics.getPerformanceTrends(tenantId, days);

      // Get top patterns
      const patterns = await this.patternRecognition.analyzePatterns(tenantId, {
        timeWindow: days,
        confidenceThreshold: 0.6
      });

      const topPatterns = patterns
        .sort((a, b) => (b.confidence * b.impact) - (a.confidence * a.impact))
        .slice(0, 5);

      // Get recent adaptations impact
      const recentAdaptations = await this.getRecentAdaptations(tenantId, 5);

      return {
        tenantId,
        period: `${days} days`,
        trends,
        topPatterns: topPatterns.map(p => ({
          type: p.type,
          context: p.contextKey,
          confidence: p.confidence,
          impact: p.impact,
          occurrences: p.occurrences,
          trend: p.trend,
          recommendations: p.recommendations?.slice(0, 2) || []
        })),
        recentAdaptations: recentAdaptations.map(a => ({
          type: a.type,
          description: a.description,
          applied: a.applied,
          createdAt: a.created_at
        })),
        summary: {
          patternsIdentified: patterns.length,
          adaptationsApplied: recentAdaptations.filter(a => a.applied).length,
          learningActive: true
        }
      };
    } catch (error) {
      console.error('Error getting learning insights:', error);
      throw error;
    }
  }
}

module.exports = {
  LearningSystem,
  FeedbackProcessor,
  PatternRecognition,
  PerformanceMetrics,
  StrategyAdapter
};