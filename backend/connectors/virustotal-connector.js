/**
 * VirusTotal Threat Intelligence Connector
 * 
 * Implements VirusTotal API integration using the connector framework
 * Provides IP reputation, file hash lookup, and domain analysis
 */

const { BaseConnector, QueryTypes } = require('./base-connector');
const AuthHandler = require('./auth-handler');
const { RateLimiter } = require('./rate-limiter');

/**
 * VirusTotal specific query types
 */
const VirusTotalQueryTypes = {
  ...QueryTypes,
  IP_REPUTATION: 'ip_reputation',
  DOMAIN_REPUTATION: 'domain_reputation', 
  FILE_HASH_LOOKUP: 'file_hash_lookup',
  URL_ANALYSIS: 'url_analysis',
  BULK_LOOKUP: 'bulk_lookup'
};

/**
 * VirusTotal Connector class
 */
class VirusTotalConnector extends BaseConnector {
  constructor(config) {
    super(config);
    
    this.authHandler = new AuthHandler(config);
    this.rateLimiter = new RateLimiter(config.rateLimits || {
      requestsPerMinute: 4 // VirusTotal free tier limit
    });
    this.baseUrl = 'https://www.virustotal.com/api/v3';
    this.timeout = config.timeout || 10000;
  }

  /**
   * Initialize the VirusTotal connector
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
   * Perform health check by testing API connectivity
   */
  async healthCheck() {
    try {
      // Use a simple quota check as health check
      const response = await this.makeRequest('/users/current', 'GET');
      
      return {
        healthy: response.status === 200,
        timestamp: new Date().toISOString(),
        responseTime: response.responseTime || 1,
        quotaRemaining: response.data?.data?.attributes?.quotas?.api_requests_monthly?.allowed || 0,
        details: {
          userId: response.data?.data?.id,
          quotas: response.data?.data?.attributes?.quotas
        }
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
   * Execute query based on type
   */
  async executeQuery(query, queryType = QueryTypes.SEARCH) {
    switch (queryType) {
      case VirusTotalQueryTypes.IP_REPUTATION:
        return await this.checkIpReputation(query.ip);
      case VirusTotalQueryTypes.DOMAIN_REPUTATION:
        return await this.checkDomainReputation(query.domain);
      case VirusTotalQueryTypes.FILE_HASH_LOOKUP:
        return await this.lookupFileHash(query.hash);
      case VirusTotalQueryTypes.URL_ANALYSIS:
        return await this.analyzeUrl(query.url);
      case VirusTotalQueryTypes.BULK_LOOKUP:
        return await this.bulkLookup(query.indicators);
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
    const response = await this.makeRequest(`/ip_addresses/${ip}`, 'GET');
    const data = response.data.data;
    const stats = data?.attributes?.last_analysis_stats || {};
    
    return {
      indicator: ip,
      type: 'ip',
      reputation: this.calculateReputation(stats),
      riskScore: this.calculateRiskScore(stats),
      maliciousCount: stats.malicious || 0,
      suspiciousCount: stats.suspicious || 0,
      cleanCount: stats.harmless || 0,
      undetectedCount: stats.undetected || 0,
      totalEngines: Object.values(stats).reduce((sum, count) => sum + count, 0),
      lastAnalysisDate: data?.attributes?.last_analysis_date,
      country: data?.attributes?.country,
      asOwner: data?.attributes?.as_owner,
      categories: data?.attributes?.categories || [],
      confidence: this.calculateConfidence(stats),
      rawData: data
    };
  }

  /**
   * Check domain reputation
   */
  async checkDomainReputation(domain) {
    const response = await this.makeRequest(`/domains/${domain}`, 'GET');
    const data = response.data.data;
    const stats = data?.attributes?.last_analysis_stats || {};
    
    return {
      indicator: domain,
      type: 'domain',
      reputation: this.calculateReputation(stats),
      riskScore: this.calculateRiskScore(stats),
      maliciousCount: stats.malicious || 0,
      suspiciousCount: stats.suspicious || 0,
      cleanCount: stats.harmless || 0,
      undetectedCount: stats.undetected || 0,
      totalEngines: Object.values(stats).reduce((sum, count) => sum + count, 0),
      lastAnalysisDate: data?.attributes?.last_analysis_date,
      registrationDate: data?.attributes?.creation_date,
      categories: data?.attributes?.categories || [],
      whoisData: data?.attributes?.whois,
      confidence: this.calculateConfidence(stats),
      rawData: data
    };
  }

  /**
   * Lookup file hash
   */
  async lookupFileHash(hash) {
    const response = await this.makeRequest(`/files/${hash}`, 'GET');
    const data = response.data.data;
    const stats = data?.attributes?.last_analysis_stats || {};
    
    return {
      indicator: hash,
      type: 'file_hash',
      reputation: this.calculateReputation(stats),
      riskScore: this.calculateRiskScore(stats),
      maliciousCount: stats.malicious || 0,
      suspiciousCount: stats.suspicious || 0,
      cleanCount: stats.harmless || 0,
      undetectedCount: stats.undetected || 0,
      totalEngines: Object.values(stats).reduce((sum, count) => sum + count, 0),
      detectionRatio: `${stats.malicious || 0}/${Object.values(stats).reduce((sum, count) => sum + count, 0)}`,
      scanDate: data?.attributes?.last_analysis_date,
      fileType: data?.attributes?.type_description,
      fileSize: data?.attributes?.size,
      fileName: data?.attributes?.meaningful_name,
      confidence: this.calculateConfidence(stats),
      rawData: data
    };
  }

  /**
   * Analyze URL
   */
  async analyzeUrl(url) {
    // First, submit URL for analysis if not already analyzed
    const urlId = Buffer.from(url).toString('base64').replace(/=/g, '');
    
    try {
      const response = await this.makeRequest(`/urls/${urlId}`, 'GET');
      const data = response.data.data;
      const stats = data?.attributes?.last_analysis_stats || {};
      
      return {
        indicator: url,
        type: 'url',
        reputation: this.calculateReputation(stats),
        riskScore: this.calculateRiskScore(stats),
        maliciousCount: stats.malicious || 0,
        suspiciousCount: stats.suspicious || 0,
        cleanCount: stats.harmless || 0,
        undetectedCount: stats.undetected || 0,
        totalEngines: Object.values(stats).reduce((sum, count) => sum + count, 0),
        lastAnalysisDate: data?.attributes?.last_analysis_date,
        categories: data?.attributes?.categories || [],
        confidence: this.calculateConfidence(stats),
        rawData: data
      };
    } catch (error) {
      if (error.message.includes('404')) {
        // URL not found, submit for analysis
        await this.submitUrlForAnalysis(url);
        throw new Error('URL submitted for analysis. Please retry in a few minutes.');
      }
      throw error;
    }
  }

  /**
   * Submit URL for analysis
   */
  async submitUrlForAnalysis(url) {
    const response = await this.makeRequest('/urls', 'POST', { url });
    return response.data;
  }

  /**
   * Bulk lookup multiple indicators
   */
  async bulkLookup(indicators) {
    const results = [];
    
    for (const indicator of indicators.slice(0, 10)) { // Limit to 10 for rate limiting
      try {
        let result;
        
        if (this.isIpAddress(indicator)) {
          result = await this.checkIpReputation(indicator);
        } else if (this.isDomain(indicator)) {
          result = await this.checkDomainReputation(indicator);
        } else if (this.isFileHash(indicator)) {
          result = await this.lookupFileHash(indicator);
        } else if (this.isUrl(indicator)) {
          result = await this.analyzeUrl(indicator);
        } else {
          result = {
            indicator,
            type: 'unknown',
            error: 'Unsupported indicator type'
          };
        }
        
        results.push(result);
      } catch (error) {
        results.push({
          indicator,
          type: 'error',
          error: error.message
        });
      }
    }
    
    return {
      results,
      totalProcessed: results.length,
      processingTime: Date.now()
    };
  }

  /**
   * Enrich indicators with VirusTotal data
   */
  async enrichIndicators(indicators) {
    const enrichmentResults = await this.bulkLookup(indicators);
    
    return {
      enrichedIndicators: enrichmentResults.results.reduce((acc, result) => {
        acc[result.indicator] = result;
        return acc;
      }, {}),
      processingTime: enrichmentResults.processingTime,
      totalProcessed: enrichmentResults.totalProcessed
    };
  }

  /**
   * Make HTTP request to VirusTotal API
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
          'Accept': 'application/json',
          'User-Agent': 'NeonharbourSecurity-Connector/1.0',
          ...authHeaders
        },
        timeout: this.timeout
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        if (typeof body === 'object') {
          options.headers['Content-Type'] = 'application/json';
          options.body = JSON.stringify(body);
        } else {
          options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          options.body = body;
        }
      }

      const response = await fetch(url, options);
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`VirusTotal API error: ${response.status} ${response.statusText}`);
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
   * Calculate reputation based on analysis stats
   */
  calculateReputation(stats) {
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    if (total === 0) return 'unknown';
    if (malicious > 0) return 'malicious';
    if (suspicious > 0) return 'suspicious';
    return 'clean';
  }

  /**
   * Calculate risk score (0-100)
   */
  calculateRiskScore(stats) {
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    if (total === 0) return 0;
    
    const riskScore = ((malicious * 2 + suspicious) / total) * 100;
    return Math.min(100, Math.round(riskScore));
  }

  /**
   * Calculate confidence score (0-1)
   */
  calculateConfidence(stats) {
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    if (total === 0) return 0;
    if (total < 5) return 0.3;
    if (total < 20) return 0.7;
    return 1.0;
  }

  /**
   * Helper methods for indicator type detection
   */
  isIpAddress(indicator) {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(indicator);
  }

  isDomain(indicator) {
    return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(indicator);
  }

  isFileHash(indicator) {
    return /^[a-fA-F0-9]{32,64}$/.test(indicator);
  }

  isUrl(indicator) {
    try {
      new URL(indicator);
      return true;
    } catch {
      return false;
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
      'url_analysis',
      'bulk_lookup',
      'indicator_enrichment'
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
      'threat_intelligence',
      'malware_analysis'
    ];
  }

  /**
   * Get VirusTotal specific status
   */
  getStatus() {
    const baseStatus = super.getStatus();
    
    return {
      ...baseStatus,
      virusTotalInfo: {
        baseUrl: this.baseUrl,
        authStatus: this.authHandler.getStatus(),
        rateLimiterStatus: this.rateLimiter.getStatus(),
        supportedIndicatorTypes: ['ip', 'domain', 'hash', 'url']
      }
    };
  }
}

module.exports = {
  VirusTotalConnector,
  VirusTotalQueryTypes
};