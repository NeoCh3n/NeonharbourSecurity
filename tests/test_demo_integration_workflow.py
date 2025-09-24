"""
Integration tests for complete demo workflow and AWS service integration.
Tests end-to-end demo scenarios, pipeline integration, and service interactions.
"""

import pytest
import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, MagicMock, call
from moto import mock_dynamodb, mock_events, mock_stepfunctions
import boto3

from src.demo.integration import DemoPipelineIntegration
from src.demo.generator import DemoDataGenerator, DemoAlert
from src.demo.session import DemoSessionManager, DemoParameters, SessionStatus
from src.demo.controller import DemoSessionController
from src.demo.progress_tracker import ProgressTracker
from src.metrics.collector import RealTimeMetricsCollector


class TestDemoPipelineIntegration:
    """Test demo pipeline integration with AWS services."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_events_client = Mock()
        self.mock_stepfunctions_client = Mock()
        self.mock_dynamodb = Mock()
    
    @patch('src.demo.integration.DemoDataGenerator')
    @patch('boto3.client')
    def test_integration_initialization(self, mock_boto_client, mock_generator_class):
        """Test integration initialization with dependencies."""
        mock_boto_client.return_value = self.mock_events_client
        mock_generator_class.return_value = Mock()
        
        integration = DemoPipelineIntegration()
        
        assert integration.generator is not None
        assert integration.events_client is not None
        assert integration.progress_tracker is not None
        assert integration.metrics_collector is not None
    
    @patch('src.demo.integration.DemoDataGenerator')
    @patch('boto3.client')
    def test_get_available_demo_scenarios(self, mock_boto_client, mock_generator_class):
        """Test getting available demo scenarios."""
        mock_boto_client.return_value = self.mock_events_client
        mock_generator_class.return_value = Mock()
        
        integration = DemoPipelineIntegration()
        scenarios = integration.get_available_demo_scenarios()
        
        assert isinstance(scenarios, dict)
        assert len(scenarios) > 0
        
        # Check scenario structure
        for scenario_type, details in scenarios.items():
            required_fields = [
                "attack_vector", "source", "severity", "tactics", 
                "hkma_relevance", "description"
            ]
            for field in required_fields:
                assert field in details, f"Missing field {field} in scenario {scenario_type}"
    
    @patch('src.demo.integration.DemoDataGenerator')
    @patch('boto3.client')
    def test_create_demo_preset_configurations(self, mock_boto_client, mock_generator_class):
        """Test creating demo preset configurations."""
        mock_boto_client.return_value = self.mock_events_client
        mock_generator_class.return_value = Mock()
        
        integration = DemoPipelineIntegration()
        presets = integration.create_demo_preset_configurations()
        
        assert isinstance(presets, dict)
        assert len(presets) >= 5  # Should have at least 5 presets
        
        # Check required presets
        required_presets = [
            "technical_deep_dive", "executive_overview", 
            "compliance_focus", "soc_analyst_training", "quick_demo"
        ]
        
        for preset_name in required_presets:
            assert preset_name in presets, f"Missing required preset: {preset_name}"
            preset = presets[preset_name]
            
            # Check preset structure
            required_fields = [
                "name", "description", "scenario_types", "target_audience",
                "demo_parameters", "duration_minutes"
            ]
            for field in required_fields:
                assert field in preset, f"Missing field {field} in preset {preset_name}"
    
    @patch('src.demo.integration.DemoDataGenerator')
    @patch('boto3.client')
    def test_validate_demo_configuration(self, mock_boto_client, mock_generator_class):
        """Test demo configuration validation."""
        mock_boto_client.return_value = self.mock_events_client
        mock_generator_class.return_value = Mock()
        
        integration = DemoPipelineIntegration()
        
        # Test valid configuration
        valid_config = {
            "scenario_types": ["phishing_email", "malware_detection"],
            "interval_seconds": 30.0,
            "false_positive_rate": 0.8,
            "duration_minutes": 15,
            "complexity_level": "intermediate"
        }
        
        result = integration.validate_demo_configuration(valid_config)
        assert result["valid"] is True
        assert len(result["errors"]) == 0
        
        # Test invalid configuration
        invalid_config = {
            "scenario_types": ["invalid_scenario"],
            "interval_seconds": 5.0,  # Too short
            "false_positive_rate": 1.5,  # Out of range
            "duration_minutes": -10  # Invalid
        }
        
        result = integration.validate_demo_configuration(invalid_config)
        assert result["valid"] is False
        assert len(result["errors"]) > 0
        
        # Check specific error types
        error_messages = " ".join(result["errors"])
        assert "scenario_types" in error_messages
        assert "interval_seconds" in error_messages
        assert "false_positive_rate" in error_messages
    
    @patch('src.demo.integration.DemoDataGenerator')
    @patch('boto3.client')
    def test_create_demo_investigation_event(self, mock_boto_client, mock_generator_class):
        """Test creating demo investigation events for EventBridge."""
        mock_boto_client.return_value = self.mock_events_client
        mock_generator_class.return_value = Mock()
        
        integration = DemoPipelineIntegration()
        
        # Create test alert
        alert = DemoAlert(
            alert_id="DEMO-TEST-001",
            investigation_id="INV-DEMO-TEST-001",
            tenant_id="test-tenant",
            source="sentinel",
            title="Test Phishing Alert",
            description="Test phishing email detected",
            severity="High",
            risk_level="high",
            entities=[{"type": "email", "name": "test@malicious.com"}],
            tactics=["InitialAccess"],
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type="phishing_email",
            is_false_positive=False,
            confidence_score=0.85,
            raw_data={"source_ip": "192.168.1.100"}
        )
        
        event = integration.create_demo_investigation_event(alert)
        
        # Verify event structure
        assert event["Source"] == "asia.agentic.soc.demo"
        assert event["DetailType"] == "DemoAlert"
        assert event["EventBusName"] == "default"
        
        # Verify event detail
        detail = json.loads(event["Detail"])
        assert detail["investigationId"] == alert.investigation_id
        assert detail["tenantId"] == alert.tenant_id
        assert detail["alert"]["isDemo"] is True
        assert detail["demoMetadata"]["scenarioType"] == "phishing_email"
        assert detail["demoMetadata"]["isDemo"] is True
        
        # Verify alert data structure
        alert_data = detail["alert"]
        assert alert_data["alertId"] == alert.alert_id
        assert alert_data["title"] == alert.title
        assert alert_data["severity"] == alert.severity
        assert len(alert_data["entities"]) == 1
    
    @patch('src.demo.integration.DemoDataGenerator')
    @patch('boto3.client')
    def test_get_demo_metrics_schema(self, mock_boto_client, mock_generator_class):
        """Test demo metrics schema definition."""
        mock_boto_client.return_value = self.mock_events_client
        mock_generator_class.return_value = Mock()
        
        integration = DemoPipelineIntegration()
        schema = integration.get_demo_metrics_schema()
        
        assert isinstance(schema, dict)
        assert "session_metrics" in schema
        assert "alert_metrics" in schema
        assert "performance_metrics" in schema
        
        # Check session metrics schema
        session_schema = schema["session_metrics"]
        required_session_fields = [
            "session_id", "start_time", "end_time", "total_alerts_generated",
            "automation_rate", "escalation_rate", "avg_processing_time"
        ]
        for field in required_session_fields:
            assert field in session_schema, f"Missing session metric field: {field}"
        
        # Check alert metrics schema
        alert_schema = schema["alert_metrics"]
        required_alert_fields = [
            "alert_id", "investigation_id", "scenario_type", "outcome",
            "confidence_score", "processing_time", "is_false_positive"
        ]
        for field in required_alert_fields:
            assert field in alert_schema, f"Missing alert metric field: {field}"


@mock_dynamodb
@mock_events
class TestEndToEndDemoWorkflow:
    """Test complete end-to-end demo workflow."""
    
    def setup_method(self):
        """Set up test environment with AWS mocks."""
        # Create DynamoDB table
        self.dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        self.sessions_table = self.dynamodb.create_table(
            TableName='demo-sessions',
            KeySchema=[{'AttributeName': 'session_id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'session_id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        
        self.investigations_table = self.dynamodb.create_table(
            TableName='investigations',
            KeySchema=[
                {'AttributeName': 'tenant_id', 'KeyType': 'HASH'},
                {'AttributeName': 'investigation_id', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'tenant_id', 'AttributeType': 'S'},
                {'AttributeName': 'investigation_id', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        # Create EventBridge client
        self.events_client = boto3.client('events', region_name='us-east-1')
    
    @patch('src.demo.generator.BedrockAnalyst')
    def test_complete_demo_session_workflow(self, mock_analyst_class):
        """Test complete demo session from start to finish."""
        # Mock analyst
        mock_analyst = Mock()
        mock_analyst.summarize_investigation.return_value = {
            "summary": json.dumps({
                "title": "Phishing Email Detected",
                "description": "Suspicious email with malicious attachment",
                "entities": [{"type": "email", "name": "phishing@malicious.com"}],
                "risk_indicators": ["external_sender", "suspicious_attachment"]
            })
        }
        mock_analyst_class.return_value = mock_analyst
        
        # Initialize components
        session_manager = DemoSessionManager(table_name='demo-sessions')
        controller = DemoSessionController(table_name='demo-sessions')
        
        # Step 1: Start demo session
        session_result = controller.start_demo_session(
            created_by="test-user",
            tenant_id="test-tenant",
            preset_name="technical_deep_dive"
        )
        
        assert session_result['success'] is True
        session_id = session_result['session_id']
        
        # Step 2: Verify session is active
        session_status = controller.get_session_status(session_id)
        assert session_status['success'] is True
        assert session_status['status'] == SessionStatus.ACTIVE.value
        
        # Step 3: Generate demo alerts
        with patch('src.demo.generator.DemoDataGenerator') as mock_generator_class:
            mock_generator = Mock()
            mock_generator_class.return_value = mock_generator
            
            # Mock alert generation
            test_alert = DemoAlert(
                alert_id="DEMO-E2E-001",
                investigation_id="INV-DEMO-E2E-001",
                tenant_id="test-tenant",
                source="sentinel",
                title="E2E Test Alert",
                description="End-to-end test alert",
                severity="Medium",
                risk_level="medium",
                entities=[{"type": "test", "name": "e2e_entity"}],
                tactics=["InitialAccess"],
                timestamp=datetime.now(timezone.utc).isoformat(),
                scenario_type="phishing_email",
                is_false_positive=True,
                confidence_score=0.3,
                raw_data={"test": True}
            )
            
            mock_generator.generate_single_alert.return_value = test_alert
            
            integration = DemoPipelineIntegration()
            generated_alert = integration.generator.generate_single_alert(
                scenario_type="phishing_email",
                risk_level="medium"
            )
            
            assert generated_alert.alert_id == "DEMO-E2E-001"
            assert generated_alert.is_false_positive is True
        
        # Step 4: Update session parameters
        param_update_result = controller.update_session_parameters(
            session_id,
            {"interval_seconds": 60.0, "false_positive_rate": 0.9}
        )
        assert param_update_result['success'] is True
        
        # Step 5: Pause session
        pause_result = controller.pause_demo_session(session_id)
        assert pause_result['success'] is True
        assert pause_result['status'] == "paused"
        
        # Step 6: Resume session
        resume_result = controller.resume_demo_session(session_id)
        assert resume_result['success'] is True
        assert resume_result['status'] == "active"
        
        # Step 7: Stop session
        stop_result = controller.stop_demo_session(session_id)
        assert stop_result['success'] is True
        assert stop_result['status'] == "stopped"
        
        # Step 8: Verify final session state
        final_status = controller.get_session_status(session_id)
        assert final_status['success'] is True
        assert final_status['status'] == SessionStatus.STOPPED.value
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_demo_alert_pipeline_integration(self, mock_boto_client, mock_analyst_class):
        """Test demo alert integration with investigation pipeline."""
        # Mock EventBridge client
        mock_events = Mock()
        mock_boto_client.return_value = mock_events
        
        # Mock analyst
        mock_analyst = Mock()
        mock_analyst.summarize_investigation.return_value = {
            "summary": json.dumps({
                "title": "Pipeline Integration Test",
                "description": "Testing pipeline integration",
                "entities": [{"type": "test", "name": "pipeline_test"}]
            })
        }
        mock_analyst_class.return_value = mock_analyst
        
        # Initialize generator
        generator = DemoDataGenerator()
        
        # Generate and send alert
        alert = generator.generate_single_alert(
            scenario_type="malware_detection",
            risk_level="high"
        )
        
        generator.send_alert_to_pipeline(alert)
        
        # Verify EventBridge call
        mock_events.put_events.assert_called_once()
        call_args = mock_events.put_events.call_args[1]
        
        assert "Entries" in call_args
        entry = call_args["Entries"][0]
        assert entry["Source"] == "asia.agentic.soc.demo"
        assert entry["DetailType"] == "DemoAlert"
        
        # Verify event structure
        detail = json.loads(entry["Detail"])
        assert detail["investigationId"] == alert.investigation_id
        assert detail["alert"]["isDemo"] is True
        assert detail["demoMetadata"]["scenarioType"] == "malware_detection"
    
    @patch('src.demo.progress_tracker.ProgressTracker')
    @patch('src.metrics.collector.RealTimeMetricsCollector')
    def test_demo_metrics_and_progress_tracking(self, mock_metrics_class, mock_progress_class):
        """Test demo metrics collection and progress tracking integration."""
        # Mock progress tracker
        mock_progress_tracker = Mock()
        mock_progress_class.return_value = mock_progress_tracker
        
        # Mock metrics collector
        mock_metrics_collector = Mock()
        mock_metrics_class.return_value = mock_metrics_collector
        
        # Initialize integration
        integration = DemoPipelineIntegration()
        
        # Test progress tracking
        investigation_id = "INV-METRICS-TEST-001"
        tenant_id = "test-tenant"
        
        # Start progress tracking
        integration.progress_tracker.start_investigation_tracking(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            is_demo=True
        )
        
        mock_progress_tracker.start_investigation_tracking.assert_called_with(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            is_demo=True
        )
        
        # Update progress
        integration.progress_tracker.update_agent_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            stage="analyze",
            agent_name="Analyst",
            status="completed",
            progress_percentage=100.0,
            confidence_score=0.8
        )
        
        mock_progress_tracker.update_agent_progress.assert_called()
        
        # Record metrics
        integration.metrics_collector.record_investigation_outcome(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            outcome="auto_closed",
            confidence_score=0.8,
            false_positive_probability=0.9,
            processing_time_seconds=45.0,
            automation_decision="auto_close",
            escalated_to_human=False,
            risk_level="low",
            scenario_type="phishing_email",
            is_demo=True
        )
        
        mock_metrics_collector.record_investigation_outcome.assert_called()
    
    def test_concurrent_demo_sessions(self):
        """Test handling multiple concurrent demo sessions."""
        session_manager = DemoSessionManager(table_name='demo-sessions')
        controller = DemoSessionController(table_name='demo-sessions')
        
        # Create multiple sessions
        sessions = []
        for i in range(5):
            result = controller.start_demo_session(
                created_by=f"user-{i}",
                tenant_id=f"tenant-{i}",
                preset_name="quick_demo"
            )
            assert result['success'] is True
            sessions.append(result['session_id'])
        
        # Verify all sessions are active
        for session_id in sessions:
            status = controller.get_session_status(session_id)
            assert status['success'] is True
            assert status['status'] == SessionStatus.ACTIVE.value
        
        # Pause some sessions
        for i in range(0, 5, 2):  # Pause sessions 0, 2, 4
            result = controller.pause_demo_session(sessions[i])
            assert result['success'] is True
        
        # Stop remaining active sessions
        for i in range(1, 5, 2):  # Stop sessions 1, 3
            result = controller.stop_demo_session(sessions[i])
            assert result['success'] is True
        
        # Verify final states
        expected_states = ["paused", "stopped", "paused", "stopped", "paused"]
        for i, session_id in enumerate(sessions):
            status = controller.get_session_status(session_id)
            assert status['status'] == expected_states[i]


class TestAWSServiceIntegration:
    """Test AWS service integration for demo system."""
    
    @patch('boto3.client')
    def test_eventbridge_service_integration(self, mock_boto_client):
        """Test EventBridge service integration."""
        mock_events = Mock()
        mock_boto_client.return_value = mock_events
        
        # Test successful event publishing
        mock_events.put_events.return_value = {
            'FailedEntryCount': 0,
            'Entries': [{'EventId': 'test-event-id'}]
        }
        
        integration = DemoPipelineIntegration()
        
        test_alert = DemoAlert(
            alert_id="AWS-TEST-001",
            investigation_id="INV-AWS-TEST-001",
            tenant_id="test-tenant",
            source="test",
            title="AWS Integration Test",
            description="Testing AWS service integration",
            severity="Low",
            risk_level="low",
            entities=[],
            tactics=["Discovery"],
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type="test_scenario",
            is_false_positive=True,
            confidence_score=0.2,
            raw_data={}
        )
        
        # Should not raise exception
        integration.send_demo_alert_to_pipeline(test_alert)
        
        mock_events.put_events.assert_called_once()
    
    @patch('boto3.client')
    def test_eventbridge_error_handling(self, mock_boto_client):
        """Test EventBridge error handling."""
        mock_events = Mock()
        mock_boto_client.return_value = mock_events
        
        # Test failed event publishing
        mock_events.put_events.return_value = {
            'FailedEntryCount': 1,
            'Entries': [{'ErrorCode': 'InternalException', 'ErrorMessage': 'Service error'}]
        }
        
        integration = DemoPipelineIntegration()
        
        test_alert = DemoAlert(
            alert_id="ERROR-TEST-001",
            investigation_id="INV-ERROR-TEST-001",
            tenant_id="test-tenant",
            source="test",
            title="Error Test",
            description="Testing error handling",
            severity="Low",
            risk_level="low",
            entities=[],
            tactics=[],
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type="test_scenario",
            is_false_positive=True,
            confidence_score=0.1,
            raw_data={}
        )
        
        # Should handle error gracefully
        with pytest.raises(Exception):
            integration.send_demo_alert_to_pipeline(test_alert)
    
    @mock_dynamodb
    def test_dynamodb_service_integration(self):
        """Test DynamoDB service integration."""
        # Create table
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        table = dynamodb.create_table(
            TableName='test-integration',
            KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        
        # Test write operation
        table.put_item(Item={
            'id': 'test-item',
            'data': 'test-data',
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
        
        # Test read operation
        response = table.get_item(Key={'id': 'test-item'})
        assert 'Item' in response
        assert response['Item']['data'] == 'test-data'


if __name__ == "__main__":
    pytest.main([__file__, "-v"])