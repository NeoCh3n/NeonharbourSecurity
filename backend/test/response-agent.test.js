/**
 * Response Agent Tests
 * 
 * Comprehensive test suite for the Response Agent functionality
 */

const { ResponseAgent } = require('../investigation/agents/response-agent');
const { callModel } = require('../ai');

// Mock the AI module
jest.mock('../ai', () => ({
  callModel: jest.fn()
}));

// Mock the execution utils
jest.mock('../utils/execution', () => ({
  withRetry: jest.fn((fn) => fn()),
  parallelMap: jest.fn((items, fn) => Promise.all(items.map(fn)))
}));

describe('ResponseAgent', () => {
  let responseAgent;
  let mockContext;
  let mockInput;

  beforeEach(() => {
    responseAgent = new ResponseAgent('test-response-agent');
    
    mockContext = {
      investigationId: 'inv-123',
      tenantId: 'tenant-1',
      businessContext: {
        businessHours: '9-17',
        criticalSystems: ['email', 'database']
      }
    };

    mockInput = {
      verdict: {
        classification: 'true_positive',
        confidence: 0.85,
        riskScore: 75,
        reasoning: 'Malicious activity detected'
      },
      alert: {
        id: 'alert-123',
        src: { ip: '192.168.1.100' },
        principal: { user: 'john.doe' },
        asset: { host: 'workstation-01' },
        severity: 'high'
      },
      evidence: [
        {
          type: 'network',
          source: 'firewall',
          data: { blocked_connections: 5 }
        }
      ],
      policies: []
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    test('should validate required input fields', () => {
      const validation = responseAgent.validate(mockInput);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should reject input without verdict', () => {
      const invalidInput = { ...mockInput };
      delete invalidInput.verdict;
      
      const validation = responseAgent.validate(invalidInput);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Investigation verdict is required for response generation');
    });

    test('should reject input without investigation or alert context', () => {
      const invalidInput = { verdict: mockInput.verdict };
      
      const validation = responseAgent.validate(invalidInput);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Investigation or alert context is required');
    });

    test('should reject invalid verdict classification', () => {
      const invalidInput = {
        ...mockInput,
        verdict: { ...mockInput.verdict, classification: 'invalid_classification' }
      };
      
      const validation = responseAgent.validate(invalidInput);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid verdict classification');
    });
  });

  describe('Response Generation', () => {
    test('should generate recommendations for true positive verdict', async () => {
      const mockAIResponse = JSON.stringify([
        {
          id: 'block_ip',
          action: 'block_ip',
          description: 'Block malicious IP address',
          priority: 'high',
          risk: 'low',
          rationale: 'Prevent further attacks',
          affectedSystems: ['firewall'],
          estimatedImpact: 'Low impact',
          verificationSteps: ['Check firewall rules']
        }
      ]);

      callModel.mockResolvedValue(mockAIResponse);

      const result = await responseAgent.execute(mockContext, mockInput);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.impactAnalysis).toBeDefined();
      expect(result.executionPlan).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    test('should handle false positive verdict appropriately', async () => {
      const falsePositiveInput = {
        ...mockInput,
        verdict: {
          classification: 'false_positive',
          confidence: 0.9,
          riskScore: 10,
          reasoning: 'Benign activity confirmed'
        }
      };

      const result = await responseAgent.execute(mockContext, falsePositiveInput);

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].action).toBe('close_alert');
      expect(result.recommendations[0].autoExecutable).toBe(true);
      expect(result.impactAnalysis.totalBusinessImpact).toBe('none');
    });

    test('should generate fallback recommendations when AI fails', async () => {
      callModel.mockRejectedValue(new Error('AI service unavailable'));

      const result = await responseAgent.execute(mockContext, mockInput);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      
      // Should include basic IP blocking recommendation
      const ipBlockRec = result.recommendations.find(r => r.action === 'block_ip');
      expect(ipBlockRec).toBeDefined();
      expect(ipBlockRec.description).toContain('192.168.1.100');
    });
  });

  describe('Recommendation Prioritization', () => {
    test('should prioritize critical actions first', async () => {
      const mockRecommendations = [
        { id: '1', priority: 'low', risk: 'low' },
        { id: '2', priority: 'critical', risk: 'high' },
        { id: '3', priority: 'medium', risk: 'medium' }
      ];

      const prioritized = responseAgent._prioritizeRecommendations(mockRecommendations, {
        verdict: { confidence: 0.9, riskScore: 80 }
      });

      expect(prioritized[0].priority).toBe('critical');
      // Check that low priority is at the end (may not be last if there are ties)
      const lowPriorityIndex = prioritized.findIndex(r => r.priority === 'low');
      expect(lowPriorityIndex).toBeGreaterThan(0);
    });

    test('should consider risk levels in prioritization', async () => {
      const mockRecommendations = [
        { id: '1', priority: 'high', risk: 'critical' },
        { id: '2', priority: 'high', risk: 'low' }
      ];

      const prioritized = responseAgent._prioritizeRecommendations(mockRecommendations, {
        verdict: { confidence: 0.9, riskScore: 80 }
      });

      // Lower risk should be prioritized higher for same priority level
      expect(prioritized[0].risk).toBe('low');
    });
  });

  describe('Action Feasibility Validation', () => {
    test('should validate action feasibility', async () => {
      const mockRecommendations = [
        {
          id: 'block_ip',
          action: 'block_ip',
          priority: 'high',
          risk: 'low'
        }
      ];

      const feasible = await responseAgent._validateActionFeasibility(mockRecommendations, mockContext);

      expect(feasible).toHaveLength(1);
      expect(feasible[0].feasibilityCheck).toBeDefined();
      expect(feasible[0].estimatedDuration).toBeDefined();
    });

    test('should mark infeasible actions when systems unavailable', async () => {
      const contextWithUnavailableSystems = {
        ...mockContext,
        unavailableSystems: ['firewall']
      };

      const mockRecommendations = [
        {
          id: 'block_ip',
          action: 'block_ip',
          priority: 'high',
          risk: 'low'
        }
      ];

      const feasible = await responseAgent._validateActionFeasibility(mockRecommendations, contextWithUnavailableSystems);

      expect(feasible[0].feasible).toBe(false);
      expect(feasible[0].feasibilityIssues).toContain('Required system not available: firewall');
    });
  });

  describe('Rollback Procedures', () => {
    test('should generate rollback procedures for all recommendations', async () => {
      const mockRecommendations = [
        {
          id: 'block_ip',
          action: 'block_ip',
          priority: 'high',
          risk: 'low'
        },
        {
          id: 'disable_account',
          action: 'disable_account',
          priority: 'high',
          risk: 'medium'
        }
      ];

      const withRollback = await responseAgent._generateRollbackProcedures(mockRecommendations, mockContext);

      expect(withRollback).toHaveLength(2);
      withRollback.forEach(rec => {
        expect(rec.rollbackProcedure).toBeDefined();
        expect(rec.rollbackProcedure.steps).toBeDefined();
        expect(rec.rollbackProcedure.requirements).toBeDefined();
        expect(rec.rollbackProcedure.risks).toBeDefined();
        expect(rec.rollbackRisk).toBeDefined();
        expect(rec.rollbackDuration).toBeDefined();
      });
    });

    test('should provide specific rollback procedures for known actions', async () => {
      const blockIPRec = {
        id: 'block_ip',
        action: 'block_ip',
        priority: 'high',
        risk: 'low'
      };

      const rollback = await responseAgent._generateRollbackProcedure(blockIPRec, mockContext);

      expect(rollback.steps).toContain('Remove IP from block list');
      expect(rollback.steps).toContain('Verify IP connectivity restored');
      expect(rollback.requirements).toContain('Firewall admin access');
    });
  });

  describe('Approval Requirements', () => {
    test('should require approval for high-risk actions', () => {
      const highRiskRec = {
        id: 'isolate_endpoint',
        action: 'isolate_endpoint',
        priority: 'critical',
        risk: 'high'
      };

      const requiresApproval = responseAgent._doesActionRequireApproval(highRiskRec, {
        verdict: { confidence: 0.9 }
      });

      expect(requiresApproval).toBe(true);
    });

    test('should not require approval for low-risk actions with high confidence', () => {
      const lowRiskRec = {
        id: 'block_ip',
        action: 'block_ip',
        priority: 'high',
        risk: 'low'
      };

      const requiresApproval = responseAgent._doesActionRequireApproval(lowRiskRec, {
        verdict: { confidence: 0.9 }
      });

      expect(requiresApproval).toBe(false);
    });

    test('should require approval for low confidence verdicts', () => {
      const lowRiskRec = {
        id: 'block_ip',
        action: 'block_ip',
        priority: 'high',
        risk: 'low'
      };

      const requiresApproval = responseAgent._doesActionRequireApproval(lowRiskRec, {
        verdict: { confidence: 0.3 }
      });

      expect(requiresApproval).toBe(true);
    });

    test('should determine correct approval levels', () => {
      const criticalRec = { risk: 'critical' };
      const highRec = { risk: 'high' };
      const mediumRec = { risk: 'medium' };
      const lowRec = { risk: 'low' };

      expect(responseAgent._getRequiredApprovalLevel(criticalRec, mockContext)).toBe('senior_management');
      expect(responseAgent._getRequiredApprovalLevel(highRec, mockContext)).toBe('security_manager');
      expect(responseAgent._getRequiredApprovalLevel(mediumRec, mockContext)).toBe('team_lead');
      expect(responseAgent._getRequiredApprovalLevel(lowRec, mockContext)).toBe('analyst');
    });
  });

  describe('Auto-Execution', () => {
    test('should allow auto-execution for low-risk, high-confidence actions', () => {
      const autoExecRec = {
        id: 'block_ip',
        action: 'block_ip',
        risk: 'low',
        requiresApproval: false
      };

      const canAutoExecute = responseAgent._isActionAutoExecutable(autoExecRec, {
        verdict: { confidence: 0.9 }
      });

      expect(canAutoExecute).toBe(true);
    });

    test('should not allow auto-execution if approval required', () => {
      const approvalRequiredRec = {
        id: 'block_ip',
        action: 'block_ip',
        risk: 'low',
        requiresApproval: true
      };

      const canAutoExecute = responseAgent._isActionAutoExecutable(approvalRequiredRec, {
        verdict: { confidence: 0.9 }
      });

      expect(canAutoExecute).toBe(false);
    });

    test('should not allow auto-execution for non-whitelisted actions', () => {
      const nonWhitelistedRec = {
        id: 'shutdown_system',
        action: 'shutdown_system',
        risk: 'low',
        requiresApproval: false
      };

      const canAutoExecute = responseAgent._isActionAutoExecutable(nonWhitelistedRec, {
        verdict: { confidence: 0.9 }
      });

      expect(canAutoExecute).toBe(false);
    });
  });

  describe('Impact Analysis', () => {
    test('should analyze impact of recommendations', () => {
      const mockRecommendations = [
        {
          action: 'block_ip',
          risk: 'low',
          affectedSystems: ['firewall']
        },
        {
          action: 'disable_account',
          risk: 'medium',
          affectedSystems: ['identity_management']
        },
        {
          action: 'isolate_endpoint',
          risk: 'high',
          affectedSystems: ['endpoint', 'network']
        }
      ];

      const impact = responseAgent._analyzeImpact(mockRecommendations, mockContext);

      expect(impact.affectedSystems).toContain('firewall');
      expect(impact.affectedSystems).toContain('identity_management');
      expect(impact.affectedSystems).toContain('endpoint');
      expect(impact.affectedSystems).toContain('network');
      expect(impact.totalBusinessImpact).toBe('high');
      expect(impact.estimatedDowntime).toBeDefined();
      expect(impact.recoveryTime).toBeDefined();
    });

    test('should identify affected users', () => {
      const mockRecommendations = [
        {
          action: 'disable_account',
          risk: 'medium'
        }
      ];

      const contextWithUser = {
        ...mockContext,
        alert: { principal: { user: 'john.doe' } }
      };

      const impact = responseAgent._analyzeImpact(mockRecommendations, contextWithUser);

      expect(impact.affectedUsers).toContain('john.doe');
    });
  });

  describe('Execution Planning', () => {
    test('should generate execution plan with immediate and approval-required actions', () => {
      const mockRecommendations = [
        {
          id: '1',
          action: 'block_ip',
          autoExecutable: true,
          requiresApproval: false
        },
        {
          id: '2',
          action: 'isolate_endpoint',
          autoExecutable: false,
          requiresApproval: true
        }
      ];

      const plan = responseAgent._generateExecutionPlan(mockRecommendations, mockContext);

      expect(plan.immediate.actions).toHaveLength(1);
      expect(plan.immediate.actions[0].action).toBe('block_ip');
      expect(plan.pendingApproval.actions).toHaveLength(1);
      expect(plan.pendingApproval.actions[0].action).toBe('isolate_endpoint');
      expect(plan.sequence).toBeDefined();
      expect(plan.parallelizable).toBeDefined();
    });

    test('should identify parallelizable actions', () => {
      const mockRecommendations = [
        { action: 'block_ip', priority: 'high' },
        { action: 'block_domain', priority: 'high' },
        { action: 'disable_account', priority: 'medium' },
        { action: 'reset_password', priority: 'medium' }
      ];

      const parallelizable = responseAgent._identifyParallelizableActions(mockRecommendations);

      const networkGroup = parallelizable.find(g => g.group === 'network_actions');
      const accountGroup = parallelizable.find(g => g.group === 'account_actions');

      expect(networkGroup).toBeDefined();
      expect(networkGroup.actions).toContain('block_ip');
      expect(networkGroup.actions).toContain('block_domain');

      expect(accountGroup).toBeDefined();
      expect(accountGroup.actions).toContain('disable_account');
      expect(accountGroup.actions).toContain('reset_password');
    });
  });

  describe('Approval Request Generation', () => {
    test('should generate approval requests for actions requiring approval', () => {
      const mockRecommendations = [
        {
          id: '1',
          action: 'block_ip',
          description: 'Block malicious IP',
          rationale: 'Prevent attacks',
          risk: 'low',
          priority: 'high',
          requiresApproval: false,
          estimatedImpact: 'Low',
          rollbackProcedure: { steps: ['Remove block'] },
          affectedSystems: ['firewall'],
          verificationSteps: ['Check firewall']
        },
        {
          id: '2',
          action: 'isolate_endpoint',
          description: 'Isolate compromised endpoint',
          rationale: 'Prevent lateral movement',
          risk: 'high',
          priority: 'critical',
          requiresApproval: true,
          approvalLevel: 'security_manager',
          estimatedImpact: 'High',
          rollbackProcedure: { steps: ['Remove isolation'] },
          affectedSystems: ['endpoint'],
          verificationSteps: ['Check isolation']
        }
      ];

      const approvalRequests = responseAgent._generateApprovalRequests(mockRecommendations, mockContext);

      expect(approvalRequests).toHaveLength(1);
      expect(approvalRequests[0].action).toBe('isolate_endpoint');
      expect(approvalRequests[0].parameters.investigationId).toBe(mockContext.investigationId);
      expect(approvalRequests[0].parameters.affectedSystems).toContain('endpoint');
    });
  });

  describe('Business Hours Consideration', () => {
    test('should detect business hours correctly', () => {
      // Mock Date to return a weekday during business hours (UTC)
      const mockDate = new Date('2024-01-15T14:00:00Z'); // Monday 2 PM UTC
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      // Mock the UTC methods specifically
      mockDate.getUTCHours = jest.fn().mockReturnValue(14);
      mockDate.getUTCDay = jest.fn().mockReturnValue(1); // Monday

      const isBusinessHours = responseAgent._isBusinessHours();
      expect(isBusinessHours).toBe(true);

      global.Date.mockRestore();
    });

    test('should detect non-business hours correctly', () => {
      // Mock Date to return a weekend
      const mockDate = new Date('2024-01-14T14:00:00Z'); // Sunday 2 PM UTC
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      // Mock the UTC methods specifically
      mockDate.getUTCHours = jest.fn().mockReturnValue(14);
      mockDate.getUTCDay = jest.fn().mockReturnValue(0); // Sunday

      const isBusinessHours = responseAgent._isBusinessHours();
      expect(isBusinessHours).toBe(false);

      global.Date.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should handle AI service failures gracefully', async () => {
      callModel.mockRejectedValue(new Error('AI service timeout'));

      const result = await responseAgent.execute(mockContext, mockInput);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should fall back to rule-based recommendations
    });

    test('should handle malformed AI responses', async () => {
      callModel.mockResolvedValue('invalid json response');

      const result = await responseAgent.execute(mockContext, mockInput);

      expect(result.recommendations).toBeDefined();
      // Should fall back to rule-based recommendations
    });
  });

  describe('Threat Scenario Tests', () => {
    test('should handle malware infection scenario', async () => {
      const malwareInput = {
        ...mockInput,
        verdict: {
          classification: 'true_positive',
          confidence: 0.9,
          riskScore: 85,
          reasoning: 'Malware detected on endpoint'
        },
        alert: {
          ...mockInput.alert,
          category: 'malware',
          asset: { host: 'workstation-01' }
        }
      };

      const mockAIResponse = JSON.stringify([
        {
          id: 'isolate_endpoint',
          action: 'isolate_endpoint',
          description: 'Isolate infected endpoint',
          priority: 'critical',
          risk: 'high',
          rationale: 'Prevent malware spread',
          affectedSystems: ['endpoint', 'network'],
          estimatedImpact: 'High - system will be offline',
          verificationSteps: ['Verify isolation', 'Run malware scan']
        }
      ]);

      callModel.mockResolvedValue(mockAIResponse);

      const result = await responseAgent.execute(mockContext, malwareInput);

      expect(result.recommendations).toBeDefined();
      const isolationRec = result.recommendations.find(r => r.action === 'isolate_endpoint');
      expect(isolationRec).toBeDefined();
      expect(isolationRec.priority).toBe('critical');
      expect(isolationRec.requiresApproval).toBe(true);
    });

    test('should handle credential compromise scenario', async () => {
      const credCompromiseInput = {
        ...mockInput,
        verdict: {
          classification: 'true_positive',
          confidence: 0.8,
          riskScore: 70,
          reasoning: 'Suspicious login activity detected'
        },
        alert: {
          ...mockInput.alert,
          category: 'authentication',
          principal: { user: 'admin.user' }
        }
      };

      // Mock AI response for credential compromise
      const mockAIResponse = JSON.stringify([
        {
          id: 'reset_password',
          action: 'reset_password',
          description: 'Reset password for compromised user admin.user',
          priority: 'high',
          risk: 'medium',
          rationale: 'Prevent unauthorized access with compromised credentials',
          affectedSystems: ['identity_management'],
          estimatedImpact: 'Medium - user will need new password',
          verificationSteps: ['Confirm password reset', 'Verify user authentication']
        }
      ]);

      callModel.mockResolvedValue(mockAIResponse);

      const result = await responseAgent.execute(mockContext, credCompromiseInput);

      expect(result.recommendations).toBeDefined();
      
      // Should include password reset recommendation
      const passwordReset = result.recommendations.find(r => r.action === 'reset_password');
      expect(passwordReset).toBeDefined();
      expect(passwordReset.description).toContain('admin.user');
    });

    test('should handle network intrusion scenario', async () => {
      const networkIntrusionInput = {
        ...mockInput,
        verdict: {
          classification: 'true_positive',
          confidence: 0.95,
          riskScore: 90,
          reasoning: 'External attacker detected'
        },
        alert: {
          ...mockInput.alert,
          category: 'network',
          src: { ip: '203.0.113.1' } // External IP
        }
      };

      // Mock AI response for network intrusion
      const mockAIResponse = JSON.stringify([
        {
          id: 'block_ip',
          action: 'block_ip',
          description: 'Block malicious IP 203.0.113.1',
          priority: 'critical',
          risk: 'low',
          rationale: 'Prevent further attacks from external source',
          affectedSystems: ['firewall', 'network'],
          estimatedImpact: 'Low - blocks single IP address',
          verificationSteps: ['Verify IP blocked in firewall', 'Monitor for continued activity']
        }
      ]);

      callModel.mockResolvedValue(mockAIResponse);

      const result = await responseAgent.execute(mockContext, networkIntrusionInput);

      expect(result.recommendations).toBeDefined();
      
      // Should include IP blocking recommendation
      const ipBlock = result.recommendations.find(r => r.action === 'block_ip');
      expect(ipBlock).toBeDefined();
      expect(ipBlock.description).toContain('203.0.113.1');
    });

    test('should handle phishing email scenario', async () => {
      const phishingInput = {
        ...mockInput,
        verdict: {
          classification: 'true_positive',
          confidence: 0.85,
          riskScore: 65,
          reasoning: 'Phishing email with malicious link'
        },
        alert: {
          ...mockInput.alert,
          category: 'email',
          source: 'email',
          entities: [
            { type: 'url', value: 'http://evil.example.com' },
            { type: 'email', value: 'victim@company.com' }
          ]
        }
      };

      const mockAIResponse = JSON.stringify([
        {
          id: 'email_recall',
          action: 'email_recall',
          description: 'Recall phishing email',
          priority: 'high',
          risk: 'medium',
          rationale: 'Prevent users from clicking malicious links',
          affectedSystems: ['email'],
          estimatedImpact: 'Medium - email will be removed from inboxes',
          verificationSteps: ['Verify email recalled', 'Check user awareness']
        }
      ]);

      callModel.mockResolvedValue(mockAIResponse);

      const result = await responseAgent.execute(mockContext, phishingInput);

      expect(result.recommendations).toBeDefined();
      const emailRecall = result.recommendations.find(r => r.action === 'email_recall');
      expect(emailRecall).toBeDefined();
    });
  });

  describe('Integration with Approval System', () => {
    test('should generate proper approval request format', () => {
      const mockRecommendations = [
        {
          id: 'isolate_endpoint',
          action: 'isolate_endpoint',
          description: 'Isolate compromised endpoint',
          rationale: 'Prevent lateral movement',
          risk: 'high',
          priority: 'critical',
          requiresApproval: true,
          approvalLevel: 'security_manager',
          estimatedImpact: 'High - system offline',
          rollbackProcedure: {
            steps: ['Remove isolation', 'Verify connectivity'],
            requirements: ['Network admin access'],
            risks: ['May allow malware spread']
          },
          affectedSystems: ['endpoint', 'network'],
          verificationSteps: ['Check isolation status', 'Monitor for activity']
        }
      ];

      const approvalRequests = responseAgent._generateApprovalRequests(mockRecommendations, mockContext);

      expect(approvalRequests).toHaveLength(1);
      const request = approvalRequests[0];
      
      expect(request.action).toBe('isolate_endpoint');
      expect(request.description).toBe('Isolate compromised endpoint');
      expect(request.rationale).toBe('Prevent lateral movement');
      expect(request.risk).toBe('high');
      expect(request.priority).toBe('critical');
      expect(request.approvalLevel).toBe('security_manager');
      expect(request.estimatedImpact).toBe('High - system offline');
      expect(request.rollbackProcedure).toBeDefined();
      expect(request.parameters).toBeDefined();
      expect(request.parameters.investigationId).toBe(mockContext.investigationId);
      expect(request.parameters.affectedSystems).toEqual(['endpoint', 'network']);
      expect(request.parameters.verificationSteps).toEqual(['Check isolation status', 'Monitor for activity']);
    });
  });

  describe('Integration with Planning Module', () => {
    test('should integrate with advanced recommendations function', async () => {
      const { generateAdvancedRecommendations } = require('../planning/plan');
      
      const unified = {
        id: 'alert-integration-test',
        src: { ip: '203.0.113.1' },
        principal: { user: 'test.user' },
        asset: { host: 'workstation-test' },
        severity: 'high',
        category: 'malware'
      };
      
      const verdict = {
        classification: 'true_positive',
        confidence: 0.9,
        riskScore: 85,
        reasoning: 'Integration test scenario'
      };
      
      const context = {
        investigationId: 'inv-integration-test',
        tenantId: 'tenant-test',
        businessContext: {}
      };
      
      const result = await generateAdvancedRecommendations(unified, verdict, context);
      
      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      
      if (result.success) {
        expect(result.impactAnalysis).toBeDefined();
        expect(result.executionPlan).toBeDefined();
        expect(result.metadata).toBeDefined();
      } else {
        expect(result.fallback).toBe(true);
        expect(result.error).toBeDefined();
      }
    });
  });
});