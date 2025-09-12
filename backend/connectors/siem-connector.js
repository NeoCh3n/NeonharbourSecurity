/**
 * SIEM Connector Implementation
 * 
 * Example implementation of a SIEM connector using the base connector framework
 * Demonstrates standardized query methods and authentication handling
 */

const { BaseConnector, QueryTypes } = require('./base-connector');
const AuthHandler = require('./auth-handler');
const { RateLimiter } = require('./rate-limiter');

/**
 * SIEM-specific query types
 */
const SiemQueryTypes = {
  ...QueryTypes,
  LOG_SEARCH: 'log_search',
  ALERT_SEARCH: 'alert_search',
  EVENT_CORRELATION: 'event_correlation'
};

/**
 * SIEM Connector class
 */
class SiemConnector extends BaseConnector {
  constructor(config) {
    super(config);
    
    this.authHandler = new AuthHandler(config);
    this.rateLimiter = new RateLimiter(config.rateLimits || {});
    this.baseUrl = config.baseUrl;
    this.apiVersion = config.apiVersion || 'v1';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Initialize the SIEM connector
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Initialize authentication
      await this.authHandler.initialize();
      
      // Perform initial health check
      await this.performHealthCheck();
      
      this.status = 'active';
      this.emit('initialized', { connectorId: this.id });
    } catch (error) {
      this.status = 'error';
      this.emit('initializationFailed', { connectorId: this.id, error });
      throw error;
    }
  }

  /**
   * Perform health check
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    try {
      const response = await this.makeRequest('/health', 'GET');
      
      return {
        healthy: response.data.status === 'ok',
        timestamp: new Date().toISOString(),
        responseTime: response.responseTime || 1, // Ensure we have a response time
        version: response.data.version,
        details: response.data.details || response.data
      };
    } catch (error) {
      return {
        healthy: false,
        timestamp: new Date().toISOString(),
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Execute a query against the SIEM
   * @param {Object} query - Query parameters
   * @param {string} queryType - Type of query
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, queryType = QueryTypes.SEARCH) {
    switch (queryType) {
      case SiemQueryTypes.LOG_SEARCH:
        return await this.searchLogs(query);
      case SiemQueryTypes.ALERT_SEARCH:
        return await this.searchAlerts(query);
      case SiemQueryTypes.EVENT_CORRELATION:
        return await this.correlateEvents(query);
      case QueryTypes.SEARCH:
        return await this.genericSearch(query);
      case QueryTypes.ENRICH:
        return await this.enrichData(query);
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }
  }

  /**
   * Search logs in the SIEM
   * @param {Object} query - Log search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchLogs(query) {
    const {
      searchQuery,
      timeRange,
      fields,
      limit = 100,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = query;

    const requestBody = {
      query: searchQuery,
      time_range: timeRange,
      fields: fields || ['*'],
      limit,
      offset,
      sort: {
        field: sortBy,
        order: sortOrder
      }
    };

    const response = await this.makeRequest('/logs/search', 'POST', requestBody);
    
    return {
      results: response.data.events || response.data.data?.events || [],
      totalCount: response.data.total_count || response.data.data?.total_count || 0,
      executionTime: response.data.execution_time || response.data.data?.execution_time,
      query: searchQuery,
      timeRange
    };
  }

  /**
   * Search alerts in the SIEM
   * @param {Object} query - Alert search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchAlerts(query) {
    const {
      severity,
      status,
      timeRange,
      ruleId,
      limit = 50,
      offset = 0
    } = query;

    const params = new URLSearchParams();
    if (severity) params.append('severity', severity);
    if (status) params.append('status', status);
    if (ruleId) params.append('rule_id', ruleId);
    if (timeRange) {
      params.append('start_time', timeRange.start);
      params.append('end_time', timeRange.end);
    }
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const response = await this.makeRequest(`/alerts?${params.toString()}`, 'GET');
    
    return {
      alerts: response.data.alerts || response.data.data?.alerts || [],
      totalCount: response.data.total_count || response.data.data?.total_count || 0,
      query: { severity, status, timeRange, ruleId }
    };
  }

  /**
   * Correlate events across different data sources
   * @param {Object} query - Correlation parameters
   * @returns {Promise<Object>} Correlation results
   */
  async correlateEvents(query) {
    const {
      entities,
      timeWindow,
      correlationRules,
      threshold = 0.7
    } = query;

    const requestBody = {
      entities,
      time_window: timeWindow,
      correlation_rules: correlationRules,
      threshold
    };

    const response = await this.makeRequest('/correlate', 'POST', requestBody);
    
    return {
      correlations: response.data.correlations || [],
      confidence: response.data.confidence || 0,
      entities: entities,
      timeWindow
    };
  }

  /**
   * Generic search functionality
   * @param {Object} query - Generic search parameters
   * @returns {Promise<Object>} Search results
   */
  async genericSearch(query) {
    const response = await this.makeRequest('/search', 'POST', query);
    return response.data;
  }

  /**
   * Enrich data with additional context
   * @param {Object} query - Enrichment parameters
   * @returns {Promise<Object>} Enriched data
   */
  async enrichData(query) {
    const { indicators, enrichmentTypes } = query;
    
    const requestBody = {
      indicators,
      enrichment_types: enrichmentTypes || ['reputation', 'geolocation', 'whois']
    };

    const response = await this.makeRequest('/enrich', 'POST', requestBody);
    
    return {
      enrichedData: response.data.enrichments || {},
      indicators,
      enrichmentTypes
    };
  }

  /**
   * Make HTTP request to SIEM API
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, method = 'GET', body = null) {
    const startTime = Date.now();
    
    try {
      // Apply rate limiting
      await this.rateLimiter.waitForRequest();
      
      // Get authentication headers
      const authHeaders = await this.authHandler.getAuthHeaders();
      
      // Prepare request options
      const url = `${this.baseUrl}/api/${this.apiVersion}${endpoint}`;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authHeaders
        },
        timeout: this.timeout
      };

      // Add HTTPS agent for certificate authentication
      const httpsAgent = this.authHandler.getHttpsAgent();
      if (httpsAgent) {
        options.agent = httpsAgent;
      }

      // Add body for POST/PUT requests
      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }

      // Make the request
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`SIEM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      return {
        data,
        status: response.status,
        responseTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Enhance error with context
      error.responseTime = responseTime;
      error.endpoint = endpoint;
      error.method = method;
      
      throw error;
    }
  }

  /**
   * Get connector capabilities
   * @returns {Array<string>} List of supported capabilities
   */
  getCapabilities() {
    return [
      'log_search',
      'alert_search',
      'event_correlation',
      'data_enrichment',
      'real_time_monitoring',
      'historical_analysis'
    ];
  }

  /**
   * Get supported data types
   * @returns {Array<string>} List of supported data types
   */
  getDataTypes() {
    return [
      'security_logs',
      'network_logs',
      'system_logs',
      'application_logs',
      'alerts',
      'incidents',
      'threat_indicators',
      'user_activity'
    ];
  }

  /**
   * Get SIEM-specific status information
   * @returns {Object} Extended status information
   */
  getStatus() {
    const baseStatus = super.getStatus();
    
    return {
      ...baseStatus,
      siemInfo: {
        baseUrl: this.baseUrl,
        apiVersion: this.apiVersion,
        authStatus: this.authHandler.getStatus(),
        rateLimiterStatus: this.rateLimiter.getStatus()
      }
    };
  }

  /**
   * Test connectivity to SIEM
   * @returns {Promise<Object>} Connectivity test result
   */
  async testConnectivity() {
    try {
      const startTime = Date.now();
      const healthResult = await this.healthCheck();
      const responseTime = healthResult.responseTime || (Date.now() - startTime);
      
      return {
        connected: healthResult.healthy,
        responseTime,
        details: healthResult.details,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = {
  SiemConnector,
  SiemQueryTypes
};