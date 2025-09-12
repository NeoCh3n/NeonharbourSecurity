/**
 * Base Connector Interface
 * 
 * Provides standardized interface for all external data source connectors
 * Handles authentication, rate limiting, health checking, and error handling
 */

const EventEmitter = require('events');

/**
 * Authentication types supported by connectors
 */
const AuthTypes = {
  API_KEY: 'api_key',
  OAUTH: 'oauth',
  CERTIFICATE: 'certificate',
  BASIC: 'basic',
  BEARER: 'bearer'
};

/**
 * Connector status enumeration
 */
const ConnectorStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
  RATE_LIMITED: 'rate_limited',
  AUTHENTICATING: 'authenticating'
};

/**
 * Query types supported by connectors
 */
const QueryTypes = {
  SEARCH: 'search',
  ENRICH: 'enrich',
  VALIDATE: 'validate',
  ACTION: 'action'
};

/**
 * Base connector class that all specific connectors must extend
 */
class BaseConnector extends EventEmitter {
  constructor(config) {
    super();
    
    if (this.constructor === BaseConnector) {
      throw new Error('BaseConnector is abstract and cannot be instantiated directly');
    }

    this.config = this.validateConfig(config);
    this.id = config.id;
    this.tenantId = config.tenantId;
    this.type = config.type;
    this.name = config.name;
    this.status = ConnectorStatus.INACTIVE;
    this.lastHealthCheck = null;
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      avgResponseTime: 0,
      errorRate: 0,
      lastError: null
    };

    // Rate limiting state
    this.rateLimiter = null;
    this.requestQueue = [];
    this.isProcessingQueue = false;

    // Circuit breaker state
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      lastFailureTime: null,
      timeout: 60000, // 1 minute
      threshold: 5 // failures before opening circuit
    };
  }

  /**
   * Validate connector configuration
   * @param {Object} config - Connector configuration
   * @returns {Object} Validated configuration
   */
  validateConfig(config) {
    const required = ['id', 'tenantId', 'type', 'name', 'authentication'];
    
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    if (!Object.values(AuthTypes).includes(config.authentication.type)) {
      throw new Error(`Unsupported authentication type: ${config.authentication.type}`);
    }

    return config;
  }

  /**
   * Initialize the connector (must be implemented by subclasses)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Perform health check (must be implemented by subclasses)
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }

  /**
   * Execute a query (must be implemented by subclasses)
   * @param {Object} query - Query parameters
   * @param {string} queryType - Type of query (search, enrich, etc.)
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, queryType = QueryTypes.SEARCH) {
    throw new Error('executeQuery() must be implemented by subclass');
  }

  /**
   * Get connector capabilities (must be implemented by subclasses)
   * @returns {Array<string>} List of supported capabilities
   */
  getCapabilities() {
    throw new Error('getCapabilities() must be implemented by subclass');
  }

  /**
   * Get supported data types (must be implemented by subclasses)
   * @returns {Array<string>} List of supported data types
   */
  getDataTypes() {
    throw new Error('getDataTypes() must be implemented by subclass');
  }

  /**
   * Standardized query method with rate limiting and error handling
   * @param {Object} query - Query parameters
   * @param {string} queryType - Type of query
   * @returns {Promise<Object>} Query result
   */
  async query(query, queryType = QueryTypes.SEARCH) {
    // Check circuit breaker
    if (this.circuitBreaker.state === 'OPEN') {
      if (Date.now() - this.circuitBreaker.lastFailureTime < this.circuitBreaker.timeout) {
        throw new Error('Circuit breaker is OPEN - connector temporarily unavailable');
      } else {
        this.circuitBreaker.state = 'HALF_OPEN';
      }
    }

    const startTime = Date.now();
    
    try {
      // Add to rate limiting queue
      const result = await this.addToQueue(query, queryType);
      
      // Update metrics on success
      this.updateMetrics(true, Date.now() - startTime);
      
      // Reset circuit breaker on success
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
      }
      
      return result;
    } catch (error) {
      // Update metrics on failure
      this.updateMetrics(false, Date.now() - startTime, error);
      
      // Update circuit breaker
      this.circuitBreaker.failureCount++;
      this.circuitBreaker.lastFailureTime = Date.now();
      
      if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
        this.circuitBreaker.state = 'OPEN';
        this.status = ConnectorStatus.ERROR;
        this.emit('circuitBreakerOpen', { connector: this.id, error });
      }
      
      throw error;
    }
  }

  /**
   * Add query to rate limiting queue
   * @param {Object} query - Query parameters
   * @param {string} queryType - Type of query
   * @returns {Promise<Object>} Query result
   */
  async addToQueue(query, queryType) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        query,
        queryType,
        resolve,
        reject,
        timestamp: Date.now()
      });

      this.processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      
      try {
        // Check if request has expired (optional timeout)
        if (Date.now() - request.timestamp > 30000) { // 30 second timeout
          request.reject(new Error('Request timeout'));
          continue;
        }

        // Apply rate limiting delay if needed
        await this.applyRateLimit();

        // Execute the actual query
        const result = await this.executeQuery(request.query, request.queryType);
        request.resolve(result);
        
      } catch (error) {
        request.reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Apply rate limiting delay
   * @returns {Promise<void>}
   */
  async applyRateLimit() {
    if (!this.config.rateLimits) {
      return;
    }

    const { requestsPerMinute, requestsPerHour } = this.config.rateLimits;
    
    if (requestsPerMinute) {
      const delay = Math.max(0, (60 * 1000) / requestsPerMinute);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Update connector metrics
   * @param {boolean} success - Whether the query was successful
   * @param {number} responseTime - Response time in milliseconds
   * @param {Error} error - Error object if query failed
   */
  updateMetrics(success, responseTime, error = null) {
    this.metrics.totalQueries++;
    
    if (success) {
      this.metrics.successfulQueries++;
    } else {
      this.metrics.failedQueries++;
      this.metrics.lastError = error ? error.message : 'Unknown error';
    }

    // Update average response time
    const totalTime = this.metrics.avgResponseTime * (this.metrics.totalQueries - 1) + responseTime;
    this.metrics.avgResponseTime = totalTime / this.metrics.totalQueries;

    // Update error rate
    this.metrics.errorRate = this.metrics.failedQueries / this.metrics.totalQueries;

    // Emit metrics update event
    this.emit('metricsUpdated', this.metrics);
  }

  /**
   * Perform health check and update status
   * @returns {Promise<Object>} Health check result
   */
  async performHealthCheck() {
    try {
      const result = await this.healthCheck();
      this.lastHealthCheck = new Date().toISOString();
      
      if (result.healthy) {
        this.status = ConnectorStatus.ACTIVE;
      } else {
        this.status = ConnectorStatus.ERROR;
      }
      
      this.emit('healthCheckCompleted', { connector: this.id, result });
      return result;
    } catch (error) {
      this.status = ConnectorStatus.ERROR;
      this.lastHealthCheck = new Date().toISOString();
      
      const result = {
        healthy: false,
        error: error.message,
        timestamp: this.lastHealthCheck
      };
      
      this.emit('healthCheckFailed', { connector: this.id, error });
      return result;
    }
  }

  /**
   * Get connector status and metrics
   * @returns {Object} Connector status information
   */
  getStatus() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      type: this.type,
      name: this.name,
      status: this.status,
      lastHealthCheck: this.lastHealthCheck,
      metrics: { ...this.metrics },
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failureCount: this.circuitBreaker.failureCount
      },
      queueLength: this.requestQueue.length
    };
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.status = ConnectorStatus.ACTIVE;
    this.emit('circuitBreakerReset', { connector: this.id });
  }

  /**
   * Shutdown the connector gracefully
   */
  async shutdown() {
    this.status = ConnectorStatus.INACTIVE;
    
    // Wait for queue to empty or timeout
    const timeout = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (this.requestQueue.length > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Reject any remaining requests
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      request.reject(new Error('Connector shutting down'));
    }
    
    this.emit('shutdown', { connector: this.id });
  }
}

module.exports = {
  BaseConnector,
  AuthTypes,
  ConnectorStatus,
  QueryTypes
};