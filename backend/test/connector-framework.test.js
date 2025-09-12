/**
 * Connector Framework Unit Tests
 * 
 * Comprehensive tests for the connector framework components
 */

const EventEmitter = require('events');

// Import framework components
const { BaseConnector, AuthTypes, ConnectorStatus, QueryTypes } = require('../connectors/base-connector');
const AuthHandler = require('../connectors/auth-handler');
const { RateLimiter, RateLimitStrategy, TokenBucketLimiter } = require('../connectors/rate-limiter');
const { CircuitBreaker, CircuitState } = require('../connectors/circuit-breaker');
const ConnectorRegistry = require('../connectors/connector-registry');
const { SiemConnector } = require('../connectors/siem-connector');

// Mock fetch for HTTP requests
global.fetch = jest.fn();

/**
 * Mock connector for testing
 */
class MockConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.initializeCalled = false;
    this.healthCheckCalled = false;
    this.queryExecuted = false;
  }

  async initialize() {
    this.initializeCalled = true;
    this.status = ConnectorStatus.ACTIVE;
  }

  async healthCheck() {
    this.healthCheckCalled = true;
    return {
      healthy: true,
      timestamp: new Date().toISOString(),
      responseTime: 100
    };
  }

  async executeQuery(query, queryType) {
    this.queryExecuted = true;
    return {
      results: [{ id: 1, data: 'mock result' }],
      query,
      queryType
    };
  }

  getCapabilities() {
    return ['search', 'enrich'];
  }

  getDataTypes() {
    return ['logs', 'alerts'];
  }
}

describe('BaseConnector', () => {
  let config;

  beforeEach(() => {
    config = {
      id: 'test-connector-1',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Test Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: 'dGVzdC1hcGkta2V5' // base64 encoded 'test-api-key'
        }
      }
    };
  });

  test('should throw error when instantiated directly', () => {
    expect(() => new BaseConnector(config)).toThrow('BaseConnector is abstract');
  });

  test('should validate required configuration fields', () => {
    const invalidConfig = { ...config };
    delete invalidConfig.id;
    
    expect(() => new MockConnector(invalidConfig)).toThrow('Missing required configuration field: id');
  });

  test('should validate authentication type', () => {
    const invalidConfig = {
      ...config,
      authentication: { type: 'invalid_type' }
    };
    
    expect(() => new MockConnector(invalidConfig)).toThrow('Unsupported authentication type');
  });

  test('should initialize successfully with valid config', async () => {
    const connector = new MockConnector(config);
    await connector.initialize();
    
    expect(connector.initializeCalled).toBe(true);
    expect(connector.status).toBe(ConnectorStatus.ACTIVE);
  });

  test('should perform health check', async () => {
    const connector = new MockConnector(config);
    await connector.initialize();
    
    const result = await connector.performHealthCheck();
    
    expect(connector.healthCheckCalled).toBe(true);
    expect(result.healthy).toBe(true);
    expect(connector.lastHealthCheck).toBeTruthy();
  });

  test('should execute queries with rate limiting', async () => {
    const connector = new MockConnector(config);
    await connector.initialize();
    
    const query = { search: 'test' };
    const result = await connector.query(query, QueryTypes.SEARCH);
    
    expect(connector.queryExecuted).toBe(true);
    expect(result.query).toEqual(query);
    expect(result.queryType).toBe(QueryTypes.SEARCH);
  });

  test('should update metrics on successful queries', async () => {
    const connector = new MockConnector(config);
    await connector.initialize();
    
    await connector.query({ search: 'test' });
    
    expect(connector.metrics.totalQueries).toBe(1);
    expect(connector.metrics.successfulQueries).toBe(1);
    expect(connector.metrics.failedQueries).toBe(0);
  });

  test('should handle circuit breaker on failures', async () => {
    const connector = new MockConnector(config);
    connector.executeQuery = jest.fn().mockRejectedValue(new Error('Connection failed'));
    
    await connector.initialize();
    
    // Trigger failures to open circuit breaker
    for (let i = 0; i < 6; i++) {
      try {
        await connector.query({ search: 'test' });
      } catch (error) {
        // Expected to fail
      }
    }
    
    expect(connector.circuitBreaker.state).toBe('OPEN');
    expect(connector.status).toBe(ConnectorStatus.ERROR);
  });

  test('should emit events on state changes', async () => {
    const connector = new MockConnector(config);
    const eventSpy = jest.fn();
    
    connector.on('circuitBreakerOpen', eventSpy);
    connector.executeQuery = jest.fn().mockRejectedValue(new Error('Connection failed'));
    
    await connector.initialize();
    
    // Trigger circuit breaker
    for (let i = 0; i < 6; i++) {
      try {
        await connector.query({ search: 'test' });
      } catch (error) {
        // Expected to fail
      }
    }
    
    expect(eventSpy).toHaveBeenCalled();
  });
});

describe('AuthHandler', () => {
  test('should initialize API key authentication', async () => {
    const config = {
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: 'dGVzdC1hcGkta2V5', // base64 encoded
          keyName: 'X-API-Key'
        }
      }
    };
    
    const authHandler = new AuthHandler(config);
    await authHandler.initialize();
    
    const headers = await authHandler.getAuthHeaders();
    expect(headers['X-API-Key']).toBe('test-api-key');
  });

  test('should initialize basic authentication', async () => {
    const config = {
      authentication: {
        type: AuthTypes.BASIC,
        credentials: {
          username: 'user',
          password: 'cGFzcw==' // base64 encoded 'pass'
        }
      }
    };
    
    const authHandler = new AuthHandler(config);
    await authHandler.initialize();
    
    const headers = await authHandler.getAuthHeaders();
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  test('should handle OAuth token refresh', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'mock-token',
        expires_in: 3600
      })
    });

    const config = {
      authentication: {
        type: AuthTypes.OAUTH,
        credentials: {
          clientId: 'client-id',
          clientSecret: 'Y2xpZW50LXNlY3JldA==', // base64 encoded
          tokenUrl: 'https://auth.example.com/token'
        }
      }
    };
    
    const authHandler = new AuthHandler(config);
    await authHandler.initialize();
    
    const headers = await authHandler.getAuthHeaders();
    expect(headers.Authorization).toBe('Bearer mock-token');
  });

  test('should validate authentication', async () => {
    const config = {
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: 'dGVzdC1hcGkta2V5'
        }
      }
    };
    
    const authHandler = new AuthHandler(config);
    await authHandler.initialize();
    
    const isValid = await authHandler.validateAuth();
    expect(isValid).toBe(true);
  });
});

describe('RateLimiter', () => {
  test('should create token bucket limiter', () => {
    const limiter = new TokenBucketLimiter(10, 5, 1000);
    
    expect(limiter.capacity).toBe(10);
    expect(limiter.tokens).toBe(10);
    expect(limiter.refillRate).toBe(5);
  });

  test('should consume tokens successfully', () => {
    const limiter = new TokenBucketLimiter(10, 5, 1000);
    
    const result = limiter.tryConsume(3);
    expect(result).toBe(true);
    expect(limiter.tokens).toBe(7);
  });

  test('should reject when insufficient tokens', () => {
    const limiter = new TokenBucketLimiter(5, 1, 1000);
    
    limiter.tryConsume(5); // Consume all tokens
    const result = limiter.tryConsume(1);
    
    expect(result).toBe(false);
    expect(limiter.tokens).toBe(0);
  });

  test('should refill tokens over time', async () => {
    const limiter = new TokenBucketLimiter(10, 10, 100); // Refill 10 tokens every 100ms
    
    limiter.tryConsume(10); // Consume all tokens
    expect(limiter.tokens).toBe(0);
    
    // Wait for refill
    await new Promise(resolve => setTimeout(resolve, 150));
    limiter.refill();
    
    expect(limiter.tokens).toBeGreaterThan(0);
  });

  test('should create rate limiter with multiple strategies', () => {
    const config = {
      requestsPerSecond: 10,
      requestsPerMinute: 100,
      strategy: RateLimitStrategy.TOKEN_BUCKET
    };
    
    const rateLimiter = new RateLimiter(config);
    const status = rateLimiter.getStatus();
    
    expect(status.second).toBeDefined();
    expect(status.minute).toBeDefined();
  });

  test('should check request allowance', () => {
    const config = {
      requestsPerSecond: 2,
      strategy: RateLimitStrategy.TOKEN_BUCKET
    };
    
    const rateLimiter = new RateLimiter(config);
    
    const result1 = rateLimiter.checkRequest();
    expect(result1.allowed).toBe(true);
    
    const result2 = rateLimiter.checkRequest();
    expect(result2.allowed).toBe(true);
    
    const result3 = rateLimiter.checkRequest();
    expect(result3.allowed).toBe(false);
  });
});

describe('CircuitBreaker', () => {
  test('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getStatus().state).toBe(CircuitState.CLOSED);
  });

  test('should execute function successfully', async () => {
    const breaker = new CircuitBreaker();
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const result = await breaker.execute(mockFn, 'arg1', 'arg2');
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  test('should transition to OPEN on failures', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const mockFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
    
    // Trigger failures
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(mockFn);
      } catch (error) {
        // Expected to fail
      }
    }
    
    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);
  });

  test('should reject calls when OPEN', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const mockFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
    
    // Trigger failure to open circuit
    try {
      await breaker.execute(mockFn);
    } catch (error) {
      // Expected to fail
    }
    
    // Next call should be rejected
    await expect(breaker.execute(mockFn)).rejects.toThrow('Circuit breaker is OPEN');
  });

  test('should transition to HALF_OPEN after timeout', async () => {
    const breaker = new CircuitBreaker({ 
      failureThreshold: 1, 
      recoveryTimeout: 100 
    });
    const mockFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
    
    // Open the circuit
    try {
      await breaker.execute(mockFn);
    } catch (error) {
      // Expected to fail
    }
    
    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);
    
    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Next call should transition to HALF_OPEN
    mockFn.mockResolvedValueOnce('success');
    const result = await breaker.execute(mockFn);
    
    expect(result).toBe('success');
  });

  test('should emit events on state changes', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const stateChangeSpy = jest.fn();
    
    breaker.on('stateChange', stateChangeSpy);
    
    const mockFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
    
    try {
      await breaker.execute(mockFn);
    } catch (error) {
      // Expected to fail
    }
    
    expect(stateChangeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: CircuitState.CLOSED,
        to: CircuitState.OPEN
      })
    );
  });

  test('should reset circuit breaker', () => {
    const breaker = new CircuitBreaker();
    breaker.failureCount = 5;
    breaker.state = CircuitState.OPEN;
    
    breaker.reset();
    
    const status = breaker.getStatus();
    expect(status.state).toBe(CircuitState.CLOSED);
    expect(status.failureCount).toBe(0);
  });
});

describe('ConnectorRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
    registry.registerConnectorType('mock', MockConnector);
  });

  afterEach(async () => {
    await registry.shutdown();
  });

  test('should register connector types', () => {
    expect(registry.connectorTypes.has('mock')).toBe(true);
  });

  test('should create connector instances', async () => {
    const config = {
      id: 'test-connector',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Test Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: { apiKey: 'dGVzdA==' }
      }
    };
    
    const connector = await registry.createConnector(config);
    
    expect(connector).toBeInstanceOf(MockConnector);
    expect(connector.initializeCalled).toBe(true);
    expect(registry.connectors.has('test-connector')).toBe(true);
  });

  test('should prevent duplicate connector IDs', async () => {
    const config = {
      id: 'duplicate-id',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Test Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: { apiKey: 'dGVzdA==' }
      }
    };
    
    await registry.createConnector(config);
    
    await expect(registry.createConnector(config))
      .rejects.toThrow('Connector with id duplicate-id already exists');
  });

  test('should get connectors by tenant', async () => {
    const config1 = {
      id: 'connector-1',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Connector 1',
      authentication: { type: AuthTypes.API_KEY, credentials: { apiKey: 'dGVzdA==' } }
    };
    
    const config2 = {
      id: 'connector-2',
      tenantId: 'tenant-2',
      type: 'mock',
      name: 'Connector 2',
      authentication: { type: AuthTypes.API_KEY, credentials: { apiKey: 'dGVzdA==' } }
    };
    
    await registry.createConnector(config1);
    await registry.createConnector(config2);
    
    const tenant1Connectors = registry.getConnectorsByTenant('tenant-1');
    expect(tenant1Connectors).toHaveLength(1);
    expect(tenant1Connectors[0].id).toBe('connector-1');
  });

  test('should perform health checks on all connectors', async () => {
    const config = {
      id: 'health-test-connector',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Health Test Connector',
      authentication: { type: AuthTypes.API_KEY, credentials: { apiKey: 'dGVzdA==' } }
    };
    
    await registry.createConnector(config);
    
    const results = await registry.performHealthChecks();
    
    expect(results['health-test-connector']).toBeDefined();
    expect(results['health-test-connector'].healthy).toBe(true);
  });

  test('should remove connectors', async () => {
    const config = {
      id: 'removable-connector',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Removable Connector',
      authentication: { type: AuthTypes.API_KEY, credentials: { apiKey: 'dGVzdA==' } }
    };
    
    await registry.createConnector(config);
    expect(registry.connectors.has('removable-connector')).toBe(true);
    
    const removed = await registry.removeConnector('removable-connector');
    
    expect(removed).toBe(true);
    expect(registry.connectors.has('removable-connector')).toBe(false);
  });

  test('should query multiple connectors', async () => {
    const config1 = {
      id: 'query-connector-1',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Query Connector 1',
      authentication: { type: AuthTypes.API_KEY, credentials: { apiKey: 'dGVzdA==' } }
    };
    
    const config2 = {
      id: 'query-connector-2',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Query Connector 2',
      authentication: { type: AuthTypes.API_KEY, credentials: { apiKey: 'dGVzdA==' } }
    };
    
    await registry.createConnector(config1);
    await registry.createConnector(config2);
    
    const results = await registry.queryMultiple(
      ['query-connector-1', 'query-connector-2'],
      { search: 'test' },
      QueryTypes.SEARCH
    );
    
    expect(results['query-connector-1']).toBeDefined();
    expect(results['query-connector-2']).toBeDefined();
    expect(results['query-connector-1'].results).toBeDefined();
    expect(results['query-connector-2'].results).toBeDefined();
  });

  test('should get registry status', async () => {
    const config = {
      id: 'status-connector',
      tenantId: 'tenant-1',
      type: 'mock',
      name: 'Status Connector',
      authentication: { type: AuthTypes.API_KEY, credentials: { apiKey: 'dGVzdA==' } }
    };
    
    await registry.createConnector(config);
    
    const status = registry.getStatus();
    
    expect(status.totalConnectors).toBe(1);
    expect(status.registeredTypes).toContain('mock');
    expect(status.connectorsByType.mock).toBe(1);
  });
});

describe('SiemConnector', () => {
  let config;

  beforeEach(() => {
    config = {
      id: 'siem-connector',
      tenantId: 'tenant-1',
      type: 'siem',
      name: 'Test SIEM',
      baseUrl: 'https://siem.example.com',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: 'dGVzdC1hcGkta2V5'
        }
      },
      rateLimits: {
        requestsPerSecond: 10
      }
    };

    // Mock successful responses
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        version: '1.0.0',
        data: {
          events: [{ id: 1, message: 'test event' }],
          total_count: 1
        }
      })
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize SIEM connector', async () => {
    const connector = new SiemConnector(config);
    await connector.initialize();
    
    expect(connector.status).toBe('active');
    expect(connector.authHandler).toBeDefined();
    expect(connector.rateLimiter).toBeDefined();
  });

  test('should perform health check', async () => {
    const connector = new SiemConnector(config);
    await connector.initialize();
    
    const result = await connector.healthCheck();
    
    expect(result.healthy).toBe(true);
    expect(result.version).toBe('1.0.0');
  });

  test('should search logs', async () => {
    const connector = new SiemConnector(config);
    await connector.initialize();
    
    const query = {
      searchQuery: 'error',
      timeRange: { start: '2023-01-01', end: '2023-01-02' },
      limit: 10
    };
    
    const result = await connector.searchLogs(query);
    
    expect(result.results).toHaveLength(1);
    expect(result.query).toBe('error');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/logs/search'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('should search alerts', async () => {
    const connector = new SiemConnector(config);
    await connector.initialize();
    
    // Clear previous mocks and set specific mock for alerts
    global.fetch.mockClear();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          alerts: [{ id: 1, severity: 'high' }],
          total_count: 1
        }
      })
    });
    
    const query = {
      severity: 'high',
      timeRange: { start: '2023-01-01', end: '2023-01-02' }
    };
    
    const result = await connector.searchAlerts(query);
    
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].severity).toBe('high');
  });

  test('should handle API errors', async () => {
    const connector = new SiemConnector(config);
    await connector.initialize();
    
    // Mock error response after initialization
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });
    
    await expect(connector.searchLogs({ searchQuery: 'test' }))
      .rejects.toThrow('SIEM API error: 500 Internal Server Error');
  });

  test('should get capabilities and data types', () => {
    const connector = new SiemConnector(config);
    
    const capabilities = connector.getCapabilities();
    const dataTypes = connector.getDataTypes();
    
    expect(capabilities).toContain('log_search');
    expect(capabilities).toContain('alert_search');
    expect(dataTypes).toContain('security_logs');
    expect(dataTypes).toContain('alerts');
  });

  test('should test connectivity', async () => {
    const connector = new SiemConnector(config);
    await connector.initialize();
    
    const result = await connector.testConnectivity();
    
    expect(result.connected).toBe(true);
    expect(result.responseTime).toBeGreaterThan(0);
  });
});

// Integration test for the complete framework
describe('Connector Framework Integration', () => {
  test('should work end-to-end with SIEM connector', async () => {
    const { connectorFramework } = require('../connectors');
    
    await connectorFramework.initialize();
    
    const config = {
      id: 'integration-test-connector',
      tenantId: 'tenant-1',
      type: 'siem',
      name: 'Integration Test SIEM',
      baseUrl: 'https://siem.example.com',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: 'dGVzdC1hcGkta2V5'
        }
      }
    };

    // Mock successful API response
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        data: { events: [], total_count: 0 }
      })
    });
    
    const connector = await connectorFramework.createConnector(config);
    
    expect(connector).toBeInstanceOf(SiemConnector);
    expect(connector.status).toBe('active');
    
    const registry = connectorFramework.getRegistry();
    const status = registry.getStatus();
    
    expect(status.totalConnectors).toBe(1);
    expect(status.registeredTypes).toContain('siem');
    expect(status.registeredTypes).toContain('virustotal');
    expect(status.registeredTypes).toContain('mock_edr');
    
    await connectorFramework.shutdown();
  });

  test('should support all connector types', async () => {
    const { connectorFramework } = require('../connectors');
    
    await connectorFramework.initialize();
    
    const registry = connectorFramework.getRegistry();
    const status = registry.getStatus();
    
    // Verify all connector types are registered
    expect(status.registeredTypes).toContain('siem');
    expect(status.registeredTypes).toContain('virustotal');
    expect(status.registeredTypes).toContain('mock_edr');
    
    await connectorFramework.shutdown();
  });
});