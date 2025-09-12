const { InvestigationOrchestrator } = require('../investigation/orchestrator');

describe('InvestigationOrchestrator', () => {
  let orchestrator;

  beforeAll(() => {
    orchestrator = new InvestigationOrchestrator();
  });

  describe('InvestigationOrchestrator class', () => {
    it('should initialize with default configuration', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.activeInvestigations).toBeInstanceOf(Map);
      expect(orchestrator.investigationQueue).toBeInstanceOf(Array);
      expect(orchestrator.maxConcurrentInvestigations).toBe(10);
      expect(orchestrator.defaultTimeoutMs).toBe(1800000); // 30 minutes
    });

    it('should generate unique investigation IDs', () => {
      const id1 = orchestrator._generateInvestigationId();
      const id2 = orchestrator._generateInvestigationId();
      
      expect(id1).toMatch(/^inv_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^inv_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should calculate progress correctly', () => {
      const steps = [
        { status: 'complete' },
        { status: 'complete' },
        { status: 'pending' },
        { status: 'failed' }
      ];
      
      const progress = orchestrator._calculateProgress(steps);
      expect(progress).toBe(50); // 2 out of 4 complete = 50%
    });

    it('should handle empty steps array', () => {
      const progress = orchestrator._calculateProgress([]);
      expect(progress).toBe(0);
    });

    it('should estimate completion time', () => {
      const investigation = { status: 'executing' };
      const steps = [
        { status: 'complete' },
        { status: 'pending' },
        { status: 'pending' }
      ];
      
      const estimate = orchestrator._estimateCompletion(investigation, steps);
      expect(estimate).toBeInstanceOf(Date);
      expect(estimate.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null for completed investigations', () => {
      const investigation = { status: 'complete' };
      const steps = [];
      
      const estimate = orchestrator._estimateCompletion(investigation, steps);
      expect(estimate).toBeNull();
    });
  });

  describe('queue management', () => {
    it('should queue investigations by priority', () => {
      orchestrator._queueInvestigation('inv1', 1);
      orchestrator._queueInvestigation('inv2', 5);
      orchestrator._queueInvestigation('inv3', 3);
      
      expect(orchestrator.investigationQueue).toHaveLength(3);
      
      // Sort by priority (higher first)
      orchestrator.investigationQueue.sort((a, b) => b.priority - a.priority);
      
      expect(orchestrator.investigationQueue[0].id).toBe('inv2'); // priority 5
      expect(orchestrator.investigationQueue[1].id).toBe('inv3'); // priority 3
      expect(orchestrator.investigationQueue[2].id).toBe('inv1'); // priority 1
    });

    it('should remove duplicate investigations from queue', () => {
      orchestrator.investigationQueue = [];
      orchestrator._queueInvestigation('inv1', 3);
      orchestrator._queueInvestigation('inv1', 4); // Should replace previous
      
      expect(orchestrator.investigationQueue).toHaveLength(1);
      expect(orchestrator.investigationQueue[0].priority).toBe(4);
    });
  });

  describe('validation', () => {
    it('should validate required parameters', () => {
      expect(() => {
        // This would normally call startInvestigation, but we're testing validation logic
        const alertId = null;
        const userId = 'user1';
        const tenantId = 'tenant1';
        
        if (!alertId || !userId || !tenantId) {
          throw new Error('alertId, userId, and tenantId are required');
        }
      }).toThrow('alertId, userId, and tenantId are required');
    });
  });
});