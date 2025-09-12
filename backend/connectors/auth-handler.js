/**
 * Authentication Handler for Connectors
 * 
 * Handles various authentication methods for external data sources
 * Supports API keys, OAuth, certificates, and basic authentication
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const https = require('https');

/**
 * Authentication handler class
 */
class AuthHandler {
  constructor(config) {
    this.config = config;
    this.credentials = null;
    this.tokenCache = new Map();
  }

  /**
   * Initialize authentication based on type
   * @returns {Promise<void>}
   */
  async initialize() {
    switch (this.config.authentication.type) {
      case 'api_key':
        await this.initializeApiKey();
        break;
      case 'oauth':
        await this.initializeOAuth();
        break;
      case 'certificate':
        await this.initializeCertificate();
        break;
      case 'basic':
        await this.initializeBasic();
        break;
      case 'bearer':
        await this.initializeBearer();
        break;
      default:
        throw new Error(`Unsupported authentication type: ${this.config.authentication.type}`);
    }
  }

  /**
   * Initialize API key authentication
   */
  async initializeApiKey() {
    const { apiKey, keyName = 'X-API-Key' } = this.config.authentication.credentials;
    
    if (!apiKey) {
      throw new Error('API key is required for api_key authentication');
    }

    this.credentials = {
      type: 'api_key',
      keyName,
      apiKey: this.decrypt(apiKey)
    };
  }

  /**
   * Initialize OAuth authentication
   */
  async initializeOAuth() {
    const { clientId, clientSecret, tokenUrl, scope } = this.config.authentication.credentials;
    
    if (!clientId || !clientSecret || !tokenUrl) {
      throw new Error('clientId, clientSecret, and tokenUrl are required for OAuth authentication');
    }

    this.credentials = {
      type: 'oauth',
      clientId,
      clientSecret: this.decrypt(clientSecret),
      tokenUrl,
      scope: scope || ''
    };

    // Get initial token
    await this.refreshOAuthToken();
  }

  /**
   * Initialize certificate authentication
   */
  async initializeCertificate() {
    const { certPath, keyPath, passphrase } = this.config.authentication.credentials;
    
    if (!certPath || !keyPath) {
      throw new Error('certPath and keyPath are required for certificate authentication');
    }

    try {
      const cert = await fs.readFile(certPath);
      const key = await fs.readFile(keyPath);

      this.credentials = {
        type: 'certificate',
        cert,
        key,
        passphrase: passphrase ? this.decrypt(passphrase) : undefined
      };
    } catch (error) {
      throw new Error(`Failed to load certificate files: ${error.message}`);
    }
  }

  /**
   * Initialize basic authentication
   */
  async initializeBasic() {
    const { username, password } = this.config.authentication.credentials;
    
    if (!username || !password) {
      throw new Error('username and password are required for basic authentication');
    }

    const credentials = Buffer.from(`${username}:${this.decrypt(password)}`).toString('base64');
    
    this.credentials = {
      type: 'basic',
      credentials
    };
  }

  /**
   * Initialize bearer token authentication
   */
  async initializeBearer() {
    const { token } = this.config.authentication.credentials;
    
    if (!token) {
      throw new Error('token is required for bearer authentication');
    }

    this.credentials = {
      type: 'bearer',
      token: this.decrypt(token)
    };
  }

  /**
   * Get authentication headers for requests
   * @returns {Promise<Object>} Authentication headers
   */
  async getAuthHeaders() {
    if (!this.credentials) {
      throw new Error('Authentication not initialized');
    }

    switch (this.credentials.type) {
      case 'api_key':
        return {
          [this.credentials.keyName]: this.credentials.apiKey
        };
      
      case 'oauth':
        const token = await this.getValidOAuthToken();
        return {
          'Authorization': `Bearer ${token}`
        };
      
      case 'basic':
        return {
          'Authorization': `Basic ${this.credentials.credentials}`
        };
      
      case 'bearer':
        return {
          'Authorization': `Bearer ${this.credentials.token}`
        };
      
      default:
        return {};
    }
  }

  /**
   * Get HTTPS agent for certificate authentication
   * @returns {https.Agent|null} HTTPS agent or null if not certificate auth
   */
  getHttpsAgent() {
    if (this.credentials && this.credentials.type === 'certificate') {
      return new https.Agent({
        cert: this.credentials.cert,
        key: this.credentials.key,
        passphrase: this.credentials.passphrase,
        rejectUnauthorized: true
      });
    }
    return null;
  }

  /**
   * Refresh OAuth token
   * @returns {Promise<string>} New access token
   */
  async refreshOAuthToken() {
    const { clientId, clientSecret, tokenUrl, scope } = this.credentials;
    
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });

    if (scope) {
      params.append('scope', scope);
    }

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      if (!response.ok) {
        throw new Error(`OAuth token request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.access_token) {
        throw new Error('No access token in OAuth response');
      }

      // Cache token with expiration
      const expiresIn = data.expires_in || 3600; // Default 1 hour
      const expiresAt = Date.now() + (expiresIn * 1000) - 60000; // Refresh 1 minute early

      this.tokenCache.set('oauth_token', {
        token: data.access_token,
        expiresAt
      });

      return data.access_token;
    } catch (error) {
      throw new Error(`Failed to refresh OAuth token: ${error.message}`);
    }
  }

  /**
   * Get valid OAuth token (refresh if needed)
   * @returns {Promise<string>} Valid access token
   */
  async getValidOAuthToken() {
    const cached = this.tokenCache.get('oauth_token');
    
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    return await this.refreshOAuthToken();
  }

  /**
   * Validate authentication configuration
   * @returns {Promise<boolean>} True if authentication is valid
   */
  async validateAuth() {
    try {
      await this.getAuthHeaders();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Decrypt encrypted credentials
   * @param {string} encryptedData - Encrypted credential data
   * @returns {string} Decrypted data
   */
  decrypt(encryptedData) {
    // In a real implementation, this would use proper encryption/decryption
    // For now, we'll assume the data is base64 encoded
    try {
      return Buffer.from(encryptedData, 'base64').toString('utf8');
    } catch (error) {
      // If not base64, return as-is (for development/testing)
      return encryptedData;
    }
  }

  /**
   * Encrypt credentials for storage
   * @param {string} data - Data to encrypt
   * @returns {string} Encrypted data
   */
  static encrypt(data) {
    // In a real implementation, this would use proper encryption
    // For now, we'll use base64 encoding
    return Buffer.from(data, 'utf8').toString('base64');
  }

  /**
   * Clear cached tokens and credentials
   */
  clearCache() {
    this.tokenCache.clear();
  }

  /**
   * Get authentication status
   * @returns {Object} Authentication status information
   */
  getStatus() {
    return {
      type: this.config.authentication.type,
      initialized: !!this.credentials,
      hasValidToken: this.credentials?.type === 'oauth' ? 
        this.tokenCache.has('oauth_token') : true,
      tokenExpiresAt: this.credentials?.type === 'oauth' ? 
        this.tokenCache.get('oauth_token')?.expiresAt : null
    };
  }
}

module.exports = AuthHandler;