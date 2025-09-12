const { LearningSystem } = require('./index');

/**
 * Example usage of the Learning and Adaptation System
 * This demonstrates how to integrate the learning system with the investigation engine
 */

async function exampleUsage() {
  const learningSystem = new LearningSystem();
  
  console.log('=== Learning and Adaptation System Example ===\n');

  try {
    // Example 1: Process analyst feedback on investigation verdict
    console.log('1. Processing verdict correction feedback...');
    const verdictFeedback = await learningSystem.processFeedback(
      'inv-12345',
      1, // userId
      'verdict_correction',
      {
        originalVerdict: 'true_positive',
        correctVerdict: 'false_positive',
        reasoning: 'This was a legitimate admin action, not malicious activity',
        confidence: 0.9
      },
      1 // tenantId
    );
    console.log('Verdict feedback processed:', verdictFeedback.id);

    // Example 2: Process investigation quality feedback
    console.log('\n2. Processing investigation quality feedback...');
    const qualityFeedback = await learningSystem.processFeedback(
      'inv-12346',
      1,
      'investigation_quality',
      {
        steps: ['initial_analysis', 'evidence_collection', 'correlation'],
        effectiveness: 7,
        suggestions: ['Add more context from user behavior analytics'],
        duration: 1800 // 30 minutes
      },
      1
    );
    console.log('Quality feedback processed:', qualityFeedback.id);

    // Example 3: Process false positive feedback
    console.log('\n3. Processing false positive feedback...');
    const fpFeedback = await learningSystem.processFeedback(
      'inv-12347',
      1,
      'false_positive',
      {
        characteristics: {
          timeOfDay: 'business_hours',
          userRole: 'admin',
          actionType: 'bulk_operation'
        },
        rootCause: 'Legitimate bulk admin operation during business hours'
      },
      1
    );
    console.log('False positive feedback processed:', fpFeedback.id);

    // Example 4: Run learning pipeline manually
    console.log('\n4. Running learning pipeline...');
    const pipelineResult = await learningSystem.runLearningPipeline(1, {
      analysisWindow: 7, // Last 7 days
      dryRun: false
    });
    console.log('Learning pipeline result:', {
      success: pipelineResult.success,
      patterns: pipelineResult.patterns,
      adaptations: pipelineResult.adaptations,
      applied: pipelineResult.applied
    });

    // Example 5: Get learning status
    console.log('\n5. Getting learning system status...');
    const status = await learningSystem.getLearningStatus(1);
    console.log('Learning status:', {
      totalFeedback: status.feedback.total,
      accuracy: status.performance.accuracy,
      totalPatterns: status.patterns.totalPatterns,
      recentAdaptations: status.adaptations.total
    });

    // Example 6: Get learning insights for dashboard
    console.log('\n6. Getting learning insights...');
    const insights = await learningSystem.getLearningInsights(1, 30);
    console.log('Learning insights:', {
      trends: insights.trends,
      topPatterns: insights.topPatterns.length,
      recentAdaptations: insights.recentAdaptations.length,
      summary: insights.summary
    });

  } catch (error) {
    console.error('Error in learning system example:', error.message);
  }
}

// Integration with Investigation Orchestrator
class InvestigationWithLearning {
  constructor() {
    this.learningSystem = new LearningSystem();
  }

  /**
   * Complete an investigation and collect feedback
   */
  async completeInvestigation(investigationId, verdict, evidence, tenantId) {
    try {
      // Complete the investigation (existing logic)
      console.log(`Completing investigation ${investigationId} with verdict: ${verdict.classification}`);

      // Automatically collect system feedback based on investigation outcome
      if (verdict.confidence < 0.6) {
        // Low confidence - collect feedback for improvement
        await this.learningSystem.processFeedback(
          investigationId,
          null, // System feedback, no specific user
          'investigation_quality',
          {
            effectiveness: Math.round(verdict.confidence * 10),
            suggestions: ['Improve evidence correlation', 'Add more data sources'],
            duration: evidence.investigationDuration || 0
          },
          tenantId
        );
      }

      // Check if this matches known false positive patterns
      const fpPatterns = await this.checkFalsePositivePatterns(evidence, tenantId);
      if (fpPatterns.length > 0) {
        console.log(`Investigation matches ${fpPatterns.length} known FP patterns`);
      }

      return {
        investigationId,
        verdict,
        learningTriggered: verdict.confidence < 0.6,
        fpPatternsMatched: fpPatterns.length
      };

    } catch (error) {
      console.error('Error completing investigation with learning:', error);
      throw error;
    }
  }

  /**
   * Check if evidence matches known false positive patterns
   */
  async checkFalsePositivePatterns(evidence, tenantId) {
    try {
      // This would integrate with the pattern recognition system
      // to check if current evidence matches known FP patterns
      const patterns = await this.learningSystem.patternRecognition.analyzePatterns(tenantId, {
        patternType: 'false_positive_pattern',
        timeWindow: 90
      });

      return patterns.filter(pattern => {
        // Simple pattern matching logic
        const patternChars = pattern.insights.find(i => i.type === 'common_characteristics');
        if (!patternChars) return false;

        // Check if evidence matches pattern characteristics
        return this.matchesCharacteristics(evidence, patternChars.value);
      });

    } catch (error) {
      console.error('Error checking FP patterns:', error);
      return [];
    }
  }

  /**
   * Simple characteristic matching
   */
  matchesCharacteristics(evidence, characteristics) {
    // Simple implementation - in practice this would be more sophisticated
    if (!evidence.entities || !characteristics) return false;

    // Check for common patterns like admin users, business hours, etc.
    const matches = [];
    
    if (characteristics.userRole === 'admin' && evidence.entities.users) {
      matches.push('admin_user');
    }
    
    if (characteristics.timeOfDay === 'business_hours') {
      const hour = new Date().getHours();
      if (hour >= 9 && hour <= 17) {
        matches.push('business_hours');
      }
    }

    return matches.length >= 2; // Require at least 2 matching characteristics
  }

  /**
   * Process analyst feedback on completed investigation
   */
  async processAnalystFeedback(investigationId, userId, feedbackType, content, tenantId) {
    return await this.learningSystem.processFeedback(
      investigationId,
      userId,
      feedbackType,
      content,
      tenantId
    );
  }
}

// Export for use in other modules
module.exports = {
  exampleUsage,
  InvestigationWithLearning
};

// Run example if this file is executed directly
if (require.main === module) {
  exampleUsage().catch(console.error);
}