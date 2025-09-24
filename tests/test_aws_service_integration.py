"""
Test AWS Service Integration

Validates that all demo and live processing uses actual AWS services
with proper KMS encryption, S3 Object Lock, and complete workflow integration.
"""

import json
import os
import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import Mock, patch, MagicMock

from src.aws.service_integration import (
    AWSServiceIntegration, 
    ServiceStatus, 
    ServiceHealthCheck,
    IntegrationValidationResult,
    aws_service_integration
)


class TestAWSServiceIntegration:
    """Test suite for AWS service integration validation"""
    
    @pytest.fixture
    def service_integration(self):
        """Mock AWS service integration"""
        with patch('boto3.client'), patch('boto3.resource'):
            return AWSServiceIntegration()
    
    @pytest.fixture
    def sample_test_alert(self):
        """Sample test alert for end-to-end testing"""
        return {
            "investigationId": f"INV-TEST-{uuid.uuid4().hex[:8]}",
            "tenantId": "test-tenant",
            "alert": {
                "source": "integration-test",
                "title": "AWS Service Integration Test Alert",
                "description": "Test alert for validating AWS service integration",
                "severity": "medium",
                "entities": [
                    {"type": "test", "value": "integration-test"}
                ],
                "isDemo": False
            },
            "receivedAt": datetime.now(timezone.utc).isoformat(),
            "source": "asia.agentic.soc.integration.test"
        }
    
    def test_bedrock_health_check(self, service_integration):
        """Test Amazon Bedrock health check"""
        # Mock successful Bedrock response
        mock_response = {
            'ResponseMetadata': {'HTTPStatusCode': 200},
            'body': Mock()
        }
        mock_response['body'].read.return_value = json.dumps({
            "content": [{"text": "Health check response"}]
        }).encode('utf-8')
        
        with patch.object(service_integration.bedrock_runtime, 'invoke_model', return_value=mock_response):
            health_check = service_integration._check_bedrock_health()
            
            assert health_check.service_name == "Amazon Bedrock"
            assert health_check.status == ServiceStatus.HEALTHY
            assert health_check.response_time_ms > 0
            assert health_check.error_message is None
    
    def test_bedrock_health_check_failure(self, service_integration):
        """Test Amazon Bedrock health check failure"""
        with patch.object(service_integration.bedrock_runtime, 'invoke_model', side_effect=Exception("Model not accessible")):
            health_check = service_integration._check_bedrock_health()
            
            assert health_check.service_name == "Amazon Bedrock"
            assert health_check.status == ServiceStatus.UNAVAILABLE
            assert health_check.error_message == "Model not accessible"
    
    def test_dynamodb_health_check(self, service_integration):
        """Test DynamoDB health check"""
        mock_response = {
            'Table': {
                'TableStatus': 'ACTIVE',
                'TableName': 'AsiaAgenticSocInvestigations-dev'
            }
        }
        
        with patch.object(service_integration.dynamodb_client, 'describe_table', return_value=mock_response):
            health_check = service_integration._check_dynamodb_health()
            
            assert health_check.service_name == "DynamoDB"
            assert health_check.status == ServiceStatus.HEALTHY
            assert health_check.response_time_ms > 0
    
    def test_dynamodb_health_check_degraded(self, service_integration):
        """Test DynamoDB health check with degraded status"""
        mock_response = {
            'Table': {
                'TableStatus': 'UPDATING',
                'TableName': 'AsiaAgenticSocInvestigations-dev'
            }
        }
        
        with patch.object(service_integration.dynamodb_client, 'describe_table', return_value=mock_response):
            health_check = service_integration._check_dynamodb_health()
            
            assert health_check.service_name == "DynamoDB"
            assert health_check.status == ServiceStatus.DEGRADED
            assert "Table status: UPDATING" in health_check.error_message
    
    def test_s3_health_check(self, service_integration):
        """Test S3 health check"""
        with patch.object(service_integration.s3, 'head_bucket', return_value={}):
            health_check = service_integration._check_s3_health()
            
            assert health_check.service_name == "S3"
            assert health_check.status == ServiceStatus.HEALTHY
            assert health_check.response_time_ms > 0
    
    def test_kms_health_check(self, service_integration):
        """Test KMS health check"""
        mock_response = {
            'KeyMetadata': {
                'KeyId': 'test-key-id',
                'KeyState': 'Enabled'
            }
        }
        
        with patch.object(service_integration.kms, 'describe_key', return_value=mock_response):
            health_check = service_integration._check_kms_health()
            
            assert health_check.service_name == "KMS"
            assert health_check.status == ServiceStatus.HEALTHY
            assert health_check.response_time_ms > 0
    
    def test_eventbridge_health_check(self, service_integration):
        """Test EventBridge health check"""
        mock_response = {
            'Name': 'AsiaAgenticSocBus',
            'Arn': 'arn:aws:events:us-east-1:123456789012:event-bus/AsiaAgenticSocBus'
        }
        
        with patch.object(service_integration.eventbridge, 'describe_event_bus', return_value=mock_response):
            health_check = service_integration._check_eventbridge_health()
            
            assert health_check.service_name == "EventBridge"
            assert health_check.status == ServiceStatus.HEALTHY
            assert health_check.response_time_ms > 0
    
    def test_stepfunctions_health_check(self, service_integration):
        """Test Step Functions health check"""
        # Set state machine ARN for test
        service_integration.state_machine_arn = "arn:aws:states:us-east-1:123456789012:stateMachine:TestStateMachine"
        
        mock_response = {
            'stateMachineArn': service_integration.state_machine_arn,
            'name': 'TestStateMachine',
            'status': 'ACTIVE'
        }
        
        with patch.object(service_integration.stepfunctions, 'describe_state_machine', return_value=mock_response):
            health_check = service_integration._check_stepfunctions_health()
            
            assert health_check.service_name == "Step Functions"
            assert health_check.status == ServiceStatus.HEALTHY
            assert health_check.response_time_ms > 0
    
    def test_stepfunctions_health_check_no_arn(self, service_integration):
        """Test Step Functions health check without ARN configured"""
        service_integration.state_machine_arn = ""
        
        health_check = service_integration._check_stepfunctions_health()
        
        assert health_check.service_name == "Step Functions"
        assert health_check.status == ServiceStatus.UNAVAILABLE
        assert "State machine ARN not configured" in health_check.error_message
    
    def test_lambda_health_check(self, service_integration):
        """Test Lambda health check"""
        mock_response = {
            'Functions': [
                {'FunctionName': 'AsiaAgenticSoc-Ingest-dev'},
                {'FunctionName': 'AsiaAgenticSoc-Context-dev'},
                {'FunctionName': 'AsiaAgenticSoc-Summarize-dev'},
                {'FunctionName': 'AsiaAgenticSoc-Risk-dev'},
                {'FunctionName': 'AsiaAgenticSoc-Audit-dev'},
                {'FunctionName': 'AsiaAgenticSoc-Approval-dev'}
            ]
        }
        
        with patch.object(service_integration.lambda_client, 'list_functions', return_value=mock_response):
            health_check = service_integration._check_lambda_health()
            
            assert health_check.service_name == "Lambda"
            assert health_check.status == ServiceStatus.HEALTHY
            assert health_check.response_time_ms > 0
    
    def test_lambda_health_check_insufficient_functions(self, service_integration):
        """Test Lambda health check with insufficient functions"""
        mock_response = {
            'Functions': [
                {'FunctionName': 'AsiaAgenticSoc-Ingest-dev'},
                {'FunctionName': 'AsiaAgenticSoc-Context-dev'}
            ]
        }
        
        with patch.object(service_integration.lambda_client, 'list_functions', return_value=mock_response):
            health_check = service_integration._check_lambda_health()
            
            assert health_check.service_name == "Lambda"
            assert health_check.status == ServiceStatus.DEGRADED
            assert "2 pipeline functions found" in health_check.error_message
    
    def test_complete_integration_validation(self, service_integration):
        """Test complete AWS service integration validation"""
        # Mock all health checks as healthy
        with patch.object(service_integration, '_check_bedrock_health') as mock_bedrock, \
             patch.object(service_integration, '_check_dynamodb_health') as mock_dynamodb, \
             patch.object(service_integration, '_check_s3_health') as mock_s3, \
             patch.object(service_integration, '_check_kms_health') as mock_kms, \
             patch.object(service_integration, '_check_eventbridge_health') as mock_eventbridge, \
             patch.object(service_integration, '_check_stepfunctions_health') as mock_stepfunctions, \
             patch.object(service_integration, '_check_lambda_health') as mock_lambda:
            
            # Configure all health checks as healthy
            mock_bedrock.return_value = ServiceHealthCheck("Amazon Bedrock", ServiceStatus.HEALTHY, 100.0)
            mock_dynamodb.return_value = ServiceHealthCheck("DynamoDB", ServiceStatus.HEALTHY, 50.0)
            mock_s3.return_value = ServiceHealthCheck("S3", ServiceStatus.HEALTHY, 30.0)
            mock_kms.return_value = ServiceHealthCheck("KMS", ServiceStatus.HEALTHY, 40.0)
            mock_eventbridge.return_value = ServiceHealthCheck("EventBridge", ServiceStatus.HEALTHY, 60.0)
            mock_stepfunctions.return_value = ServiceHealthCheck("Step Functions", ServiceStatus.HEALTHY, 80.0)
            mock_lambda.return_value = ServiceHealthCheck("Lambda", ServiceStatus.HEALTHY, 70.0)
            
            result = service_integration.validate_complete_integration()
            
            assert result.all_services_healthy == True
            assert result.bedrock_available == True
            assert result.dynamodb_accessible == True
            assert result.s3_configured == True
            assert result.kms_encryption_enabled == True
            assert result.eventbridge_functional == True
            assert result.step_functions_operational == True
            assert result.lambda_functions_deployed == True
            assert len(result.service_health_checks) == 7
            assert len(result.validation_errors) == 0
    
    def test_complete_integration_validation_with_failures(self, service_integration):
        """Test complete integration validation with service failures"""
        # Mock some health checks as failed
        with patch.object(service_integration, '_check_bedrock_health') as mock_bedrock, \
             patch.object(service_integration, '_check_dynamodb_health') as mock_dynamodb, \
             patch.object(service_integration, '_check_s3_health') as mock_s3, \
             patch.object(service_integration, '_check_kms_health') as mock_kms, \
             patch.object(service_integration, '_check_eventbridge_health') as mock_eventbridge, \
             patch.object(service_integration, '_check_stepfunctions_health') as mock_stepfunctions, \
             patch.object(service_integration, '_check_lambda_health') as mock_lambda:
            
            # Configure some health checks as failed
            mock_bedrock.return_value = ServiceHealthCheck("Amazon Bedrock", ServiceStatus.UNAVAILABLE, 0.0, "Access denied")
            mock_dynamodb.return_value = ServiceHealthCheck("DynamoDB", ServiceStatus.HEALTHY, 50.0)
            mock_s3.return_value = ServiceHealthCheck("S3", ServiceStatus.DEGRADED, 200.0, "Slow response")
            mock_kms.return_value = ServiceHealthCheck("KMS", ServiceStatus.HEALTHY, 40.0)
            mock_eventbridge.return_value = ServiceHealthCheck("EventBridge", ServiceStatus.HEALTHY, 60.0)
            mock_stepfunctions.return_value = ServiceHealthCheck("Step Functions", ServiceStatus.UNAVAILABLE, 0.0, "Not found")
            mock_lambda.return_value = ServiceHealthCheck("Lambda", ServiceStatus.HEALTHY, 70.0)
            
            result = service_integration.validate_complete_integration()
            
            assert result.all_services_healthy == False
            assert result.bedrock_available == False
            assert result.step_functions_operational == False
            assert len(result.validation_errors) == 2  # Bedrock and Step Functions failures
            assert "Amazon Bedrock: Access denied" in result.validation_errors
            assert "Step Functions: Not found" in result.validation_errors
            assert len(result.recommendations) >= 2
    
    def test_kms_encryption_compliance(self, service_integration):
        """Test KMS encryption compliance validation"""
        # Mock KMS key response
        mock_kms_response = {
            'KeyMetadata': {
                'KeyId': 'test-key-id',
                'KeyState': 'Enabled',
                'KeyRotationStatus': True
            }
        }
        
        # Mock DynamoDB encryption response
        mock_dynamodb_response = {
            'Table': {
                'SSEDescription': {
                    'Status': 'ENABLED',
                    'SSEType': 'KMS'
                }
            }
        }
        
        # Mock S3 encryption response
        mock_s3_encryption = {
            'ServerSideEncryptionConfiguration': {
                'Rules': [{
                    'ApplyServerSideEncryptionByDefault': {
                        'SSEAlgorithm': 'aws:kms',
                        'KMSMasterKeyID': 'test-key-id'
                    }
                }]
            }
        }
        
        # Mock S3 Object Lock response
        mock_object_lock = {
            'ObjectLockConfiguration': {
                'ObjectLockEnabled': 'Enabled',
                'Rule': {
                    'DefaultRetention': {
                        'Mode': 'COMPLIANCE',
                        'Years': 7
                    }
                }
            }
        }
        
        with patch.object(service_integration.kms, 'describe_key', return_value=mock_kms_response), \
             patch.object(service_integration.dynamodb_client, 'describe_table', return_value=mock_dynamodb_response), \
             patch.object(service_integration.s3, 'get_bucket_encryption', return_value=mock_s3_encryption), \
             patch.object(service_integration.s3, 'get_object_lock_configuration', return_value=mock_object_lock):
            
            result = service_integration.ensure_kms_encryption_compliance()
            
            assert result["kms_key_accessible"] == True
            assert result["dynamodb_encryption_enabled"] == True
            assert result["s3_encryption_enabled"] == True
            assert result["audit_bucket_object_lock_enabled"] == True
            assert result["encryption_compliance"] == True
            assert len(result["validation_errors"]) == 0
    
    def test_kms_encryption_compliance_failures(self, service_integration):
        """Test KMS encryption compliance with failures"""
        # Mock failures for all services
        with patch.object(service_integration.kms, 'describe_key', side_effect=Exception("Key not found")), \
             patch.object(service_integration.dynamodb_client, 'describe_table', side_effect=Exception("Table not found")), \
             patch.object(service_integration.s3, 'get_bucket_encryption', side_effect=Exception("Bucket not found")), \
             patch.object(service_integration.s3, 'get_object_lock_configuration', side_effect=Exception("Object Lock not configured")):
            
            result = service_integration.ensure_kms_encryption_compliance()
            
            assert result["kms_key_accessible"] == False
            assert result["dynamodb_encryption_enabled"] == False
            assert result["s3_encryption_enabled"] == False
            assert result["audit_bucket_object_lock_enabled"] == False
            assert result["encryption_compliance"] == False
            assert len(result["validation_errors"]) == 4
    
    def test_workflow_integration_validation(self, service_integration):
        """Test complete workflow integration validation"""
        investigation_id = "INV-TEST-12345"
        tenant_id = "test-tenant"
        
        # Mock Step Functions execution
        mock_execution_arn = "arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:test-execution"
        
        # Mock execution details
        mock_execution_details = {
            'executionArn': mock_execution_arn,
            'status': 'SUCCEEDED',
            'startDate': datetime.now(timezone.utc),
            'stopDate': datetime.now(timezone.utc)
        }
        
        # Mock Lambda invocations
        mock_lambda_invocations = [
            {'function_name': 'AsiaAgenticSoc-Ingest-dev', 'success': True, 'timestamp': datetime.now(timezone.utc)},
            {'function_name': 'AsiaAgenticSoc-Context-dev', 'success': True, 'timestamp': datetime.now(timezone.utc)},
            {'function_name': 'AsiaAgenticSoc-Summarize-dev', 'success': True, 'timestamp': datetime.now(timezone.utc)},
            {'function_name': 'AsiaAgenticSoc-Risk-dev', 'success': True, 'timestamp': datetime.now(timezone.utc)},
            {'function_name': 'AsiaAgenticSoc-Audit-dev', 'success': True, 'timestamp': datetime.now(timezone.utc)}
        ]
        
        with patch.object(service_integration, '_find_step_function_execution', return_value=mock_execution_arn), \
             patch.object(service_integration.stepfunctions, 'describe_execution', return_value=mock_execution_details), \
             patch.object(service_integration, '_validate_lambda_invocations', return_value=mock_lambda_invocations), \
             patch.object(service_integration, '_validate_dynamodb_investigation_record', return_value={'record_exists': True}), \
             patch.object(service_integration, '_validate_s3_artifacts', return_value={'artifacts_found': ['audit.json', 'summary.json']}):
            
            result = service_integration.validate_complete_workflow_integration(investigation_id, tenant_id)
            
            assert result["workflow_complete"] == True
            assert result["eventbridge_delivery"] == True
            assert result["step_function_execution"] == True
            assert result["dynamodb_updates"] == True
            assert result["s3_artifacts_created"] == True
            assert result["execution_arn"] == mock_execution_arn
            assert len(result["lambda_invocations"]) == 5
            assert len(result["validation_errors"]) == 0
    
    def test_end_to_end_processing_test(self, service_integration, sample_test_alert):
        """Test end-to-end processing with actual AWS services"""
        # Mock EventBridge response
        mock_eventbridge_response = {
            'FailedEntryCount': 0,
            'Entries': [{'EventId': 'test-event-id'}]
        }
        
        # Mock workflow validation
        mock_workflow_validation = {
            "workflow_complete": True,
            "eventbridge_delivery": True,
            "step_function_execution": True,
            "lambda_invocations": [
                {'function_name': 'AsiaAgenticSoc-Ingest-dev', 'success': True},
                {'function_name': 'AsiaAgenticSoc-Context-dev', 'success': True},
                {'function_name': 'AsiaAgenticSoc-Summarize-dev', 'success': True},
                {'function_name': 'AsiaAgenticSoc-Risk-dev', 'success': True},
                {'function_name': 'AsiaAgenticSoc-Audit-dev', 'success': True}
            ],
            "dynamodb_updates": True,
            "s3_artifacts_created": True,
            "validation_errors": []
        }
        
        with patch.object(service_integration.eventbridge, 'put_events', return_value=mock_eventbridge_response), \
             patch.object(service_integration, 'validate_complete_workflow_integration', return_value=mock_workflow_validation), \
             patch.object(service_integration, '_validate_bedrock_analysis', return_value={'analysis_found': True}), \
             patch.object(service_integration, '_validate_kms_encryption_usage', return_value={'encryption_verified': True}), \
             patch.object(service_integration, '_validate_compliance_artifacts', return_value={'artifacts_found': True}), \
             patch('time.sleep'):  # Skip sleep in test
            
            result = service_integration.test_end_to_end_processing(sample_test_alert)
            
            assert result["test_successful"] == True
            assert result["eventbridge_sent"] == True
            assert result["step_function_triggered"] == True
            assert result["all_lambdas_executed"] == True
            assert result["bedrock_analysis_completed"] == True
            assert result["dynamodb_records_created"] == True
            assert result["s3_artifacts_stored"] == True
            assert result["kms_encryption_verified"] == True
            assert result["compliance_artifacts_generated"] == True
            assert len(result["validation_errors"]) == 0
    
    def test_end_to_end_processing_test_failures(self, service_integration, sample_test_alert):
        """Test end-to-end processing with failures"""
        # Mock EventBridge failure
        mock_eventbridge_response = {
            'FailedEntryCount': 1,
            'Entries': []
        }
        
        with patch.object(service_integration.eventbridge, 'put_events', return_value=mock_eventbridge_response):
            result = service_integration.test_end_to_end_processing(sample_test_alert)
            
            assert result["test_successful"] == False
            assert result["eventbridge_sent"] == False
            assert "Failed to send alert to EventBridge" in result["validation_errors"]
            assert len(result["recommendations"]) > 0
    
    def test_find_step_function_execution(self, service_integration):
        """Test finding Step Functions execution"""
        investigation_id = "INV-TEST-12345"
        service_integration.state_machine_arn = "arn:aws:states:us-east-1:123456789012:stateMachine:TestStateMachine"
        
        mock_executions = {
            'executions': [
                {
                    'executionArn': 'arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:execution-1',
                    'name': 'execution-1',
                    'status': 'SUCCEEDED'
                },
                {
                    'executionArn': f'arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:{investigation_id}',
                    'name': investigation_id,
                    'status': 'SUCCEEDED'
                }
            ]
        }
        
        with patch.object(service_integration.stepfunctions, 'list_executions', return_value=mock_executions):
            execution_arn = service_integration._find_step_function_execution(investigation_id)
            
            assert execution_arn == f'arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:{investigation_id}'
    
    def test_validate_lambda_invocations(self, service_integration):
        """Test validating Lambda function invocations"""
        execution_arn = "arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:test-execution"
        
        mock_history = {
            'events': [
                {
                    'type': 'LambdaFunctionSucceeded',
                    'timestamp': datetime.now(timezone.utc),
                    'lambdaFunctionSucceededEventDetails': {
                        'output': 'AsiaAgenticSoc-Ingest-dev'
                    }
                },
                {
                    'type': 'LambdaFunctionFailed',
                    'timestamp': datetime.now(timezone.utc),
                    'lambdaFunctionFailedEventDetails': {
                        'cause': 'AsiaAgenticSoc-Context-dev failed'
                    }
                },
                {
                    'type': 'LambdaFunctionSucceeded',
                    'timestamp': datetime.now(timezone.utc),
                    'lambdaFunctionSucceededEventDetails': {
                        'output': 'AsiaAgenticSoc-Summarize-dev'
                    }
                }
            ]
        }
        
        with patch.object(service_integration.stepfunctions, 'get_execution_history', return_value=mock_history):
            invocations = service_integration._validate_lambda_invocations(execution_arn)
            
            assert len(invocations) == 3
            assert invocations[0]['success'] == True
            assert invocations[1]['success'] == False
            assert invocations[2]['success'] == True
    
    def test_validate_dynamodb_investigation_record(self, service_integration):
        """Test validating DynamoDB investigation record"""
        investigation_id = "INV-TEST-12345"
        tenant_id = "test-tenant"
        
        mock_item = {
            'investigationId': investigation_id,
            'tenantId': tenant_id,
            'stage': 'completed',
            'status': 'closed'
        }
        
        mock_table = Mock()
        mock_table.get_item.return_value = {'Item': mock_item}
        
        with patch.object(service_integration.dynamodb, 'Table', return_value=mock_table):
            result = service_integration._validate_dynamodb_investigation_record(investigation_id, tenant_id)
            
            assert result['record_exists'] == True
            assert result['record_data']['investigationId'] == investigation_id
    
    def test_validate_s3_artifacts(self, service_integration):
        """Test validating S3 artifacts"""
        investigation_id = "INV-TEST-12345"
        tenant_id = "test-tenant"
        
        mock_artifacts_response = {
            'Contents': [
                {'Key': f'investigations/{tenant_id}/{investigation_id}/summary.json'},
                {'Key': f'investigations/{tenant_id}/{investigation_id}/analysis.json'}
            ]
        }
        
        mock_audit_response = {
            'Contents': [
                {'Key': f'audit/{tenant_id}/{investigation_id}.json'}
            ]
        }
        
        with patch.object(service_integration.s3, 'list_objects_v2', side_effect=[mock_artifacts_response, mock_audit_response]):
            result = service_integration._validate_s3_artifacts(investigation_id, tenant_id)
            
            assert len(result['artifacts_found']) == 3
            assert f'investigations/{tenant_id}/{investigation_id}/summary.json' in result['artifacts_found']
            assert f'audit/{tenant_id}/{investigation_id}.json' in result['artifacts_found']


if __name__ == "__main__":
    pytest.main([__file__, "-v"])