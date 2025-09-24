#!/usr/bin/env python3

"""
NeoHarbour Security - Configuration Validation Script
Validates environment-specific configuration files for deployment
"""

import sys
import os
import yaml
import json
import boto3
from pathlib import Path
from typing import Dict, List, Any, Optional

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

class ConfigValidator:
    """Validates deployment configuration for NeoHarbour Security"""
    
    def __init__(self, environment: str):
        self.environment = environment
        self.project_root = project_root
        self.config_file = self.project_root / "config" / "environments" / f"{environment}.yaml"
        self.sam_config_file = self.project_root / "config" / "sam-configs" / f"samconfig-{environment}.toml"
        self.errors = []
        self.warnings = []
        
    def load_config(self) -> Dict[str, Any]:
        """Load environment configuration"""
        if not self.config_file.exists():
            raise FileNotFoundError(f"Configuration file not found: {self.config_file}")
            
        with open(self.config_file, 'r') as f:
            return yaml.safe_load(f)
    
    def validate_aws_config(self, config: Dict[str, Any]) -> None:
        """Validate AWS configuration"""
        aws_config = config.get('aws', {})
        
        # Required AWS fields
        required_fields = ['account_id', 'region']
        for field in required_fields:
            if not aws_config.get(field):
                self.errors.append(f"Missing required AWS field: {field}")
        
        # Validate account ID format
        account_id = aws_config.get('account_id', '')
        if account_id and (not account_id.isdigit() or len(account_id) != 12):
            self.errors.append(f"Invalid AWS account ID format: {account_id}")
        
        # Validate region
        region = aws_config.get('region', '')
        valid_regions = [
            'us-east-1', 'us-west-2', 'ap-southeast-1', 'ap-northeast-1',
            'eu-west-1', 'eu-central-1'
        ]
        if region and region not in valid_regions:
            self.warnings.append(f"Uncommon AWS region: {region}")
        
        # Validate DynamoDB configuration
        dynamodb_config = aws_config.get('dynamodb', {})
        required_tables = ['investigations_table', 'metrics_table', 'demo_sessions_table', 'agents_table']
        for table in required_tables:
            if not dynamodb_config.get(table):
                self.errors.append(f"Missing DynamoDB table configuration: {table}")
        
        # Validate S3 configuration
        s3_config = aws_config.get('s3', {})
        required_buckets = ['artifacts_bucket', 'audit_bucket']
        for bucket in required_buckets:
            if not s3_config.get(bucket):
                self.errors.append(f"Missing S3 bucket configuration: {bucket}")
        
        # Validate bucket naming
        for bucket_key in required_buckets:
            bucket_name = s3_config.get(bucket_key, '')
            if bucket_name:
                if not self._is_valid_s3_bucket_name(bucket_name):
                    self.errors.append(f"Invalid S3 bucket name: {bucket_name}")
    
    def validate_ai_config(self, config: Dict[str, Any]) -> None:
        """Validate AI configuration"""
        ai_config = config.get('ai', {})
        
        provider = ai_config.get('provider')
        if not provider:
            self.errors.append("Missing AI provider configuration")
        elif provider not in ['bedrock', 'kiro', 'amazonq']:
            self.errors.append(f"Invalid AI provider: {provider}")
        
        if provider == 'bedrock':
            bedrock_config = ai_config.get('bedrock', {})
            required_fields = ['region', 'text_model', 'embed_model']
            for field in required_fields:
                if not bedrock_config.get(field):
                    self.errors.append(f"Missing Bedrock configuration: {field}")
    
    def validate_demo_config(self, config: Dict[str, Any]) -> None:
        """Validate demo configuration"""
        demo_config = config.get('demo', {})
        
        if not demo_config.get('default_tenant_id'):
            self.errors.append("Missing demo default_tenant_id")
        
        max_sessions = demo_config.get('max_concurrent_sessions', 0)
        if max_sessions <= 0:
            self.errors.append("Invalid max_concurrent_sessions value")
        
        timeout = demo_config.get('session_timeout_minutes', 0)
        if timeout <= 0:
            self.errors.append("Invalid session_timeout_minutes value")
    
    def validate_security_config(self, config: Dict[str, Any]) -> None:
        """Validate security configuration"""
        security_config = config.get('security', {})
        
        # Check encryption settings
        if not security_config.get('encryption_at_rest'):
            self.warnings.append("Encryption at rest is disabled")
        
        if not security_config.get('encryption_in_transit'):
            self.warnings.append("Encryption in transit is disabled")
        
        # Production-specific security checks
        if self.environment == 'prod':
            if not security_config.get('vpc_enabled'):
                self.errors.append("VPC must be enabled for production")
            
            if not security_config.get('waf_enabled'):
                self.warnings.append("WAF is not enabled for production")
    
    def validate_monitoring_config(self, config: Dict[str, Any]) -> None:
        """Validate monitoring configuration"""
        monitoring_config = config.get('monitoring', {})
        
        if self.environment in ['staging', 'prod']:
            if not monitoring_config.get('alarms_enabled'):
                self.warnings.append(f"CloudWatch alarms should be enabled for {self.environment}")
            
            if not monitoring_config.get('alarm_notification_topic'):
                self.warnings.append(f"Alarm notification topic should be configured for {self.environment}")
    
    def validate_compliance_config(self, config: Dict[str, Any]) -> None:
        """Validate compliance configuration"""
        compliance_config = config.get('compliance', {})
        
        if not compliance_config.get('audit_logging_enabled'):
            self.errors.append("Audit logging must be enabled")
        
        retention_days = compliance_config.get('data_retention_days', 0)
        if retention_days < 30:
            self.warnings.append(f"Data retention period is less than 30 days: {retention_days}")
        
        # HKMA compliance requirements
        if self.environment == 'prod':
            if not compliance_config.get('hkma_compliance_enabled'):
                self.errors.append("HKMA compliance must be enabled for production")
            
            if retention_days < 2555:  # 7 years
                self.errors.append(f"HKMA requires 7 years data retention, configured: {retention_days} days")
    
    def validate_sam_config(self) -> None:
        """Validate SAM configuration file"""
        if not self.sam_config_file.exists():
            self.errors.append(f"SAM configuration file not found: {self.sam_config_file}")
            return
        
        # Basic TOML syntax validation would go here
        # For now, just check if file exists and is readable
        try:
            with open(self.sam_config_file, 'r') as f:
                content = f.read()
                if not content.strip():
                    self.errors.append("SAM configuration file is empty")
        except Exception as e:
            self.errors.append(f"Error reading SAM configuration: {str(e)}")
    
    def validate_aws_connectivity(self, config: Dict[str, Any]) -> None:
        """Validate AWS connectivity and permissions"""
        try:
            # Check basic AWS connectivity
            sts = boto3.client('sts')
            identity = sts.get_caller_identity()
            
            current_account = identity['Account']
            expected_account = config['aws']['account_id']
            
            if current_account != expected_account:
                self.errors.append(f"AWS account mismatch. Expected: {expected_account}, Current: {current_account}")
            
            # Check region
            session = boto3.Session()
            current_region = session.region_name
            expected_region = config['aws']['region']
            
            if current_region != expected_region:
                self.errors.append(f"AWS region mismatch. Expected: {expected_region}, Current: {current_region}")
            
        except Exception as e:
            self.errors.append(f"AWS connectivity check failed: {str(e)}")
    
    def _is_valid_s3_bucket_name(self, bucket_name: str) -> bool:
        """Validate S3 bucket name format"""
        if len(bucket_name) < 3 or len(bucket_name) > 63:
            return False
        
        if not bucket_name.replace('-', '').replace('.', '').isalnum():
            return False
        
        if bucket_name.startswith('-') or bucket_name.endswith('-'):
            return False
        
        if '..' in bucket_name:
            return False
        
        return True
    
    def validate(self) -> bool:
        """Run all validations"""
        try:
            config = self.load_config()
            
            self.validate_aws_config(config)
            self.validate_ai_config(config)
            self.validate_demo_config(config)
            self.validate_security_config(config)
            self.validate_monitoring_config(config)
            self.validate_compliance_config(config)
            self.validate_sam_config()
            self.validate_aws_connectivity(config)
            
            return len(self.errors) == 0
            
        except Exception as e:
            self.errors.append(f"Configuration validation failed: {str(e)}")
            return False
    
    def print_results(self) -> None:
        """Print validation results"""
        print(f"\n=== Configuration Validation Results for {self.environment} ===")
        
        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"  • {error}")
        
        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  • {warning}")
        
        if not self.errors and not self.warnings:
            print("\n✅ All validations passed!")
        elif not self.errors:
            print(f"\n✅ Validation passed with {len(self.warnings)} warnings")
        else:
            print(f"\n❌ Validation failed with {len(self.errors)} errors and {len(self.warnings)} warnings")

def main():
    """Main function"""
    if len(sys.argv) != 2:
        print("Usage: python validate_config.py <environment>")
        print("Environment: dev, staging, or prod")
        sys.exit(1)
    
    environment = sys.argv[1]
    
    if environment not in ['dev', 'staging', 'prod']:
        print(f"Invalid environment: {environment}")
        print("Valid environments: dev, staging, prod")
        sys.exit(1)
    
    validator = ConfigValidator(environment)
    success = validator.validate()
    validator.print_results()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()