"""
Unit tests for demo session management system
"""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from moto import mock_aws
import boto3

from src.demo.session import (
    DemoSessionManager, 
    DemoSession, 
    DemoParameters, 
    DemoMetrics,
    SessionStatus,
    DEMO_PRESETS
)
from src.demo.controller import DemoSessionController


@pytest.fixture
def mock_dynamodb_table():
    """Create a mock DynamoDB table for testing"""
    with mock_aws():
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        # Create table
        table = dynamodb.create_table(
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
        
        yield table


class TestDemoParameters:
    """Test demo parameters model"""
    
    def test_default_parameters(self):
        """Test default parameter values"""
        params = DemoParameters()
        
        assert params.interval_seconds == 30.0
        assert params.false_positive_rate == 0.8
        assert params.complexity_level == "intermediate"
        assert params.target_audience == "technical"
        assert params.duration_minutes is None
        assert params.scenario_types == ["phishing", "malware", "insider_threat"]
    
    def test_custom_parameters(self):
        """Test custom parameter values"""
        params = DemoParameters(
            interval_seconds=15.0,
            false_positive_rate=0.9,
            complexity_level="advanced",
            target_audience="executive",
            duration_minutes=45,
            scenario_types=["ransomware", "apt"]
        )
        
        assert params.interval_seconds == 15.0
        assert params.false_positive_rate == 0.9
        assert params.complexity_level == "advanced"
        assert params.target_audience == "executive"
        assert params.duration_minutes == 45
        assert params.scenario_types == ["ransomware", "apt"]


class TestDemoMetrics:
    """Test demo metrics model"""
    
    def test_default_metrics(self):
        """Test default metrics values"""
        metrics = DemoMetrics()
        
        assert metrics.alerts_generated == 0
        assert metrics.alerts_processed == 0
        assert metrics.auto_closed_count == 0
        assert metrics.escalated_count == 0
        assert metrics.automation_rate == 0.0
        assert metrics.avg_processing_time == 0.0
        assert metrics.session_duration == 0.0
    
    def test_automation_rate_calculation(self):
        """Test automation rate calculation"""
        metrics = DemoMetrics()
        
        # No processed alerts
        metrics.update_automation_rate()
        assert metrics.automation_rate == 0.0
        
        # Some processed alerts
        metrics.alerts_processed = 10
        metrics.auto_closed_count = 8
        metrics.update_automation_rate()
        assert metrics.automation_rate == 0.8
        
        # All processed alerts
        metrics.auto_closed_count = 10
        metrics.update_automation_rate()
        assert metrics.automation_rate == 1.0


class TestDemoSessionManager:
    """Test demo session manager"""
    
    def test_create_session(self, mock_dynamodb_table):
        """Test session creation"""
        manager = DemoSessionManager(table_name='test-demo-sessions')
        
        session = manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        assert session.session_id is not None
        assert session.created_by == "test-user"
        assert session.tenant_id == "test-tenant"
        assert session.status == SessionStatus.ACTIVE.value
        assert isinstance(session.parameters, DemoParameters)
        assert isinstance(session.metrics, DemoMetrics)
    
    def test_get_session(self, mock_dynamodb_table):
        """Test session retrieval"""
        manager = DemoSessionManager(table_name='test-demo-sessions')
        
        # Create session
        session = manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Retrieve session
        retrieved = manager.get_session(session.session_id)
        
        assert retrieved is not None
        assert retrieved.session_id == session.session_id
        assert retrieved.created_by == session.created_by
        assert retrieved.tenant_id == session.tenant_id
    
    def test_get_nonexistent_session(self, mock_dynamodb_table):
        """Test retrieving non-existent session"""
        manager = DemoSessionManager(table_name='test-demo-sessions')
        
        result = manager.get_session("nonexistent-id")
        assert result is None
    
    def test_update_session_status(self, mock_dynamodb_table):
        """Test session status updates"""
        manager = DemoSessionManager(table_name='test-demo-sessions')
        
        # Create session
        session = manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Update status
        success = manager.update_session_status(
            session.session_id, 
            SessionStatus.PAUSED
        )
        assert success
        
        # Verify update
        updated = manager.get_session(session.session_id)
        assert updated.status == SessionStatus.PAUSED.value
    
    def test_update_session_parameters(self, mock_dynamodb_table):
        """Test session parameter updates"""
        manager = DemoSessionManager(table_name='test-demo-sessions')
        
        # Create session
        session = manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Update parameters
        new_params = {
            'interval_seconds': 60.0,
            'false_positive_rate': 0.9
        }
        success = manager.update_session_parameters(session.session_id, new_params)
        assert success
    
    def test_pause_resume_stop_session(self, mock_dynamodb_table):
        """Test session lifecycle operations"""
        manager = DemoSessionManager(table_name='test-demo-sessions')
        
        # Create session
        session = manager.create_session(
            created_by="test-user",
            tenant_id="test-tenant"
        )
        
        # Pause session
        assert manager.pause_session(session.session_id)
        paused = manager.get_session(session.session_id)
        assert paused.status == SessionStatus.PAUSED.value
        
        # Resume session
        assert manager.resume_session(session.session_id)
        resumed = manager.get_session(session.session_id)
        assert resumed.status == SessionStatus.ACTIVE.value
        
        # Stop session
        assert manager.stop_session(session.session_id)
        stopped = manager.get_session(session.session_id)
        assert stopped.status == SessionStatus.STOPPED.value


class TestDemoSessionController:
    """Test demo session controller"""
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_start_demo_session_success(self, mock_manager_class):
        """Test successful session start"""
        # Mock manager
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        # Mock session creation
        mock_session = Mock()
        mock_session.session_id = "test-session-id"
        mock_session.status = SessionStatus.ACTIVE.value
        mock_session.parameters = DemoParameters()
        mock_session.created_at = datetime.utcnow()
        mock_manager.create_session.return_value = mock_session
        
        # Test controller
        controller = DemoSessionController()
        result = controller.start_demo_session(
            created_by="test-user",
            tenant_id="test-tenant",
            preset_name="technical_deep_dive"
        )
        
        assert result['success'] is True
        assert result['session_id'] == "test-session-id"
        assert result['status'] == SessionStatus.ACTIVE.value
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_start_demo_session_with_custom_parameters(self, mock_manager_class):
        """Test session start with custom parameters"""
        # Mock manager
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        
        # Mock session creation
        mock_session = Mock()
        mock_session.session_id = "test-session-id"
        mock_session.status = SessionStatus.ACTIVE.value
        mock_session.parameters = DemoParameters()
        mock_session.created_at = datetime.utcnow()
        mock_manager.create_session.return_value = mock_session
        
        # Test controller with custom parameters
        controller = DemoSessionController()
        custom_params = {
            'interval_seconds': 45.0,
            'false_positive_rate': 0.85
        }
        
        result = controller.start_demo_session(
            created_by="test-user",
            tenant_id="test-tenant",
            custom_parameters=custom_params
        )
        
        assert result['success'] is True
        # Verify manager was called with parameters
        mock_manager.create_session.assert_called_once()
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_pause_resume_stop_session(self, mock_manager_class):
        """Test session control operations"""
        # Mock manager
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        mock_manager.pause_session.return_value = True
        mock_manager.resume_session.return_value = True
        mock_manager.stop_session.return_value = True
        
        controller = DemoSessionController()
        
        # Test pause
        result = controller.pause_demo_session("test-session-id")
        assert result['success'] is True
        assert result['status'] == "paused"
        
        # Test resume
        result = controller.resume_demo_session("test-session-id")
        assert result['success'] is True
        assert result['status'] == "active"
        
        # Test stop
        result = controller.stop_demo_session("test-session-id")
        assert result['success'] is True
        assert result['status'] == "stopped"
    
    @patch('src.demo.controller.DemoSessionManager')
    def test_update_session_parameters(self, mock_manager_class):
        """Test parameter updates"""
        # Mock manager
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager
        mock_manager.update_session_parameters.return_value = True
        
        controller = DemoSessionController()
        
        parameters = {
            'interval_seconds': 30.0,
            'false_positive_rate': 0.8
        }
        
        result = controller.update_session_parameters("test-session-id", parameters)
        
        assert result['success'] is True
        assert result['updated_parameters'] == parameters
        mock_manager.update_session_parameters.assert_called_once_with(
            "test-session-id", parameters
        )
    
    def test_parameter_validation(self):
        """Test parameter validation"""
        controller = DemoSessionController()
        
        # Valid parameters
        valid_params = {
            'interval_seconds': 30.0,
            'false_positive_rate': 0.8,
            'duration_minutes': 45
        }
        result = controller._validate_parameters(valid_params)
        assert result['valid'] is True
        
        # Invalid interval
        invalid_params = {'interval_seconds': -5}
        result = controller._validate_parameters(invalid_params)
        assert result['valid'] is False
        
        # Invalid false positive rate
        invalid_params = {'false_positive_rate': 1.5}
        result = controller._validate_parameters(invalid_params)
        assert result['valid'] is False
    
    def test_get_available_presets(self):
        """Test getting available presets"""
        controller = DemoSessionController()
        
        result = controller.get_available_presets()
        
        assert result['success'] is True
        assert 'presets' in result
        assert len(result['presets']) == len(DEMO_PRESETS)
        
        # Check specific preset
        assert 'technical_deep_dive' in result['presets']
        preset = result['presets']['technical_deep_dive']
        assert 'name' in preset
        assert 'description' in preset
        assert 'parameters' in preset


class TestDemoPresets:
    """Test demo preset configurations"""
    
    def test_preset_availability(self):
        """Test that all expected presets are available"""
        expected_presets = [
            'technical_deep_dive',
            'executive_overview', 
            'compliance_focus',
            'continuous_monitoring'
        ]
        
        for preset_name in expected_presets:
            assert preset_name in DEMO_PRESETS
            preset = DEMO_PRESETS[preset_name]
            assert isinstance(preset, DemoParameters)
    
    def test_technical_deep_dive_preset(self):
        """Test technical deep dive preset configuration"""
        preset = DEMO_PRESETS['technical_deep_dive']
        
        assert preset.interval_seconds == 15.0
        assert preset.false_positive_rate == 0.75
        assert preset.complexity_level == "advanced"
        assert preset.target_audience == "technical"
        assert preset.duration_minutes == 45
        assert "advanced_persistent_threat" in preset.scenario_types
    
    def test_executive_overview_preset(self):
        """Test executive overview preset configuration"""
        preset = DEMO_PRESETS['executive_overview']
        
        assert preset.interval_seconds == 45.0
        assert preset.false_positive_rate == 0.85
        assert preset.complexity_level == "basic"
        assert preset.target_audience == "executive"
        assert preset.duration_minutes == 20
        assert "phishing" in preset.scenario_types
    
    def test_compliance_focus_preset(self):
        """Test compliance focus preset configuration"""
        preset = DEMO_PRESETS['compliance_focus']
        
        assert preset.interval_seconds == 30.0
        assert preset.false_positive_rate == 0.8
        assert preset.complexity_level == "intermediate"
        assert preset.target_audience == "compliance"
        assert preset.duration_minutes == 30
        assert "regulatory_violation" in preset.scenario_types
    
    def test_continuous_monitoring_preset(self):
        """Test continuous monitoring preset configuration"""
        preset = DEMO_PRESETS['continuous_monitoring']
        
        assert preset.interval_seconds == 60.0
        assert preset.false_positive_rate == 0.9
        assert preset.complexity_level == "basic"
        assert preset.target_audience == "technical"
        assert preset.duration_minutes is None  # Continuous
        assert len(preset.scenario_types) >= 4  # Multiple scenario types