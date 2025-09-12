/**
 * Mock EDR Connector
 * 
 * Mock implementation of an EDR (Endpoint Detection and Response) connector
 * Used for testing and development purposes
 */

const { BaseConnector, QueryTypes } = require('./base-connector');

/**
 * EDR specific query types
 */
const EdrQueryTypes = {
  ...QueryTypes,
  PROCESS_SEARCH: 'process_search',
  FILE_SEARCH: 'file_search',
  NETWORK_SEARCH: 'network_search',
  REGISTRY_SEARCH: 'registry_search',
  ENDPOINT_ISOLATION: 'endpoint_isolation',
  THREAT_HUNTING: 'threat_hunting'
};

/**
 * Mock EDR Connector class
 */
class MockEdrConnector extends BaseConnector {
  constructor(config) {
    super(config);
    
    this.timeout = config.timeout || 5000;
    this.mockDelay = config.mockDelay || 100; // Simulate network delay
    
    // Mock data for testing
    this.mockEndpoints = [
      { id: 'endpoint-001', hostname: 'workstation-01', ip: '192.168.1.100', os: 'Windows 10', status: 'online' },
      { id: 'endpoint-002', hostname: 'server-01', ip: '192.168.1.200', os: 'Windows Server 2019', status: 'online' },
      { id: 'endpoint-003', hostname: 'laptop-01', ip: '192.168.1.150', os: 'macOS', status: 'offline' }
    ];
    
    this.mockProcesses = [
      { id: 'proc-001', name: 'chrome.exe', pid: 1234, endpoint: 'endpoint-001', commandLine: 'chrome.exe --no-sandbox', hash: 'abc123def456' },
      { id: 'proc-002', name: 'powershell.exe', pid: 5678, endpoint: 'endpoint-001', commandLine: 'powershell.exe -ExecutionPolicy Bypass', hash: 'def456ghi789' },
      { id: 'proc-003', name: 'suspicious.exe', pid: 9999, endpoint: 'endpoint-002', commandLine: 'suspicious.exe -malware', hash: 'malicious123' }
    ];
    
    this.mockFiles = [
      { id: 'file-001', path: 'C:\\Users\\user\\Downloads\\document.pdf', hash: 'file123hash', size: 1024000, endpoint: 'endpoint-001' },
      { id: 'file-002', path: 'C:\\Windows\\System32\\malware.exe', hash: 'malicious123', size: 512000, endpoint: 'endpoint-002' },
      { id: 'file-003', path: '/tmp/suspicious_script.sh', hash: 'script456hash', size: 2048, endpoint: 'endpoint-003' }
    ];
    
    this.mockNetworkConnections = [
      { id: 'net-001', sourceIp: '192.168.1.100', destIp: '8.8.8.8', port: 443, protocol: 'TCP', endpoint: 'endpoint-001' },
      { id: 'net-002', sourceIp: '192.168.1.200', destIp: '192.168.1.100', port: 445, protocol: 'TCP', endpoint: 'endpoint-002' },
      { id: 'net-003', sourceIp: '192.168.1.100', destIp: '185.199.108.153', port: 80, protocol: 'TCP', endpoint: 'endpoint-001' }
    ];
  }

  /**
   * Initialize the mock EDR connector
   */
  async initialize() {
    await this.simulateDelay();
    this.status = 'active';
    this.emit('initialized', { connectorId: this.id });
  }

  /**
   * Perform health check
   */
  async healthCheck() {
    await this.simulateDelay();
    
    return {
      healthy: true,
      timestamp: new Date().toISOString(),
      responseTime: this.mockDelay,
      endpointsOnline: this.mockEndpoints.filter(e => e.status === 'online').length,
      totalEndpoints: this.mockEndpoints.length,
      version: '1.0.0-mock'
    };
  }

  /**
   * Execute query based on type
   */
  async executeQuery(query, queryType = QueryTypes.SEARCH) {
    await this.simulateDelay();
    
    switch (queryType) {
      case EdrQueryTypes.PROCESS_SEARCH:
        return await this.searchProcesses(query);
      case EdrQueryTypes.FILE_SEARCH:
        return await this.searchFiles(query);
      case EdrQueryTypes.NETWORK_SEARCH:
        return await this.searchNetworkConnections(query);
      case EdrQueryTypes.REGISTRY_SEARCH:
        return await this.searchRegistry(query);
      case EdrQueryTypes.ENDPOINT_ISOLATION:
        return await this.isolateEndpoint(query);
      case EdrQueryTypes.THREAT_HUNTING:
        return await this.huntThreats(query);
      case QueryTypes.SEARCH:
        return await this.genericSearch(query);
      case QueryTypes.ENRICH:
        return await this.enrichData(query);
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }
  }

  /**
   * Search for processes
   */
  async searchProcesses(query) {
    const { processName, hash, commandLine, endpoint, timeRange } = query;
    
    let results = [...this.mockProcesses];
    
    if (processName) {
      results = results.filter(p => p.name.toLowerCase().includes(processName.toLowerCase()));
    }
    
    if (hash) {
      results = results.filter(p => p.hash === hash);
    }
    
    if (commandLine) {
      results = results.filter(p => p.commandLine.toLowerCase().includes(commandLine.toLowerCase()));
    }
    
    if (endpoint) {
      results = results.filter(p => p.endpoint === endpoint);
    }
    
    return {
      processes: results,
      totalCount: results.length,
      query: { processName, hash, commandLine, endpoint },
      executionTime: this.mockDelay
    };
  }

  /**
   * Search for files
   */
  async searchFiles(query) {
    const { fileName, hash, path, endpoint, minSize, maxSize } = query;
    
    let results = [...this.mockFiles];
    
    if (fileName) {
      results = results.filter(f => f.path.toLowerCase().includes(fileName.toLowerCase()));
    }
    
    if (hash) {
      results = results.filter(f => f.hash === hash);
    }
    
    if (path) {
      results = results.filter(f => f.path.toLowerCase().includes(path.toLowerCase()));
    }
    
    if (endpoint) {
      results = results.filter(f => f.endpoint === endpoint);
    }
    
    if (minSize) {
      results = results.filter(f => f.size >= minSize);
    }
    
    if (maxSize) {
      results = results.filter(f => f.size <= maxSize);
    }
    
    return {
      files: results,
      totalCount: results.length,
      query: { fileName, hash, path, endpoint, minSize, maxSize },
      executionTime: this.mockDelay
    };
  }

  /**
   * Search network connections
   */
  async searchNetworkConnections(query) {
    const { sourceIp, destIp, port, protocol, endpoint } = query;
    
    let results = [...this.mockNetworkConnections];
    
    if (sourceIp) {
      results = results.filter(n => n.sourceIp === sourceIp);
    }
    
    if (destIp) {
      results = results.filter(n => n.destIp === destIp);
    }
    
    if (port) {
      results = results.filter(n => n.port === port);
    }
    
    if (protocol) {
      results = results.filter(n => n.protocol.toLowerCase() === protocol.toLowerCase());
    }
    
    if (endpoint) {
      results = results.filter(n => n.endpoint === endpoint);
    }
    
    return {
      connections: results,
      totalCount: results.length,
      query: { sourceIp, destIp, port, protocol, endpoint },
      executionTime: this.mockDelay
    };
  }

  /**
   * Search registry (Windows only)
   */
  async searchRegistry(query) {
    const { keyPath, valueName, endpoint } = query;
    
    // Mock registry entries
    const mockRegistryEntries = [
      { 
        id: 'reg-001', 
        keyPath: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
        valueName: 'SuspiciousApp',
        value: 'C:\\malware\\suspicious.exe',
        endpoint: 'endpoint-001'
      },
      {
        id: 'reg-002',
        keyPath: 'HKEY_CURRENT_USER\\Software\\Classes\\exefile\\shell\\open\\command',
        valueName: '(Default)',
        value: 'C:\\Windows\\System32\\cmd.exe',
        endpoint: 'endpoint-002'
      }
    ];
    
    let results = [...mockRegistryEntries];
    
    if (keyPath) {
      results = results.filter(r => r.keyPath.toLowerCase().includes(keyPath.toLowerCase()));
    }
    
    if (valueName) {
      results = results.filter(r => r.valueName.toLowerCase().includes(valueName.toLowerCase()));
    }
    
    if (endpoint) {
      results = results.filter(r => r.endpoint === endpoint);
    }
    
    return {
      registryEntries: results,
      totalCount: results.length,
      query: { keyPath, valueName, endpoint },
      executionTime: this.mockDelay
    };
  }

  /**
   * Isolate endpoint
   */
  async isolateEndpoint(query) {
    const { endpointId, isolate = true } = query;
    
    const endpoint = this.mockEndpoints.find(e => e.id === endpointId);
    
    if (!endpoint) {
      throw new Error(`Endpoint ${endpointId} not found`);
    }
    
    // Simulate isolation action
    const action = isolate ? 'isolated' : 'unisolated';
    
    return {
      endpointId,
      hostname: endpoint.hostname,
      action,
      success: true,
      timestamp: new Date().toISOString(),
      executionTime: this.mockDelay
    };
  }

  /**
   * Hunt for threats using IOCs
   */
  async huntThreats(query) {
    const { iocs, huntType = 'comprehensive' } = query;
    
    const findings = [];
    
    for (const ioc of iocs || []) {
      // Search across all data types for the IOC
      const processMatches = this.mockProcesses.filter(p => 
        p.hash === ioc || p.name.includes(ioc) || p.commandLine.includes(ioc)
      );
      
      const fileMatches = this.mockFiles.filter(f => 
        f.hash === ioc || f.path.includes(ioc)
      );
      
      const networkMatches = this.mockNetworkConnections.filter(n => 
        n.sourceIp === ioc || n.destIp === ioc
      );
      
      if (processMatches.length > 0 || fileMatches.length > 0 || networkMatches.length > 0) {
        findings.push({
          ioc,
          matches: {
            processes: processMatches,
            files: fileMatches,
            networkConnections: networkMatches
          },
          riskLevel: ioc.includes('malicious') || ioc.includes('suspicious') ? 'high' : 'medium'
        });
      }
    }
    
    return {
      findings,
      totalFindings: findings.length,
      huntType,
      query: { iocs, huntType },
      executionTime: this.mockDelay * 2 // Hunting takes longer
    };
  }

  /**
   * Generic search across all data types
   */
  async genericSearch(query) {
    const { searchTerm, dataTypes = ['processes', 'files', 'network'] } = query;
    
    const results = {};
    
    if (dataTypes.includes('processes')) {
      results.processes = await this.searchProcesses({ processName: searchTerm });
    }
    
    if (dataTypes.includes('files')) {
      results.files = await this.searchFiles({ fileName: searchTerm });
    }
    
    if (dataTypes.includes('network')) {
      results.networkConnections = await this.searchNetworkConnections({ destIp: searchTerm });
    }
    
    return {
      results,
      searchTerm,
      dataTypes,
      executionTime: this.mockDelay
    };
  }

  /**
   * Enrich data with additional context
   */
  async enrichData(query) {
    const { indicators } = query;
    const enrichedData = {};
    
    for (const indicator of indicators || []) {
      const enrichment = {
        indicator,
        endpointPresence: [],
        riskAssessment: 'low'
      };
      
      // Check if indicator appears in any endpoint data
      const processMatches = this.mockProcesses.filter(p => 
        p.hash === indicator || p.name.includes(indicator)
      );
      
      const fileMatches = this.mockFiles.filter(f => 
        f.hash === indicator || f.path.includes(indicator)
      );
      
      if (processMatches.length > 0) {
        enrichment.endpointPresence.push(...processMatches.map(p => ({
          type: 'process',
          endpoint: p.endpoint,
          details: p
        })));
      }
      
      if (fileMatches.length > 0) {
        enrichment.endpointPresence.push(...fileMatches.map(f => ({
          type: 'file',
          endpoint: f.endpoint,
          details: f
        })));
      }
      
      // Assess risk based on presence and naming
      if (indicator.includes('malicious') || indicator.includes('suspicious')) {
        enrichment.riskAssessment = 'high';
      } else if (enrichment.endpointPresence.length > 1) {
        enrichment.riskAssessment = 'medium';
      }
      
      enrichedData[indicator] = enrichment;
    }
    
    return {
      enrichedData,
      indicators,
      processingTime: this.mockDelay
    };
  }

  /**
   * Simulate network delay
   */
  async simulateDelay() {
    if (this.mockDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.mockDelay));
    }
  }

  /**
   * Get connector capabilities
   */
  getCapabilities() {
    return [
      'process_search',
      'file_search',
      'network_search',
      'registry_search',
      'endpoint_isolation',
      'threat_hunting',
      'data_enrichment',
      'real_time_monitoring'
    ];
  }

  /**
   * Get supported data types
   */
  getDataTypes() {
    return [
      'processes',
      'files',
      'network_connections',
      'registry_entries',
      'endpoints',
      'system_events',
      'behavioral_data'
    ];
  }

  /**
   * Get mock EDR specific status
   */
  getStatus() {
    const baseStatus = super.getStatus();
    
    return {
      ...baseStatus,
      edrInfo: {
        mockMode: true,
        endpointsTotal: this.mockEndpoints.length,
        endpointsOnline: this.mockEndpoints.filter(e => e.status === 'online').length,
        mockDelay: this.mockDelay,
        dataTypes: this.getDataTypes()
      }
    };
  }

  /**
   * Get endpoint list
   */
  async getEndpoints() {
    await this.simulateDelay();
    
    return {
      endpoints: this.mockEndpoints,
      totalCount: this.mockEndpoints.length,
      onlineCount: this.mockEndpoints.filter(e => e.status === 'online').length
    };
  }
}

module.exports = {
  MockEdrConnector,
  EdrQueryTypes
};