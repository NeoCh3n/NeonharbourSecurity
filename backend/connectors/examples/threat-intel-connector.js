/**
 * Threat Intelligence Connector Example
 * 
 * Example implementation showing how to create a custom connector
 * for threat intelligence feeds using the connector framework
 */

const { BaseConnector, QueryTypes } = require('../base-connector');
const AuthHandler = require('../auth-handler');
const { RateLimiter } = require('../rate-limiter');

/**
 * Threat Intelligence specific query types
 */
const ThreatIntelQueryTypes = {
  ...QueryTypes,
  IP_REPUTATION: 'ip_reputation',
  DOMAIN_REPUTATION: 'domain_reputation',
  FILE_HASH_LOOKUP: 'file_hash_lookup',
  IOC_SEARCH: 'ioc_search'
};

/**
 * Threat Intelligence Connector
 */
class ThreatIntelConnector extends BaseConnector {
  constructor(config) {
    super(config);
    
    this.authHandler = new AuthHandler(config);
    this.rateLimiter = new RateLimiter(config.rateLimits || {
      requestsPerMinute: 100 // Default rate limit for threat intel APIs
    });
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout || 10000;
  }

  /**
   * Initialize the threat intelligence connector
   */
  async initialize() {
    try {
      await this.authHandler.initialize();
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
   */
  async healthCheck() {
    try {
      const response = await this.makeRequest('/health', 'GET');
      
      return {
        healthy: response.status === 200,
        timestamp: new Date().toISOString(),
        responseTime: response.responseTime || 1,
        apiVersion: response.data?.version,
        quotaRemaining: response.data?.quota_remaining
      };
    } catch (error) {
      return {
        healthy: false,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Execute query based on type
   */
  async executeQuery(query, queryType = QueryTypes.SEARCH) {
    switch (queryType) {
      case ThreatIntelQueryTypes.IP_REPUTATION:
        return await this.checkIpReputation(query.ip);
      case ThreatIntelQueryTypes.DOMAIN_REPUTATION:
        return await this.checkDomainReputation(query.domain);
      case ThreatIntelQueryTypes.FILE_HASH_LOOKUP:
        return await this.lookupFileHash(query.hash);
      case ThreatIntelQueryTypes.IOC_SEARCH:
        return await this.searchIOCs(query);
      case QueryTypes.ENRICH:
        return await this.enrichIndicators(query.indicators);
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }
  }

  /**
   * Check IP reputation
   */
  async checkIpReputation(ip) {
    const response = await this.makeRequest(`/ip/${ip}`, 'GET');
    
    return {
      ip,
      reputation: response.data.reputation || 'unknown',
      riskScore: response.data.risk_score || 0,
      categories: response.data.categories || [],
      lastSeen: response.data.last_seen,
      sources: response.data.sources || [],
      confidence: response.data.confidence || 0
    };
  }

  /**
   * Check domain reputation
   */
  async checkDomainReputation(domain) {
    const response = await this.makeRequest(`/domain/${domain}`, 'GET');
    
    return {
      domain,
      reputation: response.data.reputation || 'unknown',
      riskScore: response.data.risk_score || 0,
      categories: response.data.categories || [],
      registrationDate: response.data.registration_date,
      sources: response.data.sources || [],
      confidence: response.data.confidence || 0
    };
  }

  /**
   * Lookup file hash
   */
  async lookupFileHash(hash) {
    const response = await this.makeRequest(`/file/${hash}`, 'GET');
    
    return {
      hash,
      malicious: response.data.malicious || false,
      detectionRatio: response.data.detection_ratio || '0/0',
      scanDate: response.data.scan_date,
      engines: response.data.engines || [],
      fileType: response.data.file_type,
      fileSize: response.data.file_size
    };
  }

  /**
   * Search for Indicators of Compromise
   */
  async searchIOCs(query) {
    const { searchTerm, iocTypes, timeRange, limit = 100 } = query;
    
    const params = new URLSearchParams({
      q: searchTerm,
      limit: limit.toString()
    });
    
    if (iocTypes) {
      params.append('types', iocTypes.join(','));
    }
    
    if (timeRange) {
      params.append('start_date', timeRange.start);
      params.append('end_date', timeRange.end);
    }
    
    const response = await this.makeRequest(`/iocs/search?${params.toString()}`, 'GET');
    
    return {
      iocs: response.data.iocs || [],
      totalCount: response.data.total_count || 0,
      searchTerm,
      executionTime: response.data.execution_time
    };
  }

  /**
   * Enrich multiple indicators
   */
  async enrichIndicators(indicators) {
    const requestBody = {
      indicators,
      include_reputation: true,
      include_context: true
    };
    
    const response = await this.makeRequest('/enrich', 'POST', requestBody);
    
    return {
      enrichedIndicators: response.data.results || {},
      processingTime: response.data.processing_time,
      quotaUsed: response.data.quota_used
    };
  }

  /**
   * Make HTTP request to threat intel API
   */
  async makeRequest(endpoint, method = 'GET', body = null) {
    const startTime = Date.now();
    
    try {
      await this.rateLimiter.waitForRequest();
      
      const authHeaders = await this.authHandler.getAuthHeaders();
      
      const url = `${this.baseUrl}${endpoint}`;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'NeonharbourSecurity-Connector/1.0',
          ...authHeaders
        },
        timeout: this.timeout
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`Threat Intel API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        data,
        status: response.status,
        responseTime
      };
    } catch (error) {
      error.responseTime = Date.now() - startTime;
      error.endpoint = endpoint;
      error.method = method;
      throw error;
    }
  }

  /**
   * Get connector capabilities
   */
  getCapabilities() {
    return [
      'ip_reputation',
      'domain_reputation',
      'file_hash_lookup',
      'ioc_search',
      'indicator_enrichment',
      'bulk_lookup'
    ];
  }

  /**
   * Get supported data types
   */
  getDataTypes() {
    return [
      'ip_addresses',
      'domains',
      'file_hashes',
      'urls',
      'indicators_of_compromise',
      'threat_intelligence'
    ];
  }

  /**
   * Get threat intel specific status
   */
  getStatus() {
    const baseStatus = super.getStatus();
    
    return {
      ...baseStatus,
      threatIntelInfo: {
        baseUrl: this.baseUrl,
        authStatus: this.authHandler.getStatus(),
        rateLimiterStatus: this.rateLimiter.getStatus(),
        supportedIndicatorTypes: ['ip', 'domain', 'hash', 'url']
      }
    };
  }
}

module.exports = {
  ThreatIntelConnector,
  ThreatIntelQueryTypes
};