const { pool } = require('../database');

/**
 * PerformanceMetrics service for tracking investigation performance
 * Implements Requirements 5.3, 5.6
 */
class PerformanceMetrics {
  constructor() {
    this.metricTypes = {
      ACCURACY: 'accuracy',
      MTTI: 'mtti', // Mean Time To Investigation
      MTTR: 'mttr', // Mean Time To Response
      FALSE_POSITIVE_RATE: 'false_positive_rate',
      INVESTIGATION_QUALITY: 'investigation_quality',
      RESPONSE_EFFECTIVENESS: 'response_effectiveness'
    };
  }

  /**
   * Calculate and update performance metrics for a tenant
   * @param {number} tenantId - Tenant ID for isolation
   * @param {Date} startDate - Start date for calculation
   * @param {Date} endDate - End date for calculation
   */
  async calculateMetrics(tenantId, startDate, endDate) {
    try {
      const metrics = {};

      // Calculate accuracy metrics
      metrics.accuracy = await this.calculateAccuracyMetrics(tenantId, startDate, endDate);
      
      // Calculate timing metrics
      metrics.timing = await this.calculateTimingMetrics(tenantId, startDate, endDate);
      
      // Calculate quality metrics
      metrics.quality = await this.calculateQualityMetrics(tenantId, startDate, endDate);
      
      // Calculate false positive rate
      metrics.falsePositiveRate = await this.calculateFalsePositiveRate(tenantId, startDate, endDate);

      // Store aggregated metrics
      await this.storeMetrics(tenantId, metrics, endDate);

      return metrics;
    } catch (error) {
      console.error('Error calculating metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate accuracy metrics
   * @param {number} tenantId - Tenant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  async calculateAccuracyMetrics(tenantId, startDate, endDate) {
    try {
      // Get verdict corrections from feedback
      const verdictResult = await pool.query(`
        SELECT 
          f.content,
          COUNT(*) as total_feedback
        FROM investigation_feedback f
        JOIN investigations i ON f.investigation_id = i.id
        WHERE f.tenant_id = $1 
          AND f.feedback_type = 'verdict_correction'
          AND f.created_at >= $2 
          AND f.created_at <= $3
        GROUP BY f.content
      `, [tenantId, startDate, endDate]);

      let totalVerdicts = 0;
      let correctVerdicts = 0;

      for (const row of verdictResult.rows) {
        const content = JSON.parse(row.content);
        totalVerdicts += parseInt(row.total_feedback);
        
        if (content.originalVerdict === content.correctVerdict) {
          correctVerdicts += parseInt(row.total_feedback);
        }
      }

      const accuracy = totalVerdicts > 0 ? correctVerdicts / totalVerdicts : 0;

      return {
        overallAccuracy: accuracy,
        totalVerdicts,
        correctVerdicts,
        incorrectVerdicts: totalVerdicts - correctVerdicts
      };
    } catch (error) {
      console.error('Error calculating accuracy metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate timing metrics (MTTI, MTTR)
   * @param {number} tenantId - Tenant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  async calculateTimingMetrics(tenantId, startDate, endDate) {
    try {
      // Calculate MTTI (Mean Time To Investigation)
      const mttiResult = await pool.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (investigate_start - created_at))) as avg_mtti_seconds,
          COUNT(*) as investigations_started
        FROM alerts a
        WHERE a.tenant_id = $1 
          AND a.investigate_start IS NOT NULL
          AND a.created_at >= $2 
          AND a.created_at <= $3
      `, [tenantId, startDate, endDate]);

      // Calculate MTTR (Mean Time To Response)
      const mttrResult = await pool.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (resolve_time - investigate_start))) as avg_mttr_seconds,
          COUNT(*) as investigations_resolved
        FROM alerts a
        WHERE a.tenant_id = $1 
          AND a.resolve_time IS NOT NULL
          AND a.investigate_start IS NOT NULL
          AND a.created_at >= $2 
          AND a.created_at <= $3
      `, [tenantId, startDate, endDate]);

      // Calculate investigation duration from investigations table
      const durationResult = await pool.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds,
          COUNT(*) as completed_investigations
        FROM investigations i
        WHERE i.tenant_id = $1 
          AND i.completed_at IS NOT NULL
          AND i.created_at >= $2 
          AND i.created_at <= $3
      `, [tenantId, startDate, endDate]);

      return {
        mtti: {
          averageSeconds: mttiResult.rows[0]?.avg_mtti_seconds || 0,
          averageMinutes: (mttiResult.rows[0]?.avg_mtti_seconds || 0) / 60,
          averageHours: (mttiResult.rows[0]?.avg_mtti_seconds || 0) / 3600,
          sampleSize: mttiResult.rows[0]?.investigations_started || 0
        },
        mttr: {
          averageSeconds: mttrResult.rows[0]?.avg_mttr_seconds || 0,
          averageMinutes: (mttrResult.rows[0]?.avg_mttr_seconds || 0) / 60,
          averageHours: (mttrResult.rows[0]?.avg_mttr_seconds || 0) / 3600,
          sampleSize: mttrResult.rows[0]?.investigations_resolved || 0
        },
        investigationDuration: {
          averageSeconds: durationResult.rows[0]?.avg_duration_seconds || 0,
          averageMinutes: (durationResult.rows[0]?.avg_duration_seconds || 0) / 60,
          averageHours: (durationResult.rows[0]?.avg_duration_seconds || 0) / 3600,
          sampleSize: durationResult.rows[0]?.completed_investigations || 0
        }
      };
    } catch (error) {
      console.error('Error calculating timing metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate quality metrics
   * @param {number} tenantId - Tenant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  async calculateQualityMetrics(tenantId, startDate, endDate) {
    try {
      // Get investigation quality feedback
      const qualityResult = await pool.query(`
        SELECT 
          f.content,
          COUNT(*) as feedback_count
        FROM investigation_feedback f
        WHERE f.tenant_id = $1 
          AND f.feedback_type = 'investigation_quality'
          AND f.created_at >= $2 
          AND f.created_at <= $3
        GROUP BY f.content
      `, [tenantId, startDate, endDate]);

      let totalQualityRatings = 0;
      let sumQualityScores = 0;
      let effectivenessSum = 0;
      let effectivenessCount = 0;

      for (const row of qualityResult.rows) {
        const content = JSON.parse(row.content);
        const count = parseInt(row.feedback_count);
        
        if (content.effectiveness) {
          effectivenessSum += content.effectiveness * count;
          effectivenessCount += count;
        }
        
        if (content.qualityScore) {
          sumQualityScores += content.qualityScore * count;
          totalQualityRatings += count;
        }
      }

      // Get response effectiveness feedback
      const responseResult = await pool.query(`
        SELECT 
          f.content,
          COUNT(*) as feedback_count
        FROM investigation_feedback f
        WHERE f.tenant_id = $1 
          AND f.feedback_type = 'response_effectiveness'
          AND f.created_at >= $2 
          AND f.created_at <= $3
        GROUP BY f.content
      `, [tenantId, startDate, endDate]);

      let responseEffectivenessSum = 0;
      let responseEffectivenessCount = 0;

      for (const row of responseResult.rows) {
        const content = JSON.parse(row.content);
        const count = parseInt(row.feedback_count);
        
        if (content.effectiveness) {
          responseEffectivenessSum += content.effectiveness * count;
          responseEffectivenessCount += count;
        }
      }

      return {
        investigationQuality: {
          averageScore: totalQualityRatings > 0 ? sumQualityScores / totalQualityRatings : 0,
          averageEffectiveness: effectivenessCount > 0 ? effectivenessSum / effectivenessCount : 0,
          sampleSize: totalQualityRatings
        },
        responseEffectiveness: {
          averageScore: responseEffectivenessCount > 0 ? responseEffectivenessSum / responseEffectivenessCount : 0,
          sampleSize: responseEffectivenessCount
        }
      };
    } catch (error) {
      console.error('Error calculating quality metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate false positive rate
   * @param {number} tenantId - Tenant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  async calculateFalsePositiveRate(tenantId, startDate, endDate) {
    try {
      // Count total alerts and false positives
      const fpResult = await pool.query(`
        SELECT 
          COUNT(*) as total_alerts,
          COUNT(CASE WHEN feedback = 'false_positive' THEN 1 END) as false_positives,
          COUNT(CASE WHEN disposition = 'false_positive' THEN 1 END) as disposition_fps
        FROM alerts a
        WHERE a.tenant_id = $1 
          AND a.created_at >= $2 
          AND a.created_at <= $3
      `, [tenantId, startDate, endDate]);

      // Also check feedback for false positives
      const feedbackFpResult = await pool.query(`
        SELECT COUNT(*) as feedback_fps
        FROM investigation_feedback f
        JOIN investigations i ON f.investigation_id = i.id
        WHERE f.tenant_id = $1 
          AND f.feedback_type = 'false_positive'
          AND f.created_at >= $2 
          AND f.created_at <= $3
      `, [tenantId, startDate, endDate]);

      const totalAlerts = parseInt(fpResult.rows[0]?.total_alerts || 0);
      const feedbackFps = parseInt(fpResult.rows[0]?.false_positives || 0);
      const dispositionFps = parseInt(fpResult.rows[0]?.disposition_fps || 0);
      const investigationFps = parseInt(feedbackFpResult.rows[0]?.feedback_fps || 0);

      // Use the maximum count from different sources
      const totalFps = Math.max(feedbackFps, dispositionFps, investigationFps);
      const falsePositiveRate = totalAlerts > 0 ? totalFps / totalAlerts : 0;

      return {
        rate: falsePositiveRate,
        totalAlerts,
        falsePositives: totalFps,
        truePositives: totalAlerts - totalFps,
        sources: {
          feedback: feedbackFps,
          disposition: dispositionFps,
          investigation: investigationFps
        }
      };
    } catch (error) {
      console.error('Error calculating false positive rate:', error);
      throw error;
    }
  }

  /**
   * Store calculated metrics in database
   * @param {number} tenantId - Tenant ID
   * @param {Object} metrics - Calculated metrics
   * @param {Date} date - Date for the metrics
   */
  async storeMetrics(tenantId, metrics, date) {
    try {
      const dateStr = date.toISOString().split('T')[0];

      // Store in performance_metrics table
      await pool.query(`
        INSERT INTO performance_metrics 
        (tenant_id, date, accuracy, mtti_seconds, mttr_seconds, false_positive_rate, 
         investigation_quality, response_effectiveness, total_investigations, 
         correct_verdicts, false_positives, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id, date) 
        DO UPDATE SET
          accuracy = EXCLUDED.accuracy,
          mtti_seconds = EXCLUDED.mtti_seconds,
          mttr_seconds = EXCLUDED.mttr_seconds,
          false_positive_rate = EXCLUDED.false_positive_rate,
          investigation_quality = EXCLUDED.investigation_quality,
          response_effectiveness = EXCLUDED.response_effectiveness,
          total_investigations = EXCLUDED.total_investigations,
          correct_verdicts = EXCLUDED.correct_verdicts,
          false_positives = EXCLUDED.false_positives,
          updated_at = CURRENT_TIMESTAMP
      `, [
        tenantId,
        dateStr,
        metrics.accuracy?.overallAccuracy || 0,
        metrics.timing?.mtti?.averageSeconds || 0,
        metrics.timing?.mttr?.averageSeconds || 0,
        metrics.falsePositiveRate?.rate || 0,
        metrics.quality?.investigationQuality?.averageScore || 0,
        metrics.quality?.responseEffectiveness?.averageScore || 0,
        metrics.accuracy?.totalVerdicts || 0,
        metrics.accuracy?.correctVerdicts || 0,
        metrics.falsePositiveRate?.falsePositives || 0
      ]);

    } catch (error) {
      console.error('Error storing metrics:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics for a date range
   * @param {number} tenantId - Tenant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  async getMetrics(tenantId, startDate, endDate) {
    try {
      const result = await pool.query(`
        SELECT 
          date,
          accuracy,
          mtti_seconds,
          mttr_seconds,
          false_positive_rate,
          investigation_quality,
          response_effectiveness,
          total_investigations,
          correct_verdicts,
          false_positives
        FROM performance_metrics
        WHERE tenant_id = $1 
          AND date >= $2 
          AND date <= $3
        ORDER BY date ASC
      `, [tenantId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

      return result.rows.map(row => ({
        date: row.date,
        accuracy: parseFloat(row.accuracy || 0),
        mtti: {
          seconds: parseFloat(row.mtti_seconds || 0),
          minutes: parseFloat(row.mtti_seconds || 0) / 60,
          hours: parseFloat(row.mtti_seconds || 0) / 3600
        },
        mttr: {
          seconds: parseFloat(row.mttr_seconds || 0),
          minutes: parseFloat(row.mttr_seconds || 0) / 60,
          hours: parseFloat(row.mttr_seconds || 0) / 3600
        },
        falsePositiveRate: parseFloat(row.false_positive_rate || 0),
        investigationQuality: parseFloat(row.investigation_quality || 0),
        responseEffectiveness: parseFloat(row.response_effectiveness || 0),
        totalInvestigations: parseInt(row.total_investigations || 0),
        correctVerdicts: parseInt(row.correct_verdicts || 0),
        falsePositives: parseInt(row.false_positives || 0)
      }));
    } catch (error) {
      console.error('Error getting metrics:', error);
      throw error;
    }
  }

  /**
   * Get performance trends for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} days - Number of days to analyze
   */
  async getPerformanceTrends(tenantId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const metrics = await this.getMetrics(tenantId, startDate, endDate);
      
      if (metrics.length < 2) {
        return {
          accuracy: 'insufficient_data',
          mtti: 'insufficient_data',
          mttr: 'insufficient_data',
          falsePositiveRate: 'insufficient_data',
          investigationQuality: 'insufficient_data'
        };
      }

      const calculateTrend = (values) => {
        if (values.length < 2) return 'stable';
        
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        
        const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
        
        const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;
        
        if (percentChange > 5) return 'improving';
        if (percentChange < -5) return 'declining';
        return 'stable';
      };

      return {
        accuracy: calculateTrend(metrics.map(m => m.accuracy)),
        mtti: calculateTrend(metrics.map(m => m.mtti.hours)),
        mttr: calculateTrend(metrics.map(m => m.mttr.hours)),
        falsePositiveRate: calculateTrend(metrics.map(m => m.falsePositiveRate)),
        investigationQuality: calculateTrend(metrics.map(m => m.investigationQuality)),
        dataPoints: metrics.length,
        period: `${days} days`
      };
    } catch (error) {
      console.error('Error getting performance trends:', error);
      throw error;
    }
  }

  /**
   * Get performance summary for dashboard
   * @param {number} tenantId - Tenant ID
   */
  async getPerformanceSummary(tenantId) {
    try {
      // Get latest metrics
      const latestResult = await pool.query(`
        SELECT * FROM performance_metrics
        WHERE tenant_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [tenantId]);

      if (latestResult.rows.length === 0) {
        return {
          accuracy: 0,
          mtti: { hours: 0 },
          mttr: { hours: 0 },
          falsePositiveRate: 0,
          investigationQuality: 0,
          responseEffectiveness: 0,
          lastUpdated: null
        };
      }

      const latest = latestResult.rows[0];
      
      return {
        accuracy: parseFloat(latest.accuracy || 0),
        mtti: {
          seconds: parseFloat(latest.mtti_seconds || 0),
          minutes: parseFloat(latest.mtti_seconds || 0) / 60,
          hours: parseFloat(latest.mtti_seconds || 0) / 3600
        },
        mttr: {
          seconds: parseFloat(latest.mttr_seconds || 0),
          minutes: parseFloat(latest.mttr_seconds || 0) / 60,
          hours: parseFloat(latest.mttr_seconds || 0) / 3600
        },
        falsePositiveRate: parseFloat(latest.false_positive_rate || 0),
        investigationQuality: parseFloat(latest.investigation_quality || 0),
        responseEffectiveness: parseFloat(latest.response_effectiveness || 0),
        totalInvestigations: parseInt(latest.total_investigations || 0),
        lastUpdated: latest.date
      };
    } catch (error) {
      console.error('Error getting performance summary:', error);
      throw error;
    }
  }
}

module.exports = PerformanceMetrics;