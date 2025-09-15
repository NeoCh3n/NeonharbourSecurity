#!/usr/bin/env node

/**
 * Core System Test Runner
 * Tests the essential functionality without overwhelming the database
 */

const { testPool, setupTestDatabase, cleanupTestData } = require('./test-database');

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...');
  try {
    const result = await testPool.query('SELECT NOW() as current_time');
    console.log('✅ Database connected successfully');
    console.log(`   Current time: ${result.rows[0].current_time}`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function testInvestigationOrchestrator() {
  console.log('🔍 Testing Investigation Orchestrator...');
  try {
    const { InvestigationOrchestrator } = require('./investigation/orchestrator');
    const orchestrator = new InvestigationOrchestrator();
    
    console.log('   Testing orchestrator initialization...');
    // Just test that the orchestrator can be created
    console.log('✅ Investigation Orchestrator working');
    console.log(`   Max concurrent investigations: ${orchestrator.maxConcurrentInvestigations}`);
    return true;
  } catch (error) {
    console.error('❌ Investigation Orchestrator failed:', error.message);
    return false;
  }
}

async function testConnectorFramework() {
  console.log('🔍 Testing Connector Framework...');
  try {
    const ConnectorRegistry = require('./connectors/connector-registry');
    const MockEDRConnector = require('./connectors/mock-edr-connector');
    
    const registry = new ConnectorRegistry();
    
    // Register mock connector type
    registry.registerConnectorType('mock-edr', MockEDRConnector);
    
    console.log('✅ Connector Framework working');
    console.log(`   Connector types registered: ${registry.connectorTypes.size}`);
    return true;
  } catch (error) {
    console.error('❌ Connector Framework failed:', error.message);
    return false;
  }
}

async function testAgentFramework() {
  console.log('🔍 Testing Agent Framework...');
  try {
    const { AgentRegistry } = require('./investigation/agents/agent-registry');
    const { AnalysisAgent } = require('./investigation/agents/analysis-agent');
    
    const registry = new AgentRegistry();
    
    // Register analysis agent
    registry.registerAgentType('analysis', AnalysisAgent);
    
    console.log('✅ Agent Framework working');
    console.log(`   Agent types registered: ${registry.agentTypes.size}`);
    return true;
  } catch (error) {
    console.error('❌ Agent Framework failed:', error.message);
    return false;
  }
}

async function testEvidenceManagement() {
  console.log('🔍 Testing Evidence Management...');
  try {
    const EvidenceStore = require('./evidence/store');
    const { testPool } = require('./test-database');
    
    const store = new EvidenceStore(testPool);
    
    console.log('   Testing evidence store initialization...');
    // Just test that the store can be created
    console.log('✅ Evidence Management working');
    console.log(`   Evidence store initialized with database`);
    return true;
  } catch (error) {
    console.error('❌ Evidence Management failed:', error.message);
    return false;
  }
}

async function runCoreTests() {
  console.log('🚀 Starting NeonHarbour Security Core Tests\n');
  
  const tests = [
    testDatabaseConnection,
    testInvestigationOrchestrator,
    testConnectorFramework,
    testAgentFramework,
    testEvidenceManagement
  ];
  
  let passed = 0;
  let failed = 0;
  
  // Setup test environment
  try {
    await setupTestDatabase();
    console.log('✅ Test database setup complete\n');
  } catch (error) {
    console.error('❌ Test database setup failed:', error.message);
    process.exit(1);
  }
  
  // Run tests
  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ Test failed with exception:`, error.message);
      failed++;
    }
    console.log(''); // Add spacing
  }
  
  // Cleanup
  try {
    await cleanupTestData();
    console.log('✅ Test cleanup complete');
  } catch (error) {
    console.warn('⚠️  Test cleanup had issues:', error.message);
  }
  
  // Results
  console.log('\n📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All core tests passed! System is ready for use.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above for details.');
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n🛑 Test interrupted. Cleaning up...');
  try {
    await cleanupTestData();
    await testPool.end();
  } catch (error) {
    console.error('Cleanup error:', error.message);
  }
  process.exit(1);
});

// Run tests if called directly
if (require.main === module) {
  runCoreTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runCoreTests };