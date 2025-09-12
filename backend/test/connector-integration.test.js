/**
 * Connector Integration Tests
 * 
 * Integration tests for all connector types including VirusTotal, Mock EDR,
 * and connector validation/testing endpoints
 */

const request = require('supertest');
const express = require('express');

// Import connector framework components
const { 
  connectorFramework, 
  VirusTotalConnector, 
  MockEdrConnector,
  ConnectorValidator,
  AuthTypes,
  VirusTotalQueryTypes,
  EdrQueryTypes
} = require('../connectors');

const connectorApi = require('../connectors/connector-api');

// Mock fetch for HTTP requests
global.fetch = jest.fn();

// Create Express app for API testing
const app = express();
app.use(express.json());
app.use('/api/connectors', connectorApi);

describe('VirusTotal Connector Integration', () => {
  let connector;
  
  const validConfig = {
    id: 'virustotal-test',
    tenantId: 'tenant-1',
    type: 'virustotal',
    name: 'Test VirusTotal',
    authentication: {
      type: AuthTypes.API_KEY,
      credentials: {
        apiKey: Buffer.from('test-vt-api-key').toString('base64')
      }
    },
    rateLimits: {
      requestsPerMinute: 4
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful VirusTotal API responses
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'test-id',
          attributes: {
            last_analysis_stats: {
              malicious: 2,
              suspicious: 1,
              harmless: 45,
              undetected: 12
            },
            last_analysis_date: 1640995200,
            country: 'US',
            as_owner: 'Test ISP'
          }
        }
      })
    });
  });

  afterEach(async () => {
    if (connector) {
      await connector.shutdown();
      connector = null;
    }
  });

  test('should initialize VirusTotal connector successfully', async () => {
    connector = new VirusTotalConnector(validConfig);
    await connector.initialize();
    
    expect(connector.status).toBe('active');
    expect(connector.id).toBe('virustotal-test');
    expect(connector.type).toBe('virustotal');
  });

  test('should perform health check', async () => {
    // Mock user info endpoint for health check - needs to be set before initialization
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'user-123',
          attributes: {
            quotas: {
              api_requests_monthly: {
                allowed: 15500,
                used: 1200
              }
            }
          }
        }
      })
    });
    
    connector = new VirusTotalConnector(validConfig);
    await connector.initialize();
    
    const healthResult = await connector.healthCheck();
    
    expect(healthResult.healthy).toBe(true);
    expect(healthResult.quotaRemaining).toBe(15500);
  });

  test('should check IP reputation', async () => {
    connector = new VirusTotalConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.checkIpReputation('8.8.8.8');
    
    expect(result.indicator).toBe('8.8.8.8');
    expect(result.type).toBe('ip');
    expect(result.reputation).toBe('malicious'); // 2 malicious > 0, so malicious
    expect(result.maliciousCount).toBe(2);
    expect(result.suspiciousCount).toBe(1);
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('should lookup file hash', async () => {
    connector = new VirusTotalConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.lookupFileHash('abc123def456789');
    
    expect(result.indicator).toBe('abc123def456789');
    expect(result.type).toBe('file_hash');
    expect(result.detectionRatio).toBe('2/60');
    expect(result.riskScore).toBeGreaterThan(0);
  });

  test('should perform bulk lookup', async () => {
    connector = new VirusTotalConnector(validConfig);
    await connector.initialize();
    
    const indicators = ['8.8.8.8', 'google.com', 'abc123def456'];
    const result = await connector.bulkLookup(indicators);
    
    expect(result.results).toHaveLength(3);
    expect(result.totalProcessed).toBe(3);
    expect(result.results[0].indicator).toBe('8.8.8.8');
    expect(result.results[1].indicator).toBe('google.com');
    expect(result.results[2].indicator).toBe('abc123def456');
  });

  test('should handle API errors gracefully', async () => {
    connector = new VirusTotalConnector(validConfig);
    await connector.initialize();
    
    // Mock API error after initialization
    global.fetch.mockRejectedValueOnce(new Error('API rate limit exceeded'));
    
    await expect(connector.checkIpReputation('1.2.3.4'))
      .rejects.toThrow('API rate limit exceeded');
  });

  test('should get capabilities and data types', () => {
    connector = new VirusTotalConnector(validConfig);
    
    const capabilities = connector.getCapabilities();
    const dataTypes = connector.getDataTypes();
    
    expect(capabilities).toContain('ip_reputation');
    expect(capabilities).toContain('domain_reputation');
    expect(capabilities).toContain('file_hash_lookup');
    
    expect(dataTypes).toContain('ip_addresses');
    expect(dataTypes).toContain('domains');
    expect(dataTypes).toContain('file_hashes');
  });
});

describe('Mock EDR Connector Integration', () => {
  let connector;
  
  const validConfig = {
    id: 'mock-edr-test',
    tenantId: 'tenant-1',
    type: 'mock_edr',
    name: 'Test Mock EDR',
    authentication: {
      type: AuthTypes.API_KEY,
      credentials: {
        apiKey: Buffer.from('test-edr-key').toString('base64')
      }
    },
    mockDelay: 50
  };

  afterEach(async () => {
    if (connector) {
      await connector.shutdown();
      connector = null;
    }
  });

  test('should initialize Mock EDR connector successfully', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    expect(connector.status).toBe('active');
    expect(connector.id).toBe('mock-edr-test');
    expect(connector.type).toBe('mock_edr');
  });

  test('should perform health check', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const healthResult = await connector.healthCheck();
    
    expect(healthResult.healthy).toBe(true);
    expect(healthResult.endpointsOnline).toBeGreaterThan(0);
    expect(healthResult.totalEndpoints).toBeGreaterThan(0);
  });

  test('should search processes', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.searchProcesses({ processName: 'chrome' });
    
    expect(result.processes).toBeDefined();
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.processes[0].name).toContain('chrome');
  });

  test('should search files', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.searchFiles({ fileName: 'malware' });
    
    expect(result.files).toBeDefined();
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.files[0].path).toContain('malware');
  });

  test('should search network connections', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.searchNetworkConnections({ port: 443 });
    
    expect(result.connections).toBeDefined();
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.connections[0].port).toBe(443);
  });

  test('should isolate endpoint', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.isolateEndpoint({ endpointId: 'endpoint-001' });
    
    expect(result.success).toBe(true);
    expect(result.action).toBe('isolated');
    expect(result.endpointId).toBe('endpoint-001');
  });

  test('should hunt for threats', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.huntThreats({ 
      iocs: ['malicious123', 'suspicious.exe'] 
    });
    
    expect(result.findings).toBeDefined();
    expect(result.totalFindings).toBeGreaterThan(0);
    expect(result.findings[0].ioc).toBe('malicious123');
  });

  test('should enrich indicators', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.enrichData({ 
      indicators: ['chrome.exe', 'malicious123'] 
    });
    
    expect(result.enrichedData).toBeDefined();
    expect(result.enrichedData['chrome.exe']).toBeDefined();
    expect(result.enrichedData['malicious123']).toBeDefined();
  });

  test('should get endpoints list', async () => {
    connector = new MockEdrConnector(validConfig);
    await connector.initialize();
    
    const result = await connector.getEndpoints();
    
    expect(result.endpoints).toBeDefined();
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.onlineCount).toBeGreaterThan(0);
  });
});

describe('Connector Validation Integration', () => {
  test('should validate valid SIEM configuration', () => {
    const config = {
      id: 'test-siem',
      tenantId: 'tenant-1',
      type: 'siem',
      name: 'Test SIEM',
      baseUrl: 'https://siem.example.com',
      apiVersion: 'v1',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('test-key').toString('base64')
        }
      }
    };
    
    const result = ConnectorValidator.validateConfig(config);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should validate valid VirusTotal configuration', () => {
    const config = {
      id: 'test-vt',
      tenantId: 'tenant-1',
      type: 'virustotal',
      name: 'Test VirusTotal',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('vt-key').toString('base64')
        }
      }
    };
    
    const result = ConnectorValidator.validateConfig(config);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should validate valid Mock EDR configuration', () => {
    const config = {
      id: 'test-edr',
      tenantId: 'tenant-1',
      type: 'mock_edr',
      name: 'Test EDR',
      mockDelay: 100,
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('edr-key').toString('base64')
        }
      }
    };
    
    const result = ConnectorValidator.validateConfig(config);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject invalid configuration', () => {
    const config = {
      // Missing required fields
      type: 'siem',
      name: 'Invalid SIEM'
    };
    
    const result = ConnectorValidator.validateConfig(config);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain('Missing required field: id');
    expect(result.errors).toContain('Missing required field: tenantId');
  });

  test('should test connector configuration', async () => {
    const config = {
      id: 'test-connector',
      tenantId: 'tenant-1',
      type: 'mock_edr',
      name: 'Test Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('test-key').toString('base64')
        }
      }
    };
    
    const result = await ConnectorValidator.testConfig(config);
    
    expect(result.configValidation.valid).toBe(true);
    expect(result.connectivityTest.success).toBe(true);
    expect(result.authenticationTest.success).toBe(true);
    expect(result.capabilitiesTest.success).toBe(true);
    expect(result.overallResult).toBe('passed');
  });
});

describe('Connector API Integration', () => {
  beforeEach(async () => {
    await connectorFramework.initialize();
  });

  afterEach(async () => {
    await connectorFramework.shutdown();
  });

  test('should validate connector configuration via API', async () => {
    const config = {
      id: 'api-test-connector',
      tenantId: 'tenant-1',
      type: 'mock_edr',
      name: 'API Test Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('api-test-key').toString('base64')
        }
      }
    };

    const response = await request(app)
      .post('/api/connectors/validate')
      .send(config)
      .expect(200);

    expect(response.body.validation.valid).toBe(true);
    expect(response.body.message).toBe('Configuration is valid');
  });

  test('should test connector configuration via API', async () => {
    const config = {
      id: 'api-test-connector-2',
      tenantId: 'tenant-1',
      type: 'virustotal',
      name: 'API Test VirusTotal',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('vt-api-key').toString('base64')
        }
      }
    };

    const response = await request(app)
      .post('/api/connectors/test')
      .send(config)
      .expect(200);

    expect(response.body.testResults.overallResult).toBe('passed');
    expect(response.body.testResults.configValidation.valid).toBe(true);
  });

  test('should create connector via API', async () => {
    const config = {
      id: 'api-created-connector',
      tenantId: 'tenant-1',
      type: 'mock_edr',
      name: 'API Created Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('created-key').toString('base64')
        }
      }
    };

    const response = await request(app)
      .post('/api/connectors')
      .send(config)
      .expect(201);

    expect(response.body.message).toBe('Connector created successfully');
    expect(response.body.connector.id).toBe('api-created-connector');
    expect(response.body.connector.type).toBe('mock_edr');
  });

  test('should get connector details via API', async () => {
    // First create a connector
    const config = {
      id: 'api-get-connector',
      tenantId: 'tenant-1',
      type: 'mock_edr',
      name: 'API Get Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('get-key').toString('base64')
        }
      }
    };

    await request(app)
      .post('/api/connectors')
      .send(config)
      .expect(201);

    // Then get its details
    const response = await request(app)
      .get('/api/connectors/api-get-connector')
      .expect(200);

    expect(response.body.connector.id).toBe('api-get-connector');
    expect(response.body.connector.type).toBe('mock_edr');
    expect(response.body.connector.capabilities).toContain('process_search');
  });

  test('should perform health check via API', async () => {
    // First create a connector
    const config = {
      id: 'api-health-connector',
      tenantId: 'tenant-1',
      type: 'mock_edr',
      name: 'API Health Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('health-key').toString('base64')
        }
      }
    };

    await request(app)
      .post('/api/connectors')
      .send(config)
      .expect(201);

    // Then perform health check
    const response = await request(app)
      .post('/api/connectors/api-health-connector/health')
      .expect(200);

    expect(response.body.health.healthy).toBe(true);
    expect(response.body.message).toBe('Connector is healthy');
  });

  test('should query connector via API', async () => {
    // First create a connector
    const config = {
      id: 'api-query-connector',
      tenantId: 'tenant-1',
      type: 'mock_edr',
      name: 'API Query Connector',
      authentication: {
        type: AuthTypes.API_KEY,
        credentials: {
          apiKey: Buffer.from('query-key').toString('base64')
        }
      }
    };

    await request(app)
      .post('/api/connectors')
      .send(config)
      .expect(201);

    // Then query it
    const queryPayload = {
      query: { processName: 'chrome' },
      queryType: EdrQueryTypes.PROCESS_SEARCH
    };

    const response = await request(app)
      .post('/api/connectors/api-query-connector/query')
      .send(queryPayload)
      .expect(200);

    expect(response.body.result.processes).toBeDefined();
    expect(response.body.metadata.connectorId).toBe('api-query-connector');
    expect(response.body.metadata.queryType).toBe(EdrQueryTypes.PROCESS_SEARCH);
  });

  test('should get registry status via API', async () => {
    const response = await request(app)
      .get('/api/connectors/registry/status')
      .expect(200);

    expect(response.body.registryStatus).toBeDefined();
    expect(response.body.registryStatus.registeredTypes).toContain('mock_edr');
    expect(response.body.registryStatus.registeredTypes).toContain('virustotal');
    expect(response.body.registryStatus.registeredTypes).toContain('siem');
  });

  test('should handle invalid connector configuration via API', async () => {
    const invalidConfig = {
      // Missing required fields
      type: 'mock_edr',
      name: 'Invalid Connector'
    };

    const response = await request(app)
      .post('/api/connectors/validate')
      .send(invalidConfig)
      .expect(400);

    expect(response.body.validation.valid).toBe(false);
    expect(response.body.validation.errors.length).toBeGreaterThan(0);
  });
});

describe('End-to-End Connector Framework Integration', () => {
  test('should work with complete workflow', async () => {
    await connectorFramework.initialize();
    
    try {
      // 1. Create VirusTotal connector
      const vtConfig = {
        id: 'e2e-virustotal',
        tenantId: 'tenant-e2e',
        type: 'virustotal',
        name: 'E2E VirusTotal',
        authentication: {
          type: AuthTypes.API_KEY,
          credentials: {
            apiKey: Buffer.from('e2e-vt-key').toString('base64')
          }
        }
      };
      
      const vtConnector = await connectorFramework.createConnector(vtConfig);
      expect(vtConnector.status).toBe('active');
      
      // 2. Create Mock EDR connector
      const edrConfig = {
        id: 'e2e-edr',
        tenantId: 'tenant-e2e',
        type: 'mock_edr',
        name: 'E2E Mock EDR',
        authentication: {
          type: AuthTypes.API_KEY,
          credentials: {
            apiKey: Buffer.from('e2e-edr-key').toString('base64')
          }
        }
      };
      
      const edrConnector = await connectorFramework.createConnector(edrConfig);
      expect(edrConnector.status).toBe('active');
      
      // 3. Perform health checks
      const registry = connectorFramework.getRegistry();
      const healthResults = await registry.performHealthChecks();
      
      expect(healthResults['e2e-virustotal'].healthy).toBe(true);
      expect(healthResults['e2e-edr'].healthy).toBe(true);
      
      // 4. Query both connectors
      const vtResult = await vtConnector.query({ ip: '8.8.8.8' }, VirusTotalQueryTypes.IP_REPUTATION);
      expect(vtResult.indicator).toBe('8.8.8.8');
      
      const edrResult = await edrConnector.query({ processName: 'chrome' }, EdrQueryTypes.PROCESS_SEARCH);
      expect(edrResult.processes).toBeDefined();
      
      // 5. Get registry status
      const status = registry.getStatus();
      expect(status.totalConnectors).toBe(2);
      expect(status.connectorsByType.virustotal).toBe(1);
      expect(status.connectorsByType.mock_edr).toBe(1);
      
    } finally {
      await connectorFramework.shutdown();
    }
  });
});