/**
 * Analysis Agent Tests
 * 
 * Comprehensive unit tests for the AnalysisAgent including scenarios with
 * known good/bad examples and edge cases.
 */

const { AnalysisAgent } = require('../investigation/agents/analysis-agent');
const { callModel } = require('../ai');

// Mock dependencies
jest.mock('../ai');
jest.mock('axios');
jest.mock('../utils/execution');

const axios = require('axios');
const { withRetry, parallelMap } = require('../utils/execution');

describe('AnalysisAgent', () => {
  let analysisAgent;
  let mockContext;

  beforeEach(() => {
    analysisAgent = new AnalysisAgent('test-analysis-agent');
    mockContext = {
      investigationId: 'test-investigation-123',
      tenantId: 'test-tenant-456'
    };

    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    withRetry.mockImplementation(async (fn) => await fn());
    parallelMap.mockImplementation(async (items, fn) => {
      return Promise.all(items.map(fn));
    });
  });

  describe('Input Validation', () => {
    test('should validate required evidence input', () => {
      const result = analysisAgent.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Evidence is required for analysis');
    });

    test('should validate required context input', () => {
      const result = analysisAgent.validate({ evidence: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Either alert or investigation context is required');
    });

    test('should pass validation with valid input', () => {
      const result = analysisAgent.validate({
        evidence: [],
        alert: { id: 'test-alert' }
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Core Analysis', () => {
    test('should perform basic analysis with malware alert', async () => {
      // Mock AI response for malware detection
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Malware detected on workstation via suspicious file execution',
        severity: 'high',
        patterns: ['file_execution', 'network_communication'],
        anomalies: ['unusual_process_behavior'],
        preliminary_verdict: 'true_positive'
      }));

      const input = {
        evidence: [
          { type: 'file', hash: 'abc123def456', verdict: 'malicious' },
          { type: 'network', destination: '192.168.1.100', suspicious: true }
        ],
        alert: {
          id: 'malware-alert-001',
          type: 'malware_detection',
          severity: 'high',
          host: 'workstation-01',
          file_hash: 'abc123def456'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.classification).toBe('true_positive');
      expect(result.verdict.confidence).toBeGreaterThan(0.5);
      expect(result.verdict.riskScore).toBeGreaterThan(50);
      expect(result.analysis.core.summary).toContain('Malware detected');
      expect(result.analysis.core.severity).toBe('high');
    });

    test('should handle false positive scenario', async () => {
      // Mock AI response for false positive
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Legitimate software update triggered security alert',
        severity: 'low',
        patterns: ['software_update'],
        anomalies: [],
        preliminary_verdict: 'false_positive'
      }));

      const input = {
        evidence: [
          { type: 'file', hash: 'legitimate123', verdict: 'clean' },
          { type: 'process', name: 'updater.exe', signed: true }
        ],
        alert: {
          id: 'false-positive-001',
          type: 'suspicious_process',
          severity: 'low',
          process: 'updater.exe'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.classification).toBe('false_positive');
      expect(result.verdict.riskScore).toBeLessThan(30);
      expect(result.analysis.core.preliminary_verdict).toBe('false_positive');
    });

    test('should handle ambiguous case requiring human review', async () => {
      // Mock AI response for ambiguous case
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Unusual network activity detected but context unclear',
        severity: 'medium',
        patterns: ['network_anomaly'],
        anomalies: ['timing_unusual'],
        preliminary_verdict: 'requires_review'
      }));

      const input = {
        evidence: [
          { type: 'network', traffic_volume: 'high', time: 'off_hours' }
        ],
        alert: {
          id: 'ambiguous-001',
          type: 'network_anomaly',
          severity: 'medium'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.classification).toBe('requires_review');
      expect(result.verdict.confidence).toBeLessThan(0.71);
      expect(result.analysis.core.preliminary_verdict).toBe('requires_review');
    });
  });

  describe('Threat Intelligence Integration', () => {
    beforeEach(() => {
      process.env.VIRUSTOTAL_API_KEY = 'test-api-key';
    });

    afterEach(() => {
      delete process.env.VIRUSTOTAL_API_KEY;
    });

    test('should enrich analysis with malicious IP intelligence', async () => {
      // Mock VirusTotal response for malicious IP
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 15,
                suspicious: 2,
                harmless: 0,
                undetected: 3
              }
            }
          }
        }
      });

      // Mock core analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Network communication to suspicious IP',
        severity: 'high',
        patterns: ['external_communication'],
        anomalies: [],
        preliminary_verdict: 'true_positive'
      }));

      const input = {
        evidence: [],
        alert: {
          id: 'malicious-ip-001',
          type: 'network_connection',
          destination_ip: '192.168.1.100'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.classification).toBe('true_positive');
      expect(result.verdict.riskScore).toBeGreaterThan(60);
      expect(result.analysis.threatIntel.results).toHaveLength(1);
      expect(result.analysis.threatIntel.results[0].malicious).toBe(15);
      expect(result.analysis.threatIntel.summary).toContain('malicious');
    });

    test('should handle clean indicators from threat intelligence', async () => {
      // Mock VirusTotal response for clean IP
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 0,
                suspicious: 0,
                harmless: 18,
                undetected: 2
              }
            }
          }
        }
      });

      // Mock core analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Network communication to external server',
        severity: 'low',
        patterns: ['external_communication'],
        anomalies: [],
        preliminary_verdict: 'false_positive'
      }));

      const input = {
        evidence: [],
        alert: {
          id: 'clean-ip-001',
          type: 'network_connection',
          destination_ip: '8.8.8.8'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.analysis.threatIntel.results[0].malicious).toBe(0);
      expect(result.analysis.threatIntel.summary).toContain('No malicious indicators');
    });

    test('should handle threat intelligence API failures gracefully', async () => {
      // Mock API failure
      axios.get.mockRejectedValueOnce(new Error('API timeout'));

      // Mock core analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Analysis without threat intelligence',
        severity: 'medium',
        patterns: [],
        anomalies: [],
        preliminary_verdict: 'requires_review'
      }));

      const input = {
        evidence: [],
        alert: {
          id: 'api-failure-001',
          type: 'network_connection',
          destination_ip: '192.168.1.100'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.analysis.threatIntel.summary).toBe('No threat intelligence available');
      expect(result.verdict.classification).toBe('requires_review');
    });
  });

  describe('MITRE ATT&CK Mapping', () => {
    test('should map lateral movement attack to MITRE framework', async () => {
      // Mock core analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Lateral movement detected via SMB',
        severity: 'high',
        patterns: ['lateral_movement', 'smb_activity'],
        anomalies: ['cross_host_access'],
        preliminary_verdict: 'true_positive'
      }));

      // Mock MITRE mapping response
      callModel.mockResolvedValueOnce(JSON.stringify({
        tactics: [
          { id: 'TA0008', name: 'Lateral Movement', confidence: 0.9 }
        ],
        techniques: [
          { id: 'T1021.002', name: 'SMB/Windows Admin Shares', confidence: 0.85 }
        ],
        confidence: 0.9,
        rationale: 'SMB activity between hosts indicates lateral movement'
      }));

      const input = {
        evidence: [
          { type: 'network', protocol: 'SMB', source: '10.0.1.5', destination: '10.0.1.10' }
        ],
        alert: {
          id: 'lateral-movement-001',
          type: 'lateral_movement',
          technique: 'smb_shares'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.analysis.mitreMapping.tactics).toHaveLength(1);
      expect(result.analysis.mitreMapping.tactics[0].id).toBe('TA0008');
      expect(result.analysis.mitreMapping.techniques[0].id).toBe('T1021.002');
      expect(result.analysis.mitreMapping.confidence).toBe(0.9);
    });

    test('should handle unknown attack patterns', async () => {
      // Mock core analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Unknown suspicious activity',
        severity: 'medium',
        patterns: ['unknown_pattern'],
        anomalies: [],
        preliminary_verdict: 'requires_review'
      }));

      // Mock MITRE mapping with low confidence
      callModel.mockResolvedValueOnce(JSON.stringify({
        tactics: [],
        techniques: [],
        confidence: 0.1,
        rationale: 'Insufficient information for MITRE mapping'
      }));

      const input = {
        evidence: [],
        alert: {
          id: 'unknown-001',
          type: 'unknown_activity'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.analysis.mitreMapping.tactics).toHaveLength(0);
      expect(result.analysis.mitreMapping.confidence).toBe(0.1);
    });
  });

  describe('Confidence Calculation', () => {
    test('should calculate high confidence for strong evidence', async () => {
      // Mock strong evidence scenario
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Clear malware detection with multiple indicators',
        severity: 'critical',
        patterns: ['malware_execution', 'c2_communication', 'persistence'],
        anomalies: ['unusual_network_traffic', 'file_system_changes'],
        preliminary_verdict: 'true_positive'
      }));

      // Mock threat intel with malicious results
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            attributes: {
              last_analysis_stats: { malicious: 20, suspicious: 0, harmless: 0, undetected: 0 }
            }
          }
        }
      });

      // Mock high-confidence MITRE mapping
      callModel.mockResolvedValueOnce(JSON.stringify({
        tactics: [{ id: 'TA0002', name: 'Execution', confidence: 0.95 }],
        techniques: [{ id: 'T1059', name: 'Command and Scripting Interpreter', confidence: 0.9 }],
        confidence: 0.95,
        rationale: 'Clear execution technique identified'
      }));

      const input = {
        evidence: [
          { type: 'file', hash: 'malicious123', verdict: 'malicious' },
          { type: 'network', c2_server: 'evil.com' },
          { type: 'registry', persistence_key: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' }
        ],
        alert: {
          id: 'high-confidence-001',
          type: 'malware_detection',
          severity: 'critical'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.confidence).toBeGreaterThan(0.8);
      expect(result.verdict.classification).toBe('true_positive');
      expect(result.verdict.riskScore).toBeGreaterThan(80);
    });

    test('should calculate low confidence for weak evidence', async () => {
      // Mock weak evidence scenario
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Minimal suspicious activity detected',
        severity: 'low',
        patterns: [],
        anomalies: [],
        preliminary_verdict: 'requires_review'
      }));

      const input = {
        evidence: [
          { type: 'log', message: 'unusual timestamp' }
        ],
        alert: {
          id: 'low-confidence-001',
          type: 'anomaly_detection',
          severity: 'low'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.confidence).toBeLessThan(0.6);
      expect(result.verdict.classification).toBe('requires_review');
    });
  });

  describe('Error Handling', () => {
    test('should handle AI model failures gracefully', async () => {
      // Mock AI failure
      callModel.mockRejectedValueOnce(new Error('AI service unavailable'));

      const input = {
        evidence: [],
        alert: { id: 'ai-failure-001', type: 'test' }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.analysis.core.summary).toContain('Analysis failed');
      expect(result.verdict.classification).toBe('requires_review');
    });

    test('should handle malformed AI responses', async () => {
      // Mock malformed JSON response
      callModel.mockResolvedValueOnce('This is not valid JSON');

      const input = {
        evidence: [],
        alert: { id: 'malformed-001', type: 'test' }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.analysis.core.summary).toBe('Analysis completed with limited parsing');
      expect(result.analysis.core.preliminary_verdict).toBe('requires_review');
    });

    test('should handle missing environment variables', async () => {
      // Remove API key
      delete process.env.VIRUSTOTAL_API_KEY;

      // Mock core analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Analysis without threat intelligence',
        severity: 'medium',
        patterns: [],
        anomalies: [],
        preliminary_verdict: 'requires_review'
      }));

      const input = {
        evidence: [],
        alert: {
          id: 'no-api-key-001',
          type: 'network_connection',
          destination_ip: '192.168.1.100'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.analysis.threatIntel.summary).toBe('No threat intelligence available');
    });
  });

  describe('Indicator Extraction', () => {
    test('should extract IP addresses from alert data', () => {
      const context = {
        alert: {
          source_ip: '192.168.1.5',
          destination_ip: '10.0.0.1',
          description: 'Connection from 172.16.0.10 to external server'
        }
      };

      const indicators = analysisAgent._extractIndicators(context);
      
      expect(indicators).toContain('192.168.1.5');
      expect(indicators).toContain('10.0.0.1');
      expect(indicators).toContain('172.16.0.10');
    });

    test('should extract file hashes from alert data', () => {
      const context = {
        alert: {
          file_hash: 'a1b2c3d4e5f6789012345678901234567890abcd',
          md5: '5d41402abc4b2a76b9719d911017c592',
          description: 'File with SHA256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
        }
      };

      const indicators = analysisAgent._extractIndicators(context);
      
      expect(indicators).toContain('a1b2c3d4e5f6789012345678901234567890abcd');
      expect(indicators).toContain('5d41402abc4b2a76b9719d911017c592');
      expect(indicators).toContain('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    test('should extract indicators from evidence', () => {
      const context = {
        evidence: [
          { indicators: ['192.168.1.100', 'malware.exe'] },
          { indicators: ['abc123def456'] }
        ]
      };

      const indicators = analysisAgent._extractIndicators(context);
      
      expect(indicators).toContain('192.168.1.100');
      expect(indicators).toContain('malware.exe');
      expect(indicators).toContain('abc123def456');
    });
  });

  describe('Agent Metrics', () => {
    test('should track successful executions', async () => {
      // Mock successful analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Test analysis',
        severity: 'low',
        patterns: [],
        anomalies: [],
        preliminary_verdict: 'false_positive'
      }));

      const input = {
        evidence: [],
        alert: { id: 'metrics-test-001', type: 'test' }
      };

      const result = await analysisAgent.executeWithRetry(mockContext, input);

      expect(result.success).toBe(true);
      const metrics = analysisAgent.getMetrics();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.successfulExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(0);
    });

    test('should track failed executions', async () => {
      // Create a custom agent with a failing execute method
      class FailingAnalysisAgent extends AnalysisAgent {
        async execute(context, input) {
          throw new Error('Simulated execution failure');
        }
      }

      const failingAgent = new FailingAnalysisAgent('failing-agent');
      
      const input = {
        evidence: [],
        alert: { id: 'metrics-test-002', type: 'test' }
      };

      const result = await failingAgent.executeWithRetry(mockContext, input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated execution failure');
      
      const metrics = failingAgent.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThan(0);
      expect(metrics.failedExecutions).toBeGreaterThan(0);
    });
  });

  describe('Real-world Scenarios', () => {
    test('should analyze phishing email scenario', async () => {
      // Mock phishing analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Phishing email with malicious attachment detected',
        severity: 'high',
        patterns: ['email_attachment', 'suspicious_sender'],
        anomalies: ['external_sender', 'urgent_language'],
        preliminary_verdict: 'true_positive'
      }));

      // Mock threat intel for malicious domain
      axios.get.mockResolvedValueOnce({
        data: {
          data: {
            attributes: {
              last_analysis_stats: { malicious: 12, suspicious: 3, harmless: 0, undetected: 1 }
            }
          }
        }
      });

      // Mock MITRE mapping for phishing
      callModel.mockResolvedValueOnce(JSON.stringify({
        tactics: [{ id: 'TA0001', name: 'Initial Access', confidence: 0.9 }],
        techniques: [{ id: 'T1566.001', name: 'Spearphishing Attachment', confidence: 0.85 }],
        confidence: 0.9,
        rationale: 'Email with malicious attachment indicates spearphishing'
      }));

      const input = {
        evidence: [
          { type: 'email', sender: 'attacker@evil.com', attachment: 'invoice.exe' },
          { type: 'file', hash: 'malicious123', verdict: 'malicious' }
        ],
        alert: {
          id: 'phishing-001',
          type: 'phishing_email',
          sender: 'attacker@evil.com',
          subject: 'URGENT: Invoice Payment Required'
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.classification).toBe('true_positive');
      expect(result.verdict.riskScore).toBeGreaterThan(70);
      expect(result.analysis.mitreMapping.techniques[0].id).toBe('T1566.001');
      expect(result.analysis.core.patterns).toContain('email_attachment');
    });

    test('should analyze ransomware scenario', async () => {
      // Mock ransomware analysis
      callModel.mockResolvedValueOnce(JSON.stringify({
        summary: 'Ransomware encryption activity detected across multiple files',
        severity: 'critical',
        patterns: ['file_encryption', 'ransom_note', 'mass_file_changes'],
        anomalies: ['high_io_activity', 'file_extension_changes'],
        preliminary_verdict: 'true_positive'
      }));

      // Mock MITRE mapping for ransomware
      callModel.mockResolvedValueOnce(JSON.stringify({
        tactics: [{ id: 'TA0040', name: 'Impact', confidence: 0.95 }],
        techniques: [{ id: 'T1486', name: 'Data Encrypted for Impact', confidence: 0.9 }],
        confidence: 0.95,
        rationale: 'Mass file encryption indicates ransomware impact'
      }));

      const input = {
        evidence: [
          { type: 'file_activity', encrypted_files: 1500, ransom_note: 'README_DECRYPT.txt' },
          { type: 'process', name: 'encrypt.exe', behavior: 'file_encryption' }
        ],
        alert: {
          id: 'ransomware-001',
          type: 'ransomware_detection',
          severity: 'critical',
          affected_files: 1500
        }
      };

      const result = await analysisAgent.execute(mockContext, input);

      expect(result.verdict.classification).toBe('true_positive');
      expect(result.verdict.riskScore).toBeGreaterThan(80);
      expect(result.analysis.mitreMapping.techniques[0].id).toBe('T1486');
      expect(result.analysis.core.severity).toBe('critical');
    });
  });
});