/**
 * ExecutionAgent Unit Tests
 * 
 * Tests for the ExecutionAgent class including:
 * - Step execution logic
 * - Parallel execution with dependencies
 * - Evidence collection and correlation
 * - Failure handling and plan adaptation
 * - Progress tracking and reporting
 */

const { ExecutionAgent } = require('../investigation/agents/execution-agent');
const { connectorFramework, __mockGetConnector, __mockListConnectors } = require('../connectors');

// Mock connector framework
jest.mock('../connectors', () => {
  const mockGetConnector = jest.fn();
  const mockListConnectors = jest.fn();
  
  return {
    connectorFramework: {
      getRegistry: jest.fn(() => ({
        getConnector: mockGetConnector,
        listConnectors: mockListConnectors
      }))
    },
    // Export mocks for test access
    __mockGetConnector: mockGetConnector,
    __mockListConnectors: mockListConnectors
  };
});

describe('ExecutionAgent', () => {
  let executionAgent;
  let mockContext;
  let mockConnector;

  // Set default timeout for all tests
  jest.setTimeout(10000);

  beforeEach(() => {
    executionAgent = new ExecutionAgent('test-execution-agent', {
      maxParallelSteps: 3,
      stepTimeoutMs: 5000,
      maxRetryAttempts: 2
    });

    mockContext = {
      investigationId: 'test-investigation-123',
      tenantId: 'tenant-1',
      userId: 'user-1'
    };

    mockConnector = {
      query: jest.fn(),
      enrich: jest.fn(),
      getStatus: jest.fn(() => ({ status: 'active' }))
    };

    // Setup connector registry mock
    __mockGetConnector.mockImplementation((tenantId, dataSourceName) => {
      if (['siem', 'edr', 'virustotal'].includes(dataSourceName)) {
        return mockConnector;
      }
      return null;
    });
    __mockListConnectors.mockReturnValue([
      { name: 'siem', status: 'active' },
      { name: 'edr', status: 'active' },
      { name: 'virustotal', status: 'active' }
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
    __mockGetConnector.mockClear();
    __mockListConnectors.mockClear();
  });

  describe('execute', () => {
    it('should execute investigation plan successfully', async () => {
      const plan = {
        steps: [
          {
            id: 'step1',
            type: 'query',
            dataSources: ['siem'],
            query: { type: 'search', term: 'malware' },
            dependencies: []
          }
        ]
      };

      mockConnector.query.mockResolvedValue({
        data: [{ id: 1, event: 'malware detected', timestamp: '2023-01-01T00:00:00Z' }],
        metadata: { total: 1 }
      });

      const result = await executionAgent.execute(mockContext, {
        plan,
        investigationId: 'test-123',
        alertContext: { severity: 'high' }
      });

      expect(result.success).toBe(true);
      expect(result.investigationId).toBe('test-123');
      expect(result.evidence).toBeDefined();
      expect(result.executionSummary).toBeDefined();
      expect(mockConnector.query).toHaveBeenCalledWith(
        { type: 'search', term: 'malware' },
        expect.objectContaining({ severity: 'high', timeout: 5000 })
      );
    });

    it('should handle invalid plan gracefully', async () => {
      const invalidPlan = { steps: null };

      await expect(
        executionAgent.execute(mockContext, { plan: invalidPlan })
      ).rejects.toThrow('Invalid investigation plan: missing or invalid steps');
    });

    it('should return partial results on execution failure', async () => {
      const plan = {
        steps: [
          {
            id: 'step1',
            type: 'invalid-type', // Use invalid step type to trigger failure
            dataSources: ['siem'],
            query: { type: 'search' }
          }
        ]
      };

      const result = await executionAgent.execute(mockContext, {
        plan,
        investigationId: 'test-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.partialEvidence).toBeDefined();
      expect(result.executionSummary).toBeDefined();
    });
  });

  describe('executeStep', () => {
    it('should execute query step successfully', async () => {
      const step = {
        id: 'query-step-1',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search', term: 'suspicious' }
      };

      mockConnector.query.mockResolvedValue({
        data: [
          { 
            id: 1, 
            message: 'Suspicious activity detected',
            src_ip: '192.168.1.100',
            timestamp: '2023-01-01T00:00:00Z'
          }
        ],
        metadata: { total: 1 }
      });

      const result = await executionAgent.executeStep(mockContext, step);


      expect(result.success).toBe(true);
      expect(result.stepId).toBe('query-step-1');
      expect(result.result.type).toBe('query');
      expect(result.result.evidence).toHaveLength(1);
      expect(result.result.evidence[0].entities).toContainEqual({
        type: 'ip',
        value: '192.168.1.100'
      });
    });

    it('should execute enrich step successfully', async () => {
      const step = {
        id: 'enrich-step-1',
        type: 'enrich',
        entities: [
          { type: 'ip', value: '192.168.1.100' },
          { type: 'domain', value: 'evil.com' }
        ],
        enrichmentSources: ['virustotal']
      };

      mockConnector.enrich.mockImplementation((value, type) => {
        if (type === 'ip') {
          return Promise.resolve({ reputation: 'malicious', score: 85 });
        }
        if (type === 'domain') {
          return Promise.resolve({ category: 'malware', detected: true });
        }
      });

      const result = await executionAgent.executeStep(mockContext, step);

      expect(result.success).toBe(true);
      expect(result.result.type).toBe('enrich');
      expect(result.result.enrichedData.ip['192.168.1.100'].virustotal).toEqual({
        reputation: 'malicious',
        score: 85
      });
      expect(result.result.enrichedData.domain['evil.com'].virustotal).toEqual({
        category: 'malware',
        detected: true
      });
    });

    it('should execute correlate step successfully', async () => {
      // Pre-populate some evidence
      executionAgent.evidence.set('prev-step', [
        {
          type: 'query_result',
          timestamp: '2023-01-01T00:00:00Z',
          entities: [{ type: 'ip', value: '192.168.1.100' }]
        },
        {
          type: 'query_result',
          timestamp: '2023-01-01T00:01:00Z',
          entities: [{ type: 'ip', value: '192.168.1.100' }]
        }
      ]);

      const step = {
        id: 'correlate-step-1',
        type: 'correlate',
        correlationType: 'temporal',
        timeWindow: 300000, // 5 minutes
        entities: [{ type: 'ip', value: '192.168.1.100' }]
      };

      const result = await executionAgent.executeStep(mockContext, step);

      expect(result.success).toBe(true);
      expect(result.result.type).toBe('correlate');
      expect(result.result.correlations).toHaveLength(1);
      expect(result.result.correlations[0].type).toBe('temporal');
    });

    it('should execute validate step successfully', async () => {
      // Pre-populate evidence for validation
      executionAgent.evidence.set('prev-step', [
        { type: 'test', confidence: 0.8 },
        { type: 'test', confidence: 0.9 },
        { type: 'test', confidence: 0.7 }
      ]);

      const step = {
        id: 'validate-step-1',
        type: 'validate',
        validationType: 'confidence',
        criteria: [
          { type: 'evidence_count', threshold: 2 },
          { type: 'confidence_threshold', threshold: 0.75 }
        ]
      };

      const result = await executionAgent.executeStep(mockContext, step);

      expect(result.success).toBe(true);
      expect(result.result.type).toBe('validate');
      expect(result.result.valid).toBe(true);
      expect(result.result.validationResults).toHaveLength(2);
    });

    it('should handle step validation errors', async () => {
      const invalidStep = {
        id: 'invalid-step',
        type: 'query'
        // Missing required fields
      };

      const result = await executionAgent.executeStep(mockContext, invalidStep);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Step validation failed');
    });

    it('should handle connector errors gracefully', async () => {
      const step = {
        id: 'failing-step',
        type: 'query',
        dataSources: ['unknown-source'], // Use unknown source to trigger connector error
        query: { type: 'search' }
      };

      const result = await executionAgent.executeStep(mockContext, step);

      expect(result.success).toBe(false);
      expect(result.error).toContain('All data sources failed');
      expect(result.shouldRetry).toBe(false); // Connector not found errors are not retryable
    });
  });

  describe('executeParallelSteps', () => {
    it('should execute independent steps in parallel', async () => {
      const steps = [
        {
          id: 'step1',
          type: 'query',
          dataSources: ['siem'],
          query: { type: 'search', term: 'malware' },
          dependencies: []
        },
        {
          id: 'step2',
          type: 'query',
          dataSources: ['edr'],
          query: { type: 'search', term: 'process' },
          dependencies: []
        }
      ];

      mockConnector.query.mockResolvedValue({
        data: [{ id: 1, event: 'test event' }],
        metadata: { total: 1 }
      });

      const startTime = Date.now();
      const result = await executionAgent.executeParallelSteps(mockContext, steps);
      const executionTime = Date.now() - startTime;

      expect(result.totalSteps).toBe(2);
      expect(result.completedSteps).toBe(2);
      expect(result.failedSteps).toBe(0);
      expect(executionTime).toBeLessThan(1000); // Should be much faster than sequential
      expect(mockConnector.query).toHaveBeenCalledTimes(2);
    });

    it('should respect step dependencies', async () => {
      const steps = [
        {
          id: 'step1',
          type: 'query',
          dataSources: ['siem'],
          query: { type: 'search' },
          dependencies: []
        },
        {
          id: 'step2',
          type: 'enrich',
          entities: [{ type: 'ip', value: '1.2.3.4' }],
          enrichmentSources: ['virustotal'],
          dependencies: ['step1'] // Depends on step1
        }
      ];

      let step1Completed = false;
      mockConnector.query.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            step1Completed = true;
            resolve({ data: [{ id: 1 }], metadata: {} });
          }, 10); // Reduced timeout
        });
      });

      mockConnector.enrich.mockImplementation(() => {
        expect(step1Completed).toBe(true); // step1 should complete first
        return Promise.resolve({ reputation: 'clean' });
      });

      const result = await executionAgent.executeParallelSteps(mockContext, steps);

      expect(result.completedSteps).toBe(2);
      expect(result.failedSteps).toBe(0);
    }, 5000); // Add timeout

    it('should handle mixed success and failure scenarios', async () => {
      // Create a scenario where we have one success and one failure
      // by using a correlate step that doesn't need connectors
      const steps = [
        {
          id: 'success-step',
          type: 'correlate',
          correlationType: 'temporal',
          timeWindow: 300000,
          entities: [],
          dependencies: []
        },
        {
          id: 'failure-step',
          type: 'query',
          dataSources: ['unknown-source'], // This will fail due to unknown connector
          query: { type: 'search' },
          dependencies: []
        }
      ];

      const result = await executionAgent.executeParallelSteps(mockContext, steps);
      
      expect(result.totalSteps).toBe(2);
      expect(result.completedSteps).toBe(1);
      // The test passes if we have at least one success and the method doesn't throw
      expect(result.completedSteps).toBeGreaterThan(0);
    });

    it('should respect maxParallelSteps configuration', async () => {
      const steps = Array.from({ length: 5 }, (_, i) => ({
        id: `step${i + 1}`,
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' },
        dependencies: []
      }));

      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockConnector.query.mockImplementation(() => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        
        return new Promise(resolve => {
          setTimeout(() => {
            concurrentCalls--;
            resolve({ data: [{ id: 1 }], metadata: {} });
          }, 10); // Reduced timeout to speed up test
        });
      });

      const result = await executionAgent.executeParallelSteps(mockContext, steps);

      expect(maxConcurrentCalls).toBeLessThanOrEqual(3); // maxParallelSteps = 3
      expect(result.completedSteps).toBe(5);
    }, 10000); // Increase test timeout
  });

  describe('handleStepFailure', () => {
    it('should retry retryable errors', async () => {
      const step = {
        id: 'retry-step',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' }
      };

      const networkError = new Error('Network timeout');
      const result = await executionAgent.handleStepFailure(step, networkError, mockContext);

      expect(result.action).toBe('retry');
      expect(result.retryCount).toBe(1);
    }, 2000);

    it('should escalate authentication errors', async () => {
      const step = {
        id: 'auth-step',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' }
      };

      const authError = new Error('Authentication failed');
      const result = await executionAgent.handleStepFailure(step, authError, mockContext);

      expect(result.action).toBe('escalate');
      expect(result.requiresHumanIntervention).toBe(true);
    });

    it('should adapt when max retries exceeded', async () => {
      const step = {
        id: 'max-retry-step',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' }
      };

      // Simulate multiple failures
      executionAgent.failedSteps.set(step.id, { retryCount: 2 });

      const networkError = new Error('Network timeout');
      const result = await executionAgent.handleStepFailure(step, networkError, mockContext);

      expect(result.action).toBe('adapt');
      expect(result.alternatives).toBeDefined();
    });

    it('should skip rate limited steps after retry', async () => {
      const step = {
        id: 'rate-limit-step',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' }
      };

      // Simulate one previous failure
      executionAgent.failedSteps.set(step.id, { retryCount: 1 });

      const rateLimitError = new Error('Rate limit exceeded');
      const result = await executionAgent.handleStepFailure(step, rateLimitError, mockContext);

      expect(result.action).toBe('skip');
      expect(result.reason).toContain('Rate limit exceeded');
    });
  });

  describe('evidence correlation', () => {
    beforeEach(() => {
      // Setup test evidence
      executionAgent.evidence.set('step1', [
        {
          type: 'query_result',
          timestamp: '2023-01-01T10:00:00Z',
          entities: [{ type: 'ip', value: '192.168.1.100' }],
          source: 'siem'
        },
        {
          type: 'query_result',
          timestamp: '2023-01-01T10:01:00Z',
          entities: [{ type: 'ip', value: '192.168.1.100' }],
          source: 'edr'
        }
      ]);

      executionAgent.evidence.set('step2', [
        {
          type: 'enrichment',
          timestamp: '2023-01-01T10:02:00Z',
          entities: [{ type: 'domain', value: 'evil.com' }],
          source: 'virustotal'
        }
      ]);
    });

    it('should perform temporal correlation', async () => {
      const result = await executionAgent._correlateEvidence(mockContext);

      expect(result.correlations).toBeDefined();
      const temporalCorrelations = result.correlations.filter(c => c.type === 'temporal');
      expect(temporalCorrelations.length).toBeGreaterThan(0);
    });

    it('should perform entity correlation', async () => {
      const result = await executionAgent._correlateEvidence(mockContext);

      expect(result.correlations).toBeDefined();
      const entityCorrelations = result.correlations.filter(c => c.type === 'entity');
      expect(entityCorrelations.length).toBeGreaterThan(0);
    });

    it('should build evidence timeline', async () => {
      const result = await executionAgent._correlateEvidence(mockContext);

      expect(result.timeline).toBeDefined();
      expect(result.timeline).toHaveLength(3);
      expect(result.timeline[0].timestamp).toBe('2023-01-01T10:00:00Z');
      expect(result.timeline[2].timestamp).toBe('2023-01-01T10:02:00Z');
    });

    it('should extract unique entities', async () => {
      const result = await executionAgent._correlateEvidence(mockContext);

      expect(result.entities).toBeDefined();
      expect(result.entities).toHaveLength(2); // ip and domain
      
      const ipEntity = result.entities.find(e => e.type === 'ip');
      expect(ipEntity.value).toBe('192.168.1.100');
      expect(ipEntity.sources).toContain('siem');
      expect(ipEntity.sources).toContain('edr');
      expect(ipEntity.evidenceCount).toBe(2);
    });
  });

  describe('progress tracking', () => {
    it('should notify progress callbacks', async () => {
      const progressCallback = jest.fn();
      executionAgent.addProgressCallback(progressCallback);

      const step = {
        id: 'progress-step',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' }
      };

      mockConnector.query.mockResolvedValue({
        data: [{ id: 1 }],
        metadata: {}
      });

      await executionAgent.executeStep(mockContext, step);

      expect(progressCallback).toHaveBeenCalledWith('step_started', expect.objectContaining({
        stepId: 'progress-step'
      }));
      expect(progressCallback).toHaveBeenCalledWith('step_completed', expect.objectContaining({
        stepId: 'progress-step'
      }));
    });

    it('should handle callback errors gracefully', async () => {
      const faultyCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      executionAgent.addProgressCallback(faultyCallback);

      const step = {
        id: 'callback-test-step',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' }
      };

      mockConnector.query.mockResolvedValue({
        data: [{ id: 1 }],
        metadata: {}
      });

      // Should not throw despite callback error
      await expect(
        executionAgent.executeStep(mockContext, step)
      ).resolves.toBeDefined();
    });

    it('should remove progress callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      executionAgent.addProgressCallback(callback1);
      executionAgent.addProgressCallback(callback2);
      expect(executionAgent.progressCallbacks).toHaveLength(2);

      executionAgent.removeProgressCallback(callback1);
      expect(executionAgent.progressCallbacks).toHaveLength(1);
      expect(executionAgent.progressCallbacks).toContain(callback2);
    });
  });

  describe('plan adaptation', () => {
    it('should adapt plan when failure threshold exceeded', async () => {
      // Test the adaptation logic directly rather than through the complex execution flow
      const mockResults = new Map([
        ['step1', { success: false, stepId: 'step1', error: 'Failed' }],
        ['step2', { success: false, stepId: 'step2', error: 'Failed' }],
        ['step3', { success: false, stepId: 'step3', error: 'Failed' }]
      ]);
      
      const mockErrors = [
        { stepId: 'step1', error: 'Failed' },
        { stepId: 'step2', error: 'Failed' },
        { stepId: 'step3', error: 'Failed' }
      ];

      // Initialize execution context
      executionAgent._initializeExecution('test-investigation', { steps: [] });
      
      // Test the adaptation logic
      const shouldAdapt = executionAgent._shouldAdaptPlan(mockResults, mockErrors);
      expect(shouldAdapt).toBe(true);
      
      // Test adaptation execution
      const adaptation = await executionAgent._adaptExecutionPlan(mockContext, [], mockResults, mockErrors);
      expect(adaptation.analysis).toBeDefined();
      expect(adaptation.analysis.totalFailures).toBe(3);
    });

    it('should generate alternative steps for failed queries', async () => {
      // Mock available data sources to include alternatives
      const mockRegistry = connectorFramework.getRegistry();
      mockRegistry.listConnectors.mockReturnValue([
        { name: 'siem', status: 'active' },
        { name: 'edr', status: 'active' },
        { name: 'virustotal', status: 'active' },
        { name: 'alternative1', status: 'active' },
        { name: 'alternative2', status: 'active' }
      ]);

      const originalStep = {
        id: 'original-step',
        type: 'query',
        dataSources: ['siem'],
        query: { type: 'search' }
      };

      const error = { error: 'Connection failed', stepId: 'original-step' };
      const alternatives = await executionAgent._generateAlternativeSteps(
        mockContext,
        originalStep,
        error
      );

      expect(alternatives).toHaveLength(1);
      expect(alternatives[0].dataSources).not.toContain('siem');
      expect(alternatives[0].id).toContain('alt_');
    });
  });

  describe('execution summary', () => {
    it('should generate comprehensive execution summary', async () => {
      // Setup execution state
      executionAgent.executionContext = {
        investigationId: 'test-123',
        startTime: Date.now() - 5000, // 5 seconds ago
        adaptations: []
      };

      executionAgent.completedSteps.set('step1', { stepId: 'step1' });
      executionAgent.completedSteps.set('step2', { stepId: 'step2' });
      executionAgent.failedSteps.set('step3', { stepId: 'step3' });

      executionAgent.evidence.set('step1', [{ type: 'test' }, { type: 'test' }]);
      executionAgent.evidence.set('step2', [{ type: 'test' }]);

      const summary = executionAgent._generateExecutionSummary();

      expect(summary.totalSteps).toBe(3);
      expect(summary.completedSteps).toBe(2);
      expect(summary.failedSteps).toBe(1);
      expect(summary.successRate).toBe(66.67);
      expect(summary.totalEvidence).toBe(3);
      expect(summary.executionTimeMs).toBeGreaterThan(4000);
      expect(summary.investigationId).toBe('test-123');
    });
  });

  describe('entity extraction', () => {
    it('should extract IP addresses from data', () => {
      const data = {
        message: 'Connection from 192.168.1.100 to 10.0.0.1',
        src_ip: '172.16.0.1'
      };

      const entities = executionAgent._extractEntitiesFromData(data);

      expect(entities).toContainEqual({ type: 'ip', value: '192.168.1.100' });
      expect(entities).toContainEqual({ type: 'ip', value: '10.0.0.1' });
      expect(entities).toContainEqual({ type: 'ip', value: '172.16.0.1' });
    });

    it('should extract domains from data', () => {
      const data = {
        message: 'DNS query for evil.com and malware.example.org'
      };

      const entities = executionAgent._extractEntitiesFromData(data);

      expect(entities).toContainEqual({ type: 'domain', value: 'evil.com' });
      expect(entities).toContainEqual({ type: 'domain', value: 'malware.example.org' });
    });

    it('should extract hashes from data', () => {
      const data = {
        file_hash: 'a1b2c3d4e5f6789012345678901234567890abcd',
        message: 'Hash: 1234567890abcdef1234567890abcdef'
      };

      const entities = executionAgent._extractEntitiesFromData(data);

      expect(entities).toContainEqual({ 
        type: 'hash', 
        value: 'a1b2c3d4e5f6789012345678901234567890abcd' 
      });
      expect(entities).toContainEqual({ 
        type: 'hash', 
        value: '1234567890abcdef1234567890abcdef' 
      });
    });

    it('should extract structured field entities', () => {
      const data = {
        src_ip: '192.168.1.100',
        dst_ip: '10.0.0.1',
        hostname: 'workstation-01',
        user: 'john.doe',
        file_hash: 'abcdef1234567890'
      };

      const entities = executionAgent._extractEntitiesFromData(data);

      expect(entities).toContainEqual({ type: 'ip', value: '192.168.1.100' });
      expect(entities).toContainEqual({ type: 'ip', value: '10.0.0.1' });
      expect(entities).toContainEqual({ type: 'host', value: 'workstation-01' });
      expect(entities).toContainEqual({ type: 'user', value: 'john.doe' });
      expect(entities).toContainEqual({ type: 'hash', value: 'abcdef1234567890' });
    });
  });

  describe('validation criteria', () => {
    it('should validate evidence count criterion', async () => {
      const evidence = [{ type: 'test' }, { type: 'test' }, { type: 'test' }];
      const criterion = { type: 'evidence_count', threshold: 2 };

      const result = await executionAgent._validateCriterion(criterion, evidence);

      expect(result.valid).toBe(true);
      expect(result.actual).toBe(3);
      expect(result.expected).toBe(2);
    });

    it('should validate confidence threshold criterion', async () => {
      const evidence = [
        { type: 'test', confidence: 0.8 },
        { type: 'test', confidence: 0.9 },
        { type: 'test', confidence: 0.7 }
      ];
      const criterion = { type: 'confidence_threshold', threshold: 0.75 };

      const result = await executionAgent._validateCriterion(criterion, evidence);

      expect(result.valid).toBe(true);
      expect(result.actual).toBeCloseTo(0.8, 2);
    });

    it('should validate entity presence criterion', async () => {
      const evidence = [
        {
          type: 'test',
          entities: [
            { type: 'ip', value: '192.168.1.100' },
            { type: 'domain', value: 'evil.com' }
          ]
        }
      ];
      const criterion = {
        type: 'entity_presence',
        condition: { entityType: 'ip', entityValue: '192.168.1.100' }
      };

      const result = await executionAgent._validateCriterion(criterion, evidence);

      expect(result.valid).toBe(true);
    });

    it('should handle unknown validation criteria', async () => {
      const evidence = [];
      const criterion = { type: 'unknown_criterion' };

      const result = await executionAgent._validateCriterion(criterion, evidence);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown validation criterion');
    });
  });
});