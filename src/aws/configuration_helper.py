"""
AWS Configuration Helper

Provides utilities to help configure and set up AWS resources for the
NeoHarbour Security system when they are missing or misconfigured.
"""

import json
import logging
import os
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

logger = logging.getLogger(__name__)


@dataclass
class ConfigurationRecommendation:
    """Configuration recommendation for AWS resources"""
    resource_type: str
    resource_name: str
    current_status: str
    recommended_action: str
    configuration_command: Optional[str] = None
    priority: str = "medium"  # low, medium, high, critical


class AWSConfigurationHelper:
    """
    Helper class to diagnose and provide recommendations for AWS resource
    configuration issues.
    """
    
    def __init__(self):
        self.region = os.getenv('AWS_REGION', 'us-east-1')
        
        try:
            self.sts = boto3.client('sts')
            self.dynamodb = boto3.client('dynamodb')
            self.s3 = boto3.client('s3')
            self.kms = boto3.client('kms')
            self.eventbridge = boto3.client('events')
            self.stepfunctions = boto3.client('stepfunctions')
            self.lambda_client = boto3.client('lambda')
            self.iam = boto3.client('iam')
        except NoCredentialsError as e:
            logger.error(f"AWS credentials not configured: {e}")
            raise
    
    def diagnose_configuration_issues(self) -> List[ConfigurationRecommendation]:
        """
        Diagnose configuration issues and provide recommendations for fixing them.
        """
        recommendations = []
        
        # Check AWS credentials and basic access
        try:
            identity = self.sts.get_caller_identity()
            account_id = identity['Account']
            logger.info(f"AWS credentials configured for account: {account_id}")
        except Exception as e:
            recommendations.append(ConfigurationRecommendation(
                resource_type="AWS Credentials",
                resource_name="AWS CLI/SDK",
                current_status="Not configured or invalid",
                recommended_action="Configure AWS credentials using 'aws configure' or environment variables",
                configuration_command="aws configure",
                priority="critical"
            ))
            return recommendations
        
        # Check DynamoDB tables
        recommendations.extend(self._check_dynamodb_configuration())
        
        # Check S3 buckets
        recommendations.extend(self._check_s3_configuration())
        
        # Check KMS key
        recommendations.extend(self._check_kms_configuration())
        
        # Check EventBridge
        recommendations.extend(self._check_eventbridge_configuration())
        
        # Check Step Functions
        recommendations.extend(self._check_stepfunctions_configuration())
        
        # Check Lambda functions
        recommendations.extend(self._check_lambda_configuration())
        
        # Check Bedrock access
        recommendations.extend(self._check_bedrock_configuration())
        
        return recommendations
    
    def _check_dynamodb_configuration(self) -> List[ConfigurationRecommendation]:
        """Check DynamoDB table configuration"""
        recommendations = []
        
        investigations_table = os.getenv('DDB_INVESTIGATIONS_TABLE', 'AsiaAgenticSocInvestigations')
        metrics_table = os.getenv('DDB_METRICS_TABLE', 'AsiaAgenticSocMetrics')
        
        for table_name in [investigations_table, metrics_table]:
            try:
                response = self.dynamodb.describe_table(TableName=table_name)
                if response['Table']['TableStatus'] != 'ACTIVE':
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="DynamoDB Table",
                        resource_name=table_name,
                        current_status=f"Status: {response['Table']['TableStatus']}",
                        recommended_action="Wait for table to become ACTIVE or check for issues",
                        priority="high"
                    ))
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceNotFoundException':
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="DynamoDB Table",
                        resource_name=table_name,
                        current_status="Not found",
                        recommended_action="Create table using SAM template deployment",
                        configuration_command="sam build && sam deploy --guided",
                        priority="critical"
                    ))
                else:
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="DynamoDB Table",
                        resource_name=table_name,
                        current_status=f"Error: {e.response['Error']['Code']}",
                        recommended_action="Check IAM permissions for DynamoDB access",
                        priority="high"
                    ))
        
        return recommendations
    
    def _check_s3_configuration(self) -> List[ConfigurationRecommendation]:
        """Check S3 bucket configuration"""
        recommendations = []
        
        artifacts_bucket = os.getenv('ARTIFACTS_BUCKET', 'asia-agentic-soc-artifacts-216927688159')
        audit_bucket = os.getenv('AUDIT_BUCKET', 'asia-agentic-soc-audit-216927688159')
        
        for bucket_name in [artifacts_bucket, audit_bucket]:
            try:
                self.s3.head_bucket(Bucket=bucket_name)
                
                # Check encryption
                try:
                    encryption = self.s3.get_bucket_encryption(Bucket=bucket_name)
                    if not any(rule.get('ApplyServerSideEncryptionByDefault', {}).get('SSEAlgorithm') == 'aws:kms' 
                              for rule in encryption.get('ServerSideEncryptionConfiguration', {}).get('Rules', [])):
                        recommendations.append(ConfigurationRecommendation(
                            resource_type="S3 Bucket Encryption",
                            resource_name=bucket_name,
                            current_status="Not using KMS encryption",
                            recommended_action="Enable KMS encryption for compliance",
                            priority="high"
                        ))
                except ClientError:
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="S3 Bucket Encryption",
                        resource_name=bucket_name,
                        current_status="No encryption configured",
                        recommended_action="Configure KMS encryption using SAM template",
                        priority="high"
                    ))
                
                # Check Object Lock for audit bucket
                if 'audit' in bucket_name:
                    try:
                        object_lock = self.s3.get_object_lock_configuration(Bucket=bucket_name)
                        if object_lock.get('ObjectLockConfiguration', {}).get('ObjectLockEnabled') != 'Enabled':
                            recommendations.append(ConfigurationRecommendation(
                                resource_type="S3 Object Lock",
                                resource_name=bucket_name,
                                current_status="Object Lock not enabled",
                                recommended_action="Enable Object Lock for compliance (requires new bucket)",
                                priority="high"
                            ))
                    except ClientError:
                        recommendations.append(ConfigurationRecommendation(
                            resource_type="S3 Object Lock",
                            resource_name=bucket_name,
                            current_status="Object Lock not configured",
                            recommended_action="Create new bucket with Object Lock enabled",
                            priority="high"
                        ))
                        
            except ClientError as e:
                if e.response['Error']['Code'] == '404':
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="S3 Bucket",
                        resource_name=bucket_name,
                        current_status="Not found",
                        recommended_action="Create bucket using SAM template deployment",
                        configuration_command="sam build && sam deploy --guided",
                        priority="critical"
                    ))
                else:
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="S3 Bucket",
                        resource_name=bucket_name,
                        current_status=f"Error: {e.response['Error']['Code']}",
                        recommended_action="Check IAM permissions for S3 access",
                        priority="high"
                    ))
        
        return recommendations
    
    def _check_kms_configuration(self) -> List[ConfigurationRecommendation]:
        """Check KMS key configuration"""
        recommendations = []
        
        kms_key_id = (
            os.getenv('KMS_KEY_ID') or 
            os.getenv('KMS_KEY_ARN') or 
            'alias/AsiaAgenticSoc'
        )
        
        try:
            response = self.kms.describe_key(KeyId=kms_key_id)
            key_metadata = response['KeyMetadata']
            
            if key_metadata['KeyState'] != 'Enabled':
                recommendations.append(ConfigurationRecommendation(
                    resource_type="KMS Key",
                    resource_name=kms_key_id,
                    current_status=f"Key state: {key_metadata['KeyState']}",
                    recommended_action="Enable KMS key",
                    priority="high"
                ))
            
            # Check key rotation
            try:
                rotation = self.kms.get_key_rotation_status(KeyId=kms_key_id)
                if not rotation.get('KeyRotationEnabled', False):
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="KMS Key Rotation",
                        resource_name=kms_key_id,
                        current_status="Key rotation disabled",
                        recommended_action="Enable automatic key rotation for security",
                        configuration_command=f"aws kms enable-key-rotation --key-id {kms_key_id}",
                        priority="medium"
                    ))
            except ClientError:
                pass  # Key rotation check is optional
                
        except ClientError as e:
            if e.response['Error']['Code'] == 'NotFoundException':
                recommendations.append(ConfigurationRecommendation(
                    resource_type="KMS Key",
                    resource_name=kms_key_id,
                    current_status="Not found",
                    recommended_action="Create KMS key using SAM template deployment",
                    configuration_command="sam build && sam deploy --guided",
                    priority="critical"
                ))
            else:
                recommendations.append(ConfigurationRecommendation(
                    resource_type="KMS Key",
                    resource_name=kms_key_id,
                    current_status=f"Error: {e.response['Error']['Code']}",
                    recommended_action="Check IAM permissions for KMS access",
                    priority="high"
                ))
        
        return recommendations
    
    def _check_eventbridge_configuration(self) -> List[ConfigurationRecommendation]:
        """Check EventBridge configuration"""
        recommendations = []
        
        event_bus_name = os.getenv('EVENT_BUS_NAME', 'AsiaAgenticSocBus')
        
        try:
            self.eventbridge.describe_event_bus(Name=event_bus_name)
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                if event_bus_name == 'default':
                    # Default bus should always exist
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="EventBridge",
                        resource_name=event_bus_name,
                        current_status="Default bus access issue",
                        recommended_action="Check IAM permissions for EventBridge access",
                        priority="high"
                    ))
                else:
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="EventBridge Custom Bus",
                        resource_name=event_bus_name,
                        current_status="Not found",
                        recommended_action="Create custom EventBridge bus or use default bus",
                        configuration_command="sam build && sam deploy --guided",
                        priority="medium"
                    ))
            else:
                recommendations.append(ConfigurationRecommendation(
                    resource_type="EventBridge",
                    resource_name=event_bus_name,
                    current_status=f"Error: {e.response['Error']['Code']}",
                    recommended_action="Check IAM permissions for EventBridge access",
                    priority="high"
                ))
        
        return recommendations
    
    def _check_stepfunctions_configuration(self) -> List[ConfigurationRecommendation]:
        """Check Step Functions configuration"""
        recommendations = []
        
        state_machine_arn = (
            os.getenv('STATE_MACHINE_ARN') or 
            os.getenv('SOC_PIPELINE_SFN_ARN') or 
            os.getenv('STEP_FUNCTIONS_ARN') or 
            os.getenv('PIPELINE_STATE_MACHINE_ARN')
        )
        
        if not state_machine_arn:
            recommendations.append(ConfigurationRecommendation(
                resource_type="Step Functions State Machine",
                resource_name="AsiaAgenticSocStateMachine",
                current_status="ARN not configured",
                recommended_action="Deploy Step Functions state machine and configure STATE_MACHINE_ARN",
                configuration_command="sam build && sam deploy --guided",
                priority="critical"
            ))
        else:
            try:
                response = self.stepfunctions.describe_state_machine(stateMachineArn=state_machine_arn)
                if response['status'] != 'ACTIVE':
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="Step Functions State Machine",
                        resource_name=state_machine_arn,
                        current_status=f"Status: {response['status']}",
                        recommended_action="Check state machine configuration and dependencies",
                        priority="high"
                    ))
            except ClientError as e:
                recommendations.append(ConfigurationRecommendation(
                    resource_type="Step Functions State Machine",
                    resource_name=state_machine_arn,
                    current_status=f"Error: {e.response['Error']['Code']}",
                    recommended_action="Deploy Step Functions state machine using SAM template",
                    configuration_command="sam build && sam deploy --guided",
                    priority="critical"
                ))
        
        return recommendations
    
    def _check_lambda_configuration(self) -> List[ConfigurationRecommendation]:
        """Check Lambda functions configuration"""
        recommendations = []
        
        try:
            response = self.lambda_client.list_functions(MaxItems=100)
            functions = response.get('Functions', [])
            
            # Expected pipeline functions
            expected_functions = [
                'AsiaAgenticSoc-Ingest',
                'AsiaAgenticSoc-Context', 
                'AsiaAgenticSoc-Summarize',
                'AsiaAgenticSoc-Risk',
                'AsiaAgenticSoc-Audit',
                'AsiaAgenticSoc-Approval',
                'AsiaAgenticSoc-AutoRemediate',
                'AsiaAgenticSoc-Adapt'
            ]
            
            function_names = [func['FunctionName'] for func in functions]
            pipeline_functions = [name for name in function_names if any(expected in name for expected in expected_functions)]
            
            if len(pipeline_functions) < 5:
                recommendations.append(ConfigurationRecommendation(
                    resource_type="Lambda Functions",
                    resource_name="Pipeline Functions",
                    current_status=f"Only {len(pipeline_functions)} pipeline functions found",
                    recommended_action="Deploy all Lambda functions using SAM template",
                    configuration_command="sam build && sam deploy --guided",
                    priority="critical"
                ))
            
            # Check function health
            for func_name in pipeline_functions[:3]:  # Check first 3 functions
                try:
                    func_response = self.lambda_client.get_function(FunctionName=func_name)
                    if func_response['Configuration']['State'] != 'Active':
                        recommendations.append(ConfigurationRecommendation(
                            resource_type="Lambda Function",
                            resource_name=func_name,
                            current_status=f"State: {func_response['Configuration']['State']}",
                            recommended_action="Check function configuration and dependencies",
                            priority="medium"
                        ))
                except ClientError:
                    pass  # Individual function check is optional
                    
        except ClientError as e:
            recommendations.append(ConfigurationRecommendation(
                resource_type="Lambda Functions",
                resource_name="Service Access",
                current_status=f"Error: {e.response['Error']['Code']}",
                recommended_action="Check IAM permissions for Lambda access",
                priority="high"
            ))
        
        return recommendations
    
    def _check_bedrock_configuration(self) -> List[ConfigurationRecommendation]:
        """Check Bedrock configuration"""
        recommendations = []
        
        bedrock_text_model = (
            os.getenv('BEDROCK_TEXT_MODEL') or 
            os.getenv('BEDROCK_TEXT_MODEL_ID') or
            os.getenv('BEDROCK_MODEL_ID') or
            os.getenv('DEFAULT_BEDROCK_MODEL_ID') or
            'anthropic.claude-3-haiku-20240307-v1:0'
        )
        
        try:
            bedrock = boto3.client('bedrock-runtime', region_name=self.region)
            
            # Try to list foundation models first
            try:
                bedrock_client = boto3.client('bedrock', region_name=self.region)
                models_response = bedrock_client.list_foundation_models()
                available_models = [model['modelId'] for model in models_response.get('modelSummaries', [])]
                
                if bedrock_text_model not in available_models:
                    recommendations.append(ConfigurationRecommendation(
                        resource_type="Bedrock Model",
                        resource_name=bedrock_text_model,
                        current_status="Model not available in region",
                        recommended_action=f"Use available model or change region. Available models: {available_models[:3]}",
                        priority="high"
                    ))
            except ClientError:
                # If list models fails, try direct model access
                test_body = {"inputText": "test", "textGenerationConfig": {"maxTokenCount": 1}}
                try:
                    bedrock.invoke_model(
                        modelId=bedrock_text_model,
                        body=json.dumps(test_body).encode('utf-8'),
                        accept='application/json',
                        contentType='application/json'
                    )
                except ClientError as e:
                    if "ValidationException" in str(e) and "unsupported countries" in str(e):
                        recommendations.append(ConfigurationRecommendation(
                            resource_type="Bedrock Access",
                            resource_name="Regional Availability",
                            current_status="Not available in current region/country",
                            recommended_action="Use supported region or alternative AI provider",
                            priority="high"
                        ))
                    elif "AccessDeniedException" in str(e):
                        recommendations.append(ConfigurationRecommendation(
                            resource_type="Bedrock Access",
                            resource_name=bedrock_text_model,
                            current_status="Access denied",
                            recommended_action="Request model access in Bedrock console",
                            priority="high"
                        ))
                    else:
                        recommendations.append(ConfigurationRecommendation(
                            resource_type="Bedrock Model",
                            resource_name=bedrock_text_model,
                            current_status=f"Error: {e.response['Error']['Code']}",
                            recommended_action="Check model availability and permissions",
                            priority="medium"
                        ))
                        
        except Exception as e:
            recommendations.append(ConfigurationRecommendation(
                resource_type="Bedrock Service",
                resource_name="Service Access",
                current_status=f"Error: {str(e)}",
                recommended_action="Check Bedrock service availability in region",
                priority="medium"
            ))
        
        return recommendations
    
    def generate_setup_script(self, recommendations: List[ConfigurationRecommendation]) -> str:
        """Generate a setup script to fix configuration issues"""
        script_lines = [
            "#!/bin/bash",
            "# AWS Configuration Setup Script",
            "# Generated by NeoHarbour Security Configuration Helper",
            "",
            "set -e",
            "",
            "echo 'Setting up AWS resources for NeoHarbour Security...'",
            ""
        ]
        
        # Group recommendations by priority
        critical_recs = [r for r in recommendations if r.priority == "critical"]
        high_recs = [r for r in recommendations if r.priority == "high"]
        
        if critical_recs:
            script_lines.extend([
                "echo 'Fixing critical configuration issues...'",
                ""
            ])
            
            for rec in critical_recs:
                if rec.configuration_command:
                    script_lines.extend([
                        f"# {rec.resource_type}: {rec.resource_name}",
                        f"echo 'Setting up {rec.resource_name}...'",
                        rec.configuration_command,
                        ""
                    ])
        
        if high_recs:
            script_lines.extend([
                "echo 'Fixing high priority configuration issues...'",
                ""
            ])
            
            for rec in high_recs:
                if rec.configuration_command:
                    script_lines.extend([
                        f"# {rec.resource_type}: {rec.resource_name}",
                        f"echo 'Configuring {rec.resource_name}...'",
                        rec.configuration_command,
                        ""
                    ])
        
        script_lines.extend([
            "echo 'AWS configuration setup complete!'",
            "echo 'Run the validation script to verify: python tools/validate_aws_service_integration.py'"
        ])
        
        return "\n".join(script_lines)


# Global configuration helper instance
aws_configuration_helper = AWSConfigurationHelper()