# AI Investigation Engine - End-to-End Testing Suite

This directory contains comprehensive end-to-end integration tests for the AI Investigation Engine, covering all aspects of the system from complete investigation workflows to security and performance testing.

## Test Suites Overview

### 1. Complete Investigation Workflow (`e2e-investigation-workflow.test.js`)
Tests the full investigation lifecycle from alert ingestion to response generation.

**Coverage:**
- Complete investigation workflow (Planning → Executing → Analyzing → Responding → Complete)
- Human feedback integration
- Audit trail generation
- Investigation state management
- Evidence collection and correlation

**Key Test Cases:**
- Full investigation lifecycle execution
- Human-in-the-loop feedback integration
- Complete audit trail verification
- Investigation metadata tracking

### 2. Multi-Tenant Isolation (`e2e-multi-tenant-isolation.test.js`)
Verifies data isolation and security between different tenants.

**Coverage:**
- Investigation data isolation
- Evidence data isolation
- Audit log isolation
- Connector configuration isolation
- Learning data isolation

**Key Test Cases:**
- Cross-tenant data access prevention
- Tenant-specific investigation lists
- Isolated evidence search
- Separate audit trails
- Tenant-isolated learning metrics

### 3. Failure and Recovery Scenarios (`e2e-failure-recovery.test.js`)
Tests system resilience and recovery mechanisms under various failure conditions.

**Coverage:**
- Data source failures
- Agent failures
- Resource exhaustion
- Network connectivity issues
- Circuit breaker patterns

**Key Test Cases:**
- Single data source failure handling
- Multiple data source failures with degraded analysis
- Complete data source failure with escalation
- Agent failure with fallback strategies
- Memory exhaustion with investigation queuing
- Investigation timeout handling
- Intermittent network failures with circuit breaker

### 4. Load Testing (`e2e-load-testing.test.js`)
Tests concurrent investigation processing and system performance under load.

**Coverage:**
- Concurrent investigation processing
- Priority-based investigation scheduling
- Queue management under burst load
- Memory usage monitoring
- Database connection pool management

**Key Test Cases:**
- 10+ concurrent investigations without performance degradation
- High-priority investigation prioritization under load
- Burst load handling with queue management
- Stable memory usage during sustained load
- Database connection pool stress testing

### 5. Security Testing (`e2e-security-testing.test.js`)
Comprehensive security testing for data access, authentication, and protection.

**Coverage:**
- Authentication and authorization
- Input validation and injection prevention
- Data encryption and protection
- Audit trail security
- Cross-tenant security

**Key Test Cases:**
- Invalid authentication token rejection
- Role-based access control enforcement
- Cross-tenant data access prevention
- SQL injection prevention
- NoSQL injection prevention
- Input validation and sanitization
- Data encryption at rest verification
- Secure session management
- Immutable audit log creation
- Audit log tampering detection

### 6. Connector Reliability (`e2e-connector-reliability.test.js`)
Tests external connector reliability, failover mechanisms, and performance.

**Coverage:**
- Connector health monitoring
- Failover mechanisms
- Load balancing
- Rate limiting
- Circuit breaker patterns

**Key Test Cases:**
- Continuous connector health monitoring
- Performance degradation detection and adaptation
- Circuit breaker pattern implementation
- Failover to backup connectors
- Graceful degradation when no backups available
- Intelligent retry with exponential backoff
- Load distribution across multiple connectors
- Rate limit respect and request queuing

## Running the Tests

### Prerequisites

1. **Database Setup**: Ensure PostgreSQL is running with test database configured
2. **Environment Variables**: Set up required environment variables (see `.env.example`)
3. **Dependencies**: Install all npm dependencies (`npm install`)
4. **Test Data**: Tests create and clean up their own test data

### Running Individual Test Suites

```bash
# Run specific test suite
npx jest test/e2e-investigation-workflow.test.js

# Run with verbose output
npx jest test/e2e-investigation-workflow.test.js --verbose

# Run with custom timeout
npx jest test/e2e-load-testing.test.js --testTimeout=180000
```

### Running All E2E Tests

```bash
# Run all E2E tests sequentially (recommended)
npm run test:e2e

# Run all E2E tests in parallel (faster but may cause conflicts)
npm run test:e2e:parallel

# Run with verbose output and detailed reporting
npm run test:e2e:verbose

# Run with custom configuration
node test/run-e2e-tests.js --parallel --verbose --retries 3
```

### Test Runner Options

The `run-e2e-tests.js` script supports various options:

- `--parallel`: Run tests in parallel (faster but may cause resource conflicts)
- `--no-report`: Skip report generation
- `--verbose`: Show detailed output including error messages
- `--retries <n>`: Number of retries for failed tests (default: 2)
- `--timeout <ms>`: Override default test timeout for all suites
- `--help`: Show help message with all options

## Test Configuration

### Environment Variables

```bash
# Database configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=neonharbour_test
DB_USER=test_user
DB_PASSWORD=test_password

# JWT configuration
JWT_SECRET=test_jwt_secret

# External service URLs (for connector tests)
SIEM_API_URL=https://mock-siem.example.com
EDR_API_URL=https://mock-edr.example.com
THREAT_INTEL_API_URL=https://mock-threatintel.example.com
```

### Test Database Setup

The tests require a separate test database to avoid conflicts with development data:

```sql
-- Create test database
CREATE DATABASE neonharbour_test;

-- Create test user
CREATE USER test_user WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE neonharbour_test TO test_user;
```

### Mock Services

Tests use mock external services to simulate SIEM, EDR, and threat intelligence APIs. These mocks are configured within each test file and can simulate various scenarios including:

- Healthy responses
- Failure conditions
- Rate limiting
- Performance degradation
- Intermittent connectivity issues

## Test Data Management

### Data Isolation

Each test suite creates its own isolated test data:

- **Tenants**: Unique tenant IDs for each test run
- **Users**: Test users with appropriate roles and permissions
- **Alerts**: Synthetic security alerts for investigation testing
- **Investigations**: Test investigations with controlled parameters

### Cleanup Strategy

Tests implement comprehensive cleanup:

- **Before Each Test**: Clean slate with fresh test data
- **After Each Test**: Remove test-specific data
- **After All Tests**: Complete cleanup of tenant and related data
- **Error Handling**: Cleanup even when tests fail

### Data Factories

Helper functions create consistent test data:

```javascript
// Create test alert with specific properties
const alertId = await createTestAlert(tenantId, 'Test Alert', 'high');

// Create test investigation
const investigationId = await startTestInvestigation(alertId, options);

// Create test user with specific role
const userId = await createTestUser(tenantId, 'analyst');
```

## Performance Benchmarks

### Expected Performance Metrics

| Metric | Target | Test Suite |
|--------|--------|------------|
| Investigation Completion | < 30 seconds | Workflow |
| Concurrent Investigations | 10+ without degradation | Load Testing |
| Memory Usage Increase | < 30% during sustained load | Load Testing |
| Database Connections | < 50 active connections | Load Testing |
| API Response Time | < 2 seconds | Connector Reliability |
| Failover Time | < 5 seconds | Failure Recovery |

### Performance Monitoring

Tests include built-in performance monitoring:

- **Response Times**: API endpoint response times
- **Memory Usage**: Heap usage and memory leaks
- **Database Performance**: Connection pool usage and query times
- **Connector Performance**: External API response times and error rates

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify database is running and accessible
   - Check connection string and credentials
   - Ensure test database exists and user has permissions

2. **Test Timeouts**
   - Increase timeout for specific test suites
   - Check system resources (CPU, memory)
   - Verify external service mocks are responding

3. **Port Conflicts**
   - Ensure test server port is available
   - Check for other running instances
   - Use different port for test environment

4. **Memory Issues**
   - Monitor memory usage during tests
   - Check for memory leaks in test cleanup
   - Increase Node.js memory limit if needed

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Set debug environment variable
DEBUG=investigation:* npm run test:e2e

# Run with Node.js inspector
node --inspect test/run-e2e-tests.js --verbose
```

### Test Isolation Issues

If tests interfere with each other:

1. Run tests sequentially instead of parallel
2. Increase cleanup timeouts
3. Add delays between test suites
4. Check for shared resources or global state

## Continuous Integration

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: neonharbour_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: neonharbour_test
          DB_USER: postgres
          DB_PASSWORD: test_password
          JWT_SECRET: test_jwt_secret
          
      - name: Upload test results
        uses: actions/upload-artifact@v2
        if: always()
        with:
          name: e2e-test-results
          path: test-results/
```

### Test Reporting

Tests generate comprehensive reports:

- **JSON Report**: Machine-readable test results (`e2e-test-results.json`)
- **HTML Report**: Human-readable test results (`e2e-test-results.html`)
- **Coverage Report**: Code coverage metrics (if enabled)
- **Performance Metrics**: Response times and resource usage

## Contributing

### Adding New Tests

1. **Create Test File**: Follow naming convention `e2e-[feature].test.js`
2. **Add to Test Runner**: Update `run-e2e-tests.js` with new test suite
3. **Documentation**: Update this README with test description
4. **Data Cleanup**: Implement proper cleanup in `beforeEach`/`afterEach`

### Test Structure

Follow this structure for new test files:

```javascript
describe('Feature Name E2E Tests', () => {
  let testTenantId;
  
  beforeAll(async () => {
    // Setup test environment
  });
  
  afterAll(async () => {
    // Cleanup test environment
  });
  
  beforeEach(async () => {
    // Setup test data
  });
  
  afterEach(async () => {
    // Cleanup test data
  });
  
  describe('Test Category', () => {
    test('should test specific functionality', async () => {
      // Test implementation
    });
  });
  
  // Helper functions
  async function setupTestEnvironment() {
    // Implementation
  }
});
```

### Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data, even when tests fail
3. **Timeouts**: Set appropriate timeouts for long-running operations
4. **Assertions**: Use descriptive assertions with clear error messages
5. **Mocking**: Mock external services to ensure test reliability
6. **Documentation**: Document complex test scenarios and expected behavior

## Requirements Coverage

This E2E test suite covers all requirements specified in the AI Investigation Engine specification:

- **Requirement 2.6**: Investigation performance and reliability
- **Requirement 5.5**: Learning system feedback and adaptation
- **Requirement 6.5**: Multi-tenant data isolation and security
- **Requirement 7.4**: External connector reliability and failover

Each test suite maps to specific requirements and validates the implementation meets the specified criteria.