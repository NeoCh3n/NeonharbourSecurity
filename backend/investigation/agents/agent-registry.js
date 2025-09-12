const { BaseAgent } = require('./base-agent');

/**
 * Agent Registry - Factory and registry for investigation agents
 * 
 * Manages agent lifecycle, discovery, and communication coordination
 */
class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.agentTypes = new Map();
    this.sharedContext = new Map();
  }

  /**
   * Register an agent type
   * @param {string} type - Agent type identifier (e.g., 'planning', 'execution')
   * @param {Class} AgentClass - Agent class constructor
   * @param {Object} defaultConfig - Default configuration for this agent type
   */
  registerAgentType(type, AgentClass, defaultConfig = {}) {
    if (!AgentClass.prototype instanceof BaseAgent && AgentClass !== BaseAgent) {
      throw new Error(`Agent class for type '${type}' must extend BaseAgent`);
    }

    this.agentTypes.set(type, {
      AgentClass,
      defaultConfig,
      instances: new Map()
    });

    console.log(`Registered agent type: ${type}`);
  }

  /**
   * Create an agent instance
   * @param {string} type - Agent type
   * @param {string} instanceId - Unique instance identifier
   * @param {Object} config - Instance-specific configuration
   * @returns {BaseAgent} Agent instance
   */
  createAgent(type, instanceId, config = {}) {
    const agentType = this.agentTypes.get(type);
    if (!agentType) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    if (this.agents.has(instanceId)) {
      throw new Error(`Agent instance '${instanceId}' already exists`);
    }

    const mergedConfig = { ...agentType.defaultConfig, ...config };
    const agent = new agentType.AgentClass(instanceId, mergedConfig);

    this.agents.set(instanceId, {
      agent,
      type,
      createdAt: new Date(),
      lastUsed: null
    });

    agentType.instances.set(instanceId, agent);

    console.log(`Created agent instance: ${instanceId} (type: ${type})`);
    return agent;
  }

  /**
   * Get an agent instance
   * @param {string} instanceId - Agent instance ID
   * @returns {BaseAgent|null} Agent instance or null if not found
   */
  getAgent(instanceId) {
    const agentInfo = this.agents.get(instanceId);
    if (agentInfo) {
      agentInfo.lastUsed = new Date();
      return agentInfo.agent;
    }
    return null;
  }

  /**
   * Get or create an agent instance
   * @param {string} type - Agent type
   * @param {string} instanceId - Instance ID
   * @param {Object} config - Configuration (used only if creating)
   * @returns {BaseAgent} Agent instance
   */
  getOrCreateAgent(type, instanceId, config = {}) {
    const existing = this.getAgent(instanceId);
    if (existing) {
      return existing;
    }
    return this.createAgent(type, instanceId, config);
  }

  /**
   * Remove an agent instance
   * @param {string} instanceId - Agent instance ID
   * @returns {boolean} True if agent was removed, false if not found
   */
  removeAgent(instanceId) {
    const agentInfo = this.agents.get(instanceId);
    if (!agentInfo) {
      return false;
    }

    const agentType = this.agentTypes.get(agentInfo.type);
    if (agentType) {
      agentType.instances.delete(instanceId);
    }

    this.agents.delete(instanceId);
    console.log(`Removed agent instance: ${instanceId}`);
    return true;
  }

  /**
   * List all agent instances
   * @param {string} type - Optional: filter by agent type
   * @returns {Array} Array of agent information objects
   */
  listAgents(type = null) {
    const agents = [];
    
    for (const [instanceId, agentInfo] of this.agents) {
      if (type && agentInfo.type !== type) {
        continue;
      }

      agents.push({
        instanceId,
        type: agentInfo.type,
        createdAt: agentInfo.createdAt,
        lastUsed: agentInfo.lastUsed,
        metrics: agentInfo.agent.getMetrics(),
        config: agentInfo.agent.getConfig()
      });
    }

    return agents;
  }

  /**
   * Get all registered agent types
   * @returns {Array} Array of agent type names
   */
  getAgentTypes() {
    return Array.from(this.agentTypes.keys());
  }

  /**
   * Execute an agent with context sharing
   * @param {string} instanceId - Agent instance ID
   * @param {Object} context - Investigation context
   * @param {Object} input - Input data
   * @returns {Promise<Object>} Execution result
   */
  async executeAgent(instanceId, context, input) {
    const agent = this.getAgent(instanceId);
    if (!agent) {
      throw new Error(`Agent instance '${instanceId}' not found`);
    }

    // Merge shared context
    const enhancedContext = {
      ...context,
      sharedData: this._getSharedContext(context.investigationId),
      agentRegistry: this
    };

    const result = await agent.executeWithRetry(enhancedContext, input);

    // Update shared context if agent provided updates
    if (result.success && result.result.sharedUpdates) {
      this._updateSharedContext(context.investigationId, result.result.sharedUpdates);
    }

    return result;
  }

  /**
   * Set shared context data for an investigation
   * @param {string} investigationId - Investigation ID
   * @param {string} key - Context key
   * @param {*} value - Context value
   */
  setSharedContext(investigationId, key, value) {
    if (!this.sharedContext.has(investigationId)) {
      this.sharedContext.set(investigationId, new Map());
    }
    this.sharedContext.get(investigationId).set(key, value);
  }

  /**
   * Get shared context data for an investigation
   * @param {string} investigationId - Investigation ID
   * @param {string} key - Context key
   * @returns {*} Context value or undefined
   */
  getSharedContext(investigationId, key) {
    const investigationContext = this.sharedContext.get(investigationId);
    return investigationContext ? investigationContext.get(key) : undefined;
  }

  /**
   * Clear shared context for an investigation
   * @param {string} investigationId - Investigation ID
   */
  clearSharedContext(investigationId) {
    this.sharedContext.delete(investigationId);
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStats() {
    const stats = {
      totalAgentTypes: this.agentTypes.size,
      totalAgentInstances: this.agents.size,
      activeInvestigations: this.sharedContext.size,
      agentTypeBreakdown: {}
    };

    // Count instances per type
    for (const [type, typeInfo] of this.agentTypes) {
      stats.agentTypeBreakdown[type] = typeInfo.instances.size;
    }

    return stats;
  }

  /**
   * Cleanup unused agents (older than specified time)
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {number} Number of agents cleaned up
   */
  cleanupUnusedAgents(maxAgeMs = 3600000) { // Default: 1 hour
    const now = new Date();
    const agentsToRemove = [];

    for (const [instanceId, agentInfo] of this.agents) {
      const lastActivity = agentInfo.lastUsed || agentInfo.createdAt;
      const age = now - lastActivity;

      if (age > maxAgeMs) {
        agentsToRemove.push(instanceId);
      }
    }

    let cleanedUp = 0;
    for (const instanceId of agentsToRemove) {
      if (this.removeAgent(instanceId)) {
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      console.log(`Cleaned up ${cleanedUp} unused agent instances`);
    }

    return cleanedUp;
  }

  // Private methods

  _getSharedContext(investigationId) {
    const context = this.sharedContext.get(investigationId);
    return context ? Object.fromEntries(context) : {};
  }

  _updateSharedContext(investigationId, updates) {
    if (!this.sharedContext.has(investigationId)) {
      this.sharedContext.set(investigationId, new Map());
    }

    const context = this.sharedContext.get(investigationId);
    for (const [key, value] of Object.entries(updates)) {
      context.set(key, value);
    }
  }
}

// Singleton instance
const agentRegistry = new AgentRegistry();

module.exports = { AgentRegistry, agentRegistry };