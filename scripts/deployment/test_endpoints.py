#!/usr/bin/env python3

"""
NeoHarbour Security - Endpoint Testing Script
Tests API endpoints after deployment to ensure they're working correctly
"""

import sys
import os
import yaml
import requests
import json
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

class EndpointTester:
    """Tests API endpoints for deployment validation"""
    
    def __init__(self, environment: str):
        self.environment = environment
        self.project_root = project_root
        self.config_file = self.project_root / "config" / "environments" / f"{environment}.yaml"
        self.errors = []
        self.warnings = []
        self.test_results = []
        
    def load_config(self) -> Dict[str, Any]:
        """Load environment configuration"""
        if not self.config_file.exists():
            raise FileNotFoundError(f"Configuration file not found: {self.config_file}")
            
        with open(self.config_file, 'r') as f:
            return yaml.safe_load(f)
    
    def test_health_endpoint(self, base_url: str) -> bool:
        """Test health check endpoint"""
        try:
            response = requests.get(f"{base_url}/health", timeout=10)
            
            if response.status_code == 200:
                health_data = response.json()
                print(f"✅ Health endpoint: {response.status_code}")
                print(f"   Status: {health_data.get('status', 'unknown')}")
                
                self.test_results.append({
                    'endpoint': '/health',
                    'status': 'pass',
                    'response_time': response.elapsed.total_seconds(),
                    'status_code': response.status_code
                })
                return True
            else:
                self.errors.append(f"Health endpoint returned {response.status_code}")
                self.test_results.append({
                    'endpoint': '/health',
                    'status': 'fail',
                    'status_code': response.status_code,
                    'error': f"HTTP {response.status_code}"
                })
                return False
                
        except requests.exceptions.RequestException as e:
            self.errors.append(f"Health endpoint request failed: {str(e)}")
            self.test_results.append({
                'endpoint': '/health',
                'status': 'fail',
                'error': str(e)
            })
            return False
    
    def test_demo_endpoints(self, base_url: str) -> bool:
        """Test demo-related endpoints"""
        endpoints = [
            ('/demo/presets', 'GET'),
            ('/demo/sessions', 'GET'),
        ]
        
        all_passed = True
        
        for endpoint, method in endpoints:
            try:
                if method == 'GET':
                    response = requests.get(f"{base_url}{endpoint}", timeout=10)
                else:
                    response = requests.request(method, f"{base_url}{endpoint}", timeout=10)
                
                if response.status_code in [200, 201, 204]:
                    print(f"✅ {method} {endpoint}: {response.status_code}")
                    self.test_results.append({
                        'endpoint': endpoint,
                        'method': method,
                        'status': 'pass',
                        'response_time': response.elapsed.total_seconds(),
                        'status_code': response.status_code
                    })
                elif response.status_code == 401:
                    print(f"⚠️  {method} {endpoint}: {response.status_code} (Authentication required - expected)")
                    self.test_results.append({
                        'endpoint': endpoint,
                        'method': method,
                        'status': 'pass',
                        'status_code': response.status_code,
                        'note': 'Authentication required (expected)'
                    })
                else:
                    self.warnings.append(f"{method} {endpoint} returned {response.status_code}")
                    self.test_results.append({
                        'endpoint': endpoint,
                        'method': method,
                        'status': 'warning',
                        'status_code': response.status_code
                    })
                    all_passed = False
                    
            except requests.exceptions.RequestException as e:
                self.errors.append(f"{method} {endpoint} request failed: {str(e)}")
                self.test_results.append({
                    'endpoint': endpoint,
                    'method': method,
                    'status': 'fail',
                    'error': str(e)
                })
                all_passed = False
        
        return all_passed
    
    def test_cors_headers(self, base_url: str) -> bool:
        """Test CORS headers"""
        try:
            # Test preflight request
            headers = {
                'Origin': 'https://example.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Content-Type'
            }
            
            response = requests.options(f"{base_url}/health", headers=headers, timeout=10)
            
            cors_headers = {
                'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
            }
            
            if any(cors_headers.values()):
                print("✅ CORS headers present")
                for header, value in cors_headers.items():
                    if value:
                        print(f"   {header}: {value}")
                
                self.test_results.append({
                    'test': 'CORS headers',
                    'status': 'pass',
                    'headers': cors_headers
                })
                return True
            else:
                self.warnings.append("No CORS headers found")
                self.test_results.append({
                    'test': 'CORS headers',
                    'status': 'warning',
                    'note': 'No CORS headers found'
                })
                return False
                
        except requests.exceptions.RequestException as e:
            self.warnings.append(f"CORS test failed: {str(e)}")
            self.test_results.append({
                'test': 'CORS headers',
                'status': 'fail',
                'error': str(e)
            })
            return False
    
    def test_response_times(self, base_url: str) -> bool:
        """Test response times for performance"""
        endpoints = ['/health']
        max_response_time = 5.0  # seconds
        
        all_passed = True
        
        for endpoint in endpoints:
            try:
                start_time = time.time()
                response = requests.get(f"{base_url}{endpoint}", timeout=10)
                response_time = time.time() - start_time
                
                if response_time <= max_response_time:
                    print(f"✅ Response time {endpoint}: {response_time:.2f}s")
                    self.test_results.append({
                        'test': f'Response time {endpoint}',
                        'status': 'pass',
                        'response_time': response_time
                    })
                else:
                    self.warnings.append(f"Slow response time for {endpoint}: {response_time:.2f}s")
                    self.test_results.append({
                        'test': f'Response time {endpoint}',
                        'status': 'warning',
                        'response_time': response_time,
                        'threshold': max_response_time
                    })
                    all_passed = False
                    
            except requests.exceptions.RequestException as e:
                self.errors.append(f"Response time test failed for {endpoint}: {str(e)}")
                self.test_results.append({
                    'test': f'Response time {endpoint}',
                    'status': 'fail',
                    'error': str(e)
                })
                all_passed = False
        
        return all_passed
    
    def test_security_headers(self, base_url: str) -> bool:
        """Test security headers"""
        try:
            response = requests.get(f"{base_url}/health", timeout=10)
            
            security_headers = {
                'X-Content-Type-Options': response.headers.get('X-Content-Type-Options'),
                'X-Frame-Options': response.headers.get('X-Frame-Options'),
                'X-XSS-Protection': response.headers.get('X-XSS-Protection'),
                'Strict-Transport-Security': response.headers.get('Strict-Transport-Security'),
                'Content-Security-Policy': response.headers.get('Content-Security-Policy'),
            }
            
            present_headers = {k: v for k, v in security_headers.items() if v}
            missing_headers = [k for k, v in security_headers.items() if not v]
            
            if present_headers:
                print(f"✅ Security headers present: {len(present_headers)}")
                for header, value in present_headers.items():
                    print(f"   {header}: {value}")
            
            if missing_headers:
                if self.environment == 'prod':
                    self.warnings.append(f"Missing security headers in production: {', '.join(missing_headers)}")
                else:
                    print(f"ℹ️  Missing security headers (optional for {self.environment}): {', '.join(missing_headers)}")
            
            self.test_results.append({
                'test': 'Security headers',
                'status': 'pass' if present_headers else 'warning',
                'present_headers': present_headers,
                'missing_headers': missing_headers
            })
            
            return True
            
        except requests.exceptions.RequestException as e:
            self.warnings.append(f"Security headers test failed: {str(e)}")
            self.test_results.append({
                'test': 'Security headers',
                'status': 'fail',
                'error': str(e)
            })
            return False
    
    def test_all_endpoints(self) -> bool:
        """Run all endpoint tests"""
        try:
            config = self.load_config()
            api_config = config.get('api', {})
            base_url = api_config.get('endpoint')
            
            if not base_url:
                self.errors.append("No API endpoint configured")
                return False
            
            print(f"\n=== Testing endpoints for {self.environment} ===")
            print(f"Base URL: {base_url}")
            
            # Wait for services to be ready
            print("Waiting for services to be ready...")
            time.sleep(10)
            
            # Run tests
            tests = [
                ('Health endpoint', lambda: self.test_health_endpoint(base_url)),
                ('Demo endpoints', lambda: self.test_demo_endpoints(base_url)),
                ('CORS headers', lambda: self.test_cors_headers(base_url)),
                ('Response times', lambda: self.test_response_times(base_url)),
                ('Security headers', lambda: self.test_security_headers(base_url)),
            ]
            
            all_passed = True
            for test_name, test_func in tests:
                print(f"\n--- {test_name} ---")
                try:
                    result = test_func()
                    if not result:
                        all_passed = False
                except Exception as e:
                    self.errors.append(f"{test_name} failed: {str(e)}")
                    all_passed = False
            
            return all_passed
            
        except Exception as e:
            self.errors.append(f"Endpoint testing failed: {str(e)}")
            return False
    
    def save_test_results(self) -> None:
        """Save test results to file"""
        results_file = self.project_root / "logs" / "deployment" / f"endpoint_tests_{self.environment}_{int(time.time())}.json"
        results_file.parent.mkdir(parents=True, exist_ok=True)
        
        results = {
            'environment': self.environment,
            'timestamp': time.time(),
            'tests': self.test_results,
            'errors': self.errors,
            'warnings': self.warnings,
            'summary': {
                'total_tests': len(self.test_results),
                'passed': len([t for t in self.test_results if t.get('status') == 'pass']),
                'warnings': len([t for t in self.test_results if t.get('status') == 'warning']),
                'failed': len([t for t in self.test_results if t.get('status') == 'fail']),
            }
        }
        
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\nTest results saved to: {results_file}")
    
    def print_results(self) -> None:
        """Print test results"""
        print(f"\n=== Endpoint Test Results for {self.environment} ===")
        
        if self.test_results:
            summary = {
                'passed': len([t for t in self.test_results if t.get('status') == 'pass']),
                'warnings': len([t for t in self.test_results if t.get('status') == 'warning']),
                'failed': len([t for t in self.test_results if t.get('status') == 'fail']),
            }
            
            print(f"\nTest Summary:")
            print(f"  ✅ Passed: {summary['passed']}")
            print(f"  ⚠️  Warnings: {summary['warnings']}")
            print(f"  ❌ Failed: {summary['failed']}")
        
        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"  • {error}")
        
        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  • {warning}")
        
        if not self.errors and not self.warnings:
            print("\n✅ All endpoint tests passed!")
        elif not self.errors:
            print(f"\n✅ Endpoint tests passed with {len(self.warnings)} warnings")
        else:
            print(f"\n❌ Endpoint tests failed with {len(self.errors)} errors and {len(self.warnings)} warnings")

def main():
    """Main function"""
    if len(sys.argv) != 2:
        print("Usage: python test_endpoints.py <environment>")
        print("Environment: dev, staging, or prod")
        sys.exit(1)
    
    environment = sys.argv[1]
    
    if environment not in ['dev', 'staging', 'prod']:
        print(f"Invalid environment: {environment}")
        print("Valid environments: dev, staging, prod")
        sys.exit(1)
    
    tester = EndpointTester(environment)
    success = tester.test_all_endpoints()
    tester.print_results()
    tester.save_test_results()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()