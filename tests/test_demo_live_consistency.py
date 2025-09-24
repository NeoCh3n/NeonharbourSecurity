"""
Test Demo and Live Mode Consistency

Validates that demo alerts route through complete Step Functions workflow
with all six agents and generate same compliance artifacts as live mode.
"""

import json
import os
import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import Mock, patch, MagicMock

from src.demo.mode_processor import ModeAwareProcessor, ProcessingMode, ProcessingContext
from src.demo.mode_switcher import DemoLiveModeSwitcher
from src.demo.quality_validator import DemoLiveQualityValidator, QualityMetrics
from src.demo.workflow_validator import DemoLiveWorkflowValidator, WorkflowValidationResult
from src.demo.integration import DemoLiveIntegration, IntegrationStatus


class TestDemoLiveConsistency:
    """Test suite for demo and live mode consistency validation"""
    
    @pytest.fixture
    def mode_processor(self):
        """Mock mode processor"""
        with patch('boto3.resource'), patch('boto3.client'):
            return ModeAwareProcessor()
    
    @pytest.fixture
    def quality_validator(self):
        """Mock quality validator"""
        with patch('boto3.resource'), patch('boto3.client'):
            return DemoLiveQualityValidator()
    
    @pytest.fixture
    def workflow_validator(self):
        """Mock workflow validator"""
        with patch('boto3.resource'), patch('boto3.client'):
            return DemoLiveWorkflowValidator()
    
    @pytest.fixture
    def integration_manager(self):
        """Mock integration manager"""
        with patch('boto3.resource'), patch('boto3.client'):
            return DemoLiveIntegration()
    
    @pytest.fixture
    def sample_demo_alert(self):
        """Sample demo alert for testing"""
        return {
            "investigationId": f"INV-DEMO-{uuid.uuid4().hex[:8]}",
            "tenantId": "test-tenant",
            "alert": {
                "source": "sentinel",
                "title": "Demo suspicious login attempt",
                "description": "Multiple failed login attempts detected",
                "severity": "high",
                "entities": [
                    {"type": "user", "value": "[test_user]"},
                    {"type": "ip", "value": "192.168.1.100"}
                ],
                "tactics": ["Initial Access", "Credential Access"],
                "isDemo": True,
                "scenarioType": "phishing",
                "isFalsePositive": False
            },
            "receivedAt": datetime.now(timezone.utc).isoformat(),
            "demoMetadata": {
                "scenarioType": "phishing",
                "isFalsePositive": False,
                "isDemo": True
            },
            "source": "asia.agentic.soc.demo"
        }
    
    @pytest.fixture
    def sample_live_alert(self):
        """Sample live alert for testing"""
        return {
            "investigationId": f"INV-LIVE-{uuid.uuid4().hex[:8]}",
            "tenantId": "test-tenant",
            "alert": {
                "source": "sentinel",
                "title": "Suspicious login attempt",
                "description": "Multiple failed login attempts detected",
                "severity": "high",
                "entities": [
                    {"type": "user", "value": "john.doe"},
                    {"type": "ip", "value": "203.104.15.22"}
                ],
                "tactics": ["Initial Access", "Credential Access"],
                "isDemo": False
            },
            "receivedAt": datetime.now(timezone.utc).isoformat(),
            "source": "asia.agentic.soc.ingestion"
        }
    
    def test_processing_context_extraction(self, mode_processor, sample_demo_alert, sample_live_alert):
        """Test that processing context is correctly extracted for both modes"""
        # Test demo context extraction
        demo_context = mode_processor.extract_processing_context(sample_demo_alert)
        assert demo_context.mode == ProcessingMode.DEMO
        assert demo_context.is_demo() == True
        assert demo_context.get_scenario_type() == "phishing"
        assert demo_context.get_false_positive_hint() == False
        
        # Test live context extraction
        live_context = mode_processor.extract_processing_context(sample_live_alert)
        assert live_context.mode == ProcessingMode.LIVE
        assert live_context.is_demo() == False
        assert live_context.get_scenario_type() is None
        assert live_context.get_false_positive_hint() is None
    
    def test_consistent_processing_wrapper(self, mode_processor, sample_demo_alert):
        """Test that consistent processing wrapper works for both modes"""
        context = mode_processor.extract_processing_context(sample_demo_alert)
        
        # Mock processing function
        def mock_processing_func(ctx, *args, **kwargs):
            return {
                "investigationId": ctx.investigation_id,
                "tenantId": ctx.tenant_id,
                "summary": "Test analysis completed",
                "processingMode": ctx.mode.value
            }
        
        # Mock DynamoDB operations
        with patch.object(mode_processor, '_update_stage_tracking'), \
             patch.object(mode_processor, '_validate_stage_result'), \
             patch.object(mode_processor, '_record_processing_metrics'):
            
            result = mode_processor.ensure_consistent_processing(
                context, "test_stage", mock_processing_func
            )
            
            assert result["investigationId"] == context.investigation_id
            assert result["tenantId"] == context.tenant_id
            assert result["processingMode"] == ProcessingMode.DEMO.value
    
    def test_workflow_consistency_validation(self, mode_processor, sample_demo_alert):
        """Test workflow consistency validation"""
        investigation_id = sample_demo_alert["investigationId"]
        tenant_id = sample_demo_alert["tenantId"]
        
        # Mock DynamoDB response
        mock_item = {
            'investigationId': investigation_id,
            'tenantId': tenant_id,
            'stage': 'completed',
            'status': 'closed',
            'processingMode': 'demo',
            'stageHistory': ['received', 'context', 'analysis', 'risk', 'remediation', 'adaptation', 'audit', 'completed'],
            'summary': 'Test summary',
            'risk': {'level': 'low', 'score': 0.3},
            'auditKey': f'audit/{tenant_id}/{investigation_id}.json'
        }
        
        with patch.object(mode_processor.dynamodb, 'Table') as mock_table:
            mock_table.return_value.get_item.return_value = {'Item': mock_item}
            
            result = mode_processor.validate_workflow_consistency(investigation_id, tenant_id)
            
            assert result['valid'] == True
            assert result['processing_mode'] == 'demo'
            assert result['current_stage'] == 'completed'
            assert len(result['missing_stages']) == 0
            assert len(result['quality_issues']) == 0
    
    def test_compliance_artifacts_generation(self, mode_processor, sample_demo_alert):
        """Test that compliance artifacts are generated consistently"""
        context = mode_processor.extract_processing_context(sample_demo_alert)
        
        stage_results = {
            "summary": "Investigation completed successfully",
            "risk": {
                "level": "low",
                "score": 0.3,
                "actions": ["Monitor user activity"],
                "escalate": False
            }
        }
        
        artifacts = mode_processor.ensure_compliance_artifacts(context, stage_results)
        
        assert "investigation_summary" in artifacts
        assert "risk_assessment" in artifacts
        assert "compliance_mapping" in artifacts
        assert "audit_trail" in artifacts
        assert "processing_metadata" in artifacts
        
        # Check demo-specific metadata
        assert "demo_metadata" in artifacts
        assert artifacts["demo_metadata"]["scenario_type"] == "phishing"
        assert artifacts["demo_metadata"]["false_positive_hint"] == False
        
        # Check HKMA compliance mapping
        compliance_mapping = artifacts["compliance_mapping"]
        assert "hkma_sa2_controls" in compliance_mapping
        assert "hkma_tm_g1_requirements" in compliance_mapping
        assert compliance_mapping["processing_mode"] == ProcessingMode.DEMO.value
    
    def test_quality_metrics_validation(self, quality_validator):
        """Test quality metrics validation for demo investigations"""
        investigation_id = "INV-DEMO-12345"
        tenant_id = "test-tenant"
        
        # Mock DynamoDB response
        mock_item = {
            'investigationId': investigation_id,
            'tenantId': tenant_id,
            'stage': 'completed',
            'status': 'closed',
            'alert': {'isDemo': True},
            'summary': 'Test summary',
            'risk': {'level': 'low'},
            'auditKey': 'audit/test-tenant/INV-DEMO-12345.json',
            'receivedAt': '2024-01-01T10:00:00Z',
            'updatedAt': '2024-01-01T10:05:00Z'
        }
        
        # Mock S3 response
        mock_s3_objects = {
            'Contents': [
                {'Key': 'audit/test-tenant/INV-DEMO-12345.json'},
                {'Key': 'audit/test-tenant/INV-DEMO-12345-summary.json'}
            ]
        }
        
        with patch.object(quality_validator.dynamodb, 'Table') as mock_table, \
             patch.object(quality_validator.s3, 'list_objects_v2') as mock_s3:
            
            mock_table.return_value.get_item.return_value = {'Item': mock_item}
            mock_s3.return_value = mock_s3_objects
            
            metrics = quality_validator.validate_investigation_quality(
                investigation_id, tenant_id, ProcessingMode.DEMO
            )
            
            assert metrics.investigation_id == investigation_id
            assert metrics.processing_mode.value == ProcessingMode.DEMO.value
            assert metrics.dynamodb_records_created == True
            assert metrics.s3_artifacts_stored == True
            assert metrics.audit_trail_created == True
            assert len(metrics.compliance_artifacts_generated) > 0
            assert metrics.quality_score > 0.0
    
    def test_demo_live_quality_comparison(self, quality_validator):
        """Test comparison between demo and live investigation quality"""
        demo_id = "INV-DEMO-12345"
        live_id = "INV-LIVE-67890"
        tenant_id = "test-tenant"
        
        # Mock quality metrics for both investigations
        with patch.object(quality_validator, 'validate_investigation_quality') as mock_validate:
            # Demo metrics
            demo_metrics = QualityMetrics(
                investigation_id=demo_id,
                processing_mode=ProcessingMode.DEMO,
                stages_completed={'received', 'context', 'analysis', 'risk', 'audit', 'completed'},
                compliance_artifacts_generated=['audit.json', 'summary.json'],
                processing_time_seconds=120.0,
                ai_analysis_performed=True,
                risk_assessment_completed=True,
                audit_trail_created=True,
                s3_artifacts_stored=True,
                dynamodb_records_created=True,
                quality_score=0.95
            )
            
            # Live metrics
            live_metrics = QualityMetrics(
                investigation_id=live_id,
                processing_mode=ProcessingMode.LIVE,
                stages_completed={'received', 'context', 'analysis', 'risk', 'audit', 'completed'},
                compliance_artifacts_generated=['audit.json', 'summary.json'],
                processing_time_seconds=115.0,
                ai_analysis_performed=True,
                risk_assessment_completed=True,
                audit_trail_created=True,
                s3_artifacts_stored=True,
                dynamodb_records_created=True,
                quality_score=0.93
            )
            
            mock_validate.side_effect = [demo_metrics, live_metrics]
            
            comparison = quality_validator.compare_demo_live_quality(
                demo_id, live_id, tenant_id, tenant_id
            )
            
            assert comparison['demo_quality_score'] == 0.95
            assert comparison['live_quality_score'] == 0.93
            assert abs(comparison['quality_difference'] - 0.02) < 0.001  # Allow for floating point precision
            assert comparison['quality_consistent'] == True  # Difference < 0.1
            assert len(comparison['stages_comparison']['missing_in_demo']) == 0
            assert len(comparison['stages_comparison']['missing_in_live']) == 0
    
    def test_workflow_routing_validation(self, workflow_validator, sample_demo_alert):
        """Test that demo alerts are properly routed through Step Functions workflow"""
        routing_validation = workflow_validator.ensure_demo_workflow_routing(sample_demo_alert)
        
        assert routing_validation["alert_valid"] == True
        assert len(routing_validation["routing_issues"]) == 0
        assert routing_validation["alert_structure"]["is_demo"] == True
        assert routing_validation["alert_structure"]["scenario_type"] == "phishing"
        assert routing_validation["alert_structure"]["false_positive_hint"] == False
    
    def test_workflow_execution_monitoring(self, workflow_validator):
        """Test workflow execution monitoring"""
        investigation_id = "INV-DEMO-12345"
        tenant_id = "test-tenant"
        
        # Mock Step Functions responses
        mock_execution_arn = "arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:test-execution"
        
        with patch.object(workflow_validator, '_find_step_function_execution') as mock_find, \
             patch.object(workflow_validator.stepfunctions, 'describe_execution') as mock_describe:
            
            mock_find.return_value = mock_execution_arn
            mock_describe.return_value = {
                'executionArn': mock_execution_arn,
                'status': 'SUCCEEDED',
                'name': 'test-execution',
                'startDate': datetime.now(timezone.utc),
                'stopDate': datetime.now(timezone.utc)
            }
            
            # Mock workflow validation
            with patch.object(workflow_validator, 'validate_complete_workflow') as mock_validate:
                mock_validate.return_value = WorkflowValidationResult(
                    investigation_id=investigation_id,
                    tenant_id=tenant_id,
                    processing_mode=ProcessingMode.DEMO,
                    workflow_complete=True,
                    stages_executed=['IngestFinding', 'GatherContext', 'SummarizeWithAI', 'RiskDecider', 'WriteAuditTrail'],
                    missing_stages=[],
                    execution_time_seconds=120.0,
                    compliance_artifacts_generated=True,
                    quality_score=0.95,
                    validation_errors=[],
                    step_function_execution_arn=mock_execution_arn
                )
                
                monitoring_result = workflow_validator.monitor_workflow_execution(
                    investigation_id, tenant_id, timeout_minutes=5
                )
                
                assert monitoring_result["execution_found"] == True
                assert monitoring_result["execution_status"] == "SUCCEEDED"
                assert monitoring_result["final_validation"] is not None
                assert monitoring_result["timeout_reached"] == False
    
    def test_integration_consistency_validation(self, integration_manager):
        """Test overall integration consistency validation"""
        tenant_id = "test-tenant"
        
        # Mock recent investigations
        demo_investigations = ["INV-DEMO-001", "INV-DEMO-002"]
        live_investigations = ["INV-LIVE-001", "INV-LIVE-002"]
        
        with patch.object(integration_manager, '_get_recent_investigations') as mock_get_recent:
            mock_get_recent.side_effect = [demo_investigations, live_investigations]
            
            # Mock quality validation results
            with patch.object(integration_manager.quality_validator, 'validate_investigation_quality') as mock_quality:
                mock_quality.side_effect = [
                    # Demo results
                    QualityMetrics("INV-DEMO-001", ProcessingMode.DEMO, set(), [], 120.0, True, True, True, True, True, 0.95),
                    QualityMetrics("INV-DEMO-002", ProcessingMode.DEMO, set(), [], 125.0, True, True, True, True, True, 0.93),
                    # Live results
                    QualityMetrics("INV-LIVE-001", ProcessingMode.LIVE, set(), [], 118.0, True, True, True, True, True, 0.94),
                    QualityMetrics("INV-LIVE-002", ProcessingMode.LIVE, set(), [], 122.0, True, True, True, True, True, 0.92)
                ]
                
                # Mock workflow consistency validation
                with patch.object(integration_manager.workflow_validator, 'validate_demo_live_consistency') as mock_workflow:
                    mock_workflow.return_value = {"overall_consistent": True}
                    
                    result = integration_manager.validate_integration_consistency(tenant_id, sample_size=2)
                    
                    assert result.status == IntegrationStatus.CONSISTENT
                    assert result.demo_quality_score == 0.94  # Average of 0.95 and 0.93
                    assert abs(result.live_quality_score - 0.93) < 0.001  # Average of 0.94 and 0.92, allow for floating point precision
                    assert result.workflow_consistency == True
                    assert len(result.validation_errors) == 0
    
    def test_seamless_mode_processing(self, integration_manager, sample_demo_alert):
        """Test seamless processing in target mode"""
        target_mode = ProcessingMode.DEMO
        
        # Mock alert preparation and sending
        with patch.object(integration_manager, '_prepare_alert_for_mode') as mock_prepare, \
             patch.object(integration_manager, '_send_alert_to_pipeline') as mock_send, \
             patch.object(integration_manager.workflow_validator, 'ensure_demo_workflow_routing') as mock_routing, \
             patch.object(integration_manager.workflow_validator, 'monitor_workflow_execution') as mock_monitor, \
             patch.object(integration_manager.quality_validator, 'validate_investigation_quality') as mock_quality:
            
            mock_prepare.return_value = sample_demo_alert
            mock_send.return_value = sample_demo_alert["investigationId"]
            mock_routing.return_value = {"alert_valid": True, "routing_issues": []}
            # Create a proper final_validation dict
            mock_monitor.return_value = {
                "final_validation": {"workflow_complete": True}
            }
            mock_quality.return_value = QualityMetrics(
                sample_demo_alert["investigationId"], ProcessingMode.DEMO, set(), 
                ['audit.json', 'summary.json'], 120.0,  # Add compliance artifacts
                True, True, True, True, True, 0.95
            )
            
            result = integration_manager.ensure_seamless_processing(sample_demo_alert, target_mode)
            
            assert result["success"] == True
            assert result["investigation_id"] == sample_demo_alert["investigationId"]
            assert result["processing_mode"] == ProcessingMode.DEMO.value
            assert result["quality_validated"] == True
            assert result["workflow_complete"] == True
            assert result["compliance_artifacts_generated"] == True
            assert result["workflow_complete"] == True
            assert result["compliance_artifacts_generated"] == True
    
    def test_mode_switching_quality_validation(self, integration_manager):
        """Test mode switching quality validation"""
        tenant_id = "test-tenant"
        source_mode = ProcessingMode.LIVE
        target_mode = ProcessingMode.DEMO
        
        # Mock mode switcher operations
        with patch.object(integration_manager.mode_switcher, '_validate_current_mode_quality') as mock_validate, \
             patch.object(integration_manager.mode_switcher, 'switch_to_demo_mode') as mock_switch, \
             patch.object(integration_manager.mode_switcher, 'validate_mode_consistency') as mock_consistency:
            
            # Mock pre-switch validation
            mock_validate.side_effect = [
                {"average_quality_score": 0.92},  # Pre-switch
                {"average_quality_score": 0.94}   # Post-switch
            ]
            
            # Mock successful switch
            from src.demo.mode_switcher import ModeSwitchResult
            mock_switch.return_value = ModeSwitchResult(
                success=True,
                previous_mode="live",
                new_mode="demo",
                quality_maintained=True,
                validation_results={}
            )
            
            # Mock consistency validation
            mock_consistency.return_value = {"consistency_valid": True}
            
            result = integration_manager.validate_mode_switching_quality(
                tenant_id, source_mode, target_mode
            )
            
            assert result["switch_valid"] == True
            assert result["pre_switch_quality"] == 0.92
            assert result["post_switch_quality"] == 0.94
            assert result["quality_maintained"] == True
            assert result["consistency_validated"] == True
    
    def test_compliance_artifact_consistency(self, integration_manager):
        """Test compliance artifact consistency between demo and live"""
        demo_id = "INV-DEMO-12345"
        live_id = "INV-LIVE-67890"
        tenant_id = "test-tenant"
        
        # Mock quality validation for both investigations
        with patch.object(integration_manager.quality_validator, 'validate_investigation_quality') as mock_quality:
            mock_quality.side_effect = [
                QualityMetrics(demo_id, ProcessingMode.DEMO, set(), ['audit.json', 'summary.json'], 120.0, True, True, True, True, True, 0.95),
                QualityMetrics(live_id, ProcessingMode.LIVE, set(), ['audit.json', 'summary.json'], 118.0, True, True, True, True, True, 0.93)
            ]
            
            # Mock artifact consistency validations
            with patch.object(integration_manager, '_validate_artifact_structure_consistency') as mock_structure, \
                 patch.object(integration_manager, '_validate_artifact_content_consistency') as mock_content, \
                 patch.object(integration_manager, '_validate_hkma_compliance_consistency') as mock_hkma:
                
                mock_structure.return_value = True
                mock_content.return_value = True
                mock_hkma.return_value = True
                
                result = integration_manager.ensure_compliance_artifact_consistency(
                    demo_id, live_id, tenant_id
                )
                
                assert result["artifacts_consistent"] == True
                assert result["structural_consistency"] == True
                assert result["content_consistency"] == True
                assert result["hkma_compliance_consistent"] == True
                assert len(result["validation_errors"]) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])