#!/usr/bin/env python3
"""
Security Hub Integration Demo

This script demonstrates the Security Hub connector, cross-account access validation,
and secure data ingestion pipeline capabilities.
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.connectors.securityhub import SecurityHubClient
from src.connectors.cross_account_validator import CrossAccountValidator
from src.connectors.secure_ingestion_pipeline import (
    SecureIngestionPipeline, 
    IngestionConfig, 
    IngestionStatus
)


def print_section(title: str) -> None:
    """Print a formatted section header."""
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")


def print_json(data: dict, title: str = "") -> None:
    """Print JSON data with formatting."""
    if title:
        print(f"\n{title}:")
    print(json.dumps(data, indent=2, default=str))


async def demo_security_hub_connector():
    """Demonstrate Security Hub connector functionality."""
    print_section("Security Hub Connector Demo")
    
    # Initialize Security Hub client (will use fixture data if AWS not configured)
    client = SecurityHubClient(region="us-east-1")
    
    print("\n1. Fetching recent Security Hub findings...")
    findings = client.fetch_recent_findings(limit=5, hours_back=24)
    print(f"Retrieved {len(findings)} findings")
    
    if findings:
        sample_finding = findings[0]
        print_json(sample_finding, "Sample Finding")
        
        print(f"\nFinding Analysis:")
        print(f"  - Risk Score: {sample_finding['risk_score']:.3f}")
        print(f"  - Threat Category: {sample_finding['threat_category']}")
        print(f"  - Remediation Priority: {sample_finding['remediation_priority']}")
        print(f"  - Compliance Frameworks: {sample_finding.get('compliance_frameworks', [])}")
    
    print("\n2. Fetching critical severity findings...")
    critical_findings = client.fetch_critical_findings(limit=3)
    print(f"Retrieved {len(critical_findings)} critical findings")
    
    print("\n3. Fetching compliance-related findings...")
    compliance_findings = client.fetch_compliance_findings(limit=3)
    print(f"Retrieved {len(compliance_findings)} compliance findings")
    
    print("\n4. Fetching findings from specific security products...")
    product_arns = [
        "arn:aws:securityhub:us-east-1::product/aws/guardduty",
        "arn:aws:securityhub:us-east-1::product/aws/config"
    ]
    product_findings = client.fetch_findings_by_product(product_arns, limit=3)
    print(f"Retrieved {len(product_findings)} findings from specific products")


def demo_cross_account_validation():
    """Demonstrate cross-account access validation."""
    print_section("Cross-Account Access Validation Demo")
    
    # Initialize validator
    validator = CrossAccountValidator(region="us-east-1")
    
    # Demo customer account details
    customer_account_id = "123456789012"
    role_arn = f"arn:aws:iam::{customer_account_id}:role/NeoHarbourSecurityHubAccess"
    external_id = f"neoharbour-{customer_account_id}"
    
    print("\n1. Generating Security Hub setup guide...")
    setup_guide = validator.generate_security_hub_setup_guide(customer_account_id)
    
    print(f"Role ARN: {setup_guide['role_arn']}")
    print(f"External ID: {setup_guide['external_id']}")
    required_perms = setup_guide['permissions_policy']['Statement'][0]['Action']
    print(f"Required Permissions: {len(required_perms)} permissions")
    
    print("\nSetup Steps:")
    for step in setup_guide['setup_steps']:
        print(f"  {step}")
    
    print("\n2. Generating multi-service setup guide...")
    multi_service_guide = validator.generate_multi_service_setup_guide(customer_account_id)
    
    print(f"Services: {', '.join(multi_service_guide['services'])}")
    print(f"Total Permissions: {len(multi_service_guide['permissions_policy']['Statement'][0]['Action'])}")
    
    print("\n3. Simulating access validation...")
    # Note: This would normally validate against real AWS resources
    print("Validation would test:")
    print("  - STS role assumption")
    print("  - Security Hub service access")
    print("  - Findings retrieval permissions")
    print("  - Cross-account trust relationship")
    
    # Show what a successful validation would look like
    mock_validation_result = {
        "valid": True,
        "service": "securityhub",
        "customer_account_id": customer_account_id,
        "role_arn": role_arn,
        "errors": [],
        "warnings": [],
        "test_results": [
            {
                "method": "describe_hub",
                "description": "Verify Security Hub is enabled",
                "passed": True,
                "response_summary": "Hub ARN: arn:aws:securityhub:us-east-1:123456789012:hub/default"
            },
            {
                "method": "get_findings",
                "description": "Test findings access with limit=1",
                "passed": True,
                "response_summary": "Retrieved 1 findings"
            }
        ]
    }
    
    print_json(mock_validation_result, "Mock Validation Result")


async def demo_secure_ingestion_pipeline():
    """Demonstrate secure data ingestion pipeline."""
    print_section("Secure Data Ingestion Pipeline Demo")
    
    # Initialize pipeline
    pipeline = SecureIngestionPipeline()
    
    # Create ingestion configuration
    config = IngestionConfig(
        source_type="securityhub",
        customer_account_id="123456789012",
        role_arn="arn:aws:iam::123456789012:role/NeoHarbourSecurityHubAccess",
        external_id="neoharbour-123456789012",
        region="us-east-1",
        batch_size=10,
        max_retries=3,
        hours_back=24,
        severity_filter=["HIGH", "CRITICAL"]
    )
    
    print("\n1. Ingestion Configuration:")
    print(f"  - Source Type: {config.source_type}")
    print(f"  - Customer Account: {config.customer_account_id}")
    print(f"  - Batch Size: {config.batch_size}")
    print(f"  - Max Retries: {config.max_retries}")
    print(f"  - Severity Filter: {config.severity_filter}")
    
    print("\n2. Starting Security Hub findings ingestion...")
    
    # Progress callback to show real-time updates
    def progress_callback(result):
        print(f"  Status: {result.status.value}")
        print(f"  Records Processed: {result.records_processed}")
        print(f"  Successful: {result.records_successful}")
        print(f"  Failed: {result.records_failed}")
        print(f"  Retry Attempts: {result.retry_attempts}")
        if result.errors:
            print(f"  Errors: {len(result.errors)}")
    
    # Note: This would normally connect to real AWS services
    # For demo purposes, we'll simulate the process
    print("  [Simulated] Assuming cross-account role...")
    print("  [Simulated] Connecting to Security Hub...")
    print("  [Simulated] Fetching findings batch...")
    print("  [Simulated] Processing findings through investigation pipeline...")
    
    # Show what a successful ingestion result would look like
    mock_result = {
        "status": "success",
        "records_processed": 25,
        "records_successful": 23,
        "records_failed": 2,
        "retry_attempts": 1,
        "total_duration_seconds": 45.2,
        "errors": [
            {
                "timestamp": datetime.utcnow().isoformat(),
                "error_type": "ValidationError",
                "error_message": "Invalid finding format",
                "context": "Record processing failed"
            }
        ],
        "warnings": []
    }
    
    print_json(mock_result, "Mock Ingestion Result")
    
    print("\n3. Pipeline Metrics:")
    metrics = pipeline.get_ingestion_metrics()
    print_json(metrics, "Current Pipeline Metrics")


def demo_error_handling_and_retry():
    """Demonstrate error handling and retry logic."""
    print_section("Error Handling and Retry Logic Demo")
    
    print("\n1. Common Error Scenarios:")
    
    error_scenarios = [
        {
            "error": "AccessDenied",
            "description": "Insufficient permissions for Security Hub access",
            "resolution": "Verify IAM role permissions and trust relationship"
        },
        {
            "error": "InvalidAccessException", 
            "description": "Security Hub not enabled in target account",
            "resolution": "Enable Security Hub service in customer account"
        },
        {
            "error": "ThrottlingException",
            "description": "API rate limit exceeded",
            "resolution": "Automatic retry with exponential backoff"
        },
        {
            "error": "AssumeRoleFailure",
            "description": "Cannot assume cross-account role",
            "resolution": "Check role ARN, external ID, and trust policy"
        }
    ]
    
    for i, scenario in enumerate(error_scenarios, 1):
        print(f"\n{i}. {scenario['error']}")
        print(f"   Description: {scenario['description']}")
        print(f"   Resolution: {scenario['resolution']}")
    
    print("\n2. Retry Strategy:")
    print("   - Initial retry delay: 1.0 seconds")
    print("   - Backoff multiplier: 2.0x")
    print("   - Maximum retry delay: 60 seconds")
    print("   - Maximum retries: 3 attempts")
    print("   - Exponential backoff: 1s → 2s → 4s → 8s")
    
    print("\n3. Circuit Breaker Logic:")
    print("   - Maximum consecutive errors: 5")
    print("   - Continue on error: Configurable")
    print("   - Error threshold monitoring")
    print("   - Automatic failure detection")


def demo_compliance_and_security():
    """Demonstrate compliance and security features."""
    print_section("Compliance and Security Features Demo")
    
    print("\n1. Security Features:")
    security_features = [
        "Cross-account IAM role assumption with external ID",
        "Encrypted data transmission (TLS/SSL)",
        "Least privilege access permissions",
        "Audit logging of all access attempts",
        "Session token rotation and expiration",
        "Input validation and sanitization"
    ]
    
    for feature in security_features:
        print(f"   ✓ {feature}")
    
    print("\n2. Compliance Frameworks Supported:")
    frameworks = [
        "PCI DSS - Payment Card Industry Data Security Standard",
        "NIST 800-53 - National Institute of Standards and Technology",
        "CIS - Center for Internet Security Benchmarks",
        "AWS Foundational Security Standard",
        "SOC 2 - Service Organization Control 2",
        "ISO 27001 - Information Security Management"
    ]
    
    for framework in frameworks:
        print(f"   ✓ {framework}")
    
    print("\n3. Data Protection:")
    print("   ✓ Data encrypted in transit and at rest")
    print("   ✓ Immutable audit logs with S3 Object Lock")
    print("   ✓ KMS encryption for sensitive data")
    print("   ✓ No persistent storage of customer credentials")
    print("   ✓ Automatic credential rotation")
    
    print("\n4. Monitoring and Alerting:")
    print("   ✓ Real-time ingestion status monitoring")
    print("   ✓ Error rate and retry attempt tracking")
    print("   ✓ Performance metrics collection")
    print("   ✓ Automated failure notifications")
    print("   ✓ Compliance violation alerts")


async def main():
    """Run all demo scenarios."""
    print("Security Hub Integration and Cross-Account Access Demo")
    print("=" * 60)
    print("This demo showcases the Security Hub connector capabilities,")
    print("cross-account access validation, and secure data ingestion.")
    print("\nNote: This demo uses fixture data when AWS services are not configured.")
    
    try:
        # Run all demo scenarios
        await demo_security_hub_connector()
        demo_cross_account_validation()
        await demo_secure_ingestion_pipeline()
        demo_error_handling_and_retry()
        demo_compliance_and_security()
        
        print_section("Demo Complete")
        print("All Security Hub integration features demonstrated successfully!")
        print("\nNext Steps:")
        print("1. Configure AWS credentials and cross-account roles")
        print("2. Enable Security Hub in customer accounts")
        print("3. Test real data ingestion with validation endpoints")
        print("4. Set up monitoring and alerting for production use")
        
    except Exception as e:
        print(f"\nDemo failed with error: {e}")
        print("This is expected if AWS services are not configured.")


if __name__ == "__main__":
    asyncio.run(main())