/**
 * Agent Framework - Main exports
 * 
 * This module provides the complete agent framework for the AI Investigation Engine
 */

const { BaseAgent } = require('./base-agent');
const { AgentRegistry, agentRegistry } = require('./agent-registry');
const { AgentCommunication, agentCommunication } = require('./agent-communication');
const { ExecutionAgent } = require('./execution-agent');
const { AnalysisAgent } = require('./analysis-agent');
const { ResponseAgent } = require('./response-agent');

// Register built-in agents
agentRegistry.registerAgentType('execution', ExecutionAgent, {
  maxParallelSteps: 5,
  stepTimeoutMs: 60000,
  evidenceCorrelationWindow: 3600000,
  maxRetryAttempts: 3,
  adaptationThreshold: 0.3
});

agentRegistry.registerAgentType('analysis', AnalysisAgent, {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 60000,
  confidenceThreshold: 0.7,
  threatIntelEnabled: true,
  mitreMapping: true,
  maxIndicators: 10
});

agentRegistry.registerAgentType('response', ResponseAgent, {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 45000,
  maxRecommendations: 10,
  autoExecuteThreshold: 0.8,
  requireApprovalThreshold: 0.5
});

module.exports = {
  // Base classes
  BaseAgent,
  AgentRegistry,
  AgentCommunication,
  
  // Agent implementations
  ExecutionAgent,
  AnalysisAgent,
  ResponseAgent,
  
  // Singleton instances
  agentRegistry,
  agentCommunication,
  
  // Utility functions
  createAgentFramework: () => ({
    registry: new AgentRegistry(),
    communication: new AgentCommunication()
  })
};