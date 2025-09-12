const { pool } = require('../database');

/**
 * FeedbackProcessor service for collecting and processing analyst feedback
 * Implements Requirements 5.1, 5.2, 5.5
 */
class FeedbackProcessor {
  constructor() {
    this.feedbackTypes = {
      VERDICT_CORRECTION: 'verdict_correction',
      INVESTIGATION_QUALITY: 'investigation_quality', 
      RESPONSE_EFFECTIVENESS: 'response_effectiveness',
      FALSE_POSITIVE: 'false_positive',
      MISSED_DETECTION: 'missed_detection',
      STRATEGY_SUGGESTION: 'strategy_suggestion'
    };
  }

  /**
   * Collect feedback from analyst on investigation outcome
   * @param {string} investigationId - Investigation ID
   * @param {number} userId - User providing feedback
   * @param {string} feedbackType - Type of feedback
   * @param {Object} content - Feedback content
   * @param {number} tenantId - Tenant ID for isolation
   */
  async collectFeedback(investigationId, userId, feedbackType, content, tenantId) {
    try {
      // Validate feedback type
      if (!Object.values(this.feedbackTypes).includes(feedbackType)) {
        throw new Error(`Invalid feedback type: ${feedbackType}`);
      }

      // Store feedback in database
      const result = await pool.query(`
        INSERT INTO investigation_feedback 
        (investigation_id, user_id, tenant_id, feedback_type, content, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING id, created_at
      `, [investigationId, userId, tenantId, feedbackType, JSON.stringify(content)]);

      const feedbackId = result.rows[0].id;

      // Process feedback immediately for learning
      await this.processFeedback(feedbackId, tenantId);

      return {
        id: feedbackId,
        investigationId,
        feedbackType,
        createdAt: result.rows[0].created_at
      };
    } catch (error) {
      console.error('Error collecting feedback:', error);
      throw error;
    }
  }

  /**
   * Process feedback to extract learning patterns
   * @param {number} feedbackId - Feedback record ID
   * @param {number} tenantId - Tenant ID for isolation
   */
  async processFeedback(feedbackId, tenantId) {
    try {
      // Get feedback details with investigation context
      const feedbackResult = await pool.query(`
        SELECT 
          f.*,
          i.status as investigation_status,
          i.context as investigation_context,
          i.alert_id,
          a.severity,
          a.category,
          a.entities,
          a.fingerprint
        FROM investigation_feedback f
        JOIN investigations i ON f.investigation_id = i.id
        LEFT JOIN alerts a ON i.alert_id = a.id
        WHERE f.id = $1 AND f.tenant_id = $2
      `, [feedbackId, tenantId]);

      if (feedbackResult.rows.length === 0) {
        throw new Error(`Feedback ${feedbackId} not found for tenant ${tenantId}`);
      }

      const feedback = feedbackResult.rows[0];
      const content = JSON.parse(feedback.content);

      // Extract learning patterns based on feedback type
      const patterns = await this.extractLearningPatterns(feedback, content);

      // Store learning patterns
      for (const pattern of patterns) {
        await this.storeLearningPattern(pattern, tenantId);
      }

      // Update performance metrics
      await this.updatePerformanceMetrics(feedback, content, tenantId);

    } catch (error) {
      console.error('Error processing feedback:', error);
      throw error;
    }
  }

  /**
   * Extract learning patterns from feedback
   * @param {Object} feedback - Feedback record with investigation context
   * @param {Object} content - Feedback content
   */
  async extractLearningPatterns(feedback, content) {
    const patterns = [];

    switch (feedback.feedback_type) {
      case this.feedbackTypes.VERDICT_CORRECTION:
        patterns.push({
          type: 'verdict_accuracy',
          context: {
            alertCategory: feedback.category,
            severity: feedback.severity,
            entities: feedback.entities,
            originalVerdict: content.originalVerdict,
            correctVerdict: content.correctVerdict,
            reasoning: content.reasoning
          },
          impact: content.confidence || 0.5,
          metadata: {
            investigationId: feedback.investigation_id,
            alertFingerprint: feedback.fingerprint
          }
        });
        break;

      case this.feedbackTypes.INVESTIGATION_QUALITY:
        patterns.push({
          type: 'investigation_strategy',
          context: {
            alertCategory: feedback.category,
            severity: feedback.severity,
            investigationSteps: content.steps,
            effectiveness: content.effectiveness,
            suggestions: content.suggestions
          },
          impact: content.effectiveness / 10, // Normalize 1-10 scale to 0-1
          metadata: {
            investigationId: feedback.investigation_id,
            duration: content.duration
          }
        });
        break;

      case this.feedbackTypes.RESPONSE_EFFECTIVENESS:
        patterns.push({
          type: 'response_strategy',
          context: {
            alertCategory: feedback.category,
            severity: feedback.severity,
            recommendedActions: content.recommendedActions,
            actualActions: content.actualActions,
            effectiveness: content.effectiveness,
            businessImpact: content.businessImpact
          },
          impact: content.effectiveness / 10,
          metadata: {
            investigationId: feedback.investigation_id,
            responseTime: content.responseTime
          }
        });
        break;

      case this.feedbackTypes.FALSE_POSITIVE:
        patterns.push({
          type: 'false_positive_pattern',
          context: {
            alertCategory: feedback.category,
            entities: feedback.entities,
            commonCharacteristics: content.characteristics,
            rootCause: content.rootCause
          },
          impact: 1.0, // High impact for FP reduction
          metadata: {
            investigationId: feedback.investigation_id,
            alertFingerprint: feedback.fingerprint
          }
        });
        break;

      case this.feedbackTypes.STRATEGY_SUGGESTION:
        patterns.push({
          type: 'strategy_improvement',
          context: {
            alertCategory: feedback.category,
            currentStrategy: content.currentStrategy,
            suggestedStrategy: content.suggestedStrategy,
            expectedImprovement: content.expectedImprovement
          },
          impact: content.confidence || 0.5,
          metadata: {
            investigationId: feedback.investigation_id,
            analystExperience: content.analystExperience
          }
        });
        break;
    }

    return patterns;
  }

  /**
   * Store learning pattern in database
   * @param {Object} pattern - Learning pattern to store
   * @param {number} tenantId - Tenant ID for isolation
   */
  async storeLearningPattern(pattern, tenantId) {
    try {
      await pool.query(`
        INSERT INTO learning_patterns 
        (tenant_id, pattern_type, context, impact_score, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        tenantId,
        pattern.type,
        JSON.stringify(pattern.context),
        pattern.impact,
        JSON.stringify(pattern.metadata)
      ]);
    } catch (error) {
      console.error('Error storing learning pattern:', error);
      throw error;
    }
  }

  /**
   * Update performance metrics based on feedback
   * @param {Object} feedback - Feedback record
   * @param {Object} content - Feedback content
   * @param {number} tenantId - Tenant ID
   */
  async updatePerformanceMetrics(feedback, content, tenantId) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get or create today's metrics
      let metricsResult = await pool.query(`
        SELECT * FROM performance_metrics 
        WHERE tenant_id = $1 AND date = $2
      `, [tenantId, today]);

      let metrics;
      if (metricsResult.rows.length === 0) {
        // Create new metrics record
        const insertResult = await pool.query(`
          INSERT INTO performance_metrics 
          (tenant_id, date, total_investigations, correct_verdicts, false_positives, 
           avg_investigation_time, avg_response_time, created_at)
          VALUES ($1, $2, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP)
          RETURNING *
        `, [tenantId, today]);
        metrics = insertResult.rows[0];
      } else {
        metrics = metricsResult.rows[0];
      }

      // Update metrics based on feedback type
      const updates = {};
      
      if (feedback.feedback_type === this.feedbackTypes.VERDICT_CORRECTION) {
        if (content.correctVerdict === content.originalVerdict) {
          updates.correct_verdicts = ((metrics && metrics.correct_verdicts) || 0) + 1;
        }
        if (content.correctVerdict === 'false_positive') {
          updates.false_positives = ((metrics && metrics.false_positives) || 0) + 1;
        }
      }

      if (feedback.feedback_type === this.feedbackTypes.INVESTIGATION_QUALITY && content.duration) {
        const currentAvg = (metrics && metrics.avg_investigation_time) || 0;
        const currentTotal = (metrics && metrics.total_investigations) || 0;
        const newAvg = (currentAvg * currentTotal + content.duration) / (currentTotal + 1);
        updates.avg_investigation_time = newAvg;
      }

      if (feedback.feedback_type === this.feedbackTypes.RESPONSE_EFFECTIVENESS && content.responseTime) {
        const currentAvg = (metrics && metrics.avg_response_time) || 0;
        const currentTotal = (metrics && metrics.total_investigations) || 0;
        const newAvg = (currentAvg * currentTotal + content.responseTime) / (currentTotal + 1);
        updates.avg_response_time = newAvg;
      }

      updates.total_investigations = ((metrics && metrics.total_investigations) || 0) + 1;
      updates.updated_at = 'CURRENT_TIMESTAMP';

      // Build update query
      const updateFields = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 3}`
      ).join(', ');

      if (updateFields) {
        await pool.query(`
          UPDATE performance_metrics 
          SET ${updateFields}
          WHERE tenant_id = $1 AND date = $2
        `, [tenantId, today, ...Object.values(updates)]);
      }

    } catch (error) {
      console.error('Error updating performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get feedback summary for investigation
   * @param {string} investigationId - Investigation ID
   * @param {number} tenantId - Tenant ID
   */
  async getFeedbackSummary(investigationId, tenantId) {
    try {
      const result = await pool.query(`
        SELECT 
          feedback_type,
          content,
          created_at,
          u.email as analyst_email
        FROM investigation_feedback f
        LEFT JOIN users u ON f.user_id = u.id
        WHERE f.investigation_id = $1 AND f.tenant_id = $2
        ORDER BY f.created_at DESC
      `, [investigationId, tenantId]);

      return result.rows.map(row => ({
        feedbackType: row.feedback_type,
        content: JSON.parse(row.content),
        createdAt: row.created_at,
        analystEmail: row.analyst_email
      }));
    } catch (error) {
      console.error('Error getting feedback summary:', error);
      throw error;
    }
  }

  /**
   * Get feedback statistics for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Date} startDate - Start date for statistics
   * @param {Date} endDate - End date for statistics
   */
  async getFeedbackStatistics(tenantId, startDate, endDate) {
    try {
      const result = await pool.query(`
        SELECT 
          feedback_type,
          COUNT(*) as count,
          AVG(CASE 
            WHEN content->>'effectiveness' IS NOT NULL 
            THEN (content->>'effectiveness')::float 
            ELSE NULL 
          END) as avg_effectiveness
        FROM investigation_feedback
        WHERE tenant_id = $1 
          AND created_at >= $2 
          AND created_at <= $3
        GROUP BY feedback_type
        ORDER BY count DESC
      `, [tenantId, startDate, endDate]);

      return result.rows;
    } catch (error) {
      console.error('Error getting feedback statistics:', error);
      throw error;
    }
  }
}

module.exports = FeedbackProcessor;