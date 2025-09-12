/**
 * Execution Agent - Executes investigation steps and collects evidence
 * 
 * Responsible for:
 * - Executing investigation steps in parallel where possible
 * - Querying data sources via connectors
 * - Collecting and correlating evidence
 * - Handling step failures and plan adaptation
 * - Progress tracking and reporting
 */

const { BaseAgent } = require('./base-agent');
const { connectorFramework } = require('../../connectors');

class ExecutionAgent extends BaseAgent {
  constructor(name, config = {}) {
    super(name, {
      maxParallelSteps: 5,
      stepTimeoutMs: 60000,
      evidenceCorrelationWindow: 3600000, // 1 hour
      maxRetryAttempts: 3,
      adaptationThreshold: 0.3, // Adapt plan if 30% of steps fail
      ...config
    });
    
    this.activeSteps = new Map();
    this.completedSteps = new Map();
    this.failedSteps = new Map();
    this.evidence = new Map();
    this.correlations = [];
    this.progressCallbacks = [];
  }

  /**
   * Execute investigation plan
   * @param {Object} context - Investigation context
   * @param {Object} input - Input containing investigation plan and configuration
   * @returns {Promise<Object>} Execution result with evidence and progress
   */
  async execute(context, input) {
    const { plan, investigationId, alertContext } = input;
    
    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
      throw new Error('Invalid investigation plan: missing or invalid steps');
    }

    // Initialize execution state
    this._initializeExecution(investigationId, plan);
    
    try {
      // Execute steps with dependency management
      const executionResult = await this._executeStepsWithDependencies(
        context, 
        plan.steps, 
        alertContext
      );

      // Correlate collected evidence
      const correlatedEvidence = await this._correlateEvidence(context);

      // Generate execution summary
      const summary = this._generateExecutionSummary();

      return {
        success: true,
        investigationId,
        evidence: correlatedEvidence,
        executionSummary: summary,
        adaptedPlan: this._hasAdaptations() ? this._getAdaptedPlan() : null,
        sharedUpdates: {
          [`execution_${investigationId}`]: {
            evidence: correlatedEvidence,
            summary,
            completedAt: new Date().toISOString()
          }
        }
      };

    } catch (error) {
      // Handle execution failure
      const failureResult = await this._handleExecutionFailure(context, error);
      return {
        success: false,
        error: error.message,
        investigationId,
        partialEvidence: this._getCollectedEvidence(),
        failureAnalysis: failureResult,
        executionSummary: this._generateExecutionSummary()
      };
    } finally {
      this._cleanupExecution(investigationId);
    }
  }

  /**
   * Execute a single investigation step
   * @param {Object} context - Investigation context
   * @param {Object} step - Step configuration
   * @param {Object} alertContext - Alert context for the investigation
   * @returns {Promise<Object>} Step execution result
   */
  async executeStep(context, step, alertContext = {}) {
    const stepId = step.id || `step_${Date.now()}`;
    const startTime = Date.now();

    try {
      this._updateStepStatus(stepId, 'running', { startTime });
      this._notifyProgress('step_started', { stepId, step });

      // Validate step configuration
      const validation = this._validateStep(step);
      if (!validation.valid) {
        throw new Error(`Step validation failed: ${validation.errors.join(', ')}`);
      }

      // Execute step based on type
      let result;
      switch (step.type) {
        case 'query':
          result = await this._executeQueryStep(context, step, alertContext);
          break;
        case 'enrich':
          result = await this._executeEnrichStep(context, step, alertContext);
          break;
        case 'correlate':
          result = await this._executeCorrelateStep(context, step, alertContext);
          break;
        case 'validate':
          result = await this._executeValidateStep(context, step, alertContext);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      // Store evidence from step result
      if (result.evidence) {
        this._storeEvidence(stepId, result.evidence, step);
      }

      const executionTime = Date.now() - startTime;
      this._updateStepStatus(stepId, 'completed', { 
        result, 
        executionTime,
        completedAt: new Date().toISOString()
      });
      
      this._notifyProgress('step_completed', { stepId, step, result, executionTime });

      return {
        success: true,
        stepId,
        result,
        executionTime,
        evidenceCount: result.evidence ? result.evidence.length : 0
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this._updateStepStatus(stepId, 'failed', { 
        error: error.message, 
        executionTime,
        failedAt: new Date().toISOString()
      });
      
      this._notifyProgress('step_failed', { stepId, step, error: error.message, executionTime });

      // Determine if step should be retried or adapted
      const shouldRetry = this._shouldRetryStep(step, error);
      const adaptation = shouldRetry ? null : await this._adaptStepFailure(context, step, error);

      return {
        success: false,
        stepId,
        error: error.message,
        executionTime,
        shouldRetry,
        adaptation
      };
    }
  }

  /**
   * Execute multiple steps in parallel with dependency management
   * @param {Object} context - Investigation context
   * @param {Array} steps - Array of investigation steps
   * @param {Object} alertContext - Alert context
   * @returns {Promise<Object>} Parallel execution result
   */
  async executeParallelSteps(context, steps, alertContext = {}) {
    const dependencyGraph = this._buildDependencyGraph(steps);
    const executionQueue = this._createExecutionQueue(dependencyGraph);
    const results = new Map();
    const errors = [];
    let maxIterations = steps.length * 10; // Prevent infinite loops

    while ((executionQueue.length > 0 || this.activeSteps.size > 0) && maxIterations > 0) {
      maxIterations--;
      
      // Start new steps that have no pending dependencies
      const readySteps = executionQueue.filter(step => 
        this._areDependenciesSatisfied(step, results)
      );

      // Remove ready steps from queue and start execution (respecting parallel limit)
      const stepsToStart = readySteps.slice(0, this.config.maxParallelSteps - this.activeSteps.size);
      
      for (const step of stepsToStart) {
        const index = executionQueue.indexOf(step);
        executionQueue.splice(index, 1);
        
        const stepPromise = this.executeStep(context, step, alertContext)
          .then(result => {
            this.activeSteps.delete(step.id);
            results.set(step.id, result);
            return result;
          })
          .catch(error => {
            this.activeSteps.delete(step.id);
            const errorResult = { success: false, stepId: step.id, error: error.message };
            results.set(step.id, errorResult);
            errors.push(errorResult);
            return errorResult;
          });

        this.activeSteps.set(step.id, stepPromise);
      }

      // Wait for at least one step to complete if we have active steps
      if (this.activeSteps.size > 0) {
        try {
          await Promise.race(Array.from(this.activeSteps.values()));
        } catch (error) {
          // Race will resolve when any promise completes, errors are handled above
        }
      }

      // If no progress can be made, break out
      if (stepsToStart.length === 0 && this.activeSteps.size === 0 && executionQueue.length > 0) {
        // Mark remaining steps as failed due to unmet dependencies
        for (const step of executionQueue) {
          const errorResult = { success: false, stepId: step.id, error: 'Unmet dependencies' };
          results.set(step.id, errorResult);
          errors.push(errorResult);
        }
        break;
      }

      // Check if we should adapt the plan due to failures
      if (this._shouldAdaptPlan(results, errors)) {
        const adaptation = await this._adaptExecutionPlan(context, steps, results, errors);
        if (adaptation.newSteps && adaptation.newSteps.length > 0) {
          // Add adapted steps to execution queue
          executionQueue.push(...adaptation.newSteps);
        }
      }
    }

    const completedSteps = Array.from(results.values()).filter(r => r.success).length;
    
    // Check if we should adapt the plan due to failures before throwing error
    if (this._shouldAdaptPlan(results, errors)) {
      const adaptation = await this._adaptExecutionPlan(context, steps, results, errors);
      if (adaptation.newSteps && adaptation.newSteps.length > 0) {
        // Add adapted steps to execution queue - but since we're at the end, just log the adaptation
        console.log('Plan adapted due to high failure rate');
      }
    }
    
    // If all steps failed, throw an error to trigger failure handling
    if (completedSteps === 0 && steps.length > 0) {
      throw new Error(`All ${steps.length} investigation steps failed: ${errors.map(e => e.error).join(', ')}`);
    }

    return {
      totalSteps: steps.length,
      completedSteps,
      failedSteps: errors.length,
      results: Object.fromEntries(results),
      errors,
      evidence: this._getCollectedEvidence()
    };
  }

  /**
   * Handle step failure and determine recovery strategy
   * @param {Object} step - Failed step
   * @param {Error} error - Error that occurred
   * @param {Object} context - Investigation context
   * @returns {Object} Failure handling result
   */
  async handleStepFailure(step, error, context) {
    const failureType = this._classifyFailure(error);
    const retryCount = this.failedSteps.get(step.id)?.retryCount || 0;

    // Log failure for analysis
    this._logStepFailure(step, error, failureType, retryCount);

    // Determine recovery strategy
    const strategy = this._determineRecoveryStrategy(step, error, failureType, retryCount);

    switch (strategy.action) {
      case 'retry':
        return await this._retryStep(context, step, strategy.delay);
      
      case 'adapt':
        return await this._adaptStepFailure(context, step, error);
      
      case 'skip':
        return this._skipStep(step, error, strategy.reason);
      
      case 'escalate':
        return this._escalateStepFailure(step, error, strategy.reason);
      
      default:
        throw new Error(`Unknown recovery strategy: ${strategy.action}`);
    }
  }

  /**
   * Add progress callback for real-time updates
   * @param {Function} callback - Progress callback function
   */
  addProgressCallback(callback) {
    if (typeof callback === 'function') {
      this.progressCallbacks.push(callback);
    }
  }

  /**
   * Remove progress callback
   * @param {Function} callback - Progress callback to remove
   */
  removeProgressCallback(callback) {
    const index = this.progressCallbacks.indexOf(callback);
    if (index > -1) {
      this.progressCallbacks.splice(index, 1);
    }
  }

  // Private methods

  _initializeExecution(investigationId, plan) {
    this.activeSteps.clear();
    this.completedSteps.clear();
    this.failedSteps.clear();
    this.evidence.clear();
    this.correlations = [];
    
    this.executionContext = {
      investigationId,
      plan,
      startTime: Date.now(),
      adaptations: []
    };
  }

  async _executeStepsWithDependencies(context, steps, alertContext) {
    return await this.executeParallelSteps(context, steps, alertContext);
  }

  async _executeQueryStep(context, step, alertContext) {
    const { dataSources, query, parameters = {} } = step;
    const results = [];

    for (const dataSource of dataSources) {
      try {
        const connector = await this._getConnector(context, dataSource);
        const queryResult = await connector.query(query, {
          ...parameters,
          ...alertContext,
          timeout: this.config.stepTimeoutMs
        });

        results.push({
          dataSource,
          success: true,
          data: queryResult.data,
          metadata: queryResult.metadata
        });

      } catch (error) {
        results.push({
          dataSource,
          success: false,
          error: error.message
        });
        
        // If all data sources fail, throw error to fail the step
        if (results.length === dataSources.length && results.every(r => !r.success)) {
          throw new Error(`All data sources failed: ${results.map(r => r.error).join(', ')}`);
        }
      }
    }

    return {
      type: 'query',
      results,
      evidence: this._extractEvidenceFromQueryResults(results),
      summary: `Queried ${dataSources.length} data sources, ${results.filter(r => r.success).length} successful`
    };
  }

  async _executeEnrichStep(context, step, alertContext) {
    const { entities, enrichmentSources } = step;
    const enrichedData = {};
    let hasAnySuccess = false;

    for (const entity of entities) {
      enrichedData[entity.type] = enrichedData[entity.type] || {};
      
      for (const source of enrichmentSources) {
        try {
          const connector = await this._getConnector(context, source);
          const enrichment = await connector.enrich(entity.value, entity.type);
          
          enrichedData[entity.type][entity.value] = {
            ...enrichedData[entity.type][entity.value],
            [source]: enrichment
          };
          hasAnySuccess = true;

        } catch (error) {
          enrichedData[entity.type][entity.value] = {
            ...enrichedData[entity.type][entity.value],
            [source]: { error: error.message }
          };
        }
      }
    }

    // If no enrichment succeeded, throw error
    if (!hasAnySuccess) {
      throw new Error('All enrichment sources failed');
    }

    return {
      type: 'enrich',
      enrichedData,
      evidence: this._extractEvidenceFromEnrichment(enrichedData),
      summary: `Enriched ${entities.length} entities from ${enrichmentSources.length} sources`
    };
  }

  async _executeCorrelateStep(context, step, alertContext) {
    const { correlationType, timeWindow, entities } = step;
    const correlations = [];

    // Get existing evidence for correlation
    const existingEvidence = Array.from(this.evidence.values()).flat();
    
    // Perform correlation based on type
    switch (correlationType) {
      case 'temporal':
        correlations.push(...this._performTemporalCorrelation(existingEvidence, timeWindow));
        break;
      case 'spatial':
        correlations.push(...this._performSpatialCorrelation(existingEvidence, entities));
        break;
      case 'behavioral':
        correlations.push(...this._performBehavioralCorrelation(existingEvidence, entities));
        break;
    }

    return {
      type: 'correlate',
      correlations,
      evidence: correlations.map(c => ({
        type: 'correlation',
        correlationType,
        entities: c.entities,
        confidence: c.confidence,
        description: c.description,
        timestamp: new Date().toISOString()
      })),
      summary: `Found ${correlations.length} ${correlationType} correlations`
    };
  }

  async _executeValidateStep(context, step, alertContext) {
    const { validationType, criteria, evidence } = step;
    const validationResults = [];

    for (const criterion of criteria) {
      const result = await this._validateCriterion(criterion, evidence || this._getCollectedEvidence());
      validationResults.push(result);
    }

    const overallValid = validationResults.every(r => r.valid);
    
    return {
      type: 'validate',
      valid: overallValid,
      validationResults,
      evidence: [{
        type: 'validation',
        validationType,
        result: overallValid,
        details: validationResults,
        timestamp: new Date().toISOString()
      }],
      summary: `Validation ${overallValid ? 'passed' : 'failed'}: ${validationResults.filter(r => r.valid).length}/${validationResults.length} criteria met`
    };
  }

  async _getConnector(context, dataSourceName) {
    const registry = connectorFramework.getRegistry();
    const connector = registry.getConnector(context.tenantId, dataSourceName);
    
    if (!connector) {
      throw new Error(`Connector not found for data source: ${dataSourceName}`);
    }
    
    return connector;
  }

  _validateStep(step) {
    const errors = [];

    if (!step.type) {
      errors.push('Step type is required');
    }

    if (!step.id) {
      errors.push('Step ID is required');
    }

    switch (step.type) {
      case 'query':
        if (!step.dataSources || !Array.isArray(step.dataSources)) {
          errors.push('Query step requires dataSources array');
        }
        if (!step.query) {
          errors.push('Query step requires query object');
        }
        break;
      
      case 'enrich':
        if (!step.entities || !Array.isArray(step.entities)) {
          errors.push('Enrich step requires entities array');
        }
        if (!step.enrichmentSources || !Array.isArray(step.enrichmentSources)) {
          errors.push('Enrich step requires enrichmentSources array');
        }
        break;
      
      case 'correlate':
        if (!step.correlationType) {
          errors.push('Correlate step requires correlationType');
        }
        break;
      
      case 'validate':
        if (!step.criteria || !Array.isArray(step.criteria)) {
          errors.push('Validate step requires criteria array');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _buildDependencyGraph(steps) {
    const graph = new Map();
    
    for (const step of steps) {
      graph.set(step.id, {
        step,
        dependencies: step.dependencies || [],
        dependents: []
      });
    }

    // Build reverse dependencies
    for (const [stepId, node] of graph) {
      for (const depId of node.dependencies) {
        const depNode = graph.get(depId);
        if (depNode) {
          depNode.dependents.push(stepId);
        }
      }
    }

    return graph;
  }

  _createExecutionQueue(dependencyGraph) {
    return Array.from(dependencyGraph.values()).map(node => node.step);
  }

  _areDependenciesSatisfied(step, results) {
    if (!step.dependencies || step.dependencies.length === 0) {
      return true;
    }

    return step.dependencies.every(depId => {
      const result = results.get(depId);
      return result && result.success;
    });
  }

  _shouldAdaptPlan(results, errors) {
    const totalSteps = results.size;
    const failureRate = errors.length / totalSteps;
    return failureRate >= this.config.adaptationThreshold;
  }

  async _adaptExecutionPlan(context, originalSteps, results, errors) {
    // Analyze failures to determine adaptation strategy
    const failureAnalysis = this._analyzeFailures(errors);
    
    // Generate alternative steps for failed ones
    const adaptedSteps = [];
    
    for (const error of errors) {
      const originalStep = originalSteps.find(s => s.id === error.stepId);
      if (originalStep) {
        const alternatives = await this._generateAlternativeSteps(context, originalStep, error);
        adaptedSteps.push(...alternatives);
      }
    }

    this.executionContext.adaptations.push({
      timestamp: new Date().toISOString(),
      reason: 'High failure rate detected',
      failureAnalysis,
      originalSteps: errors.map(e => e.stepId),
      newSteps: adaptedSteps.map(s => s.id)
    });

    return {
      newSteps: adaptedSteps,
      analysis: failureAnalysis
    };
  }

  async _correlateEvidence(context) {
    const allEvidence = this._getCollectedEvidence();
    
    // Perform temporal correlation
    const temporalCorrelations = this._performTemporalCorrelation(
      allEvidence, 
      this.config.evidenceCorrelationWindow
    );

    // Perform entity-based correlation
    const entityCorrelations = this._performEntityCorrelation(allEvidence);

    // Combine correlations
    this.correlations = [...temporalCorrelations, ...entityCorrelations];

    return {
      evidence: allEvidence,
      correlations: this.correlations,
      timeline: this._buildEvidenceTimeline(allEvidence),
      entities: this._extractUniqueEntities(allEvidence)
    };
  }

  _performTemporalCorrelation(evidence, timeWindow) {
    const correlations = [];
    const timeGroups = new Map();

    // Group evidence by time windows
    for (const item of evidence) {
      if (item.timestamp) {
        const timestamp = new Date(item.timestamp).getTime();
        const windowStart = Math.floor(timestamp / timeWindow) * timeWindow;
        
        if (!timeGroups.has(windowStart)) {
          timeGroups.set(windowStart, []);
        }
        timeGroups.get(windowStart).push(item);
      }
    }

    // Find correlations within time windows
    for (const [windowStart, items] of timeGroups) {
      if (items.length > 1) {
        correlations.push({
          type: 'temporal',
          timeWindow: {
            start: new Date(windowStart).toISOString(),
            end: new Date(windowStart + timeWindow).toISOString()
          },
          entities: items.map(i => i.entities || []).flat(),
          confidence: this._calculateTemporalConfidence(items),
          description: `${items.length} events occurred within ${timeWindow/1000}s window`,
          evidence: items
        });
      }
    }

    return correlations;
  }

  _performSpatialCorrelation(evidence, entities) {
    const correlations = [];
    const spatialGroups = new Map();

    // Group evidence by spatial entities (IPs, hosts, etc.)
    for (const item of evidence) {
      const itemEntities = item.entities || [];
      for (const entity of itemEntities) {
        if (['ip', 'host', 'network'].includes(entity.type)) {
          if (!spatialGroups.has(entity.value)) {
            spatialGroups.set(entity.value, []);
          }
          spatialGroups.get(entity.value).push(item);
        }
      }
    }

    // Find correlations for entities with multiple evidence items
    for (const [entityValue, items] of spatialGroups) {
      if (items.length > 1) {
        correlations.push({
          type: 'spatial',
          entity: entityValue,
          entities: items.map(i => i.entities || []).flat(),
          confidence: this._calculateSpatialConfidence(items),
          description: `${items.length} events associated with ${entityValue}`,
          evidence: items
        });
      }
    }

    return correlations;
  }

  _performBehavioralCorrelation(evidence, entities) {
    const correlations = [];
    const behaviorPatterns = new Map();

    // Group evidence by behavioral patterns
    for (const item of evidence) {
      if (item.behavior || item.action) {
        const pattern = item.behavior || item.action;
        if (!behaviorPatterns.has(pattern)) {
          behaviorPatterns.set(pattern, []);
        }
        behaviorPatterns.get(pattern).push(item);
      }
    }

    // Find behavioral correlations
    for (const [pattern, items] of behaviorPatterns) {
      if (items.length > 1) {
        correlations.push({
          type: 'behavioral',
          pattern,
          entities: items.map(i => i.entities || []).flat(),
          confidence: this._calculateBehavioralConfidence(items),
          description: `${items.length} instances of ${pattern} behavior`,
          evidence: items
        });
      }
    }

    return correlations;
  }

  _performEntityCorrelation(evidence) {
    const correlations = [];
    const entityMap = new Map();

    // Build entity occurrence map
    for (const item of evidence) {
      const entities = item.entities || [];
      for (const entity of entities) {
        const key = `${entity.type}:${entity.value}`;
        if (!entityMap.has(key)) {
          entityMap.set(key, []);
        }
        entityMap.get(key).push(item);
      }
    }

    // Find entities that appear in multiple evidence items
    for (const [entityKey, items] of entityMap) {
      if (items.length > 1) {
        const [type, value] = entityKey.split(':');
        correlations.push({
          type: 'entity',
          entity: { type, value },
          entities: items.map(i => i.entities || []).flat(),
          confidence: this._calculateEntityConfidence(items),
          description: `Entity ${value} appears in ${items.length} evidence items`,
          evidence: items
        });
      }
    }

    return correlations;
  }

  _calculateTemporalConfidence(items) {
    // Higher confidence for more items in same time window
    return Math.min(0.9, 0.3 + (items.length * 0.1));
  }

  _calculateSpatialConfidence(items) {
    // Higher confidence for more diverse evidence types from same entity
    const evidenceTypes = new Set(items.map(i => i.type));
    return Math.min(0.9, 0.4 + (evidenceTypes.size * 0.1));
  }

  _calculateBehavioralConfidence(items) {
    // Higher confidence for consistent behavioral patterns
    return Math.min(0.9, 0.5 + (items.length * 0.05));
  }

  _calculateEntityConfidence(items) {
    // Higher confidence for entities appearing across different data sources
    const sources = new Set(items.map(i => i.source));
    return Math.min(0.9, 0.3 + (sources.size * 0.15));
  }

  _buildEvidenceTimeline(evidence) {
    return evidence
      .filter(item => item.timestamp)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(item => ({
        timestamp: item.timestamp,
        type: item.type,
        source: item.source,
        description: item.description || item.summary,
        entities: item.entities || []
      }));
  }

  _extractUniqueEntities(evidence) {
    const entityMap = new Map();
    
    for (const item of evidence) {
      const entities = item.entities || [];
      for (const entity of entities) {
        const key = `${entity.type}:${entity.value}`;
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            type: entity.type,
            value: entity.value,
            sources: new Set(),
            evidenceCount: 0
          });
        }
        
        const entityInfo = entityMap.get(key);
        entityInfo.sources.add(item.source);
        entityInfo.evidenceCount++;
      }
    }

    return Array.from(entityMap.values()).map(entity => ({
      ...entity,
      sources: Array.from(entity.sources)
    }));
  }

  _storeEvidence(stepId, evidence, step) {
    if (!this.evidence.has(stepId)) {
      this.evidence.set(stepId, []);
    }

    const enrichedEvidence = evidence.map(item => ({
      ...item,
      stepId,
      stepType: step.type,
      source: step.dataSources ? step.dataSources[0] : 'unknown',
      collectedAt: new Date().toISOString()
    }));

    this.evidence.get(stepId).push(...enrichedEvidence);
  }

  _getCollectedEvidence() {
    return Array.from(this.evidence.values()).flat();
  }

  _extractEvidenceFromQueryResults(results) {
    const evidence = [];
    
    for (const result of results) {
      if (result.success && result.data) {
        // Extract evidence based on data structure
        if (Array.isArray(result.data)) {
          for (const item of result.data) {
            evidence.push({
              type: 'query_result',
              source: result.dataSource,
              data: item,
              timestamp: item.timestamp || new Date().toISOString(),
              entities: this._extractEntitiesFromData(item)
            });
          }
        } else {
          evidence.push({
            type: 'query_result',
            source: result.dataSource,
            data: result.data,
            timestamp: result.data.timestamp || new Date().toISOString(),
            entities: this._extractEntitiesFromData(result.data)
          });
        }
      }
    }

    return evidence;
  }

  _extractEvidenceFromEnrichment(enrichedData) {
    const evidence = [];
    
    for (const [entityType, entities] of Object.entries(enrichedData)) {
      for (const [entityValue, enrichments] of Object.entries(entities)) {
        for (const [source, enrichment] of Object.entries(enrichments)) {
          if (!enrichment.error) {
            evidence.push({
              type: 'enrichment',
              source,
              entityType,
              entityValue,
              data: enrichment,
              timestamp: new Date().toISOString(),
              entities: [{ type: entityType, value: entityValue }]
            });
          }
        }
      }
    }

    return evidence;
  }

  _extractEntitiesFromData(data) {
    const entities = [];
    
    // Common entity extraction patterns
    const patterns = {
      ip: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
      domain: /\b[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\b/g,
      hash: /\b[a-fA-F0-9]{32,64}\b/g,
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    };

    const text = JSON.stringify(data);
    
    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          entities.push({ type, value: match });
        }
      }
    }

    // Extract from structured fields
    if (typeof data === 'object') {
      if (data.src_ip) entities.push({ type: 'ip', value: data.src_ip });
      if (data.dst_ip) entities.push({ type: 'ip', value: data.dst_ip });
      if (data.hostname) entities.push({ type: 'host', value: data.hostname });
      if (data.user) entities.push({ type: 'user', value: data.user });
      if (data.file_hash) entities.push({ type: 'hash', value: data.file_hash });
    }

    return entities;
  }

  async _validateCriterion(criterion, evidence) {
    const { type, condition, threshold } = criterion;
    
    switch (type) {
      case 'evidence_count':
        const count = evidence.length;
        return {
          valid: count >= threshold,
          criterion: type,
          expected: threshold,
          actual: count,
          description: `Evidence count: ${count} (required: ${threshold})`
        };
      
      case 'confidence_threshold':
        const avgConfidence = evidence
          .filter(e => e.confidence !== undefined)
          .reduce((sum, e, _, arr) => sum + e.confidence / arr.length, 0);
        return {
          valid: avgConfidence >= threshold,
          criterion: type,
          expected: threshold,
          actual: avgConfidence,
          description: `Average confidence: ${avgConfidence.toFixed(2)} (required: ${threshold})`
        };
      
      case 'entity_presence':
        const hasEntity = evidence.some(e => 
          e.entities && e.entities.some(entity => 
            entity.type === condition.entityType && 
            entity.value === condition.entityValue
          )
        );
        return {
          valid: hasEntity,
          criterion: type,
          expected: condition,
          actual: hasEntity,
          description: `Entity ${condition.entityType}:${condition.entityValue} ${hasEntity ? 'found' : 'not found'}`
        };
      
      default:
        return {
          valid: false,
          criterion: type,
          error: `Unknown validation criterion: ${type}`
        };
    }
  }

  _updateStepStatus(stepId, status, data = {}) {
    const stepInfo = {
      stepId,
      status,
      timestamp: new Date().toISOString(),
      ...data
    };

    switch (status) {
      case 'completed':
        this.completedSteps.set(stepId, stepInfo);
        break;
      case 'failed':
        this.failedSteps.set(stepId, stepInfo);
        break;
    }
  }

  _notifyProgress(event, data) {
    for (const callback of this.progressCallbacks) {
      try {
        callback(event, data);
      } catch (error) {
        console.warn('Progress callback error:', error.message);
      }
    }
  }

  _shouldRetryStep(step, error) {
    const retryCount = this.failedSteps.get(step.id)?.retryCount || 0;
    return retryCount < this.config.maxRetryAttempts && this._isRetryableError(error);
  }

  async _retryStep(context, step, delay = 0) {
    if (delay > 0 && process.env.NODE_ENV !== 'test') {
      await this._sleep(delay);
    }

    const currentRetryCount = this.failedSteps.get(step.id)?.retryCount || 0;
    this.failedSteps.set(step.id, { 
      ...this.failedSteps.get(step.id), 
      retryCount: currentRetryCount + 1 
    });

    return { action: 'retry', retryCount: currentRetryCount + 1 };
  }

  async _adaptStepFailure(context, step, error) {
    // Generate alternative approaches for the failed step
    const alternatives = await this._generateAlternativeSteps(context, step, error);
    
    return {
      action: 'adapt',
      originalStep: step.id,
      alternatives,
      reason: `Step failed: ${error.message}`
    };
  }

  _skipStep(step, error, reason) {
    return {
      action: 'skip',
      stepId: step.id,
      reason,
      error: error.message
    };
  }

  _escalateStepFailure(step, error, reason) {
    return {
      action: 'escalate',
      stepId: step.id,
      error: error.message,
      reason,
      requiresHumanIntervention: true
    };
  }

  _classifyFailure(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('rate limit')) return 'rate_limit';
    if (message.includes('authentication')) return 'auth_failure';
    if (message.includes('not found')) return 'not_found';
    if (message.includes('network')) return 'network_error';
    if (message.includes('permission')) return 'permission_denied';
    
    return 'unknown';
  }

  _determineRecoveryStrategy(step, error, failureType, retryCount) {
    // Strategy based on failure type and retry count
    switch (failureType) {
      case 'timeout':
      case 'network_error':
        return retryCount < 2 ? 
          { action: 'retry', delay: 1000 * Math.pow(2, retryCount) } :
          { action: 'adapt', reason: 'Max retries exceeded for network issue' };
      
      case 'rate_limit':
        return retryCount < 1 ?
          { action: 'retry', delay: 5000 } :
          { action: 'skip', reason: 'Rate limit exceeded, skipping step' };
      
      case 'auth_failure':
      case 'permission_denied':
        return { action: 'escalate', reason: 'Authentication/permission issue requires intervention' };
      
      case 'not_found':
        return { action: 'adapt', reason: 'Resource not found, trying alternative approach' };
      
      default:
        return retryCount < 1 ?
          { action: 'retry', delay: 1000 } :
          { action: 'escalate', reason: 'Unknown error type requires investigation' };
    }
  }

  async _generateAlternativeSteps(context, originalStep, error) {
    const alternatives = [];
    
    switch (originalStep.type) {
      case 'query':
        // Try alternative data sources
        const availableSources = await this._getAvailableDataSources(context);
        const originalSources = originalStep.dataSources || [];
        const alternativeSources = availableSources.filter(
          source => !originalSources.includes(source)
        );
        
        if (alternativeSources.length > 0) {
          alternatives.push({
            ...originalStep,
            id: `${originalStep.id}_alt_${Date.now()}`,
            dataSources: alternativeSources.slice(0, 2), // Limit to 2 alternatives
            description: `Alternative query using ${alternativeSources.join(', ')}`
          });
        }
        break;
      
      case 'enrich':
        // Try alternative enrichment sources
        const originalEnrichmentSources = originalStep.enrichmentSources || [];
        const altEnrichmentSources = ['virustotal', 'threatintel', 'osint'].filter(
          source => !originalEnrichmentSources.includes(source)
        );
        
        if (altEnrichmentSources.length > 0) {
          alternatives.push({
            ...originalStep,
            id: `${originalStep.id}_alt_${Date.now()}`,
            enrichmentSources: altEnrichmentSources.slice(0, 1),
            description: `Alternative enrichment using ${altEnrichmentSources[0]}`
          });
        }
        break;
    }

    return alternatives;
  }

  async _getAvailableDataSources(context) {
    try {
      const registry = connectorFramework.getRegistry();
      const connectors = registry.listConnectors(context.tenantId);
      return connectors
        .filter(c => c.status === 'active')
        .map(c => c.name);
    } catch (error) {
      return [];
    }
  }

  _analyzeFailures(errors) {
    const failureTypes = {};
    const failedDataSources = new Set();
    
    for (const error of errors) {
      const type = this._classifyFailure(new Error(error.error));
      failureTypes[type] = (failureTypes[type] || 0) + 1;
      
      // Extract data source from error context if available
      if (error.dataSource) {
        failedDataSources.add(error.dataSource);
      }
    }

    return {
      totalFailures: errors.length,
      failureTypes,
      failedDataSources: Array.from(failedDataSources),
      recommendations: this._generateFailureRecommendations(failureTypes, failedDataSources)
    };
  }

  _generateFailureRecommendations(failureTypes, failedDataSources) {
    const recommendations = [];
    
    if (failureTypes.auth_failure > 0) {
      recommendations.push('Check authentication credentials for data sources');
    }
    
    if (failureTypes.rate_limit > 0) {
      recommendations.push('Consider implementing request throttling or upgrading API limits');
    }
    
    if (failureTypes.network_error > 0) {
      recommendations.push('Check network connectivity to external services');
    }
    
    if (failedDataSources.size > 0) {
      recommendations.push(`Review configuration for: ${Array.from(failedDataSources).join(', ')}`);
    }

    return recommendations;
  }

  _generateExecutionSummary() {
    const totalSteps = this.completedSteps.size + this.failedSteps.size;
    const successRate = totalSteps > 0 ? (this.completedSteps.size / totalSteps) * 100 : 0;
    const totalEvidence = this._getCollectedEvidence().length;
    const executionTime = Date.now() - this.executionContext.startTime;

    return {
      totalSteps,
      completedSteps: this.completedSteps.size,
      failedSteps: this.failedSteps.size,
      successRate: Math.round(successRate * 100) / 100,
      totalEvidence,
      correlationsFound: this.correlations.length,
      executionTimeMs: executionTime,
      adaptations: this.executionContext.adaptations.length,
      investigationId: this.executionContext.investigationId
    };
  }

  _hasAdaptations() {
    return this.executionContext.adaptations.length > 0;
  }

  _getAdaptedPlan() {
    return {
      originalPlan: this.executionContext.plan,
      adaptations: this.executionContext.adaptations,
      adaptedAt: new Date().toISOString()
    };
  }

  async _handleExecutionFailure(context, error) {
    return {
      error: error.message,
      failureType: this._classifyFailure(error),
      partialResults: {
        completedSteps: this.completedSteps.size,
        failedSteps: this.failedSteps.size,
        evidenceCollected: this._getCollectedEvidence().length
      },
      recommendations: [
        'Review failed steps for common patterns',
        'Check data source connectivity',
        'Consider manual investigation for critical evidence'
      ]
    };
  }

  _cleanupExecution(investigationId) {
    // Clean up execution state immediately for tests
    this.activeSteps.clear();
    
    // In test environment, clean up immediately
    if (process.env.NODE_ENV === 'test') {
      this.completedSteps.clear();
      this.failedSteps.clear();
      this.evidence.clear();
      this.correlations = [];
    } else {
      // Keep completed steps and evidence for a short time for debugging in production
      setTimeout(() => {
        this.completedSteps.clear();
        this.failedSteps.clear();
        this.evidence.clear();
        this.correlations = [];
      }, 300000); // 5 minutes
    }
  }

  _logStepFailure(step, error, failureType, retryCount) {
    console.warn(`Step ${step.id} failed (attempt ${retryCount + 1}):`, {
      stepType: step.type,
      error: error.message,
      failureType,
      step: step.description || step.id
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { ExecutionAgent };