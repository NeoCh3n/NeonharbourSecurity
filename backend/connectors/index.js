/**
 * Connector Framework Main Export
 * 
 * Provides centralized access to all connector framework components
 */

const { BaseConnector, AuthTypes, ConnectorStatus, QueryTypes } = require('./base-connector');
const AuthHandler = require('./auth-handler');
const { RateLimiter, RateLimitStrategy } = require('./rate-limiter');
const { CircuitBreaker, CircuitState } = require('./circuit-breaker');
const ConnectorRegistry = require('./connector-registry');
const { SiemConnector, SiemQueryTypes } = require('./siem-connector');
const { VirusTotalConnector, VirusTotalQueryTypes } = require('./virustotal-connector');
const { MockEdrConnector, EdrQueryTypes } = require('./mock-edr-connector');
const { ConnectorValidator } = require('./connector-validator');

/**
 * Connector Framework Factory
 */
class ConnectorFramework {
  constructor() {
    this.registry = new ConnectorRegistry();
    this.initialized = false;
  }

  /**
   * Initialize the connector framework
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    // Register built-in connector types
    this.registry.registerConnectorType('siem', SiemConnector);
    this.registry.registerConnectorType('virustotal', VirusTotalConnector);
    this.registry.registerConnectorType('mock_edr', MockEdrConnector);
    
    // Start health checking
    this.registry.startHealthChecking();
    
    this.initialized = true;
  }

  /**
   * Create a new connector
   * @param {Object} config - Connector configuration
   * @returns {Promise<BaseConnector>} Created connector instance
   */
  async createConnector(config) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return await this.registry.createConnector(config);
  }

  /**
   * Get the connector registry
   * @returns {ConnectorRegistry} Registry instance
   */
  getRegistry() {
    return this.registry;
  }

  /**
   * Shutdown the framework
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.registry) {
      await this.registry.shutdown();
    }
    this.initialized = false;
  }
}

// Create singleton instance
const connectorFramework = new ConnectorFramework();

module.exports = {
  // Main framework
  ConnectorFramework,
  connectorFramework,
  
  // Core components
  BaseConnector,
  AuthHandler,
  RateLimiter,
  CircuitBreaker,
  ConnectorRegistry,
  
  // Built-in connectors
  SiemConnector,
  VirusTotalConnector,
  MockEdrConnector,
  
  // Utilities
  ConnectorValidator,
  
  // Enums and constants
  AuthTypes,
  ConnectorStatus,
  QueryTypes,
  SiemQueryTypes,
  VirusTotalQueryTypes,
  EdrQueryTypes,
  RateLimitStrategy,
  CircuitState,
  
  // Utility functions
  createConnector: (config) => connectorFramework.createConnector(config),
  getRegistry: () => connectorFramework.getRegistry(),
  initialize: () => connectorFramework.initialize(),
  shutdown: () => connectorFramework.shutdown()
};