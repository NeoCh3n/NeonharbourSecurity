"""
Comprehensive unit tests for demo session management system.
Tests session lifecycle, parameter management, and real-time control.
"""

import pytest
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal
from moto import mock_dynamodb
import boto3

from src.demo.session import (
    DemoSessionManager, 
    DemoSession, 
    DemoParameters, 
    DemoMetrics,
    SessionStatus,
    AudienceType,
    ComplexityLevel,
    DEMO_PRESETS
)
from src.demo.controller import DemoSessionController


class TestDemoParameters:
    """Test demo parameters model and validation."""
    
    def test_default_parameters(self):
        """Test default parameter values."""
        params = DemoParameters()
        
        assert params.interval_seconds == 30.0
        assert params.false_positive_rate == 0.8
        assert params.complexity_level == ComplexityLevel.INTERMEDIATE.value
        assert params.target_audience == AudienceType.TECHNICAL.value
        assert params.duration_minutes is None
        assert params.scenario_types == ["phishing", "malware", "insider_threat"]
    
    def test_custom_parameters(self):
        """Test custom parameter values and validation."""
        params = DemoParameters(
            interval_seconds=15.0,
            false_positive_rate=0.9,
            complexity_level=ComplexityLevel.ADVANCED.value,
            target_audience=AudienceType.EXECUTIVE.value,
            duration_minutes=45,
            scenario_types=["ransomware", "apt"]
        )
        
        assert params.interval_seconds == 15.0
        assert params.false_positive_rate == 0.9
        assert params.complexity_level == ComplexityLevel.ADVANCED.value
        assert params.target_audience == AudienceType.EXECUTIVE.value
        assert params.duration_minutes == 45
        assert params.scenario_types == ["ransomware", "apt"]
    
    def test_parameter_validation(self):
        """Test parameter validation logic."""
        # Test valid parameters
        valid_params = DemoParameters(
            interval_seconds=20.0,
            false_positive_rate=0.75,
            duration_minutes=30
        )
        
        validation_result = valid_params.validate()
        assert validation_result["valid"] is True
        assert len(validation_result["errors"]) == 0
        
        # Test invalid interval
        invalid_params = DemoParameters(interval_seconds=5.0)  # Too short
        validation_result = invalid_params.validate()
        assert validation_result["valid"] is False
        assert any("interval_seconds" in error for error in validation_result["errors"])
        
        # Test invalid false positive rate
        invalid_params = DemoParameters(false_positive_rate=1.5)  # Out of range
        validation_result = invalid_params.validate()
        assert validation_result["valid"] is False
        assert any("false_positive_rate" in error for error in validation_result["errors"])
    
    def test_parameter_serialization(self):
        """Test parameter serialization for storage."""
        params = DemoParameters(
            interval_seconds=25.0,
            false_positive_rate=0.85,
            complexity_level=ComplexityLevel.ADVANCED.value,
            target_audience=AudienceType.COMPLIANCE.value,
            duration_minutes=60,
            scenario_types=["phishing", "data_breach"]
        )
        
        # Test to_dict
        params_dict = params.to_dict()
        assert params_dict["interval_seconds"] == 25.0
        assert params_dict["false_positive_rate"] == 0.85
        assert params_dict["scenario_types"] == ["phishing", "data_breach"]
        
        # Test from_dict
        restored_params = DemoParameters.from_dict(params_dict)
        assert restored_params.interval_seconds == params.interval_seconds
        assert restored_params.false_positive_rate == params.false_positive_rate
        assert restored_params.scenario_types == params.scenario_types


class TestDemoMetrics:
    """Test demo metrics model and calculations."""
    
    def test_default_metrics(self):
        """Test default metrics initialization."""
        metrics = DemoMetrics()
        
        assert metrics.alerts_generated == 0
        assert metrics.alerts_processed == 0
        assert metrics.auto_closed_count == 0
        assert metrics.escalated_count == 0
        assert metrics.automation_rate == 0.0
        assert metrics.avg_processing_time == 0.0
        assert metrics.session_duration == 0.0
        assert metrics.target_met is False
    
    def test_automation_rate_calculation(self):
        """Test automation rate calculation logic."""
        metrics = DemoMetrics()
        
        # Test with no processed alerts
        metrics.update_automation_rate()
        assert metrics.automation_rate == 0.0
        assert metrics.target_met is False
        
        # Test with processed alerts
        metrics.alerts_processed = 100
        metrics.auto_closed_count = 75
        metrics.monitoring_count = 10
        metrics.escalated_count = 15
        
        metrics.update_automation_rate()
        assert metrics.automation_rate == 0.85  # (75 + 10) / 100
        assert metrics.target_met is True  # 85% > 80% target
        
        # Test edge case - all escalated
        metrics.auto_closed_count = 0
        metrics.monitoring_count = 0
        metrics.escalated_count = 100
        
        metrics.update_automation_rate()
        assert metrics.automation_rate == 0.0
        assert metrics.target_met is False
    
    def test_metrics_update_operations(self):
        """Test metrics update operations."""
        metrics = DemoMetrics()
        
        # Test alert generation tracking
        metrics.increment_alerts_generated(5)
        assert metrics.alerts_generated == 5
        
        # Test alert processing tracking
        metrics.record_alert_processed("auto_closed", 45.0)
        assert metrics.alerts_processed == 1
        assert metrics.auto_closed_count == 1
        assert metrics.total_processing_time == 45.0
        assert metrics.avg_processing_time == 45.0
        
        # Test multiple processing records
        metrics.record_alert_processed("escalated", 120.0)
        metrics.record_alert_processed("auto_closed", 30.0)
        
        assert metrics.alerts_processed == 3
        assert metrics.auto_closed_count == 2
        assert metrics.escalated_count == 1
        assert metrics.avg_processing_time == (45.0 + 120.0 + 30.0) / 3
    
    def test_session_duration_tracking(self):
        """Test session duration calculation."""
        metrics = DemoMetrics()
        start_time = datetime.now(timezone.utc)
        
        # Simulate session running for 30 minutes
        end_time = start_time + timedelta(minutes=30)
        metrics.update_session_duration(start_time, end_time)
        
        assert metrics.session_duration == 30.0  # minutes
    
    def test_metrics_serialization(self):
        """Test metrics serialization for storage."""
        metrics = DemoMetrics(
            alerts_generated=50,
            alerts_processed=45,
            auto_closed_count=35,
            escalated_count=10,
            avg_processing_time=75.5,
            session_duration=25.0
        )
        metrics.update_automation_rate()
        
        # Test to_dict
        metrics_dict = metrics.to_dict()
        assert metrics_dict["alerts_generated"] == 50
        assert metrics_dict["automation_rate"] == 0.78  # (35 + 0) / 45
        assert metrics_dict["target_met"] is False  # 78% < 80%
        
        # Test from_dict
        restored_metrics = DemoMetrics.from_dict(metrics_dict)
        assert restored_metrics.alerts_generated == metrics.alerts_generated
        assert restored_metrics.automation_rate == metrics.automation_rate


@mock_dynamodb
class TestDemoSessionManager:
    """Test demo session manager with mocked DynamoDB."""
    
    def setup_method(self):
        """Set up test environment with DynamoDB table."""
        # Create DynamoDB table
        self.dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        self.table = self.dynamodb.create_table(
            TableName='test-demo-sessions',
            KeySchema=[
                {'AttributeName': 'session_id', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'session_id', 'AttributeType': 'S'},
                {'AttributeName': 'tenant_id', 'AttributeType': 'S'},
                {'AttributeName': 'status', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'TenantStatusIndex',
                    'KeySchema': [
                        {'AttributeName': 'tenant_id', 'KeyType': 'HASH'},
                        {'AttributeName': 'status', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {
                        'ReadCapacityUnits': 5,
                        'WriteCapacityUnits': 5
                    }
                }
            ],
            BillingMode='PROVISIONED',
            ProvisionedThroughput={
                'ReadCapacityUnits': 5,
                'WriteCapacityUnits': 5
            }
        )
        
        self.manager = DemoSessionManager(table_name='test-demo-sessions')
    
    def test_create_session(self):
        """Test session creation."""
        session = self.manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant",
            parameters=DemoParameters(interval_seconds=20.0)
        )
        
        assert session.session_id is not None
        assert session.created_by == "test-user"
        assert session.tenant_id == "test-tenant"
        assert session.status == SessionStatus.ACTIVE.value
        assert session.parameters.interval_seconds == 20.0
        assert isinstance(session.metrics, DemoMetrics)
        assert session.created_at is not None
    
    def test_get_session(self):
        """Test session retrieval."""
        # Create session
        created_session = self.manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Retrieve session
        retrieved_session = self.manager.get_session(created_session.session_id)
        
        assert retrieved_session is not None
        assert retrieved_session.session_id == created_session.session_id
        assert retrieved_session.created_by == created_session.created_by
        assert retrieved_session.tenant_id == created_session.tenant_id
        assert retrieved_session.status == created_session.status
    
    def test_get_nonexistent_session(self):
        """Test retrieving non-existent session."""
        result = self.manager.get_session("nonexistent-session-id")
        assert result is None
    
    def test_update_session_status(self):
        """Test session status updates."""
        # Create session
        session = self.manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Update to paused
        success = self.manager.update_session_status(
            session.session_id, 
            SessionStatus.PAUSED
        )
        assert success is True
        
        # Verify update
        updated_session = self.manager.get_session(session.session_id)
        assert updated_session.status == SessionStatus.PAUSED.value
        assert updated_session.updated_at is not None
        
        # Update to stopped
        success = self.manager.update_session_status(
            session.session_id,
            SessionStatus.STOPPED
        )
        assert success is True
        
        stopped_session = self.manager.get_session(session.session_id)
        assert stopped_session.status == SessionStatus.STOPPED.value
    
    def test_update_session_parameters(self):
        """Test session parameter updates."""
        # Create session
        session = self.manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Update parameters
        new_params = {
            'interval_seconds': 45.0,
            'false_positive_rate': 0.9,
            'duration_minutes': 60
        }
        
        success = self.manager.update_session_parameters(
            session.session_id, 
            new_params
        )
        assert success is True
        
        # Verify update
        updated_session = self.manager.get_session(session.session_id)
        assert updated_session.parameters.interval_seconds == 45.0
        assert updated_session.parameters.false_positive_rate == 0.9
        assert updated_session.parameters.duration_minutes == 60
    
    def test_update_session_metrics(self):
        """Test session metrics updates."""
        # Create session
        session = self.manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Update metrics
        metrics_update = {
            'alerts_generated': 25,
            'alerts_processed': 20,
            'auto_closed_count': 16,
            'escalated_count': 4
        }
        
        success = self.manager.update_session_metrics(
            session.session_id,
            metrics_update
        )
        assert success is True
        
        # Verify update
        updated_session = self.manager.get_session(session.session_id)
        assert updated_session.metrics.alerts_generated == 25
        assert updated_session.metrics.alerts_processed == 20
        assert updated_session.metrics.auto_closed_count == 16
        assert updated_session.metrics.escalated_count == 4
    
    def test_list_sessions_by_tenant(self):
        """Test listing sessions by tenant."""
        tenant_id = "test-tenant"
        
        # Create multiple sessions
        session1 = self.manager.create_session("user1", tenant_id)
        session2 = self.manager.create_session("user2", tenant_id)
        session3 = self.manager.create_session("user3", "other-tenant")
        
        # Pause one session
        self.manager.update_session_status(session2.session_id, SessionStatus.PAUSED)
        
        # List active sessions for tenant
        active_sessions = self.manager.list_sessions_by_tenant(
            tenant_id, 
            status=SessionStatus.ACTIVE
        )
        
        assert len(active_sessions) == 1
        assert active_sessions[0].session_id == session1.session_id
        
        # List all sessions for tenant
        all_sessions = self.manager.list_sessions_by_tenant(tenant_id)
        assert len(all_sessions) == 2
        
        session_ids = [s.session_id for s in all_sessions]
        assert session1.session_id in session_ids
        assert session2.session_id in session_ids
        assert session3.session_id not in session_ids
    
    def test_session_lifecycle_operations(self):
        """Test complete session lifecycle."""
        # Create session
        session = self.manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        assert session.status == SessionStatus.ACTIVE.value
        
        # Pause session
        assert self.manager.pause_session(session.session_id) is True
        paused_session = self.manager.get_session(session.session_id)
        assert paused_session.status == SessionStatus.PAUSED.value
        
        # Resume session
        assert self.manager.resume_session(session.session_id) is True
        resumed_session = self.manager.get_session(session.session_id)
        assert resumed_session.status == SessionStatus.ACTIVE.value
        
        # Stop session
        assert self.manager.stop_session(session.session_id) is True
        stopped_session = self.manager.get_session(session.session_id)
        assert stopped_session.status == SessionStatus.STOPPED.value
        
        # Cannot resume stopped session
        assert self.manager.resume_session(session.session_id) is False
    
    def test_error_handling(self):
        """Test error handling for invalid operations."""
        # Test updating non-existent session
        success = self.manager.update_session_status(
            "nonexistent-id",
            SessionStatus.PAUSED
        )
        assert success is False
        
        # Test invalid parameter updates
        session = self.manager.create_session("test-user", "test-tenant")
        
        invalid_params = {'interval_seconds': -10}  # Invalid value
        success = self.manager.update_session_parameters(
            session.session_id,
            invalid_params
        )
        assert success is False


class TestDemoSessionController:
    """Test demo session controller high-level operations."""
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_start_demo_session_with_preset(self, mock_manager_class):
        """Test starting session with preset configuration."""
        # Mock manager
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        # Mock session creation
        mock_session = Mock()
        mock_session.session_id = "test-session-id"
        mock_session.status = SessionStatus.ACTIVE.value
        mock_session.parameters = DemoParameters()
        mock_session.created_at = datetime.now(timezone.utc)
        mock_manager.create_session.return_value = mock_session
        
        controller = DemoSessionController()
        
        # Test with preset
        result = controller.start_demo_session(
            created_by="test-user",
            tenant_id="test-tenant",
            preset_name="technical_deep_dive"
        )
        
        assert result['success'] is True
        assert result['session_id'] == "test-session-id"
        assert result['status'] == SessionStatus.ACTIVE.value
        assert 'preset_applied' in result
        assert result['preset_applied'] == "technical_deep_dive"
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_start_demo_session_with_custom_parameters(self, mock_manager_class):
        """Test starting session with custom parameters."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        mock_session = Mock()
        mock_session.session_id = "custom-session-id"
        mock_session.status = SessionStatus.ACTIVE.value
        mock_session.parameters = DemoParameters(interval_seconds=45.0)
        mock_session.created_at = datetime.now(timezone.utc)
        mock_manager.create_session.return_value = mock_session
        
        controller = DemoSessionController()
        
        custom_params = {
            'interval_seconds': 45.0,
            'false_positive_rate': 0.85,
            'duration_minutes': 30
        }
        
        result = controller.start_demo_session(
            created_by="test-user",
            tenant_id="test-tenant",
            custom_parameters=custom_params
        )
        
        assert result['success'] is True
        assert result['session_id'] == "custom-session-id"
        assert 'parameters_applied' in result
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_session_control_operations(self, mock_manager_class):
        """Test session control operations through controller."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        # Mock successful operations
        mock_manager.pause_session.return_value = True
        mock_manager.resume_session.return_value = True
        mock_manager.stop_session.return_value = True
        
        controller = DemoSessionController()
        session_id = "test-session-id"
        
        # Test pause
        result = controller.pause_demo_session(session_id)
        assert result['success'] is True
        assert result['status'] == "paused"
        mock_manager.pause_session.assert_called_with(session_id)
        
        # Test resume
        result = controller.resume_demo_session(session_id)
        assert result['success'] is True
        assert result['status'] == "active"
        mock_manager.resume_session.assert_called_with(session_id)
        
        # Test stop
        result = controller.stop_demo_session(session_id)
        assert result['success'] is True
        assert result['status'] == "stopped"
        mock_manager.stop_session.assert_called_with(session_id)
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_parameter_update_validation(self, mock_manager_class):
        """Test parameter update with validation."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        mock_manager.update_session_parameters.return_value = True
        
        controller = DemoSessionController()
        
        # Test valid parameters
        valid_params = {
            'interval_seconds': 30.0,
            'false_positive_rate': 0.8
        }
        
        result = controller.update_session_parameters("test-session", valid_params)
        assert result['success'] is True
        assert result['updated_parameters'] == valid_params
        
        # Test invalid parameters
        invalid_params = {
            'interval_seconds': -5.0,  # Invalid
            'false_positive_rate': 1.5  # Invalid
        }
        
        result = controller.update_session_parameters("test-session", invalid_params)
        assert result['success'] is False
        assert 'validation_errors' in result
        assert len(result['validation_errors']) > 0
    
    def test_get_available_presets(self):
        """Test getting available demo presets."""
        controller = DemoSessionController()
        
        result = controller.get_available_presets()
        
        assert result['success'] is True
        assert 'presets' in result
        assert len(result['presets']) == len(DEMO_PRESETS)
        
        # Verify preset structure
        for preset_name, preset_info in result['presets'].items():
            assert 'name' in preset_info
            assert 'description' in preset_info
            assert 'parameters' in preset_info
            assert 'target_audience' in preset_info
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_get_session_status(self, mock_manager_class):
        """Test getting session status through controller."""
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        # Mock session
        mock_session = Mock()
        mock_session.session_id = "test-session"
        mock_session.status = SessionStatus.ACTIVE.value
        mock_session.parameters = DemoParameters()
        mock_session.metrics = DemoMetrics(alerts_generated=10, alerts_processed=8)
        mock_session.created_at = datetime.now(timezone.utc)
        mock_session.updated_at = datetime.now(timezone.utc)
        
        mock_manager.get_session.return_value = mock_session
        
        controller = DemoSessionController()
        
        result = controller.get_session_status("test-session")
        
        assert result['success'] is True
        assert result['session_id'] == "test-session"
        assert result['status'] == SessionStatus.ACTIVE.value
        assert 'parameters' in result
        assert 'metrics' in result
        assert result['metrics']['alerts_generated'] == 10


class TestDemoPresets:
    """Test demo preset configurations."""
    
    def test_preset_availability(self):
        """Test that all expected presets are available."""
        expected_presets = [
            'technical_deep_dive',
            'executive_overview',
            'compliance_focus',
            'continuous_monitoring',
            'quick_demo'
        ]
        
        for preset_name in expected_presets:
            assert preset_name in DEMO_PRESETS
            preset = DEMO_PRESETS[preset_name]
            assert isinstance(preset, DemoParameters)
    
    def test_technical_deep_dive_preset(self):
        """Test technical deep dive preset configuration."""
        preset = DEMO_PRESETS['technical_deep_dive']
        
        assert preset.interval_seconds == 15.0
        assert preset.false_positive_rate == 0.75
        assert preset.complexity_level == ComplexityLevel.ADVANCED.value
        assert preset.target_audience == AudienceType.TECHNICAL.value
        assert preset.duration_minutes == 45
        assert "advanced_persistent_threat" in preset.scenario_types
        assert "lateral_movement" in preset.scenario_types
    
    def test_executive_overview_preset(self):
        """Test executive overview preset configuration."""
        preset = DEMO_PRESETS['executive_overview']
        
        assert preset.interval_seconds == 45.0
        assert preset.false_positive_rate == 0.85
        assert preset.complexity_level == ComplexityLevel.BASIC.value
        assert preset.target_audience == AudienceType.EXECUTIVE.value
        assert preset.duration_minutes == 20
        assert "phishing" in preset.scenario_types
        assert "malware" in preset.scenario_types
    
    def test_compliance_focus_preset(self):
        """Test compliance focus preset configuration."""
        preset = DEMO_PRESETS['compliance_focus']
        
        assert preset.interval_seconds == 30.0
        assert preset.false_positive_rate == 0.8
        assert preset.complexity_level == ComplexityLevel.INTERMEDIATE.value
        assert preset.target_audience == AudienceType.COMPLIANCE.value
        assert preset.duration_minutes == 30
        assert "data_privacy_violation" in preset.scenario_types
        assert "regulatory_violation" in preset.scenario_types
    
    def test_preset_parameter_validation(self):
        """Test that all presets have valid parameters."""
        for preset_name, preset in DEMO_PRESETS.items():
            validation_result = preset.validate()
            assert validation_result["valid"] is True, f"Preset {preset_name} has invalid parameters: {validation_result['errors']}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])