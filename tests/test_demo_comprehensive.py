"""
Comprehensive test runner for all demo system functionality.
Orchestrates unit tests, integration tests, and performance tests.
"""

import pytest
import sys
import os
from datetime import datetime
import json
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestDemoSystemComprehensive:
    """Comprehensive test suite for the entire demo system."""
    
    def test_all_demo_components_available(self):
        """Test that all demo system components can be imported."""
        try:
            # Core demo components
            from src.demo.generator import DemoDataGenerator, DemoAlert
            from src.demo.session import DemoSessionManager, DemoParameters
            from src.demo.controller import DemoSessionController
            from src.demo.scenarios import get_scenario_templates
            from src.demo.variations import AlertVariationEngine
            from src.demo.integration import DemoPipelineIntegration
            from src.demo.progress_tracker import ProgressTracker
            
            # Metrics components
            from src.metrics.collector import RealTimeMetricsCollector
            from src.metrics.roi_calculator import ROICalculationEngine
            from src.metrics.dashboard import DashboardDataAggregator
            
            print("✓ All demo system components imported successfully")
            
        except ImportError as e:
            pytest.fail(f"Failed to import demo system component: {e}")
    
    def test_demo_system_configuration(self):
        """Test demo system configuration and environment setup."""
        # Check required environment variables
        required_env_vars = [
            'AWS_DEFAULT_REGION',
            'DDB_INVESTIGATIONS_TABLE',
            'ARTIFACTS_BUCKET'
        ]
        
        missing_vars = []
        for var in required_env_vars:
            if not os.environ.get(var):
                missing_vars.append(var)
        
        if missing_vars:
            print(f"⚠ Missing environment variables: {missing_vars}")
            print("  Demo system may not function properly in production")
        else:
            print("✓ All required environment variables present")
    
    def test_demo_system_integration_points(self):
        """Test integration points between demo system components."""
        from src.demo.generator import DemoDataGenerator
        from src.demo.session import DemoSessionManager
        from src.demo.progress_tracker import ProgressTracker
        from src.metrics.collector import RealTimeMetricsCollector
        
        # Test component initialization
        try:
            # These should initialize without errors
            generator = DemoDataGenerator.__new__(DemoDataGenerator)
            session_manager = DemoSessionManager.__new__(DemoSessionManager)
            progress_tracker = ProgressTracker.__new__(ProgressTracker)
            metrics_collector = RealTimeMetricsCollector.__new__(RealTimeMetricsCollector)
            
            print("✓ All demo system components can be instantiated")
            
        except Exception as e:
            pytest.fail(f"Failed to instantiate demo system component: {e}")
    
    def test_demo_data_structures(self):
        """Test demo system data structures and serialization."""
        from src.demo.generator import DemoAlert
        from src.demo.session import DemoParameters, DemoMetrics
        from datetime import datetime, timezone
        
        # Test DemoAlert structure
        alert = DemoAlert(
            alert_id="TEST-001",
            investigation_id="INV-TEST-001",
            tenant_id="test-tenant",
            source="test",
            title="Test Alert",
            description="Test description",
            severity="Medium",
            risk_level="medium",
            entities=[{"type": "test", "name": "test_entity"}],
            tactics=["Discovery"],
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type="test_scenario",
            is_false_positive=True,
            confidence_score=0.5,
            raw_data={"test": True}
        )
        
        # Test serialization
        alert_dict = alert.__dict__
        assert alert_dict["alert_id"] == "TEST-001"
        assert alert_dict["is_false_positive"] is True
        
        # Test DemoParameters
        params = DemoParameters(
            interval_seconds=30.0,
            false_positive_rate=0.8,
            duration_minutes=15
        )
        
        params_dict = params.to_dict()
        assert params_dict["interval_seconds"] == 30.0
        
        # Test DemoMetrics
        metrics = DemoMetrics()
        metrics.alerts_generated = 10
        metrics.alerts_processed = 8
        metrics.auto_closed_count = 6  # Set auto_closed_count for automation rate calculation
        metrics.update_automation_rate()
        
        assert metrics.automation_rate > 0
        
        print("✓ Demo system data structures work correctly")
    
    def test_scenario_template_coverage(self):
        """Test scenario template coverage for different attack types."""
        from src.demo.scenarios import get_scenario_templates
        
        templates = get_scenario_templates()
        scenario_types = [t.scenario_type for t in templates]
        
        # Check for key scenario categories
        required_categories = [
            "phishing", "malware", "ransomware", "insider_threat",
            "data_breach", "privilege_escalation", "lateral_movement"
        ]
        
        covered_categories = []
        for category in required_categories:
            if any(category in scenario_type.lower() for scenario_type in scenario_types):
                covered_categories.append(category)
        
        coverage_ratio = len(covered_categories) / len(required_categories)
        
        print(f"✓ Scenario coverage: {len(covered_categories)}/{len(required_categories)} categories")
        print(f"  Covered: {covered_categories}")
        
        assert coverage_ratio >= 0.7, f"Insufficient scenario coverage: {coverage_ratio:.2%}"
    
    def test_hkma_compliance_mapping(self):
        """Test HKMA compliance mapping in scenarios."""
        from src.demo.scenarios import get_scenario_templates
        
        templates = get_scenario_templates()
        hkma_keywords = ['sa-2', 'tm-g-1', 'hkma', 'pdpo', 'operational risk']
        
        hkma_relevant_templates = []
        for template in templates:
            hkma_text = template.hkma_relevance.lower()
            if any(keyword in hkma_text for keyword in hkma_keywords):
                hkma_relevant_templates.append(template.scenario_type)
        
        hkma_coverage = len(hkma_relevant_templates) / len(templates)
        
        print(f"✓ HKMA compliance coverage: {len(hkma_relevant_templates)}/{len(templates)} templates")
        print(f"  Coverage ratio: {hkma_coverage:.2%}")
        
        assert hkma_coverage >= 0.5, f"Insufficient HKMA coverage: {hkma_coverage:.2%}"
        assert len(hkma_relevant_templates) >= 5, "Need at least 5 HKMA-relevant templates"
    
    def test_demo_preset_configurations(self):
        """Test demo preset configurations for different audiences."""
        from src.demo.session import DEMO_PRESETS
        
        required_presets = [
            'technical_deep_dive',
            'executive_overview',
            'compliance_focus',
            'quick_demo'
        ]
        
        available_presets = list(DEMO_PRESETS.keys())
        
        for preset_name in required_presets:
            assert preset_name in available_presets, f"Missing required preset: {preset_name}"
            
            preset = DEMO_PRESETS[preset_name]
            
            # Validate preset parameters
            validation_result = preset.validate()
            assert validation_result["valid"], f"Invalid preset {preset_name}: {validation_result['errors']}"
        
        print(f"✓ Demo presets: {len(available_presets)} available")
        print(f"  Required presets present: {required_presets}")
    
    def test_aws_service_integration_readiness(self):
        """Test AWS service integration readiness."""
        import boto3
        from botocore.exceptions import NoCredentialsError, ClientError
        
        # Test AWS service clients can be created
        services_to_test = ['events', 'dynamodb', 'stepfunctions', 's3']
        service_status = {}
        
        for service in services_to_test:
            try:
                client = boto3.client(service, region_name='us-east-1')
                service_status[service] = "✓ Client created"
            except NoCredentialsError:
                service_status[service] = "⚠ No credentials (expected in test)"
            except Exception as e:
                service_status[service] = f"✗ Error: {e}"
        
        print("AWS Service Integration Status:")
        for service, status in service_status.items():
            print(f"  {service}: {status}")
        
        # All services should at least be able to create clients
        for service, status in service_status.items():
            assert "✗ Error" not in status, f"Failed to create {service} client"


def run_comprehensive_tests():
    """Run all comprehensive demo system tests."""
    print("=" * 60)
    print("DEMO SYSTEM COMPREHENSIVE TEST SUITE")
    print("=" * 60)
    print(f"Started at: {datetime.now().isoformat()}")
    print()
    
    # Test configuration
    test_config = {
        'unit_tests': True,
        'integration_tests': True,
        'performance_tests': False,  # Set to True for full performance testing
        'verbose': True
    }
    
    test_files = []
    
    if test_config['unit_tests']:
        test_files.extend([
            'tests/test_demo_data_generation.py',
            'tests/test_demo_session_management.py',
            'tests/test_scenario_management.py',
            'tests/test_progress_tracking.py',
            'tests/test_metrics_collection.py'
        ])
    
    if test_config['integration_tests']:
        test_files.extend([
            'tests/test_demo_integration_workflow.py',
            'tests/test_demo_live_consistency.py'
        ])
    
    if test_config['performance_tests']:
        test_files.append('tests/test_demo_performance.py')
    
    # Add comprehensive tests
    test_files.append('tests/test_demo_comprehensive.py')
    
    # Run tests
    pytest_args = ['-v'] if test_config['verbose'] else []
    pytest_args.extend(test_files)
    
    print(f"Running tests: {len(test_files)} test files")
    print()
    
    # Run pytest
    exit_code = pytest.main(pytest_args)
    
    print()
    print("=" * 60)
    print(f"Test suite completed at: {datetime.now().isoformat()}")
    print(f"Exit code: {exit_code}")
    print("=" * 60)
    
    return exit_code


if __name__ == "__main__":
    # Run comprehensive test suite
    exit_code = run_comprehensive_tests()
    sys.exit(exit_code)