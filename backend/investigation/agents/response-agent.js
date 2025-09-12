/**
 * Response Agent - Generates actionable response recommendations based on investigation findings
 * 
 * This agent implements the response phase of the investigation workflow, generating prioritized
 * recommendations for containment, remediation, and recovery actions based on analysis results.
 */

const { BaseAgent } = require('./base-agent');
const { callModel } = require('../../ai');
const { withRetry } = require('../../utils/execution');

class ResponseAgent extends BaseAgent {
  constructor(name, config = {}) {
    super(name, {
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 45000,
      maxRecommendations: 10,
      autoExecuteThreshold: 0.8,
      requireApprovalThreshold: 0.5,
      ...config
    });

    // Action risk levels and approval requirements
    this.actionRiskLevels = {
      'block_ip': 'low',
      'block_domain': 'low',
      'quarantine_file': 'low',
      'disable_account': 'medium',
      'reset_password': 'medium',
      'isolate_endpoint': 'high',
      'revoke_certificates': 'high',
      'shutdown_system': 'critical',
      'network_segmentation': 'critical'
    };

    // Actions that require approval by default
    this.approvalRequired = new Set([
      'disable_account',
      'isolate_endpoint',
      'revoke_certificates',
      'shutdown_system',
      'network_segmentation',
      'delete_files',
      'modify_firewall'
    ]);

    // Low-risk actions that can be auto-executed
    this.autoExecutable = new Set([
      'block_ip',
      'block_domain',
      'quarantine_file',
      'update_signatures'
    ]);
  }

  /**
   * Validate response input
   * @param {Object} input - Input containing verdict and investigation context
   * @returns {Object} Validation result
   */
  validate(input) {
    const errors = [];

    if (!input.verdict) {
      errors.push('Investigation verdict is required for response generation');
    }

    if (!input.investigation && !input.alert) {
      errors.push('Investigation or alert context is required');
    }

    if (input.verdict && !['true_positive', 'false_positive', 'requires_review'].includes(input.verdict.classification)) {
      errors.push('Invalid verdict classification');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute response recommendation generation
   * @param {Object} context - Investigation context
   * @param {Object} input - Response input
   * @returns {Promise<Object>} Response recommendations
   */
  async execute(context, input) {
    const startTime = Date.now();
    
    try {
      const { verdict, investigation, alert, evidence, policies } = input;
      
      // Only generate recommendations for true positives or high-confidence cases
      if (verdict.classification === 'false_positive') {
        return this._generateFalsePositiveResponse(verdict, context);
      }

      const responseContext = {
        investigationId: context.investigationId,
        tenantId: context.tenantId,
        verdict,
        investigation: investigation || {},
        alert: alert || investigation?.alert,
        evidence: evidence || [],
        policies: policies || [],
        businessContext: context.businessContext || {}
      };

      // Generate core recommendations
      const coreRecommendations = await this._generateCoreRecommendations(responseContext);

      // Prioritize recommendations
      const prioritizedRecommendations = this._prioritizeRecommendations(coreRecommendations, responseContext);

      // Validate action feasibility
      const feasibleRecommendations = await this._validateActionFeasibility(prioritizedRecommendations, responseContext);

      // Generate rollback procedures
      const recommendationsWithRollback = await this._generateRollbackProcedures(feasibleRecommendations, responseContext);

      // Determine approval requirements
      const finalRecommendations = this._determineApprovalRequirements(recommendationsWithRollback, responseContext);

      // Identify affected systems and data flows
      const impactAnalysis = this._analyzeImpact(finalRecommendations, responseContext);

      const result = {
        recommendations: finalRecommendations.slice(0, this.config.maxRecommendations),
        impactAnalysis,
        executionPlan: this._generateExecutionPlan(finalRecommendations, responseContext),
        approvalRequests: this._generateApprovalRequests(finalRecommendations, responseContext),
        metadata: {
          responseTime: Date.now() - startTime,
          agentVersion: '1.0.0',
          totalRecommendations: finalRecommendations.length,
          autoExecutableCount: finalRecommendations.filter(r => r.autoExecutable).length,
          approvalRequiredCount: finalRecommendations.filter(r => r.requiresApproval).length
        }
      };

      return result;

    } catch (error) {
      console.error(`Response Agent ${this.name} execution failed:`, error.message);
      throw error;
    }
  }

  /**
   * Generate core response recommendations using AI
   * @param {Object} context - Response context
   * @returns {Promise<Array>} Core recommendations
   */
  async _generateCoreRecommendations(context) {
    try {
      const prompt = this._buildRecommendationPrompt(context);
      
      const aiResponse = await callModel([
        {
          role: 'system',
          content: 'You are an expert incident responder. Generate specific, actionable response recommendations. Return only strict JSON with array of recommendations, each having: id, action, description, priority (critical|high|medium|low), risk (low|medium|high|critical), rationale, affectedSystems, estimatedImpact, verificationSteps.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        maxTokens: 2000,
        timeoutMs: this.config.timeoutMs
      });

      return this._parseRecommendationResponse(aiResponse);

    } catch (error) {
      console.error('Core recommendation generation failed:', error.message);
      return this._generateFallbackRecommendations(context);
    }
  }

  /**
   * Generate fallback recommendations when AI fails
   * @param {Object} context - Response context
   * @returns {Array} Fallback recommendations
   */
  _generateFallbackRecommendations(context) {
    const recommendations = [];
    const { alert, verdict } = context;

    // Basic IP blocking if source IP is present
    if (alert?.src?.ip) {
      recommendations.push({
        id: 'block_source_ip',
        action: 'block_ip',
        description: `Block source IP ${alert.src.ip}`,
        priority: 'high',
        risk: 'low',
        rationale: 'Prevent further attacks from identified source',
        affectedSystems: ['firewall', 'network'],
        estimatedImpact: 'Low - blocks single IP address',
        verificationSteps: ['Verify IP is blocked in firewall', 'Monitor for continued activity']
      });
    }

    // Account actions if user is involved
    if (alert?.principal?.user) {
      recommendations.push({
        id: 'reset_user_password',
        action: 'reset_password',
        description: `Reset password for user ${alert.principal.user}`,
        priority: 'high',
        risk: 'medium',
        rationale: 'Prevent unauthorized access with compromised credentials',
        affectedSystems: ['identity_management'],
        estimatedImpact: 'Medium - user will need to set new password',
        verificationSteps: ['Confirm password reset', 'Verify user can authenticate']
      });
    }

    // Endpoint isolation for high-risk cases
    if (verdict.riskScore >= 70 && alert?.asset?.host) {
      recommendations.push({
        id: 'isolate_endpoint',
        action: 'isolate_endpoint',
        description: `Isolate endpoint ${alert.asset.host}`,
        priority: 'critical',
        risk: 'high',
        rationale: 'Prevent lateral movement from compromised system',
        affectedSystems: ['endpoint', 'network'],
        estimatedImpact: 'High - system will be disconnected from network',
        verificationSteps: ['Confirm endpoint isolation', 'Verify no network connectivity']
      });
    }

    // Always add at least one recommendation for manual review if nothing else applies
    if (recommendations.length === 0) {
      recommendations.push({
        id: 'manual_review',
        action: 'manual_review',
        description: 'Manual security analyst review required',
        priority: 'medium',
        risk: 'low',
        rationale: 'Insufficient context for automated recommendations',
        affectedSystems: [],
        estimatedImpact: 'None - analyst review only',
        verificationSteps: ['Analyst completes investigation', 'Document findings']
      });
    }

    return recommendations;
  }

  /**
   * Prioritize recommendations based on risk, impact, and business context
   * @param {Array} recommendations - Raw recommendations
   * @param {Object} context - Response context
   * @returns {Array} Prioritized recommendations
   */
  _prioritizeRecommendations(recommendations, context) {
    const priorityWeights = {
      'critical': 4,
      'high': 3,
      'medium': 2,
      'low': 1
    };

    const riskWeights = {
      'critical': 1, // Higher risk = lower weight (more caution)
      'high': 2,
      'medium': 3,
      'low': 4
    };

    return recommendations
      .map(rec => ({
        ...rec,
        _score: this._calculateRecommendationScore(rec, context, priorityWeights, riskWeights)
      }))
      .sort((a, b) => b._score - a._score)
      .map(rec => {
        delete rec._score;
        return rec;
      });
  }

  /**
   * Calculate recommendation priority score
   * @param {Object} recommendation - Recommendation to score
   * @param {Object} context - Response context
   * @param {Object} priorityWeights - Priority weight mapping
   * @param {Object} riskWeights - Risk weight mapping
   * @returns {number} Priority score
   */
  _calculateRecommendationScore(recommendation, context, priorityWeights, riskWeights) {
    let score = 0;

    // Base score from priority
    score += priorityWeights[recommendation.priority] || 1;

    // Adjust for risk (lower risk = higher score)
    score += riskWeights[recommendation.risk] || 2;

    // Boost score for high-confidence verdicts
    if (context.verdict.confidence > 0.8) {
      score += 2;
    }

    // Boost score for high risk scores
    if (context.verdict.riskScore >= 70) {
      score += 3;
    } else if (context.verdict.riskScore >= 50) {
      score += 1;
    }

    // Consider business hours (lower impact during off-hours)
    const isBusinessHours = this._isBusinessHours();
    if (!isBusinessHours && recommendation.risk === 'high') {
      score += 1; // Slightly prefer high-impact actions during off-hours
    }

    return score;
  }

  /**
   * Validate action feasibility based on available systems and policies
   * @param {Array} recommendations - Recommendations to validate
   * @param {Object} context - Response context
   * @returns {Promise<Array>} Feasible recommendations
   */
  async _validateActionFeasibility(recommendations, context) {
    const feasibleRecommendations = [];

    for (const rec of recommendations) {
      const feasibility = await this._checkActionFeasibility(rec, context);
      
      if (feasibility.feasible) {
        feasibleRecommendations.push({
          ...rec,
          feasibilityCheck: feasibility,
          estimatedDuration: feasibility.estimatedDuration || 'Unknown'
        });
      } else {
        // Add as informational with feasibility issues noted
        feasibleRecommendations.push({
          ...rec,
          feasible: false,
          feasibilityIssues: feasibility.issues,
          priority: 'low' // Downgrade infeasible actions
        });
      }
    }

    return feasibleRecommendations;
  }

  /**
   * Check if a specific action is feasible
   * @param {Object} recommendation - Recommendation to check
   * @param {Object} context - Response context
   * @returns {Promise<Object>} Feasibility result
   */
  async _checkActionFeasibility(recommendation, context) {
    const issues = [];
    let feasible = true;
    let estimatedDuration = '5-10 minutes';

    // Check if required systems are available
    const requiredSystems = this._getRequiredSystems(recommendation.action);
    for (const system of requiredSystems) {
      if (!this._isSystemAvailable(system, context)) {
        issues.push(`Required system not available: ${system}`);
        feasible = false;
      }
    }

    // Check policy constraints
    const policyCheck = this._checkPolicyConstraints(recommendation, context);
    if (!policyCheck.allowed) {
      issues.push(`Policy violation: ${policyCheck.reason}`);
      feasible = false;
    }

    // Check business impact constraints
    if (recommendation.risk === 'critical' && this._isBusinessHours()) {
      issues.push('Critical risk action during business hours requires additional approval');
      // Don't mark as infeasible, but flag for extra approval
    }

    // Estimate duration based on action complexity
    estimatedDuration = this._estimateActionDuration(recommendation.action);

    return {
      feasible,
      issues,
      estimatedDuration,
      systemsRequired: requiredSystems,
      policyCompliant: policyCheck.allowed
    };
  }

  /**
   * Generate rollback procedures for each recommendation
   * @param {Array} recommendations - Recommendations needing rollback procedures
   * @param {Object} context - Response context
   * @returns {Promise<Array>} Recommendations with rollback procedures
   */
  async _generateRollbackProcedures(recommendations, context) {
    const recommendationsWithRollback = [];

    for (const rec of recommendations) {
      const rollbackProcedure = await this._generateRollbackProcedure(rec, context);
      
      recommendationsWithRollback.push({
        ...rec,
        rollbackProcedure,
        rollbackRisk: this._assessRollbackRisk(rec, rollbackProcedure),
        rollbackDuration: this._estimateRollbackDuration(rec.action)
      });
    }

    return recommendationsWithRollback;
  }

  /**
   * Generate rollback procedure for a specific recommendation
   * @param {Object} recommendation - Recommendation needing rollback
   * @param {Object} context - Response context
   * @returns {Promise<Object>} Rollback procedure
   */
  async _generateRollbackProcedure(recommendation, context) {
    const rollbackMap = {
      'block_ip': {
        steps: ['Remove IP from block list', 'Verify IP connectivity restored'],
        requirements: ['Firewall admin access'],
        risks: ['May allow malicious traffic if threat still active']
      },
      'disable_account': {
        steps: ['Re-enable user account', 'Verify account functionality', 'Notify user of reactivation'],
        requirements: ['Identity management admin access'],
        risks: ['Account may still be compromised if not properly investigated']
      },
      'isolate_endpoint': {
        steps: ['Remove network isolation', 'Verify network connectivity', 'Run security scan', 'Monitor for suspicious activity'],
        requirements: ['Network admin access', 'Endpoint management access'],
        risks: ['May allow malware to spread if endpoint still compromised']
      },
      'reset_password': {
        steps: ['User sets new password', 'Verify authentication works', 'Check for any locked applications'],
        requirements: ['User cooperation', 'Identity management access'],
        risks: ['Minimal - standard password reset procedure']
      }
    };

    const defaultRollback = {
      steps: ['Reverse the implemented action', 'Verify system functionality', 'Monitor for issues'],
      requirements: ['Administrative access to affected systems'],
      risks: ['May restore vulnerable state if threat not fully mitigated']
    };

    return rollbackMap[recommendation.action] || defaultRollback;
  }

  /**
   * Determine approval requirements for each recommendation
   * @param {Array} recommendations - Recommendations to evaluate
   * @param {Object} context - Response context
   * @returns {Array} Recommendations with approval requirements
   */
  _determineApprovalRequirements(recommendations, context) {
    return recommendations.map(rec => {
      const requiresApproval = this._doesActionRequireApproval(rec, context);
      const autoExecutable = this._isActionAutoExecutable(rec, context);

      return {
        ...rec,
        requiresApproval,
        autoExecutable: autoExecutable && !requiresApproval,
        approvalLevel: this._getRequiredApprovalLevel(rec, context),
        approvalReason: this._getApprovalReason(rec, context)
      };
    });
  }

  /**
   * Check if action requires approval
   * @param {Object} recommendation - Recommendation to check
   * @param {Object} context - Response context
   * @returns {boolean} Whether approval is required
   */
  _doesActionRequireApproval(recommendation, context) {
    // Always require approval for high/critical risk actions
    if (['high', 'critical'].includes(recommendation.risk)) {
      return true;
    }

    // Require approval if explicitly configured
    if (this.approvalRequired.has(recommendation.action)) {
      return true;
    }

    // Require approval during business hours for medium risk
    if (recommendation.risk === 'medium' && this._isBusinessHours()) {
      return true;
    }

    // Require approval if confidence is below threshold
    if (context.verdict.confidence < this.config.requireApprovalThreshold) {
      return true;
    }

    // Check policy requirements
    const policyCheck = this._checkPolicyConstraints(recommendation, context);
    if (policyCheck.requiresApproval) {
      return true;
    }

    return false;
  }

  /**
   * Check if action can be auto-executed
   * @param {Object} recommendation - Recommendation to check
   * @param {Object} context - Response context
   * @returns {boolean} Whether action can be auto-executed
   */
  _isActionAutoExecutable(recommendation, context) {
    // Never auto-execute if approval is required
    if (recommendation.requiresApproval) {
      return false;
    }

    // Only auto-execute if in the allowed list
    if (!this.autoExecutable.has(recommendation.action)) {
      return false;
    }

    // Only auto-execute if confidence is high enough
    if (context.verdict.confidence < this.config.autoExecuteThreshold) {
      return false;
    }

    // Only auto-execute low-risk actions
    if (recommendation.risk !== 'low') {
      return false;
    }

    return true;
  }

  /**
   * Analyze impact of recommendations on systems and data flows
   * @param {Array} recommendations - Recommendations to analyze
   * @param {Object} context - Response context
   * @returns {Object} Impact analysis
   */
  _analyzeImpact(recommendations, context) {
    const affectedSystems = new Set();
    const affectedUsers = new Set();
    const dataFlowImpacts = [];
    let totalBusinessImpact = 'low';

    recommendations.forEach(rec => {
      // Collect affected systems
      if (rec.affectedSystems) {
        rec.affectedSystems.forEach(system => affectedSystems.add(system));
      }

      // Analyze user impact
      if (rec.action === 'disable_account' || rec.action === 'reset_password') {
        if (context.alert?.principal?.user) {
          affectedUsers.add(context.alert.principal.user);
        }
      }

      // Analyze data flow impacts
      if (rec.action === 'isolate_endpoint' || rec.action === 'network_segmentation') {
        dataFlowImpacts.push({
          type: 'network_isolation',
          description: `Network access restricted for ${rec.affectedSystems?.join(', ') || 'affected systems'}`,
          severity: rec.risk
        });
      }

      // Determine overall business impact
      if (rec.risk === 'critical' && totalBusinessImpact !== 'critical') {
        totalBusinessImpact = 'critical';
      } else if (rec.risk === 'high' && !['critical'].includes(totalBusinessImpact)) {
        totalBusinessImpact = 'high';
      } else if (rec.risk === 'medium' && totalBusinessImpact === 'low') {
        totalBusinessImpact = 'medium';
      }
    });

    return {
      affectedSystems: Array.from(affectedSystems),
      affectedUsers: Array.from(affectedUsers),
      dataFlowImpacts,
      totalBusinessImpact,
      estimatedDowntime: this._estimateDowntime(recommendations),
      recoveryTime: this._estimateRecoveryTime(recommendations)
    };
  }

  /**
   * Generate execution plan for recommendations
   * @param {Array} recommendations - Recommendations to plan
   * @param {Object} context - Response context
   * @returns {Object} Execution plan
   */
  _generateExecutionPlan(recommendations, context) {
    const autoExecutable = recommendations.filter(r => r.autoExecutable);
    const requiresApproval = recommendations.filter(r => r.requiresApproval);
    
    return {
      immediate: {
        actions: autoExecutable.slice(0, 3), // Limit immediate actions
        estimatedDuration: this._sumDurations(autoExecutable.slice(0, 3))
      },
      pendingApproval: {
        actions: requiresApproval,
        estimatedDuration: this._sumDurations(requiresApproval)
      },
      sequence: this._generateActionSequence(recommendations),
      parallelizable: this._identifyParallelizableActions(recommendations)
    };
  }

  /**
   * Generate approval requests for actions requiring approval
   * @param {Array} recommendations - Recommendations to check
   * @param {Object} context - Response context
   * @returns {Array} Approval requests
   */
  _generateApprovalRequests(recommendations, context) {
    return recommendations
      .filter(rec => rec.requiresApproval)
      .map(rec => ({
        action: rec.action,
        description: rec.description,
        rationale: rec.rationale,
        risk: rec.risk,
        priority: rec.priority,
        approvalLevel: rec.approvalLevel,
        estimatedImpact: rec.estimatedImpact,
        rollbackProcedure: rec.rollbackProcedure,
        parameters: {
          investigationId: context.investigationId,
          alertId: context.alert?.id,
          affectedSystems: rec.affectedSystems,
          verificationSteps: rec.verificationSteps
        }
      }));
  }

  /**
   * Generate response for false positive cases
   * @param {Object} verdict - Investigation verdict
   * @param {Object} context - Investigation context
   * @returns {Object} False positive response
   */
  _generateFalsePositiveResponse(verdict, context) {
    return {
      recommendations: [{
        id: 'close_false_positive',
        action: 'close_alert',
        description: 'Close alert as false positive',
        priority: 'low',
        risk: 'low',
        rationale: verdict.reasoning || 'Investigation determined this is a false positive',
        affectedSystems: [],
        estimatedImpact: 'None - administrative action only',
        verificationSteps: ['Update alert status', 'Add false positive tag'],
        requiresApproval: false,
        autoExecutable: true,
        rollbackProcedure: {
          steps: ['Reopen alert', 'Remove false positive tag', 'Re-investigate if needed'],
          requirements: ['Administrative access'],
          risks: ['May delay response to actual threats if incorrectly classified']
        }
      }],
      impactAnalysis: {
        affectedSystems: [],
        affectedUsers: [],
        dataFlowImpacts: [],
        totalBusinessImpact: 'none',
        estimatedDowntime: '0 minutes',
        recoveryTime: '0 minutes'
      },
      executionPlan: {
        immediate: { actions: [], estimatedDuration: '1 minute' },
        pendingApproval: { actions: [], estimatedDuration: '0 minutes' },
        sequence: ['close_alert'],
        parallelizable: []
      },
      approvalRequests: [],
      metadata: {
        responseTime: 0,
        agentVersion: '1.0.0',
        totalRecommendations: 1,
        autoExecutableCount: 1,
        approvalRequiredCount: 0
      }
    };
  }

  // Helper methods

  _buildRecommendationPrompt(context) {
    const parts = [
      'Generate incident response recommendations for this security investigation:',
      '',
      'Investigation Verdict:',
      JSON.stringify(context.verdict, null, 2),
      '',
      'Alert Details:',
      JSON.stringify(context.alert, null, 2),
      '',
      'Evidence Summary:',
      JSON.stringify(context.evidence?.slice(0, 5) || [], null, 2), // Limit evidence for prompt size
      '',
      'Business Context:',
      JSON.stringify(context.businessContext, null, 2),
      '',
      'Focus on actionable, specific recommendations with clear rationale and impact assessment.'
    ];

    return parts.join('\n');
  }

  _parseRecommendationResponse(aiResponse) {
    try {
      const cleanedResponse = aiResponse.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse);
      
      if (Array.isArray(parsed)) {
        return parsed.map((rec, index) => ({
          id: rec.id || `rec_${index + 1}`,
          action: rec.action || 'manual_review',
          description: rec.description || 'Manual review required',
          priority: rec.priority || 'medium',
          risk: rec.risk || 'medium',
          rationale: rec.rationale || 'Based on investigation findings',
          affectedSystems: Array.isArray(rec.affectedSystems) ? rec.affectedSystems : [],
          estimatedImpact: rec.estimatedImpact || 'Impact assessment needed',
          verificationSteps: Array.isArray(rec.verificationSteps) ? rec.verificationSteps : []
        }));
      } else if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
        return parsed.recommendations;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.warn('Failed to parse recommendation response:', error.message);
      return [];
    }
  }

  _getRequiredSystems(action) {
    const systemMap = {
      'block_ip': ['firewall', 'network'],
      'block_domain': ['dns', 'firewall'],
      'disable_account': ['identity_management', 'active_directory'],
      'reset_password': ['identity_management'],
      'isolate_endpoint': ['endpoint_management', 'network'],
      'quarantine_file': ['endpoint_management', 'antivirus'],
      'revoke_certificates': ['pki', 'certificate_authority'],
      'shutdown_system': ['endpoint_management', 'infrastructure'],
      'network_segmentation': ['network', 'firewall', 'switches']
    };

    return systemMap[action] || ['manual'];
  }

  _isSystemAvailable(system, context) {
    // In a real implementation, this would check actual system availability
    // For now, assume most systems are available except for some edge cases
    const unavailableSystems = context.unavailableSystems || [];
    return !unavailableSystems.includes(system);
  }

  _checkPolicyConstraints(recommendation, context) {
    // Check against organizational policies
    const policies = context.policies || [];
    
    for (const policy of policies) {
      if (policy.actionPattern && recommendation.action.match(policy.actionPattern)) {
        if (policy.effect === 'deny') {
          return { allowed: false, reason: `Denied by policy: ${policy.name}` };
        } else if (policy.effect === 'require_approval') {
          return { allowed: true, requiresApproval: true, reason: `Requires approval per policy: ${policy.name}` };
        }
      }
    }

    return { allowed: true, requiresApproval: false };
  }

  _isBusinessHours() {
    const now = new Date();
    const hour = now.getUTCHours(); // Use UTC hours for consistency
    const day = now.getUTCDay();
    
    // Assume business hours are 9 AM to 5 PM, Monday to Friday (UTC)
    return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
  }

  _estimateActionDuration(action) {
    const durationMap = {
      'block_ip': '2-5 minutes',
      'block_domain': '2-5 minutes',
      'disable_account': '5-10 minutes',
      'reset_password': '10-15 minutes',
      'isolate_endpoint': '10-20 minutes',
      'quarantine_file': '5-10 minutes',
      'revoke_certificates': '15-30 minutes',
      'shutdown_system': '5-15 minutes',
      'network_segmentation': '30-60 minutes'
    };

    return durationMap[action] || '10-20 minutes';
  }

  _assessRollbackRisk(recommendation, rollbackProcedure) {
    if (recommendation.risk === 'critical') {
      return 'high';
    } else if (recommendation.risk === 'high') {
      return 'medium';
    } else {
      return 'low';
    }
  }

  _estimateRollbackDuration(action) {
    // Rollback typically takes similar or slightly longer than the original action
    const baseEstimate = this._estimateActionDuration(action);
    return baseEstimate.replace(/(\d+)-(\d+)/, (match, min, max) => {
      const newMin = Math.ceil(parseInt(min) * 1.2);
      const newMax = Math.ceil(parseInt(max) * 1.5);
      return `${newMin}-${newMax}`;
    });
  }

  _getRequiredApprovalLevel(recommendation, context) {
    if (recommendation.risk === 'critical') {
      return 'senior_management';
    } else if (recommendation.risk === 'high') {
      return 'security_manager';
    } else if (recommendation.risk === 'medium') {
      return 'team_lead';
    } else {
      return 'analyst';
    }
  }

  _getApprovalReason(recommendation, context) {
    if (recommendation.risk === 'critical' || recommendation.risk === 'high') {
      return `High-risk action (${recommendation.risk}) requires management approval`;
    } else if (this._isBusinessHours() && recommendation.risk === 'medium') {
      return 'Medium-risk action during business hours requires approval';
    } else if (context.verdict.confidence < this.config.requireApprovalThreshold) {
      return `Low confidence verdict (${context.verdict.confidence.toFixed(2)}) requires human review`;
    } else {
      return 'Action requires approval per organizational policy';
    }
  }

  _estimateDowntime(recommendations) {
    const downtimeActions = recommendations.filter(r => 
      ['isolate_endpoint', 'shutdown_system', 'network_segmentation'].includes(r.action)
    );

    if (downtimeActions.length === 0) {
      return '0 minutes';
    }

    // Estimate based on most impactful action
    const maxImpact = downtimeActions.reduce((max, rec) => {
      const impactScore = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 }[rec.risk] || 2;
      return Math.max(max, impactScore);
    }, 0);

    const downtimeMap = {
      1: '5-15 minutes',
      2: '15-30 minutes', 
      3: '30-60 minutes',
      4: '1-4 hours'
    };

    return downtimeMap[maxImpact] || '15-30 minutes';
  }

  _estimateRecoveryTime(recommendations) {
    // Recovery time is typically 2-3x the downtime
    const downtime = this._estimateDowntime(recommendations);
    
    if (downtime === '0 minutes') {
      return '0 minutes';
    }

    return downtime.replace(/(\d+)-(\d+)/, (match, min, max) => {
      const newMin = Math.ceil(parseInt(min) * 2);
      const newMax = Math.ceil(parseInt(max) * 3);
      return `${newMin}-${newMax}`;
    });
  }

  _sumDurations(recommendations) {
    if (recommendations.length === 0) {
      return '0 minutes';
    }

    // Simple estimation - assume actions can be parallelized to some degree
    const totalActions = recommendations.length;
    const avgDuration = 10; // minutes
    const parallelFactor = Math.min(3, totalActions); // Max 3 parallel actions
    
    const estimatedMinutes = Math.ceil((totalActions * avgDuration) / parallelFactor);
    return `${estimatedMinutes} minutes`;
  }

  _generateActionSequence(recommendations) {
    // Sort by priority and dependencies
    const sequence = [];
    const priorityOrder = ['critical', 'high', 'medium', 'low'];
    
    priorityOrder.forEach(priority => {
      const actionsAtPriority = recommendations
        .filter(r => r.priority === priority)
        .map(r => r.action);
      sequence.push(...actionsAtPriority);
    });

    return sequence;
  }

  _identifyParallelizableActions(recommendations) {
    // Actions that can be executed in parallel (don't interfere with each other)
    const parallelizable = [];
    const networkActions = recommendations.filter(r => 
      ['block_ip', 'block_domain', 'network_segmentation'].includes(r.action)
    );
    const accountActions = recommendations.filter(r => 
      ['disable_account', 'reset_password'].includes(r.action)
    );
    const endpointActions = recommendations.filter(r => 
      ['quarantine_file', 'isolate_endpoint'].includes(r.action)
    );

    if (networkActions.length > 1) {
      parallelizable.push({
        group: 'network_actions',
        actions: networkActions.map(a => a.action)
      });
    }

    if (accountActions.length > 1) {
      parallelizable.push({
        group: 'account_actions', 
        actions: accountActions.map(a => a.action)
      });
    }

    if (endpointActions.length > 1) {
      parallelizable.push({
        group: 'endpoint_actions',
        actions: endpointActions.map(a => a.action)
      });
    }

    return parallelizable;
  }
}

module.exports = { ResponseAgent };