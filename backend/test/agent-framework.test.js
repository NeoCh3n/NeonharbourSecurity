const { BaseAgent } = require('../investigation/agents/base-agent');
const { AgentRegistry, agentRegistry } = require('../investigation/agents/agent-registry');
const { AgentCommunication, agentCommunication } = require('../investigation/agents/agent-communication');

// Test agent implementation
class TestAgent extends BaseAgent {
    constructor(name, config) {
        super(name, config);
        this.executionCount = 0;
    }

    async execute(context, input) {
        this.executionCount++;

        if (input.shouldFail) {
            throw new Error('Simulated failure');
        }

        if (input.shouldTimeout) {
            await new Promise(resolve => setTimeout(resolve, this.config.timeoutMs + 100));
        }

        return {
            message: `Test agent ${this.name} executed successfully`,
            input: input,
            context: context.investigationId,
            executionCount: this.executionCount
        };
    }

    validate(input) {
        if (!input || typeof input !== 'object') {
            return { valid: false, errors: ['Input must be an object'] };
        }
        return { valid: true, errors: [] };
    }
}

describe('Agent Framework', () => {
    describe('BaseAgent', () => {
        let agent;

        beforeEach(() => {
            agent = new TestAgent('test-agent', { maxRetries: 2, timeoutMs: 1000 });
        });

        it('should initialize with correct configuration', () => {
            expect(agent.name).toBe('test-agent');
            expect(agent.config.maxRetries).toBe(2);
            expect(agent.config.timeoutMs).toBe(1000);
            expect(agent.metrics.totalExecutions).toBe(0);
        });

        it('should execute successfully with valid input', async () => {
            const context = { investigationId: 'test-inv-1' };
            const input = { data: 'test' };

            const result = await agent.executeWithRetry(context, input);

            expect(result.success).toBe(true);
            expect(result.result.message).toContain('executed successfully');
            expect(result.attempts).toBe(1);
            expect(agent.metrics.totalExecutions).toBe(1);
            expect(agent.metrics.successfulExecutions).toBe(1);
        });

        it('should fail validation with invalid input', async () => {
            const context = { investigationId: 'test-inv-1' };
            const input = null;

            await expect(agent.executeWithRetry(context, input))
                .rejects.toThrow('Input validation failed');
        });

        it('should retry on failure and eventually succeed', async () => {
            const context = { investigationId: 'test-inv-1' };

            // First call will fail, second will succeed
            let callCount = 0;
            const originalExecute = agent.execute.bind(agent);
            agent.execute = async (ctx, inp) => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Simulated network error');
                }
                return originalExecute(ctx, inp);
            };

            const result = await agent.executeWithRetry(context, { data: 'test' });

            expect(result.success).toBe(true);
            expect(result.attempts).toBe(2);
            expect(agent.metrics.totalRetries).toBe(1);
        });

        it('should fail after max retries', async () => {
            const context = { investigationId: 'test-inv-1' };
            const input = { shouldFail: true };

            const result = await agent.executeWithRetry(context, input);

            expect(result.success).toBe(false);
            expect(result.attempts).toBe(3); // 1 initial + 2 retries
            expect(result.error).toContain('Simulated failure');
        });

        it('should handle timeout correctly', async () => {
            agent.config.timeoutMs = 100;
            const context = { investigationId: 'test-inv-1' };
            const input = { shouldTimeout: true };

            const result = await agent.executeWithRetry(context, input);

            expect(result.success).toBe(false);
            expect(result.error).toContain('timed out');
        });

        it('should track metrics correctly', async () => {
            const context = { investigationId: 'test-inv-1' };

            // Reset metrics to start fresh
            agent.resetMetrics();

            // Successful execution
            const result1 = await agent.executeWithRetry(context, { data: 'test1' });
            expect(result1.success).toBe(true);

            // Failed execution with non-retryable error
            const result2 = await agent.executeWithRetry(context, { shouldFail: true });
            expect(result2.success).toBe(false);

            const metrics = agent.getMetrics();

            // Each executeWithRetry call increments totalExecutions once
            expect(metrics.totalExecutions).toBe(2);
            expect(metrics.successfulExecutions).toBe(1);
            expect(metrics.failedExecutions).toBe(1);
            expect(metrics.totalRetries).toBe(0); // No retries for non-retryable error
            expect(metrics.successRate).toBe(50); // 1/2 * 100
        });
    });

    describe('AgentRegistry', () => {
        let registry;

        beforeEach(() => {
            registry = new AgentRegistry();
        });

        it('should register agent types', () => {
            registry.registerAgentType('test', TestAgent, { maxRetries: 5 });

            expect(registry.getAgentTypes()).toContain('test');
        });

        it('should create agent instances', () => {
            registry.registerAgentType('test', TestAgent);

            const agent = registry.createAgent('test', 'test-instance-1');

            expect(agent).toBeInstanceOf(TestAgent);
            expect(agent.name).toBe('test-instance-1');
        });

        it('should prevent duplicate instance IDs', () => {
            registry.registerAgentType('test', TestAgent);
            registry.createAgent('test', 'duplicate-id');

            expect(() => {
                registry.createAgent('test', 'duplicate-id');
            }).toThrow('Agent instance \'duplicate-id\' already exists');
        });

        it('should get existing agents', () => {
            registry.registerAgentType('test', TestAgent);
            const created = registry.createAgent('test', 'get-test');

            const retrieved = registry.getAgent('get-test');

            expect(retrieved).toBe(created);
        });

        it('should get or create agents', () => {
            registry.registerAgentType('test', TestAgent);

            // First call creates
            const agent1 = registry.getOrCreateAgent('test', 'get-or-create');
            expect(agent1).toBeInstanceOf(TestAgent);

            // Second call returns existing
            const agent2 = registry.getOrCreateAgent('test', 'get-or-create');
            expect(agent2).toBe(agent1);
        });

        it('should remove agents', () => {
            registry.registerAgentType('test', TestAgent);
            registry.createAgent('test', 'to-remove');

            const removed = registry.removeAgent('to-remove');
            expect(removed).toBe(true);

            const retrieved = registry.getAgent('to-remove');
            expect(retrieved).toBeNull();
        });

        it('should list agents with filtering', () => {
            registry.registerAgentType('test', TestAgent);
            registry.registerAgentType('other', TestAgent);

            registry.createAgent('test', 'test-1');
            registry.createAgent('test', 'test-2');
            registry.createAgent('other', 'other-1');

            const allAgents = registry.listAgents();
            expect(allAgents).toHaveLength(3);

            const testAgents = registry.listAgents('test');
            expect(testAgents).toHaveLength(2);
            expect(testAgents.every(a => a.type === 'test')).toBe(true);
        });

        it('should execute agents with context sharing', async () => {
            registry.registerAgentType('test', TestAgent);
            const agent = registry.createAgent('test', 'context-test');

            const context = { investigationId: 'test-inv' };
            const input = { data: 'test' };

            const result = await registry.executeAgent('context-test', context, input);

            expect(result.success).toBe(true);
            expect(result.result.context).toBe('test-inv');
        });

        it('should manage shared context', () => {
            registry.setSharedContext('inv-1', 'key1', 'value1');
            registry.setSharedContext('inv-1', 'key2', { nested: 'object' });

            expect(registry.getSharedContext('inv-1', 'key1')).toBe('value1');
            expect(registry.getSharedContext('inv-1', 'key2')).toEqual({ nested: 'object' });
            expect(registry.getSharedContext('inv-1', 'nonexistent')).toBeUndefined();

            registry.clearSharedContext('inv-1');
            expect(registry.getSharedContext('inv-1', 'key1')).toBeUndefined();
        });

        it('should provide registry statistics', () => {
            registry.registerAgentType('test', TestAgent);
            registry.registerAgentType('other', TestAgent);
            registry.createAgent('test', 'stats-1');
            registry.createAgent('test', 'stats-2');

            const stats = registry.getStats();

            expect(stats.totalAgentTypes).toBe(2);
            expect(stats.totalAgentInstances).toBe(2);
            expect(stats.agentTypeBreakdown.test).toBe(2);
            expect(stats.agentTypeBreakdown.other).toBe(0);
        });
    });

    describe('AgentCommunication', () => {
        let comm;

        beforeEach(() => {
            comm = new AgentCommunication();
        });

        it('should send and receive messages', () => {
            const message = {
                from: 'agent-1',
                to: 'agent-2',
                investigationId: 'inv-1',
                type: 'data_request',
                data: { query: 'test' }
            };

            const messageId = comm.sendMessage(message);
            expect(messageId).toBeDefined();

            const messages = comm.getMessages('inv-1', 'agent-2');
            expect(messages).toHaveLength(1);
            expect(messages[0].from).toBe('agent-1');
            expect(messages[0].type).toBe('data_request');
        });

        it('should handle broadcast messages', () => {
            const message = {
                from: 'system',
                to: 'broadcast',
                investigationId: 'inv-1',
                type: 'investigation_started',
                data: {}
            };

            comm.sendMessage(message);

            const messagesForAgent1 = comm.getMessages('inv-1', 'agent-1');
            const messagesForAgent2 = comm.getMessages('inv-1', 'agent-2');

            expect(messagesForAgent1).toHaveLength(1);
            expect(messagesForAgent2).toHaveLength(1);
        });

        it('should filter messages by type and delivery status', () => {
            comm.sendMessage({
                from: 'agent-1',
                investigationId: 'inv-1',
                type: 'type-a',
                data: {}
            });

            comm.sendMessage({
                from: 'agent-1',
                investigationId: 'inv-1',
                type: 'type-b',
                data: {}
            });

            const typeAMessages = comm.getMessages('inv-1', null, { messageType: 'type-a' });
            expect(typeAMessages).toHaveLength(1);
            expect(typeAMessages[0].type).toBe('type-a');

            const undeliveredMessages = comm.getMessages('inv-1', null, { undeliveredOnly: true });
            expect(undeliveredMessages).toHaveLength(2);

            // Mark one as delivered
            comm.markDelivered([typeAMessages[0].id]);

            const stillUndelivered = comm.getMessages('inv-1', null, { undeliveredOnly: true });
            expect(stillUndelivered).toHaveLength(1);
        });

        it('should maintain message history', () => {
            comm.sendMessage({
                from: 'agent-1',
                investigationId: 'inv-1',
                type: 'test',
                data: { step: 1 }
            });

            comm.sendMessage({
                from: 'agent-2',
                investigationId: 'inv-1',
                type: 'test',
                data: { step: 2 }
            });

            const history = comm.getMessageHistory('inv-1');
            expect(history).toHaveLength(2);
            expect(history[0].data.step).toBe(1);
            expect(history[1].data.step).toBe(2);
        });

        it('should broadcast system messages', () => {
            comm.broadcastSystemMessage('inv-1', 'status_update', { status: 'analyzing' });

            const messages = comm.getMessages('inv-1');
            expect(messages).toHaveLength(1);
            expect(messages[0].from).toBe('system');
            expect(messages[0].to).toBe('broadcast');
            expect(messages[0].type).toBe('status_update');
            expect(messages[0].priority).toBe(4);
        });

        it('should provide communication statistics', () => {
            comm.sendMessage({
                from: 'agent-1',
                investigationId: 'inv-1',
                type: 'type-a',
                data: {}
            });

            comm.sendMessage({
                from: 'agent-2',
                investigationId: 'inv-2',
                type: 'type-b',
                data: {}
            });

            const stats = comm.getStats();
            expect(stats.totalMessages).toBe(2);
            expect(stats.totalInvestigations).toBe(2);
            expect(stats.messagesByType['type-a']).toBe(1);
            expect(stats.messagesByType['type-b']).toBe(1);
        });

        it('should clear messages for investigations', () => {
            comm.sendMessage({
                from: 'agent-1',
                investigationId: 'inv-1',
                type: 'test',
                data: {}
            });

            expect(comm.getMessages('inv-1')).toHaveLength(1);

            comm.clearMessages('inv-1');
            expect(comm.getMessages('inv-1')).toHaveLength(0);
        });
    });
});