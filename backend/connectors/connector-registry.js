/**
 * Connector Registry
 * 
 * Manages all connector instances, health monitoring, and lifecycle
 * Provides centralized access to all data source connectors
 */

const EventEmitter = require('events');
const { BaseConnector, ConnectorStatus } = require('./base-connector');

/**
 * Connector registry class
 */
class ConnectorRegistry extends EventEmitter {
  constructor() {
    super();
    
    this.connectors = new Map();
    this.connectorTypes = new Map();
    this.healthCheckInterval = null;
    this.healthCheckFrequency = 60000; // 1 minute
    this.isShuttingDown = false;
  }

  /**
   * Register a connector type (class)
   * @param {string} type - Connector type name
   * @param {Function} ConnectorClass - Connector class constructor
   */
  registerConnectorType(type, ConnectorClass) {
    if (!ConnectorClass.prototype instanceof BaseConnector) {
      throw new Error('Connector class must extend BaseConnector');
    }

    this.connectorTypes.set(type, ConnectorClass);
    this.emit('connectorTypeRegistered', { type, ConnectorClass });
  }

  /**
   * Create and register a connector instance
   * @param {Object} config - Connector configuration
   * @returns {Promise<BaseConnector>} Created connector instance
   */
  async createConnector(config) {
    const { type, id, tenantId } = config;

    if (!type || !id || !tenantId) {
      throw new Error('Connector config must include type, id, and tenantId');
    }

    if (this.connectors.has(id)) {
      throw new Error(`Connector with id ${id} already exists`);
    }

    const ConnectorClass = this.connectorTypes.get(type);
    if (!ConnectorClass) {
      throw new Error(`Unknown connector type: ${type}`);
    }

    try {
      const connector = new ConnectorClass(config);
      
      // Set up event listeners
      this.setupConnectorEventListeners(connector);
      
      // Initialize the connector
      await connector.initialize();
      
      // Register the connector
      this.connectors.set(id, connector);
      
      this.emit('connectorCreated', { connector, config });
      
      return connector;
    } catch (error) {
      this.emit('connectorCreationFailed', { config, error });
      throw error;
    }
  }

  /**
   * Set up event listeners for a connector
   * @param {BaseConnector} connector - Connector instance
   */
  setupConnectorEventListeners(connector) {
    connector.on('healthCheckCompleted', (data) => {
      this.emit('connectorHealthCheck', data);
    });

    connector.on('healthCheckFailed', (data) => {
      this.emit('connectorHealthCheckFailed', data);
    });

    connector.on('circuitBreakerOpen', (data) => {
      this.emit('connectorCircuitBreakerOpen', data);
    });

    connector.on('circuitBreakerReset', (data) => {
      this.emit('connectorCircuitBreakerReset', data);
    });

    connector.on('metricsUpdated', (metrics) => {
      this.emit('connectorMetricsUpdated', { 
        connectorId: connector.id, 
        metrics 
      });
    });

    connector.on('error', (error) => {
      this.emit('connectorError', { 
        connectorId: connector.id, 
        error 
      });
    });
  }

  /**
   * Get a connector by ID
   * @param {string} id - Connector ID
   * @returns {BaseConnector|null} Connector instance or null
   */
  getConnector(id) {
    return this.connectors.get(id) || null;
  }

  /**
   * Get all connectors for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Array<BaseConnector>} Array of connector instances
   */
  getConnectorsByTenant(tenantId) {
    return Array.from(this.connectors.values())
      .filter(connector => connector.tenantId === tenantId);
  }

  /**
   * Get connectors by type
   * @param {string} type - Connector type
   * @param {string} tenantId - Optional tenant ID filter
   * @returns {Array<BaseConnector>} Array of connector instances
   */
  getConnectorsByType(type, tenantId = null) {
    return Array.from(this.connectors.values())
      .filter(connector => {
        const typeMatch = connector.type === type;
        const tenantMatch = !tenantId || connector.tenantId === tenantId;
        return typeMatch && tenantMatch;
      });
  }

  /**
   * Get active connectors
   * @param {string} tenantId - Optional tenant ID filter
   * @returns {Array<BaseConnector>} Array of active connector instances
   */
  getActiveConnectors(tenantId = null) {
    return Array.from(this.connectors.values())
      .filter(connector => {
        const isActive = connector.status === ConnectorStatus.ACTIVE;
        const tenantMatch = !tenantId || connector.tenantId === tenantId;
        return isActive && tenantMatch;
      });
  }

  /**
   * Remove a connector
   * @param {string} id - Connector ID
   * @returns {Promise<boolean>} True if connector was removed
   */
  async removeConnector(id) {
    const connector = this.connectors.get(id);
    if (!connector) {
      return false;
    }

    try {
      // Shutdown the connector gracefully
      await connector.shutdown();
      
      // Remove event listeners
      connector.removeAllListeners();
      
      // Remove from registry
      this.connectors.delete(id);
      
      this.emit('connectorRemoved', { connectorId: id });
      
      return true;
    } catch (error) {
      this.emit('connectorRemovalFailed', { connectorId: id, error });
      throw error;
    }
  }

  /**
   * Update connector configuration
   * @param {string} id - Connector ID
   * @param {Object} newConfig - New configuration
   * @returns {Promise<BaseConnector>} Updated connector instance
   */
  async updateConnector(id, newConfig) {
    const oldConnector = this.connectors.get(id);
    if (!oldConnector) {
      throw new Error(`Connector ${id} not found`);
    }

    // Remove old connector
    await this.removeConnector(id);
    
    // Create new connector with updated config
    const updatedConfig = { ...oldConnector.config, ...newConfig, id };
    return await this.createConnector(updatedConfig);
  }

  /**
   * Perform health checks on all connectors
   * @returns {Promise<Object>} Health check results
   */
  async performHealthChecks() {
    const results = {};
    const promises = [];

    for (const [id, connector] of this.connectors) {
      promises.push(
        connector.performHealthCheck()
          .then(result => ({ id, result, success: true }))
          .catch(error => ({ id, error, success: false }))
      );
    }

    const healthCheckResults = await Promise.allSettled(promises);
    
    for (const result of healthCheckResults) {
      if (result.status === 'fulfilled') {
        const { id, result: healthResult, success } = result.value;
        results[id] = success ? healthResult : { error: result.value.error };
      } else {
        // This shouldn't happen with our promise handling, but just in case
        results['unknown'] = { error: result.reason };
      }
    }

    this.emit('healthChecksCompleted', results);
    return results;
  }

  /**
   * Start automatic health checking
   * @param {number} frequency - Health check frequency in milliseconds
   */
  startHealthChecking(frequency = null) {
    if (this.healthCheckInterval) {
      this.stopHealthChecking();
    }

    this.healthCheckFrequency = frequency || this.healthCheckFrequency;
    
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.performHealthChecks();
        } catch (error) {
          this.emit('healthCheckError', error);
        }
      }
    }, this.healthCheckFrequency);

    this.emit('healthCheckingStarted', { frequency: this.healthCheckFrequency });
  }

  /**
   * Stop automatic health checking
   */
  stopHealthChecking() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.emit('healthCheckingStopped');
    }
  }

  /**
   * Get registry status and statistics
   * @returns {Object} Registry status
   */
  getStatus() {
    const connectorsByStatus = {};
    const connectorsByType = {};
    let totalQueries = 0;
    let totalErrors = 0;

    for (const connector of this.connectors.values()) {
      const status = connector.getStatus();
      
      // Count by status
      connectorsByStatus[status.status] = (connectorsByStatus[status.status] || 0) + 1;
      
      // Count by type
      connectorsByType[status.type] = (connectorsByType[status.type] || 0) + 1;
      
      // Aggregate metrics
      totalQueries += status.metrics.totalQueries || 0;
      totalErrors += status.metrics.failedQueries || 0;
    }

    return {
      totalConnectors: this.connectors.size,
      registeredTypes: Array.from(this.connectorTypes.keys()),
      connectorsByStatus,
      connectorsByType,
      totalQueries,
      totalErrors,
      errorRate: totalQueries > 0 ? totalErrors / totalQueries : 0,
      healthCheckingActive: !!this.healthCheckInterval,
      healthCheckFrequency: this.healthCheckFrequency
    };
  }

  /**
   * Get detailed status of all connectors
   * @param {string} tenantId - Optional tenant ID filter
   * @returns {Array<Object>} Array of connector statuses
   */
  getDetailedStatus(tenantId = null) {
    return Array.from(this.connectors.values())
      .filter(connector => !tenantId || connector.tenantId === tenantId)
      .map(connector => connector.getStatus());
  }

  /**
   * Query multiple connectors in parallel
   * @param {Array<string>} connectorIds - Array of connector IDs
   * @param {Object} query - Query parameters
   * @param {string} queryType - Type of query
   * @returns {Promise<Object>} Results from all connectors
   */
  async queryMultiple(connectorIds, query, queryType) {
    const promises = connectorIds.map(async (id) => {
      const connector = this.getConnector(id);
      if (!connector) {
        return { id, error: 'Connector not found', success: false };
      }

      try {
        const result = await connector.query(query, queryType);
        return { id, result, success: true };
      } catch (error) {
        return { id, error: error.message, success: false };
      }
    });

    const results = await Promise.allSettled(promises);
    const response = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { id, result: queryResult, error, success } = result.value;
        response[id] = success ? queryResult : { error };
      } else {
        response['unknown'] = { error: result.reason };
      }
    }

    return response;
  }

  /**
   * Shutdown all connectors gracefully
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.isShuttingDown = true;
    
    // Stop health checking
    this.stopHealthChecking();
    
    // Shutdown all connectors
    const shutdownPromises = Array.from(this.connectors.values())
      .map(connector => connector.shutdown().catch(error => ({ error, connectorId: connector.id })));
    
    const results = await Promise.allSettled(shutdownPromises);
    
    // Clear the registry
    this.connectors.clear();
    
    this.emit('registryShutdown', { results });
  }

  /**
   * Reset circuit breakers for all connectors
   * @param {string} tenantId - Optional tenant ID filter
   */
  resetCircuitBreakers(tenantId = null) {
    const connectors = tenantId ? 
      this.getConnectorsByTenant(tenantId) : 
      Array.from(this.connectors.values());

    for (const connector of connectors) {
      connector.resetCircuitBreaker();
    }

    this.emit('circuitBreakersReset', { 
      count: connectors.length, 
      tenantId 
    });
  }
}

module.exports = ConnectorRegistry;