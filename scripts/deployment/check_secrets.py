#!/usr/bin/env python3

"""
NeoHarbour Security - Secrets Validation Script
Checks for required secrets and credentials for deployment
"""

import sys
import os
import yaml
import boto3
from pathlib import Path
from typing import Dict, List, Any, Optional

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

class SecretsChecker:
    """Checks for required secrets and credentials"""
    
    def __init__(self, environment: str):
        self.environment = environment
        self.project_root = project_root
        self.config_file = self.project_root / "config" / "environments" / f"{environment}.yaml"
        self.errors = []
        self.warnings = []
        
    def load_config(self) -> Dict[str, Any]:
        """Load environment configuration"""
        if not self.config_file.exists():
            raise FileNotFoundError(f"Configuration file not found: {self.config_file}")
            
        with open(self.config_file, 'r') as f:
            return yaml.safe_load(f)
    
    def check_aws_credentials(self) -> None:
        """Check AWS credentials and permissions"""
        try:
            # Check basic AWS connectivity
            sts = boto3.client('sts')
            identity = sts.get_caller_identity()
            print(f"✅ AWS credentials valid for account: {identity['Account']}")
            
            # Check required permissions
            self._check_aws_permissions()
            
        except Exception as e:
            self.errors.append(f"AWS credentials check failed: {str(e)}")
    
    def _check_aws_permissions(self) -> None:
        """Check required AWS permissions"""
        required_permissions = [
            ('dynamodb', 'list_tables'),
            ('s3', 'list_buckets'),
            ('kms', 'list_keys'),
            ('events', 'list_event_buses'),
            ('states', 'list_state_machines'),
            ('lambda', 'list_functions'),
            ('cloudformation', 'list_stacks'),
        ]
        
        for service, operation in required_permissions:
            try:
                client = boto3.client(service)
                getattr(client, operation)()
                print(f"✅ {service}:{operation} permission available")
            except Exception as e:
                self.warnings.append(f"Permission check failed for {service}:{operation}: {str(e)}")
    
    def check_bedrock_access(self, config: Dict[str, Any]) -> None:
        """Check Bedrock model access"""
        ai_config = config.get('ai', {})
        if ai_config.get('provider') != 'bedrock':
            return
        
        bedrock_config = ai_config.get('bedrock', {})
        region = bedrock_config.get('region')
        text_model = bedrock_config.get('text_model')
        embed_model = bedrock_config.get('embed_model')
        
        if not all([region, text_model, embed_model]):
            self.errors.append("Incomplete Bedrock configuration")
            return
        
        try:
            bedrock = boto3.client('bedrock', region_name=region)
            
            # Check if models are available
            models = bedrock.list_foundation_models()
            available_models = [model['modelId'] for model in models['modelSummaries']]
            
            if text_model not in available_models:
                self.errors.append(f"Bedrock text model not available: {text_model}")
            else:
                print(f"✅ Bedrock text model available: {text_model}")
            
            if embed_model not in available_models:
                self.errors.append(f"Bedrock embedding model not available: {embed_model}")
            else:
                print(f"✅ Bedrock embedding model available: {embed_model}")
                
        except Exception as e:
            self.warnings.append(f"Bedrock access check failed: {str(e)}")
    
    def check_secrets_manager(self, config: Dict[str, Any]) -> None:
        """Check AWS Secrets Manager for required secrets"""
        try:
            secrets_client = boto3.client('secretsmanager')
            
            # Define expected secrets based on environment
            expected_secrets = [
                f"/asia-agentic-soc/{self.environment}/clerk-secret-key",
                f"/asia-agentic-soc/{self.environment}/demo-auth-token",
            ]
            
            # Add connector secrets for staging/prod
            if self.environment in ['staging', 'prod']:
                connector_secrets = [
                    f"/asia-agentic-soc/{self.environment}/sentinel-credentials",
                    f"/asia-agentic-soc/{self.environment}/splunk-credentials",
                    f"/asia-agentic-soc/{self.environment}/defender-credentials",
                    f"/asia-agentic-soc/{self.environment}/crowdstrike-credentials",
                    f"/asia-agentic-soc/{self.environment}/okta-credentials",
                ]
                expected_secrets.extend(connector_secrets)
            
            # Check each secret
            for secret_name in expected_secrets:
                try:
                    secrets_client.describe_secret(SecretId=secret_name)
                    print(f"✅ Secret exists: {secret_name}")
                except secrets_client.exceptions.ResourceNotFoundException:
                    if self.environment == 'prod':
                        self.errors.append(f"Required secret missing: {secret_name}")
                    else:
                        self.warnings.append(f"Optional secret missing: {secret_name}")
                except Exception as e:
                    self.warnings.append(f"Error checking secret {secret_name}: {str(e)}")
                    
        except Exception as e:
            self.warnings.append(f"Secrets Manager check failed: {str(e)}")
    
    def check_environment_variables(self) -> None:
        """Check required environment variables"""
        required_env_vars = [
            'AWS_REGION',
            'AWS_DEFAULT_REGION',
        ]
        
        optional_env_vars = [
            'AWS_PROFILE',
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
        ]
        
        for var in required_env_vars:
            if not os.getenv(var):
                self.errors.append(f"Required environment variable missing: {var}")
            else:
                print(f"✅ Environment variable set: {var}")
        
        for var in optional_env_vars:
            if os.getenv(var):
                print(f"✅ Optional environment variable set: {var}")
    
    def check_ssl_certificates(self, config: Dict[str, Any]) -> None:
        """Check SSL certificates for custom domains"""
        if self.environment == 'dev':
            return  # Dev doesn't use custom domains
        
        frontend_config = config.get('frontend', {})
        backend_config = config.get('backend', {})
        
        ssl_certs = []
        if frontend_config.get('ssl_certificate_arn'):
            ssl_certs.append(('frontend', frontend_config['ssl_certificate_arn']))
        
        if backend_config.get('ssl_certificate_arn'):
            ssl_certs.append(('backend', backend_config['ssl_certificate_arn']))
        
        if not ssl_certs:
            self.warnings.append(f"No SSL certificates configured for {self.environment}")
            return
        
        try:
            acm = boto3.client('acm', region_name='us-east-1')  # ACM for CloudFront is in us-east-1
            
            for cert_type, cert_arn in ssl_certs:
                try:
                    cert_info = acm.describe_certificate(CertificateArn=cert_arn)
                    status = cert_info['Certificate']['Status']
                    
                    if status == 'ISSUED':
                        print(f"✅ SSL certificate valid for {cert_type}: {cert_arn}")
                    else:
                        self.warnings.append(f"SSL certificate not issued for {cert_type}: {status}")
                        
                except Exception as e:
                    self.errors.append(f"SSL certificate check failed for {cert_type}: {str(e)}")
                    
        except Exception as e:
            self.warnings.append(f"ACM access check failed: {str(e)}")
    
    def check_notification_endpoints(self, config: Dict[str, Any]) -> None:
        """Check notification endpoints"""
        notifications = config.get('notifications', {})
        
        # Check Slack webhook
        slack_webhook = notifications.get('slack', {}).get('webhook_url')
        if slack_webhook and slack_webhook != 'null':
            if not slack_webhook.startswith('https://hooks.slack.com/'):
                self.warnings.append("Slack webhook URL format may be incorrect")
            else:
                print("✅ Slack webhook URL format looks correct")
        
        # Check SNS topic
        sns_topic = notifications.get('sns', {}).get('topic_arn')
        if sns_topic and sns_topic != 'null':
            try:
                sns = boto3.client('sns')
                sns.get_topic_attributes(TopicArn=sns_topic)
                print(f"✅ SNS topic accessible: {sns_topic}")
            except Exception as e:
                self.warnings.append(f"SNS topic check failed: {str(e)}")
    
    def check_all_secrets(self) -> bool:
        """Run all secret checks"""
        try:
            config = self.load_config()
            
            print(f"\n=== Checking secrets for {self.environment} environment ===")
            
            self.check_aws_credentials()
            self.check_bedrock_access(config)
            self.check_secrets_manager(config)
            self.check_environment_variables()
            self.check_ssl_certificates(config)
            self.check_notification_endpoints(config)
            
            return len(self.errors) == 0
            
        except Exception as e:
            self.errors.append(f"Secrets check failed: {str(e)}")
            return False
    
    def print_results(self) -> None:
        """Print check results"""
        print(f"\n=== Secrets Check Results for {self.environment} ===")
        
        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"  • {error}")
        
        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  • {warning}")
        
        if not self.errors and not self.warnings:
            print("\n✅ All secret checks passed!")
        elif not self.errors:
            print(f"\n✅ Secret checks passed with {len(self.warnings)} warnings")
        else:
            print(f"\n❌ Secret checks failed with {len(self.errors)} errors and {len(self.warnings)} warnings")

def main():
    """Main function"""
    if len(sys.argv) != 2:
        print("Usage: python check_secrets.py <environment>")
        print("Environment: dev, staging, or prod")
        sys.exit(1)
    
    environment = sys.argv[1]
    
    if environment not in ['dev', 'staging', 'prod']:
        print(f"Invalid environment: {environment}")
        print("Valid environments: dev, staging, prod")
        sys.exit(1)
    
    checker = SecretsChecker(environment)
    success = checker.check_all_secrets()
    checker.print_results()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()