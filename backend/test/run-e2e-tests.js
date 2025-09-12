#!/usr/bin/env node

/**
 * End-to-End Test Runner for AI Investigation Engine
 * 
 * This script runs all E2E integration tests in the correct order
 * and provides comprehensive reporting on test results.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test suites in execution order
const testSuites = [
  {
    name: 'Complete Investigation Workflow',
    file: 'e2e-investigation-workflow.test.js',
    description: 'Tests full investigation lifecycle from alert to response',
    timeout: 120000
  },
  {
    name: 'Multi-Tenant Isolation',
    file: 'e2e-multi-tenant-isolation.test.js',
    description: 'Tests data isolation between different tenants',
    timeout: 90000
  },
  {
    name: 'Failure and Recovery Scenarios',
    file: 'e2e-failure-recovery.test.js',
    description: 'Tests system resilience and recovery mechanisms',
    timeout: 150000
  },
  {
    name: 'Load Testing',
    file: 'e2e-load-testing.test.js',
    description: 'Tests concurrent investigation processing under load',
    timeout: 180000
  },
  {
    name: 'Security Testing',
    file: 'e2e-security-testing.test.js',
    description: 'Tests security controls and data protection',
    timeout: 120000
  },
  {
    name: 'Connector Reliability',
    file: 'e2e-connector-reliability.test.js',
    description: 'Tests external connector reliability and failover',
    timeout: 150000
  }
];

// Configuration
const config = {
  maxRetries: 2,
  parallelExecution: false, // Set to true for parallel execution (if tests are independent)
  generateReport: true,
  reportFormat: 'json', // 'json' or 'html'
  outputDir: './test-results',
  verbose: true
};

class E2ETestRunner {
  constructor() {
    this.results = {
      startTime: new Date(),
      endTime: null,
      totalTests: testSuites.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      suiteResults: [],
      summary: {}
    };
    
    this.setupOutputDirectory();
  }

  setupOutputDirectory() {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
  }

  async runAllTests() {
    console.log('🚀 Starting AI Investigation Engine E2E Tests');
    console.log('=' .repeat(60));
    
    this.logEnvironmentInfo();

    if (config.parallelExecution) {
      await this.runTestsInParallel();
    } else {
      await this.runTestsSequentially();
    }

    this.results.endTime = new Date();
    this.generateSummary();
    
    if (config.generateReport) {
      this.generateReport();
    }

    this.printFinalResults();
    
    // Exit with appropriate code
    process.exit(this.results.failed > 0 ? 1 : 0);
  }

  logEnvironmentInfo() {
    console.log('Environment Information:');
    console.log(`- Node.js Version: ${process.version}`);
    console.log(`- Platform: ${process.platform}`);
    console.log(`- Architecture: ${process.arch}`);
    console.log(`- Memory: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`);
    console.log(`- Test Timeout: ${Math.max(...testSuites.map(s => s.timeout))}ms`);
    console.log('');
  }

  async runTestsSequentially() {
    for (let i = 0; i < testSuites.length; i++) {
      const suite = testSuites[i];
      console.log(`\n📋 Running Test Suite ${i + 1}/${testSuites.length}: ${suite.name}`);
      console.log(`   ${suite.description}`);
      console.log('-'.repeat(60));

      const result = await this.runTestSuite(suite);
      this.results.suiteResults.push(result);

      if (result.status === 'passed') {
        this.results.passed++;
        console.log(`✅ ${suite.name} - PASSED`);
      } else if (result.status === 'failed') {
        this.results.failed++;
        console.log(`❌ ${suite.name} - FAILED`);
        
        if (config.verbose) {
          console.log('Error Details:');
          console.log(result.error);
        }
      } else {
        this.results.skipped++;
        console.log(`⏭️  ${suite.name} - SKIPPED`);
      }
    }
  }

  async runTestsInParallel() {
    console.log('Running tests in parallel...\n');
    
    const promises = testSuites.map(async (suite, index) => {
      console.log(`📋 Starting Test Suite ${index + 1}: ${suite.name}`);
      return this.runTestSuite(suite);
    });

    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      const suite = testSuites[index];
      const testResult = result.status === 'fulfilled' ? result.value : {
        suite: suite.name,
        status: 'failed',
        error: result.reason,
        duration: 0,
        tests: { total: 0, passed: 0, failed: 1 }
      };

      this.results.suiteResults.push(testResult);

      if (testResult.status === 'passed') {
        this.results.passed++;
        console.log(`✅ ${suite.name} - PASSED`);
      } else {
        this.results.failed++;
        console.log(`❌ ${suite.name} - FAILED`);
      }
    });
  }

  async runTestSuite(suite) {
    const startTime = Date.now();
    let attempt = 0;
    let lastError = null;

    while (attempt <= config.maxRetries) {
      try {
        const testFile = path.join(__dirname, suite.file);
        
        if (!fs.existsSync(testFile)) {
          throw new Error(`Test file not found: ${testFile}`);
        }

        // Run Jest for specific test file
        const jestCommand = `npx jest ${testFile} --json --testTimeout=${suite.timeout}`;
        
        if (config.verbose) {
          console.log(`   Executing: ${jestCommand}`);
        }

        const output = execSync(jestCommand, {
          cwd: path.dirname(__dirname),
          encoding: 'utf8',
          stdio: 'pipe'
        });

        const jestResult = JSON.parse(output);
        
        return {
          suite: suite.name,
          status: jestResult.success ? 'passed' : 'failed',
          duration: Date.now() - startTime,
          tests: {
            total: jestResult.numTotalTests,
            passed: jestResult.numPassedTests,
            failed: jestResult.numFailedTests
          },
          coverage: jestResult.coverageMap || null,
          details: jestResult.testResults[0] || null
        };

      } catch (error) {
        attempt++;
        lastError = error;
        
        if (attempt <= config.maxRetries) {
          console.log(`   ⚠️  Attempt ${attempt} failed, retrying...`);
          await this.delay(2000 * attempt); // Exponential backoff
        }
      }
    }

    // All attempts failed
    return {
      suite: suite.name,
      status: 'failed',
      duration: Date.now() - startTime,
      error: lastError.message,
      tests: { total: 0, passed: 0, failed: 1 }
    };
  }

  generateSummary() {
    const duration = this.results.endTime - this.results.startTime;
    const totalTestCases = this.results.suiteResults.reduce((sum, result) => sum + (result.tests?.total || 0), 0);
    const passedTestCases = this.results.suiteResults.reduce((sum, result) => sum + (result.tests?.passed || 0), 0);
    const failedTestCases = this.results.suiteResults.reduce((sum, result) => sum + (result.tests?.failed || 0), 0);

    this.results.summary = {
      duration: duration,
      durationFormatted: this.formatDuration(duration),
      testSuites: {
        total: this.results.totalTests,
        passed: this.results.passed,
        failed: this.results.failed,
        skipped: this.results.skipped,
        successRate: ((this.results.passed / this.results.totalTests) * 100).toFixed(1)
      },
      testCases: {
        total: totalTestCases,
        passed: passedTestCases,
        failed: failedTestCases,
        successRate: totalTestCases > 0 ? ((passedTestCases / totalTestCases) * 100).toFixed(1) : '0'
      }
    };
  }

  generateReport() {
    const reportData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch
        },
        configuration: config
      },
      results: this.results
    };

    if (config.reportFormat === 'json') {
      const jsonReport = JSON.stringify(reportData, null, 2);
      fs.writeFileSync(path.join(config.outputDir, 'e2e-test-results.json'), jsonReport);
      console.log(`\n📊 JSON report generated: ${config.outputDir}/e2e-test-results.json`);
    }

    if (config.reportFormat === 'html') {
      const htmlReport = this.generateHtmlReport(reportData);
      fs.writeFileSync(path.join(config.outputDir, 'e2e-test-results.html'), htmlReport);
      console.log(`\n📊 HTML report generated: ${config.outputDir}/e2e-test-results.html`);
    }
  }

  generateHtmlReport(data) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>AI Investigation Engine E2E Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e8f4f8; padding: 15px; border-radius: 5px; text-align: center; }
        .passed { background: #d4edda; }
        .failed { background: #f8d7da; }
        .suite { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.passed { border-left: 5px solid #28a745; }
        .suite.failed { border-left: 5px solid #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI Investigation Engine E2E Test Results</h1>
        <p>Generated: ${data.metadata.generatedAt}</p>
        <p>Duration: ${data.results.summary.durationFormatted}</p>
    </div>
    
    <div class="summary">
        <div class="metric ${data.results.summary.testSuites.failed === 0 ? 'passed' : 'failed'}">
            <h3>Test Suites</h3>
            <p>${data.results.summary.testSuites.passed}/${data.results.summary.testSuites.total} Passed</p>
            <p>${data.results.summary.testSuites.successRate}% Success Rate</p>
        </div>
        <div class="metric ${data.results.summary.testCases.failed === 0 ? 'passed' : 'failed'}">
            <h3>Test Cases</h3>
            <p>${data.results.summary.testCases.passed}/${data.results.summary.testCases.total} Passed</p>
            <p>${data.results.summary.testCases.successRate}% Success Rate</p>
        </div>
    </div>
    
    <h2>Test Suite Details</h2>
    ${data.results.suiteResults.map(suite => `
        <div class="suite ${suite.status}">
            <h3>${suite.suite}</h3>
            <p>Status: ${suite.status.toUpperCase()}</p>
            <p>Duration: ${this.formatDuration(suite.duration)}</p>
            ${suite.tests ? `<p>Tests: ${suite.tests.passed}/${suite.tests.total} passed</p>` : ''}
            ${suite.error ? `<p style="color: red;">Error: ${suite.error}</p>` : ''}
        </div>
    `).join('')}
</body>
</html>`;
  }

  printFinalResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🏁 E2E Test Execution Complete');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total Duration: ${this.results.summary.durationFormatted}`);
    console.log(`   Test Suites: ${this.results.summary.testSuites.passed}/${this.results.summary.testSuites.total} passed (${this.results.summary.testSuites.successRate}%)`);
    console.log(`   Test Cases: ${this.results.summary.testCases.passed}/${this.results.summary.testCases.total} passed (${this.results.summary.testCases.successRate}%)`);

    if (this.results.failed > 0) {
      console.log(`\n❌ Failed Test Suites:`);
      this.results.suiteResults
        .filter(result => result.status === 'failed')
        .forEach(result => {
          console.log(`   - ${result.suite}`);
          if (result.error && config.verbose) {
            console.log(`     Error: ${result.error}`);
          }
        });
    }

    if (this.results.passed === this.results.totalTests) {
      console.log(`\n🎉 All tests passed! The AI Investigation Engine is ready for production.`);
    } else {
      console.log(`\n⚠️  Some tests failed. Please review the results and fix issues before deployment.`);
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI argument parsing
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AI Investigation Engine E2E Test Runner

Usage: node run-e2e-tests.js [options]

Options:
  --parallel          Run tests in parallel (faster but may cause conflicts)
  --no-report         Skip report generation
  --verbose           Show detailed output
  --retries <n>       Number of retries for failed tests (default: 2)
  --timeout <ms>      Override default test timeout
  --help, -h          Show this help message

Examples:
  node run-e2e-tests.js                    # Run all tests sequentially
  node run-e2e-tests.js --parallel         # Run tests in parallel
  node run-e2e-tests.js --verbose --retries 3  # Verbose output with 3 retries
`);
  process.exit(0);
}

// Apply CLI arguments
if (args.includes('--parallel')) {
  config.parallelExecution = true;
}

if (args.includes('--no-report')) {
  config.generateReport = false;
}

if (args.includes('--verbose')) {
  config.verbose = true;
}

const retriesIndex = args.indexOf('--retries');
if (retriesIndex !== -1 && args[retriesIndex + 1]) {
  config.maxRetries = parseInt(args[retriesIndex + 1]);
}

const timeoutIndex = args.indexOf('--timeout');
if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
  const timeout = parseInt(args[timeoutIndex + 1]);
  testSuites.forEach(suite => suite.timeout = timeout);
}

// Run the tests
const runner = new E2ETestRunner();
runner.runAllTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});