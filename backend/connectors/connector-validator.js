/**
 * Connector Configuration Validator
 * 
 * Validates connector configurations and provides testing endpoints
 */

const { AuthTypes, QueryTypes } = require('./base-connector');

/**
 * Configuration validation schemas
 */
const ConfigSchemas = {
  base: {
    required: ['id', 'tenantId', 'type', 'name', 'authentication'],
    optional: ['rateLimits', 'timeout', 'retryConfig']
  },
  
  siem: {
    required: ['baseUrl', 'apiVersion'],
    optional: ['timeout', 'customHeaders']
  },
  
  virustotal: {
    required: [],
    optional: ['timeout', 'mockDelay']
  },
  
  mock_edr: {
    required: [],
    optional: ['timeout', 'mockDelay']
  }
};

/**
 * Authentication validation schemas
 */
const AuthSchemas = {
  [AuthTypes.API_KEY]: {
    required: ['apiKey'],
    optional: ['keyName', 'keyLocation']
  },
  
  [AuthTypes.BASIC]: {
    required: ['username', 'password'],
    optional: []
  },
  
  [AuthTypes.BEARER]: {
    required: ['token'],
    optional: ['tokenType']
  },
  
  [AuthTypes.OAUTH]: {
    required: ['clientId', 'clientSecret', 'tokenUrl'],
    optional: ['scope', 'grantType']
  },
  
  [AuthTypes.CERTIFICATE]: {
    required: ['certPath', 'keyPath'],
    optional: ['passphrase', 'ca']
  }
};

/**
 * Connector Configuration Validator class
 */
class ConnectorValidator {
  
  /**
   * Validate complete connector configuration
   * @param {Object} config - Connector configuration
   * @returns {Object} Validation result
   */
  static validateConfig(config) {
    const errors = [];
    const warnings = [];
    
    try {
      // Validate base configuration
      const baseValidation = this.validateBaseConfig(config);
      errors.push(...baseValidation.errors);
      warnings.push(...baseValidation.warnings);
      
      // Validate type-specific configuration
      if (config.type && ConfigSchemas[config.type]) {
        const typeValidation = this.validateTypeSpecificConfig(config);
        errors.push(...typeValidation.errors);
        warnings.push(...typeValidation.warnings);
      }
      
      // Validate authentication configuration
      if (config.authentication) {
        const authValidation = this.validateAuthConfig(config.authentication);
        errors.push(...authValidation.errors);
        warnings.push(...authValidation.warnings);
      }
      
      // Validate rate limiting configuration
      if (config.rateLimits) {
        const rateLimitValidation = this.validateRateLimits(config.rateLimits);
        errors.push(...rateLimitValidation.errors);
        warnings.push(...rateLimitValidation.warnings);
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        config: this.sanitizeConfig(config)
      };
      
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation failed: ${error.message}`],
        warnings: [],
        config: null
      };
    }
  }

  /**
   * Validate base connector configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validation result
   */
  static validateBaseConfig(config) {
    const errors = [];
    const warnings = [];
    const schema = ConfigSchemas.base;
    
    // Check required fields
    for (const field of schema.required) {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate field types and formats
    if (config.id && typeof config.id !== 'string') {
      errors.push('Field "id" must be a string');
    }
    
    if (config.id && !/^[a-zA-Z0-9_-]+$/.test(config.id)) {
      errors.push('Field "id" must contain only alphanumeric characters, hyphens, and underscores');
    }
    
    if (config.tenantId && typeof config.tenantId !== 'string') {
      errors.push('Field "tenantId" must be a string');
    }
    
    if (config.type && typeof config.type !== 'string') {
      errors.push('Field "type" must be a string');
    }
    
    if (config.name && typeof config.name !== 'string') {
      errors.push('Field "name" must be a string');
    }
    
    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
      errors.push('Field "timeout" must be a positive number');
    }
    
    // Check for unknown fields
    const knownFields = [...schema.required, ...schema.optional, 'baseUrl', 'apiVersion'];
    for (const field in config) {
      if (!knownFields.includes(field) && !ConfigSchemas[config.type]?.required?.includes(field) && !ConfigSchemas[config.type]?.optional?.includes(field)) {
        warnings.push(`Unknown field: ${field}`);
      }
    }
    
    return { errors, warnings };
  }

  /**
   * Validate type-specific configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validation result
   */
  static validateTypeSpecificConfig(config) {
    const errors = [];
    const warnings = [];
    const schema = ConfigSchemas[config.type];
    
    if (!schema) {
      warnings.push(`No validation schema found for connector type: ${config.type}`);
      return { errors, warnings };
    }
    
    // Check required fields
    for (const field of schema.required) {
      if (!config[field]) {
        errors.push(`Missing required field for ${config.type}: ${field}`);
      }
    }
    
    // Type-specific validations
    switch (config.type) {
      case 'siem':
        if (config.baseUrl && !this.isValidUrl(config.baseUrl)) {
          errors.push('Field "baseUrl" must be a valid URL');
        }
        if (config.apiVersion && typeof config.apiVersion !== 'string') {
          errors.push('Field "apiVersion" must be a string');
        }
        break;
        
      case 'virustotal':
        // VirusTotal specific validations
        break;
        
      case 'mock_edr':
        if (config.mockDelay && (typeof config.mockDelay !== 'number' || config.mockDelay < 0)) {
          errors.push('Field "mockDelay" must be a non-negative number');
        }
        break;
    }
    
    return { errors, warnings };
  }

  /**
   * Validate authentication configuration
   * @param {Object} authConfig - Authentication configuration
   * @returns {Object} Validation result
   */
  static validateAuthConfig(authConfig) {
    const errors = [];
    const warnings = [];
    
    if (!authConfig.type) {
      errors.push('Authentication type is required');
      return { errors, warnings };
    }
    
    if (!Object.values(AuthTypes).includes(authConfig.type)) {
      errors.push(`Unsupported authentication type: ${authConfig.type}`);
      return { errors, warnings };
    }
    
    const schema = AuthSchemas[authConfig.type];
    if (!schema) {
      warnings.push(`No validation schema for auth type: ${authConfig.type}`);
      return { errors, warnings };
    }
    
    // Check required credentials
    const credentials = authConfig.credentials || {};
    for (const field of schema.required) {
      if (!credentials[field]) {
        errors.push(`Missing required authentication credential: ${field}`);
      }
    }
    
    // Type-specific validations
    switch (authConfig.type) {
      case AuthTypes.API_KEY:
        if (credentials.apiKey && !this.isBase64(credentials.apiKey)) {
          warnings.push('API key should be base64 encoded for security');
        }
        break;
        
      case AuthTypes.BASIC:
        if (credentials.password && !this.isBase64(credentials.password)) {
          warnings.push('Password should be base64 encoded for security');
        }
        break;
        
      case AuthTypes.OAUTH:
        if (credentials.tokenUrl && !this.isValidUrl(credentials.tokenUrl)) {
          errors.push('Token URL must be a valid URL');
        }
        break;
        
      case AuthTypes.CERTIFICATE:
        // Certificate path validations would go here
        break;
    }
    
    return { errors, warnings };
  }

  /**
   * Validate rate limiting configuration
   * @param {Object} rateLimits - Rate limiting configuration
   * @returns {Object} Validation result
   */
  static validateRateLimits(rateLimits) {
    const errors = [];
    const warnings = [];
    
    const validFields = ['requestsPerSecond', 'requestsPerMinute', 'requestsPerHour', 'requestsPerDay'];
    
    for (const field in rateLimits) {
      if (!validFields.includes(field)) {
        warnings.push(`Unknown rate limit field: ${field}`);
        continue;
      }
      
      const value = rateLimits[field];
      if (typeof value !== 'number' || value <= 0) {
        errors.push(`Rate limit field "${field}" must be a positive number`);
      }
    }
    
    // Check for reasonable limits
    if (rateLimits.requestsPerSecond && rateLimits.requestsPerSecond > 1000) {
      warnings.push('Very high requests per second limit may cause issues');
    }
    
    return { errors, warnings };
  }

  /**
   * Test connector configuration
   * @param {Object} config - Connector configuration
   * @returns {Promise<Object>} Test result
   */
  static async testConfig(config) {
    const startTime = Date.now();
    const testResults = {
      configValidation: null,
      connectivityTest: null,
      authenticationTest: null,
      capabilitiesTest: null,
      overallResult: 'unknown'
    };
    
    try {
      // 1. Validate configuration
      testResults.configValidation = this.validateConfig(config);
      
      if (!testResults.configValidation.valid) {
        testResults.overallResult = 'failed';
        return testResults;
      }
      
      // 2. Test connectivity (mock implementation)
      testResults.connectivityTest = await this.testConnectivity(config);
      
      // 3. Test authentication (mock implementation)
      testResults.authenticationTest = await this.testAuthentication(config);
      
      // 4. Test capabilities (mock implementation)
      testResults.capabilitiesTest = await this.testCapabilities(config);
      
      // Determine overall result
      const allTests = [
        testResults.connectivityTest,
        testResults.authenticationTest,
        testResults.capabilitiesTest
      ];
      
      if (allTests.every(test => test.success)) {
        testResults.overallResult = 'passed';
      } else if (allTests.some(test => test.success)) {
        testResults.overallResult = 'partial';
      } else {
        testResults.overallResult = 'failed';
      }
      
    } catch (error) {
      testResults.overallResult = 'error';
      testResults.error = error.message;
    }
    
    testResults.executionTime = Date.now() - startTime;
    return testResults;
  }

  /**
   * Test connectivity to the service
   * @param {Object} config - Connector configuration
   * @returns {Promise<Object>} Connectivity test result
   */
  static async testConnectivity(config) {
    // Mock connectivity test
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const mockResults = {
      siem: { success: true, responseTime: 150, message: 'SIEM API accessible' },
      virustotal: { success: true, responseTime: 200, message: 'VirusTotal API accessible' },
      mock_edr: { success: true, responseTime: 50, message: 'Mock EDR connector ready' }
    };
    
    return mockResults[config.type] || { 
      success: false, 
      responseTime: 0, 
      message: `Connectivity test not implemented for type: ${config.type}` 
    };
  }

  /**
   * Test authentication
   * @param {Object} config - Connector configuration
   * @returns {Promise<Object>} Authentication test result
   */
  static async testAuthentication(config) {
    // Mock authentication test
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const authType = config.authentication?.type;
    const hasCredentials = config.authentication?.credentials && 
      Object.keys(config.authentication.credentials).length > 0;
    
    if (!hasCredentials) {
      return {
        success: false,
        message: 'No authentication credentials provided'
      };
    }
    
    return {
      success: true,
      authType,
      message: `${authType} authentication successful`
    };
  }

  /**
   * Test connector capabilities
   * @param {Object} config - Connector configuration
   * @returns {Promise<Object>} Capabilities test result
   */
  static async testCapabilities(config) {
    // Mock capabilities test
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const mockCapabilities = {
      siem: ['log_search', 'alert_search', 'event_correlation'],
      virustotal: ['ip_reputation', 'domain_reputation', 'file_hash_lookup'],
      mock_edr: ['process_search', 'file_search', 'network_search', 'endpoint_isolation']
    };
    
    const capabilities = mockCapabilities[config.type] || [];
    
    return {
      success: capabilities.length > 0,
      capabilities,
      message: `Found ${capabilities.length} capabilities`
    };
  }

  /**
   * Sanitize configuration for safe storage/display
   * @param {Object} config - Configuration object
   * @returns {Object} Sanitized configuration
   */
  static sanitizeConfig(config) {
    const sanitized = { ...config };
    
    // Remove or mask sensitive data
    if (sanitized.authentication?.credentials) {
      const credentials = { ...sanitized.authentication.credentials };
      
      // Mask sensitive fields
      const sensitiveFields = ['apiKey', 'password', 'token', 'clientSecret'];
      for (const field of sensitiveFields) {
        if (credentials[field]) {
          credentials[field] = '***MASKED***';
        }
      }
      
      sanitized.authentication = {
        ...sanitized.authentication,
        credentials
      };
    }
    
    return sanitized;
  }

  /**
   * Helper method to validate URLs
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid URL
   */
  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper method to check if string is base64 encoded
   * @param {string} str - String to check
   * @returns {boolean} True if appears to be base64
   */
  static isBase64(str) {
    try {
      return btoa(atob(str)) === str;
    } catch {
      return false;
    }
  }
}

module.exports = {
  ConnectorValidator,
  ConfigSchemas,
  AuthSchemas
};