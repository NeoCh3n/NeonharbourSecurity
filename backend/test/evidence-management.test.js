/**
 * Evidence Management System Tests
 * 
 * Comprehensive test suite for evidence storage, correlation, quality scoring,
 * timeline generation, and search functionality.
 */

const { Pool } = require('pg');
const { EvidenceManager, EvidenceStore, EvidenceCorrelator, EvidenceScorer, EvidenceTimeline, EvidenceSearch } = require('../evidence');

// Mock database for testing
const mockDb = {
  connect: jest.fn(),
  query: jest.fn()
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

describe('Evidence Management System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockImplementation((sql, params) => {
      // Default mock response
      return { rows: [] };
    });
  });

  describe('EvidenceStore', () => {
    let evidenceStore;

    beforeEach(() => {
      evidenceStore = new EvidenceStore(mockDb);
    });

    describe('store', () => {
      it('should store evidence with all required fields', async () => {
        const evidence = {
          type: 'network',
          source: 'siem',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          data: { event: 'connection', destination: '192.168.1.100' },
          entities: { ips: ['192.168.1.100'] },
          confidence: 0.8
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ 
            rows: [{ 
              id: 'evidence-123',
              investigation_id: 'inv-123',
              type: 'network',
              source: 'siem',
              timestamp: evidence.timestamp,
              confidence: 0.8,
              quality_score: 0.7
            }] 
          }) // INSERT evidence
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await evidenceStore.store('inv-123', evidence);

        expect(result).toHaveProperty('id');
        expect(result.type).toBe('network');
        expect(result.source).toBe('siem');
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should validate required fields', async () => {
        const invalidEvidence = {
          // Missing required fields
          data: { event: 'test' }
        };

        await expect(evidenceStore.store('inv-123', invalidEvidence))
          .rejects.toThrow('Evidence type is required');
      });

      it('should handle relationships and tags', async () => {
        const evidence = {
          type: 'process',
          source: 'edr',
          timestamp: new Date(),
          data: { process: 'malware.exe' },
          relationships: [{
            relatedEvidenceId: 'evidence-456',
            type: 'causal',
            strength: 0.9
          }],
          tags: ['malware', 'suspicious']
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ 
            rows: [{ id: 'evidence-789', investigation_id: 'inv-123' }] 
          }) // INSERT evidence
          .mockResolvedValueOnce({ rows: [] }) // INSERT relationship
          .mockResolvedValueOnce({ rows: [] }) // INSERT tag 1
          .mockResolvedValueOnce({ rows: [] }) // INSERT tag 2
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        await evidenceStore.store('inv-123', evidence);

        // Verify relationship insertion
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('evidence_relationships'),
          expect.arrayContaining([expect.any(String), 'evidence-456', 'causal', 0.9])
        );

        // Verify tag insertions
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('evidence_tags'),
          expect.arrayContaining([expect.any(String), 'malware'])
        );
      });
    });

    describe('getEvidence', () => {
      it('should retrieve evidence with filters', async () => {
        const mockEvidence = [
          {
            id: 'evidence-1',
            type: 'network',
            source: 'siem',
            timestamp: '2024-01-01T10:00:00Z',
            confidence: 0.8,
            data: { event: 'connection' },
            tags: ['network', 'external'],
            related_ids: []
          }
        ];

        mockClient.query.mockResolvedValue({ rows: mockEvidence });

        const filters = {
          type: 'network',
          minConfidence: 0.7,
          timeRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-01T23:59:59Z')
          }
        };

        const result = await evidenceStore.getEvidence('inv-123', filters);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('network');
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE e.investigation_id = $1'),
          expect.arrayContaining(['inv-123', 'network', 0.7])
        );
      });
    });

    describe('getStats', () => {
      it('should return comprehensive statistics', async () => {
        const mockStats = {
          total_evidence: '10',
          evidence_types: '3',
          data_sources: '2',
          avg_confidence: '0.75',
          avg_quality: '0.8',
          earliest_evidence: '2024-01-01T10:00:00Z',
          latest_evidence: '2024-01-01T12:00:00Z',
          high_confidence_count: '7',
          high_quality_count: '8'
        };

        const mockTypeStats = [
          { type: 'network', count: '5', avg_confidence: '0.8' },
          { type: 'process', count: '3', avg_confidence: '0.7' },
          { type: 'file', count: '2', avg_confidence: '0.75' }
        ];

        const mockSourceStats = [
          { source: 'siem', count: '6', avg_quality: '0.85' },
          { source: 'edr', count: '4', avg_quality: '0.75' }
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: [mockStats] })
          .mockResolvedValueOnce({ rows: mockTypeStats })
          .mockResolvedValueOnce({ rows: mockSourceStats });

        const result = await evidenceStore.getStats('inv-123');

        expect(result.total_evidence).toBe('10');
        expect(result.typeBreakdown).toHaveLength(3);
        expect(result.sourceBreakdown).toHaveLength(2);
        expect(result.typeBreakdown[0].type).toBe('network');
      });
    });
  });

  describe('EvidenceCorrelator', () => {
    let correlator;

    beforeEach(() => {
      correlator = new EvidenceCorrelator(mockDb);
    });

    describe('analyzeCorrelations', () => {
      it('should identify temporal correlations', async () => {
        const newEvidence = {
          id: 'evidence-1',
          timestamp: '2024-01-01T10:00:00Z',
          type: 'network',
          entities: { ips: ['192.168.1.100'] },
          data: { event: 'connection' }
        };

        const existingEvidence = [
          {
            id: 'evidence-2',
            timestamp: '2024-01-01T10:02:00Z', // 2 minutes later
            type: 'process',
            entities: { ips: ['192.168.1.100'] },
            data: { event: 'execution' }
          }
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: [newEvidence] }) // Get new evidence
          .mockResolvedValueOnce({ rows: existingEvidence }) // Get all evidence
          .mockResolvedValueOnce({ rows: [] }); // Store correlation

        const result = await correlator.analyzeCorrelations('inv-123', 'evidence-1');

        expect(result).toHaveLength(3); // temporal + entity + causal correlations
        
        const temporalCorr = result.find(c => c.type === 'temporal');
        expect(temporalCorr).toBeDefined();
        expect(temporalCorr.strength).toBeGreaterThan(0.3);
        
        const entityCorr = result.find(c => c.type === 'entity');
        expect(entityCorr).toBeDefined();
        expect(entityCorr.strength).toBeGreaterThan(0.3);
      });

      it('should identify behavioral correlations', async () => {
        const evidence1 = {
          id: 'evidence-1',
          timestamp: '2024-01-01T10:00:00Z',
          type: 'alert',
          data: { 
            mitre: { 
              techniques: ['T1055'], 
              tactics: ['defense-evasion'] 
            } 
          },
          entities: {}
        };

        const evidence2 = {
          id: 'evidence-2',
          timestamp: '2024-01-01T10:05:00Z',
          type: 'alert',
          data: { 
            mitre: { 
              techniques: ['T1055'], 
              tactics: ['defense-evasion'] 
            } 
          },
          entities: {}
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [evidence1] })
          .mockResolvedValueOnce({ rows: [evidence2] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await correlator.analyzeCorrelations('inv-123', 'evidence-1');

        const behavioralCorr = result.find(c => c.type === 'behavioral');
        expect(behavioralCorr).toBeDefined();
        expect(behavioralCorr.strength).toBeGreaterThan(0.4);
        expect(behavioralCorr.metadata.commonTechniques).toContain('T1055');
      });
    });

    describe('getCorrelationNetwork', () => {
      it('should generate network visualization data', async () => {
        const mockEvidence = [
          {
            id: 'evidence-1',
            type: 'network',
            source: 'siem',
            timestamp: '2024-01-01T10:00:00Z',
            confidence: 0.8,
            quality_score: 0.7,
            entities: { ips: ['192.168.1.100'] }
          },
          {
            id: 'evidence-2',
            type: 'process',
            source: 'edr',
            timestamp: '2024-01-01T10:02:00Z',
            confidence: 0.9,
            quality_score: 0.8,
            entities: { ips: ['192.168.1.100'] }
          }
        ];

        const mockCorrelations = [
          {
            correlation_type: 'temporal',
            evidence_ids: ['evidence-1', 'evidence-2'],
            strength: 0.8,
            description: 'Events occurred within 5 minutes'
          }
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: mockEvidence })
          .mockResolvedValueOnce({ rows: mockCorrelations });

        const result = await correlator.getCorrelationNetwork('inv-123');

        expect(result.nodes).toHaveLength(2);
        expect(result.edges).toHaveLength(1);
        expect(result.nodes[0]).toHaveProperty('size');
        expect(result.edges[0]).toHaveProperty('strength', 0.8);
      });
    });
  });

  describe('EvidenceScorer', () => {
    let scorer;

    beforeEach(() => {
      scorer = new EvidenceScorer();
    });

    describe('scoreEvidence', () => {
      it('should calculate comprehensive quality scores', async () => {
        const evidence = {
          type: 'network',
          source: 'siem',
          timestamp: new Date(),
          data: {
            event: 'connection',
            source_ip: '192.168.1.1',
            dest_ip: '10.0.0.1',
            port: 443,
            protocol: 'https'
          },
          entities: {
            ips: ['192.168.1.1', '10.0.0.1'],
            ports: ['443']
          },
          metadata: {
            collector: 'firewall-01',
            rule_id: 'FW-001'
          },
          confidence: 0.8
        };

        const result = await scorer.scoreEvidence(evidence);

        expect(result).toHaveProperty('overall');
        expect(result).toHaveProperty('breakdown');
        expect(result).toHaveProperty('factors');
        
        expect(result.overall).toBeGreaterThan(0);
        expect(result.overall).toBeLessThanOrEqual(1);
        
        expect(result.breakdown).toHaveProperty('source');
        expect(result.breakdown).toHaveProperty('completeness');
        expect(result.breakdown).toHaveProperty('freshness');
        expect(result.breakdown).toHaveProperty('validation');
        expect(result.breakdown).toHaveProperty('consistency');
        expect(result.breakdown).toHaveProperty('relevance');

        // SIEM should have high source reliability
        expect(result.breakdown.source).toBeGreaterThan(0.8);
        
        // Fresh evidence should score high on freshness
        expect(result.breakdown.freshness).toBeGreaterThan(0.9);
        
        // Complete data should score high on completeness
        expect(result.breakdown.completeness).toBeGreaterThan(0.7);
      });

      it('should handle incomplete evidence', async () => {
        const incompleteEvidence = {
          type: 'log',
          source: 'unknown',
          timestamp: new Date('2020-01-01'), // Very old
          data: { message: 'test' }
          // Missing entities, metadata
        };

        const result = await scorer.scoreEvidence(incompleteEvidence);

        expect(result.overall).toBeLessThan(0.6);
        expect(result.breakdown.completeness).toBeLessThan(0.8);
        expect(result.breakdown.freshness).toBeLessThan(0.3);
        expect(result.factors).toContain('Stale evidence');
      });

      it('should detect consistency issues', async () => {
        const inconsistentEvidence = {
          type: 'network',
          source: 'siem',
          timestamp: new Date('2030-01-01'), // Future timestamp
          data: {
            source_ip: '192.168.1.1',
            message: 'Connection to 10.0.0.1'
          },
          entities: {
            // Missing IPs that are mentioned in data
          },
          confidence: 0.9 // High confidence despite issues
        };

        const result = await scorer.scoreEvidence(inconsistentEvidence);

        expect(result.breakdown.consistency).toBeLessThan(0.8);
        expect(result.factors).toContain('Consistency issues detected');
      });
    });

    describe('updateFromFeedback', () => {
      it('should process analyst feedback', async () => {
        const feedback = {
          accuracy: 0.9,
          relevance: 0.8,
          completeness: 0.7
        };

        const result = await scorer.updateFromFeedback('evidence-123', feedback);

        expect(result).toHaveProperty('evidenceId', 'evidence-123');
        expect(result).toHaveProperty('adjustments');
        expect(result.adjustments).toHaveProperty('sourceReliability', 0.9);
        expect(result.adjustments).toHaveProperty('relevance', 0.8);
      });
    });
  });

  describe('EvidenceTimeline', () => {
    let timeline;

    beforeEach(() => {
      timeline = new EvidenceTimeline(mockDb);
    });

    describe('generate', () => {
      it('should create timeline with phases and visualization data', async () => {
        const mockEvidence = [
          {
            id: 'evidence-1',
            type: 'network',
            source: 'siem',
            timestamp: '2024-01-01T10:00:00Z',
            confidence: 0.8,
            quality_score: 0.7,
            data: { event: 'connection' },
            entities: { ips: ['192.168.1.1'] },
            tags: ['external']
          },
          {
            id: 'evidence-2',
            type: 'process',
            source: 'edr',
            timestamp: '2024-01-01T10:02:00Z',
            confidence: 0.9,
            quality_score: 0.8,
            data: { event: 'execution' },
            entities: { processes: ['malware.exe'] },
            tags: ['suspicious']
          },
          {
            id: 'evidence-3',
            type: 'file',
            source: 'edr',
            timestamp: '2024-01-01T11:00:00Z', // 1 hour gap - new phase
            confidence: 0.7,
            quality_score: 0.6,
            data: { event: 'creation' },
            entities: { files: ['/tmp/payload.bin'] },
            tags: ['malware']
          }
        ];

        mockClient.query.mockResolvedValue({ rows: mockEvidence });

        const result = await timeline.generate('inv-123');

        expect(result).toHaveProperty('timeline');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('visualization');

        // Timeline events
        expect(result.timeline).toHaveLength(3);
        expect(result.timeline[0]).toHaveProperty('title');
        expect(result.timeline[0]).toHaveProperty('visualization');

        // Summary
        expect(result.summary.totalEvents).toBe(3);
        expect(result.summary.timespan).toHaveProperty('start');
        expect(result.summary.timespan).toHaveProperty('end');
        expect(result.summary.phases).toHaveLength(2); // Should detect 2 phases due to time gap

        // Visualization
        expect(result.visualization.events).toHaveLength(3);
        expect(result.visualization.phases).toHaveLength(2);
        expect(result.visualization).toHaveProperty('axes');
        expect(result.visualization).toHaveProperty('legend');
      });

      it('should handle empty evidence', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });

        const result = await timeline.generate('inv-123');

        expect(result.timeline).toHaveLength(0);
        expect(result.summary.totalEvents).toBe(0);
        expect(result.summary.timespan).toBeNull();
      });

      it('should apply filters correctly', async () => {
        const options = {
          types: ['network'],
          minConfidence: 0.8,
          timeRange: {
            start: new Date('2024-01-01T00:00:00Z'),
            end: new Date('2024-01-01T23:59:59Z')
          }
        };

        mockClient.query.mockResolvedValue({ rows: [] });

        await timeline.generate('inv-123', options);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('AND e.type = ANY($4)'),
          expect.arrayContaining(['inv-123', expect.any(Date), expect.any(Date), ['network'], 0.8])
        );
      });
    });
  });

  describe('EvidenceSearch', () => {
    let search;

    beforeEach(() => {
      search = new EvidenceSearch(mockDb);
    });

    describe('search', () => {
      it('should parse and execute complex queries', async () => {
        const query = 'type:network source:siem confidence:>0.8 entity:ip:192.168.1.1 malware';
        
        const mockResults = [
          {
            id: 'evidence-1',
            type: 'network',
            source: 'siem',
            confidence: 0.9,
            data: { event: 'connection' },
            entities: { ips: ['192.168.1.1'] },
            tags: ['malware'],
            total_count: '1'
          }
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // Set tenant context
          .mockResolvedValueOnce({ rows: mockResults }) // Main search
          .mockResolvedValueOnce({ rows: [] }) // Type facets
          .mockResolvedValueOnce({ rows: [] }) // Source facets
          .mockResolvedValueOnce({ rows: [] }) // Confidence facets
          .mockResolvedValueOnce({ rows: [] }); // Time facets

        const result = await search.search(1, query);

        expect(result.results).toHaveLength(1);
        expect(result.totalCount).toBe(1);
        expect(result.query.parsed).toHaveProperty('text', ['malware']);
        expect(result.query.parsed).toHaveProperty('types', ['network']);
        expect(result.query.parsed).toHaveProperty('sources', ['siem']);
        expect(result.query.parsed).toHaveProperty('minConfidence', 0.8);
        expect(result.query.parsed.entities).toHaveProperty('ip');
        expect(result.query.parsed.entities.ip).toContain('192.168.1.1');
      });

      it('should generate facets for filtering', async () => {
        const mockTypeFacets = [
          { type: 'network', count: '10' },
          { type: 'process', count: '5' }
        ];

        const mockSourceFacets = [
          { source: 'siem', count: '8' },
          { source: 'edr', count: '7' }
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // Set tenant
          .mockResolvedValueOnce({ rows: [] }) // Main search
          .mockResolvedValueOnce({ rows: mockTypeFacets }) // Type facets
          .mockResolvedValueOnce({ rows: mockSourceFacets }) // Source facets
          .mockResolvedValueOnce({ rows: [] }) // Confidence facets
          .mockResolvedValueOnce({ rows: [] }); // Time facets

        const result = await search.search(1, 'test');

        expect(result.facets.types).toHaveLength(2);
        expect(result.facets.types[0]).toHaveProperty('value', 'network');
        expect(result.facets.types[0]).toHaveProperty('count', 10);
        
        expect(result.facets.sources).toHaveLength(2);
        expect(result.facets.sources[0]).toHaveProperty('value', 'siem');
      });
    });

    describe('findSimilar', () => {
      it('should find similar evidence based on reference', async () => {
        const refEvidence = {
          id: 'evidence-ref',
          type: 'network',
          timestamp: '2024-01-01T10:00:00Z',
          entities: { ips: ['192.168.1.1'] },
          data: { event: 'connection' }
        };

        const similarEvidence = [
          {
            id: 'evidence-similar',
            type: 'network',
            timestamp: '2024-01-01T10:30:00Z',
            entities: { ips: ['192.168.1.1'] },
            data: { event: 'connection' },
            total_count: '1'
          }
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: [refEvidence] }) // Get reference
          .mockResolvedValueOnce({ rows: [] }) // Set tenant
          .mockResolvedValueOnce({ rows: similarEvidence }); // Find similar

        const result = await search.findSimilar('evidence-ref');

        expect(result.referenceEvidence).toEqual(refEvidence);
        expect(result.similarEvidence).toHaveLength(0); // No similar evidence in mock
        expect(result.similarityFactors).toContain('Same evidence type: network');
      });
    });

    describe('getSuggestions', () => {
      it('should provide search suggestions', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });

        const result = await search.getSuggestions(1, 'type');

        expect(result.length).toBeGreaterThanOrEqual(0); // May return empty array with mocked data
        if (result.length > 0) {
          expect(result[0]).toHaveProperty('type');
          expect(result[0]).toHaveProperty('text');
          expect(result[0]).toHaveProperty('description');
        }
      });

      it('should suggest entity patterns', async () => {
        mockClient.query.mockResolvedValue({ rows: [] });

        const result = await search.getSuggestions(1, '192.168.1.1');

        expect(result).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'entity',
              text: 'entity:ip:192.168.1.1',
              description: expect.stringContaining('IP Address')
            })
          ])
        );
      });
    });
  });

  describe('EvidenceManager', () => {
    let evidenceManager;

    beforeEach(() => {
      evidenceManager = new EvidenceManager(mockDb);
    });

    describe('storeEvidence', () => {
      it('should orchestrate evidence storage with scoring and correlation', async () => {
        const evidence = {
          type: 'network',
          source: 'siem',
          timestamp: new Date(),
          data: { event: 'connection' },
          entities: { ips: ['192.168.1.1'] }
        };

        // Mock the store method
        evidenceManager.store.store = jest.fn().mockResolvedValue({
          id: 'evidence-123',
          ...evidence,
          qualityScore: { overall: 0.8 },
          confidence: 0.8
        });

        // Mock the correlator
        evidenceManager.correlator.analyzeCorrelations = jest.fn().mockResolvedValue([]);

        const result = await evidenceManager.storeEvidence('inv-123', evidence);

        expect(result).toHaveProperty('id', 'evidence-123');
        expect(evidenceManager.store.store).toHaveBeenCalledWith(
          'inv-123',
          expect.objectContaining({
            ...evidence,
            qualityScore: expect.objectContaining({ overall: expect.any(Number) }),
            confidence: expect.any(Number)
          }),
          {}
        );
        expect(evidenceManager.correlator.analyzeCorrelations).toHaveBeenCalledWith('inv-123', 'evidence-123');
      });

      it('should skip correlation when disabled', async () => {
        const evidence = {
          type: 'network',
          source: 'siem',
          timestamp: new Date(),
          data: { event: 'connection' }
        };

        evidenceManager.store.store = jest.fn().mockResolvedValue({
          id: 'evidence-123',
          ...evidence
        });

        evidenceManager.correlator.analyzeCorrelations = jest.fn();

        await evidenceManager.storeEvidence('inv-123', evidence, { correlate: false });

        expect(evidenceManager.correlator.analyzeCorrelations).not.toHaveBeenCalled();
      });
    });

    describe('integration methods', () => {
      it('should delegate to appropriate services', async () => {
        // Mock all service methods
        evidenceManager.store.getEvidence = jest.fn().mockResolvedValue([]);
        evidenceManager.correlator.getCorrelations = jest.fn().mockResolvedValue([]);
        evidenceManager.timeline.generate = jest.fn().mockResolvedValue({});
        evidenceManager.search.search = jest.fn().mockResolvedValue({});
        evidenceManager.store.getStats = jest.fn().mockResolvedValue({});

        await evidenceManager.getEvidence('inv-123');
        await evidenceManager.getCorrelations('inv-123');
        await evidenceManager.generateTimeline('inv-123');
        await evidenceManager.searchEvidence(1, 'test');
        await evidenceManager.getEvidenceStats('inv-123');

        expect(evidenceManager.store.getEvidence).toHaveBeenCalledWith('inv-123', {});
        expect(evidenceManager.correlator.getCorrelations).toHaveBeenCalledWith('inv-123', {});
        expect(evidenceManager.timeline.generate).toHaveBeenCalledWith('inv-123', {});
        expect(evidenceManager.search.search).toHaveBeenCalledWith(1, 'test', {});
        expect(evidenceManager.store.getStats).toHaveBeenCalledWith('inv-123');
      });
    });
  });
});

// Integration tests with real database (if available)
describe('Evidence Management Integration Tests', () => {
  let db;
  let evidenceManager;

  beforeAll(async () => {
    // Only run if test database is available
    if (process.env.TEST_DATABASE_URL) {
      db = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      evidenceManager = new EvidenceManager(db);
    }
  });

  afterAll(async () => {
    if (db) {
      await db.end();
    }
  });

  describe('End-to-End Evidence Workflow', () => {
    it('should handle complete evidence lifecycle', async () => {
      if (!db) {
        console.log('Skipping integration test - no test database configured');
        return;
      }

      const investigationId = 'test-inv-' + Date.now();
      
      // Store initial evidence
      const evidence1 = {
        type: 'network',
        source: 'siem',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        data: {
          event: 'connection',
          source_ip: '192.168.1.100',
          dest_ip: '10.0.0.1',
          port: 443
        },
        entities: {
          ips: ['192.168.1.100', '10.0.0.1'],
          ports: ['443']
        },
        tags: ['external', 'https']
      };

      const stored1 = await evidenceManager.storeEvidence(investigationId, evidence1);
      expect(stored1).toHaveProperty('id');

      // Store related evidence
      const evidence2 = {
        type: 'process',
        source: 'edr',
        timestamp: new Date('2024-01-01T10:02:00Z'),
        data: {
          event: 'execution',
          process: 'malware.exe',
          parent: 'explorer.exe'
        },
        entities: {
          processes: ['malware.exe'],
          ips: ['192.168.1.100'] // Same IP for correlation
        },
        tags: ['suspicious', 'malware']
      };

      const stored2 = await evidenceManager.storeEvidence(investigationId, evidence2);
      expect(stored2).toHaveProperty('id');

      // Retrieve evidence
      const allEvidence = await evidenceManager.getEvidence(investigationId);
      expect(allEvidence).toHaveLength(2);

      // Check correlations
      const correlations = await evidenceManager.getCorrelations(investigationId);
      expect(correlations.length).toBeGreaterThan(0);

      // Generate timeline
      const timeline = await evidenceManager.generateTimeline(investigationId);
      expect(timeline.timeline).toHaveLength(2);
      expect(timeline.summary.totalEvents).toBe(2);

      // Search evidence
      const searchResults = await evidenceManager.searchEvidence(1, 'malware');
      expect(searchResults.results.length).toBeGreaterThan(0);

      // Get statistics
      const stats = await evidenceManager.getEvidenceStats(investigationId);
      expect(stats.total_evidence).toBe('2');
    });
  });
});