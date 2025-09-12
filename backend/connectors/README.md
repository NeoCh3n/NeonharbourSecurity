# Connector Framework

The Connector Framework provides a standardized way to integrate with external security tools and data sources. It includes built-in support for authentication, rate limiting, circuit breakers, health monitoring, and error handling.

## Architecture

The framework consists of several key components:

- **BaseConnector**: Abstract base class that all connectors must extend
- **AuthHandler**: Handles various authentication methods (API keys, OAuth, certificates)
- **RateLimiter**: Implements rate limiting with multiple strategies
- **CircuitBreaker**: Provides circuit breaker pattern for fault tolerance
- **ConnectorRegistry**: Manages connector instances and lifecycle
- **Built-in Connectors**: Pre-built connectors for common security tools

## Quick Start

### 1. Initialize the Framework

```javascript
const { connectorFramework } = require('./connectors');

// Initialize the framework
await connectorFramework.initialize();
```

### 2. Create a Connector

```javascript
const config = {
  id: 'my-siem-connector',
  tenantId: 'tenant-123',
  type: 'siem',
  name: 'My SIEM Integration',
  baseUrl: 'https://siem.example.com',
  authentication: {
    type: 'api_key',
    credentials: {
      apiKey: 'your-base64-encoded-api-key',
      keyName: 'X-API-Key'
    }
  },
  rateLimits: {
    requestsPerSecond: 10,
    requestsPerMinute: 100
  }
};

const connector = await connectorFramework.createConnector(config);
```

### 3. Execute Queries

```javascript
// Search logs
const logResults = await connector.query({
  searchQuery: 'error AND severity:high',
  timeRange: {
    start: '2023-01-01T00:00:00Z',
    end: '2023-01-02T00:00:00Z'
  },
  limit: 100
}, 'log_search');

// Search alerts
const alertResults = await connector.query({
  severity: 'high',
  status: 'open',
  timeRange: {
    start: '2023-01-01T00:00:00Z',
    end: '2023-01-02T00:00:00Z'
  }
}, 'alert_search');
```

## Authentication Types

The framework supports multiple authentication methods:

### API Key Authentication

```javascript
authentication: {
  type: 'api_key',
  credentials: {
    apiKey: 'base64-encoded-key',
    keyName: 'X-API-Key' // Optional, defaults to 'X-API-Key'
  }
}
```

### OAuth 2.0 Client Credentials

```javascript
authentication: {
  type: 'oauth',
  credentials: {
    clientId: 'your-client-id',
    clientSecret: 'base64-encoded-secret',
    tokenUrl: 'https://auth.example.com/oauth/token',
    scope: 'read:logs write:alerts' // Optional
  }
}
```

### Basic Authentication

```javascript
authentication: {
  type: 'basic',
  credentials: {
    username: 'your-username',
    password: 'base64-encoded-password'
  }
}
```

### Certificate Authentication

```javascript
authentication: {
  type: 'certificate',
  credentials: {
    certPath: '/path/to/cert.pem',
    keyPath: '/path/to/key.pem',
    passphrase: 'base64-encoded-passphrase' // Optional
  }
}
```

### Bearer Token

```javascript
authentication: {
  type: 'bearer',
  credentials: {
    token: 'base64-encoded-token'
  }
}
```

## Rate Limiting

Configure rate limiting to respect API limits:

```javascript
rateLimits: {
  requestsPerSecond: 10,
  requestsPerMinute: 100,
  requestsPerHour: 1000,
  strategy: 'token_bucket' // 'token_bucket', 'sliding_window', 'fixed_window'
}
```

## Circuit Breaker

Circuit breakers are automatically configured but can be customized:

```javascript
circuitBreaker: {
  failureThreshold: 5,        // Failures before opening
  recoveryTimeout: 60000,     // Time before trying again (ms)
  monitoringPeriod: 10000,    // Monitoring window (ms)
  halfOpenMaxCalls: 3,        // Max calls in half-open state
  successThreshold: 2         // Successes needed to close
}
```

## Health Monitoring

Connectors automatically perform health checks:

```javascript
// Manual health check
const healthResult = await connector.performHealthCheck();

// Get connector status
const status = connector.getStatus();

// Registry-wide health checks
const registry = connectorFramework.getRegistry();
const allHealthResults = await registry.performHealthChecks();
```

## Creating Custom Connectors

### 1. Extend BaseConnector

```javascript
const { BaseConnector, QueryTypes } = require('./base-connector');

class MyCustomConnector extends BaseConnector {
  async initialize() {
    // Initialize your connector
    this.status = 'active';
  }

  async healthCheck() {
    // Implement health check logic
    return {
      healthy: true,
      timestamp: new Date().toISOString(),
      responseTime: 100
    };
  }

  async executeQuery(query, queryType) {
    // Implement query execution logic
    switch (queryType) {
      case QueryTypes.SEARCH:
        return await this.search(query);
      case QueryTypes.ENRICH:
        return await this.enrich(query);
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }
  }

  getCapabilities() {
    return ['search', 'enrich'];
  }

  getDataTypes() {
    return ['logs', 'alerts'];
  }
}
```

### 2. Register Your Connector

```javascript
const registry = connectorFramework.getRegistry();
registry.registerConnectorType('my-custom', MyCustomConnector);
```

### 3. Use Your Connector

```javascript
const config = {
  id: 'my-connector',
  tenantId: 'tenant-123',
  type: 'my-custom',
  name: 'My Custom Connector',
  // ... other config
};

const connector = await connectorFramework.createConnector(config);
```

## Built-in Connectors

### SIEM Connector

Provides standardized access to SIEM platforms:

```javascript
const config = {
  type: 'siem',
  baseUrl: 'https://siem.example.com',
  // ... authentication and other config
};

const siemConnector = await connectorFramework.createConnector(config);

// Search logs
const logs = await siemConnector.query({
  searchQuery: 'failed login',
  timeRange: { start: '2023-01-01', end: '2023-01-02' }
}, 'log_search');

// Search alerts
const alerts = await siemConnector.query({
  severity: 'high',
  status: 'open'
}, 'alert_search');

// Correlate events
const correlations = await siemConnector.query({
  entities: ['192.168.1.100', 'user@example.com'],
  timeWindow: '1h',
  threshold: 0.8
}, 'event_correlation');
```

## Error Handling

The framework provides comprehensive error handling:

```javascript
try {
  const result = await connector.query(query);
} catch (error) {
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    // Circuit breaker is open, service unavailable
    console.log('Service temporarily unavailable');
  } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // Rate limit exceeded
    console.log('Rate limit exceeded, retry later');
  } else {
    // Other errors
    console.error('Query failed:', error.message);
  }
}
```

## Events

Connectors emit events for monitoring and debugging:

```javascript
connector.on('healthCheckCompleted', (data) => {
  console.log('Health check completed:', data);
});

connector.on('circuitBreakerOpen', (data) => {
  console.log('Circuit breaker opened:', data);
});

connector.on('metricsUpdated', (metrics) => {
  console.log('Metrics updated:', metrics);
});
```

## Registry Management

The ConnectorRegistry provides centralized management:

```javascript
const registry = connectorFramework.getRegistry();

// Get all connectors for a tenant
const tenantConnectors = registry.getConnectorsByTenant('tenant-123');

// Get connectors by type
const siemConnectors = registry.getConnectorsByType('siem', 'tenant-123');

// Get active connectors only
const activeConnectors = registry.getActiveConnectors('tenant-123');

// Query multiple connectors in parallel
const results = await registry.queryMultiple(
  ['connector-1', 'connector-2'],
  { search: 'malware' },
  'search'
);

// Remove a connector
await registry.removeConnector('connector-id');

// Get registry status
const status = registry.getStatus();
```

## Best Practices

### 1. Configuration Management

- Store sensitive credentials encrypted
- Use environment variables for configuration
- Validate configuration before creating connectors

### 2. Error Handling

- Always handle circuit breaker states
- Implement proper retry logic
- Log errors with sufficient context

### 3. Rate Limiting

- Configure appropriate rate limits for each API
- Monitor rate limit usage
- Implement backoff strategies

### 4. Health Monitoring

- Set up automated health checks
- Monitor connector metrics
- Alert on connector failures

### 5. Security

- Encrypt credentials at rest
- Use secure authentication methods
- Validate all inputs
- Implement proper access controls

## Testing

The framework includes comprehensive test utilities:

```javascript
// Mock connector for testing
class MockConnector extends BaseConnector {
  async executeQuery(query, queryType) {
    return { mockResult: true, query, queryType };
  }
  
  getCapabilities() { return ['mock']; }
  getDataTypes() { return ['mock-data']; }
}

// Register and test
registry.registerConnectorType('mock', MockConnector);
const connector = await registry.createConnector({
  id: 'test-connector',
  type: 'mock',
  // ... config
});

const result = await connector.query({ test: true });
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify credentials are correctly encoded
   - Check API key permissions
   - Ensure OAuth scopes are sufficient

2. **Rate Limiting**
   - Adjust rate limit configuration
   - Implement proper backoff strategies
   - Monitor API usage quotas

3. **Circuit Breaker Issues**
   - Check failure thresholds
   - Monitor error rates
   - Verify recovery timeouts

4. **Connection Issues**
   - Verify network connectivity
   - Check firewall rules
   - Validate SSL certificates

### Debugging

Enable debug logging:

```javascript
connector.on('error', (error) => {
  console.error('Connector error:', error);
});

connector.on('metricsUpdated', (metrics) => {
  console.log('Connector metrics:', metrics);
});
```

## API Reference

See the individual component files for detailed API documentation:

- [BaseConnector](./base-connector.js)
- [AuthHandler](./auth-handler.js)
- [RateLimiter](./rate-limiter.js)
- [CircuitBreaker](./circuit-breaker.js)
- [ConnectorRegistry](./connector-registry.js)
- [SiemConnector](./siem-connector.js)