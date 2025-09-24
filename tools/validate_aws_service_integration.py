#!/usr/bin/env python3
"""
AWS Service Integration Validation Tool

Validates that all demo and live processing uses actual AWS services
with proper KMS encryption, S3 Object Lock, and complete workflow integration.
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Dict, Any

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Try to load .env file from project root
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print(f"📁 Loaded environment from: {env_path}")
    else:
        print("⚠️  No .env file found, using system environment variables")
except ImportError:
    print("⚠️  python-dotenv not installed, using system environment variables only")

from aws.service_integration import aws_service_integration
from aws.configuration_helper import aws_configuration_helper
from aws.development_mode import development_mode


def print_header(title: str):
    """Print formatted header"""
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")


def print_section(title: str):
    """Print formatted section"""
    print(f"\n{'-'*40}")
    print(f" {title}")
    print(f"{'-'*40}")


def print_result(test_name: str, success: bool, details: str = ""):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"    {details}")


def validate_service_health():
    """Validate all AWS service health checks"""
    print_section("AWS Service Health Validation")
    
    # Check if we're in development mode
    if development_mode.is_development:
        print("🚀 Development Mode Detected")
    
    try:
        validation_result = aws_service_integration.validate_complete_integration()
        
        # Enhance for development mode
        enhanced_result = development_mode.enhance_validation_for_development({
            'all_services_healthy': validation_result.all_services_healthy,
            'service_health_checks': validation_result.service_health_checks,
            'validation_errors': validation_result.validation_errors,
            'recommendations': validation_result.recommendations
        })
        
        # Print overall status
        overall_healthy = validation_result.all_services_healthy
        dev_ready = enhanced_result.get('development_ready', False)
        
        if development_mode.is_development and dev_ready:
            print_result("Overall Service Health", True, "Core services ready for development")
        else:
            print_result("Overall Service Health", overall_healthy)
        
        # Print individual service results
        for health_check in validation_result.service_health_checks:
            success = health_check.status.value != "unavailable"
            
            # In development mode, mark optional services as warnings instead of failures
            if development_mode.is_development and development_mode.should_skip_service(health_check.service_name):
                if not success:
                    success = "warning"  # Special status for optional services
            
            details = f"Response time: {health_check.response_time_ms:.1f}ms"
            if health_check.error_message:
                details += f" | Error: {health_check.error_message}"
            
            if success == "warning":
                status = "⚠️  OPTIONAL"
                print(f"{status} {health_check.service_name} Health")
                print(f"    {details} (Optional in development mode)")
            else:
                print_result(f"{health_check.service_name} Health", success, details)
        
        # Print development mode notes
        if development_mode.is_development and enhanced_result.get('development_notes'):
            print("\n🚀 Development Mode Notes:")
            for note in enhanced_result['development_notes']:
                print(f"    • {note}")
        
        # Print validation errors and recommendations
        if validation_result.validation_errors:
            print("\n❌ Validation Errors:")
            for error in validation_result.validation_errors:
                print(f"    • {error}")
        
        if validation_result.recommendations:
            print("\n💡 Recommendations:")
            for rec in validation_result.recommendations:
                print(f"    • {rec}")
        
        # Return development-aware status
        if development_mode.is_development:
            return dev_ready or overall_healthy
        else:
            return overall_healthy
        
    except Exception as e:
        print_result("Service Health Validation", False, f"Exception: {e}")
        return False


def validate_kms_encryption():
    """Validate KMS encryption compliance"""
    print_section("KMS Encryption Compliance Validation")
    
    try:
        compliance_result = aws_service_integration.ensure_kms_encryption_compliance()
        
        print_result("Overall Encryption Compliance", compliance_result["encryption_compliance"])
        print_result("KMS Key Accessible", compliance_result["kms_key_accessible"])
        print_result("DynamoDB Encryption Enabled", compliance_result["dynamodb_encryption_enabled"])
        print_result("S3 Encryption Enabled", compliance_result["s3_encryption_enabled"])
        print_result("Audit Bucket Object Lock", compliance_result["audit_bucket_object_lock_enabled"])
        
        # Print validation errors and recommendations
        if compliance_result["validation_errors"]:
            print("\n❌ Encryption Validation Errors:")
            for error in compliance_result["validation_errors"]:
                print(f"    • {error}")
        
        if compliance_result["recommendations"]:
            print("\n💡 Encryption Recommendations:")
            for rec in compliance_result["recommendations"]:
                print(f"    • {rec}")
        
        return compliance_result["encryption_compliance"]
        
    except Exception as e:
        print_result("KMS Encryption Validation", False, f"Exception: {e}")
        return False


def validate_workflow_integration():
    """Validate workflow integration with sample investigation"""
    print_section("Workflow Integration Validation")
    
    try:
        # Use a recent investigation ID if available, or create a test one
        investigation_id = f"INV-VALIDATION-{uuid.uuid4().hex[:8]}"
        tenant_id = os.getenv("DEFAULT_TENANT_ID", "validation-tenant")
        
        print(f"Testing with Investigation ID: {investigation_id}")
        print(f"Tenant ID: {tenant_id}")
        
        workflow_result = aws_service_integration.validate_complete_workflow_integration(
            investigation_id, tenant_id
        )
        
        print_result("Overall Workflow Complete", workflow_result["workflow_complete"])
        print_result("EventBridge Delivery", workflow_result["eventbridge_delivery"])
        print_result("Step Function Execution", workflow_result["step_function_execution"])
        print_result("DynamoDB Updates", workflow_result["dynamodb_updates"])
        print_result("S3 Artifacts Created", workflow_result["s3_artifacts_created"])
        
        if workflow_result["execution_arn"]:
            print(f"    Execution ARN: {workflow_result['execution_arn']}")
        
        if workflow_result["execution_time_seconds"] > 0:
            print(f"    Execution Time: {workflow_result['execution_time_seconds']:.1f}s")
        
        # Print Lambda invocations
        if workflow_result["lambda_invocations"]:
            print(f"\n📋 Lambda Invocations ({len(workflow_result['lambda_invocations'])}):")
            for invocation in workflow_result["lambda_invocations"]:
                status = "✅" if invocation["success"] else "❌"
                print(f"    {status} {invocation['function_name']}")
        
        # Print validation errors
        if workflow_result["validation_errors"]:
            print("\n❌ Workflow Validation Errors:")
            for error in workflow_result["validation_errors"]:
                print(f"    • {error}")
        
        return workflow_result["workflow_complete"]
        
    except Exception as e:
        print_result("Workflow Integration Validation", False, f"Exception: {e}")
        return False


def run_end_to_end_test():
    """Run end-to-end processing test"""
    print_section("End-to-End Processing Test")
    
    try:
        # Create test alert
        test_alert = {
            "investigationId": f"INV-E2E-{uuid.uuid4().hex[:8]}",
            "tenantId": os.getenv("DEFAULT_TENANT_ID", "e2e-test-tenant"),
            "alert": {
                "source": "validation-test",
                "title": "AWS Service Integration Validation Test",
                "description": "End-to-end test alert for validating AWS service integration",
                "severity": "medium",
                "entities": [
                    {"type": "test", "value": "aws-integration-validation"}
                ],
                "tactics": ["Testing"],
                "isDemo": True,
                "scenarioType": "integration-test",
                "isFalsePositive": False
            },
            "receivedAt": datetime.now(timezone.utc).isoformat(),
            "demoMetadata": {
                "scenarioType": "integration-test",
                "isFalsePositive": False,
                "isDemo": True
            },
            "source": "asia.agentic.soc.integration.test"
        }
        
        print(f"Testing with Investigation ID: {test_alert['investigationId']}")
        print(f"Tenant ID: {test_alert['tenantId']}")
        
        # Run end-to-end test
        test_result = aws_service_integration.test_end_to_end_processing(test_alert)
        
        print_result("Overall Test Success", test_result["test_successful"])
        print_result("EventBridge Sent", test_result["eventbridge_sent"])
        print_result("Step Function Triggered", test_result["step_function_triggered"])
        print_result("All Lambdas Executed", test_result["all_lambdas_executed"])
        print_result("Bedrock Analysis Completed", test_result["bedrock_analysis_completed"])
        print_result("DynamoDB Records Created", test_result["dynamodb_records_created"])
        print_result("S3 Artifacts Stored", test_result["s3_artifacts_stored"])
        print_result("KMS Encryption Verified", test_result["kms_encryption_verified"])
        print_result("Compliance Artifacts Generated", test_result["compliance_artifacts_generated"])
        
        if test_result["total_processing_time_seconds"] > 0:
            print(f"    Total Processing Time: {test_result['total_processing_time_seconds']:.1f}s")
        
        # Print validation errors and recommendations
        if test_result["validation_errors"]:
            print("\n❌ End-to-End Test Errors:")
            for error in test_result["validation_errors"]:
                print(f"    • {error}")
        
        if test_result["recommendations"]:
            print("\n💡 End-to-End Test Recommendations:")
            for rec in test_result["recommendations"]:
                print(f"    • {rec}")
        
        return test_result["test_successful"]
        
    except Exception as e:
        print_result("End-to-End Processing Test", False, f"Exception: {e}")
        return False


def print_environment_info():
    """Print environment information"""
    print_section("Environment Information")
    
    env_vars = [
        "AWS_REGION",
        "AWS_PROFILE",
        "DDB_INVESTIGATIONS_TABLE",
        "DDB_METRICS_TABLE",
        "ARTIFACTS_BUCKET",
        "AUDIT_BUCKET",
        "KMS_KEY_ID",
        "EVENT_BUS_NAME",
        "STATE_MACHINE_ARN",
        "BEDROCK_TEXT_MODEL",
        "BEDROCK_EMBED_MODEL",
        "DEFAULT_TENANT_ID"
    ]
    
    for var in env_vars:
        value = os.getenv(var, "Not set")
        # Mask sensitive values
        if "KEY" in var or "SECRET" in var:
            value = "***" if value != "Not set" else value
        print(f"  {var}: {value}")


def provide_configuration_guidance():
    """Provide configuration guidance for fixing issues"""
    print_section("Configuration Guidance")
    
    try:
        recommendations = aws_configuration_helper.diagnose_configuration_issues()
        
        if not recommendations:
            print("✅ No configuration issues detected!")
            return
        
        # Group recommendations by priority
        critical_recs = [r for r in recommendations if r.priority == "critical"]
        high_recs = [r for r in recommendations if r.priority == "high"]
        medium_recs = [r for r in recommendations if r.priority == "medium"]
        
        if critical_recs:
            print("\n🚨 CRITICAL Issues (must fix):")
            for rec in critical_recs:
                print(f"  • {rec.resource_type}: {rec.resource_name}")
                print(f"    Status: {rec.current_status}")
                print(f"    Action: {rec.recommended_action}")
                if rec.configuration_command:
                    print(f"    Command: {rec.configuration_command}")
                print()
        
        if high_recs:
            print("\n⚠️  HIGH Priority Issues:")
            for rec in high_recs:
                print(f"  • {rec.resource_type}: {rec.resource_name}")
                print(f"    Status: {rec.current_status}")
                print(f"    Action: {rec.recommended_action}")
                if rec.configuration_command:
                    print(f"    Command: {rec.configuration_command}")
                print()
        
        if medium_recs:
            print("\n💡 MEDIUM Priority Issues:")
            for rec in medium_recs:
                print(f"  • {rec.resource_type}: {rec.resource_name}")
                print(f"    Status: {rec.current_status}")
                print(f"    Action: {rec.recommended_action}")
                if rec.configuration_command:
                    print(f"    Command: {rec.configuration_command}")
                print()
        
        # Generate setup script
        setup_script = aws_configuration_helper.generate_setup_script(recommendations)
        script_path = "setup_aws_resources.sh"
        
        with open(script_path, 'w') as f:
            f.write(setup_script)
        
        print(f"📝 Generated setup script: {script_path}")
        print("   Run this script to automatically fix configuration issues:")
        print(f"   chmod +x {script_path} && ./{script_path}")
        
    except Exception as e:
        print(f"❌ Error generating configuration guidance: {e}")


def main():
    """Main validation function"""
    print_header("AWS Service Integration Validation")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    
    # Print environment info
    print_environment_info()
    
    # Run all validations
    results = []
    
    # 1. Service Health Validation
    service_health_ok = validate_service_health()
    results.append(("Service Health", service_health_ok))
    
    # 2. KMS Encryption Validation
    encryption_ok = validate_kms_encryption()
    results.append(("KMS Encryption", encryption_ok))
    
    # 3. Workflow Integration Validation
    workflow_ok = validate_workflow_integration()
    results.append(("Workflow Integration", workflow_ok))
    
    # 4. End-to-End Test (only if basic services are healthy)
    if service_health_ok:
        e2e_ok = run_end_to_end_test()
        results.append(("End-to-End Test", e2e_ok))
    else:
        print_section("End-to-End Processing Test")
        print("⏭️  SKIPPED - Service health issues detected")
        results.append(("End-to-End Test", False))
    
    # Print summary
    print_header("Validation Summary")
    
    all_passed = True
    for test_name, passed in results:
        print_result(test_name, passed)
        if not passed:
            all_passed = False
    
    # Provide configuration guidance if there are failures
    if not all_passed:
        provide_configuration_guidance()
        
        # Add development mode specific guidance
        if development_mode.is_development:
            print_section("Development Mode Guidance")
            dev_recommendations = development_mode.get_development_recommendations()
            for rec in dev_recommendations:
                print(rec)
    
    print(f"\n{'='*60}")
    if all_passed:
        print("🎉 ALL VALIDATIONS PASSED")
        print("AWS service integration is properly configured for demo and live processing.")
        exit_code = 0
    elif development_mode.is_development and any("development_ready" in str(result) for result in results):
        print("🚀 DEVELOPMENT MODE READY")
        print("Core services are configured. Some optional services need setup for full functionality.")
        exit_code = 0
    else:
        print("❌ SOME VALIDATIONS FAILED")
        print("Please review the errors and configuration guidance above.")
        exit_code = 1
    
    print(f"{'='*60}")
    
    return exit_code


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)