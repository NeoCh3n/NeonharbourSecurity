"""
Integration tests for demo session management system
"""

import pytest
import json
import os
from datetime import datetime
from unittest.mock import patch, Mock

from src.demo.api import handler
from src.demo.session import SessionStatus


class TestDemoSessionAPI:
    """Integration tests for demo session API"""
    
    @patch('src.demo.api.DemoSessionController')
    def test_create_session_api(self, mock_controller_class):
        """Test session creation via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock successful session creation
        mock_controller.start_demo_session.return_value = {
            'success': True,
            'session_id': 'test-session-123',
            'status': 'active',
            'parameters': {
                'interval_seconds': 30.0,
                'false_positive_rate': 0.8
            },
            'created_at': '2024-01-01T12:00:00',
            'message': 'Demo session started successfully'
        }
        
        # Create API event
        event = {
            'httpMethod': 'POST',
            'path': '/demo/sessions',
            'body': json.dumps({
                'preset_name': 'technical_deep_dive',
                'parameters': {
                    'interval_seconds': 20.0
                }
            }),
            'requestContext': {
                'authorizer': {
                    'user_id': 'test-user',
                    'tenant_id': 'test-tenant'
                }
            }
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 201
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['session_id'] == 'test-session-123'
        
        # Verify controller was called correctly
        mock_controller.start_demo_session.assert_called_once_with(
            created_by='test-user',
            tenant_id='test-tenant',
            preset_name='technical_deep_dive',
            custom_parameters={'interval_seconds': 20.0}
        )
    
    @patch('src.demo.api.DemoSessionController')
    def test_get_session_api(self, mock_controller_class):
        """Test get session via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock session retrieval
        mock_controller.get_session_status.return_value = {
            'success': True,
            'session_id': 'test-session-123',
            'status': 'active',
            'created_at': '2024-01-01T12:00:00',
            'created_by': 'test-user',
            'tenant_id': 'test-tenant',
            'parameters': {
                'interval_seconds': 30.0,
                'false_positive_rate': 0.8
            },
            'metrics': {
                'alerts_generated': 10,
                'alerts_processed': 8,
                'automation_rate': 0.8
            }
        }
        
        # Create API event
        event = {
            'httpMethod': 'GET',
            'path': '/demo/sessions/test-session-123',
            'pathParameters': {
                'session_id': 'test-session-123'
            }
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['session_id'] == 'test-session-123'
        assert body['status'] == 'active'
        
        # Verify controller was called
        mock_controller.get_session_status.assert_called_once_with('test-session-123')
    
    @patch('src.demo.api.DemoSessionController')
    def test_update_parameters_api(self, mock_controller_class):
        """Test parameter update via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock parameter update
        mock_controller.update_session_parameters.return_value = {
            'success': True,
            'session_id': 'test-session-123',
            'updated_parameters': {
                'interval_seconds': 45.0,
                'false_positive_rate': 0.9
            },
            'message': 'Parameters updated successfully'
        }
        
        # Create API event
        event = {
            'httpMethod': 'PUT',
            'path': '/demo/sessions/test-session-123/parameters',
            'pathParameters': {
                'session_id': 'test-session-123'
            },
            'body': json.dumps({
                'parameters': {
                    'interval_seconds': 45.0,
                    'false_positive_rate': 0.9
                }
            })
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['updated_parameters']['interval_seconds'] == 45.0
        
        # Verify controller was called
        mock_controller.update_session_parameters.assert_called_once_with(
            'test-session-123',
            {'interval_seconds': 45.0, 'false_positive_rate': 0.9}
        )
    
    @patch('src.demo.api.DemoSessionController')
    def test_pause_session_api(self, mock_controller_class):
        """Test session pause via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock pause operation
        mock_controller.pause_demo_session.return_value = {
            'success': True,
            'session_id': 'test-session-123',
            'status': 'paused',
            'message': 'Session paused successfully'
        }
        
        # Create API event
        event = {
            'httpMethod': 'PUT',
            'path': '/demo/sessions/test-session-123/status',
            'pathParameters': {
                'session_id': 'test-session-123'
            },
            'body': json.dumps({
                'action': 'pause'
            })
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['status'] == 'paused'
        
        # Verify controller was called
        mock_controller.pause_demo_session.assert_called_once_with('test-session-123')
    
    @patch('src.demo.api.DemoSessionController')
    def test_list_sessions_api(self, mock_controller_class):
        """Test list sessions via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock session list
        mock_controller.list_active_sessions.return_value = {
            'success': True,
            'sessions': [
                {
                    'session_id': 'session-1',
                    'status': 'active',
                    'created_by': 'user-1',
                    'tenant_id': 'test-tenant'
                },
                {
                    'session_id': 'session-2',
                    'status': 'paused',
                    'created_by': 'user-2',
                    'tenant_id': 'test-tenant'
                }
            ],
            'count': 2,
            'message': 'Found 2 active sessions'
        }
        
        # Create API event
        event = {
            'httpMethod': 'GET',
            'path': '/demo/sessions',
            'queryStringParameters': {
                'tenant_id': 'test-tenant'
            },
            'requestContext': {
                'authorizer': {
                    'tenant_id': 'test-tenant'
                }
            }
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['count'] == 2
        assert len(body['sessions']) == 2
        
        # Verify controller was called
        mock_controller.list_active_sessions.assert_called_once_with('test-tenant')
    
    @patch('src.demo.api.DemoSessionController')
    def test_get_presets_api(self, mock_controller_class):
        """Test get presets via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock presets
        mock_controller.get_available_presets.return_value = {
            'success': True,
            'presets': {
                'technical_deep_dive': {
                    'name': 'technical_deep_dive',
                    'description': 'Advanced technical demonstration',
                    'parameters': {
                        'interval_seconds': 15.0,
                        'complexity_level': 'advanced'
                    }
                }
            },
            'count': 1,
            'message': 'Found 1 available presets'
        }
        
        # Create API event
        event = {
            'httpMethod': 'GET',
            'path': '/demo/presets'
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert 'presets' in body
        assert 'technical_deep_dive' in body['presets']
        
        # Verify controller was called
        mock_controller.get_available_presets.assert_called_once()
    
    @patch('src.demo.api.DemoSessionController')
    def test_stop_session_api(self, mock_controller_class):
        """Test session stop via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock stop operation
        mock_controller.stop_demo_session.return_value = {
            'success': True,
            'session_id': 'test-session-123',
            'status': 'stopped',
            'final_metrics': {
                'alerts_generated': 20,
                'alerts_processed': 18,
                'automation_rate': 0.9
            },
            'message': 'Session stopped successfully'
        }
        
        # Create API event
        event = {
            'httpMethod': 'DELETE',
            'path': '/demo/sessions/test-session-123',
            'pathParameters': {
                'session_id': 'test-session-123'
            }
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['status'] == 'stopped'
        assert 'final_metrics' in body
        
        # Verify controller was called
        mock_controller.stop_demo_session.assert_called_once_with('test-session-123')
    
    @patch('src.demo.api.DemoSessionController')
    def test_update_metrics_api(self, mock_controller_class):
        """Test metrics update via API"""
        # Mock controller
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        
        # Mock metrics update
        mock_controller.update_session_metrics.return_value = {
            'success': True,
            'session_id': 'test-session-123',
            'updated_metrics': {
                'alerts_generated': 15,
                'alerts_processed': 12,
                'automation_rate': 0.8
            },
            'message': 'Metrics updated successfully'
        }
        
        # Create API event
        event = {
            'httpMethod': 'PUT',
            'path': '/demo/sessions/test-session-123/metrics',
            'pathParameters': {
                'session_id': 'test-session-123'
            },
            'body': json.dumps({
                'metrics': {
                    'alerts_generated': 15,
                    'alerts_processed': 12,
                    'auto_closed_count': 10
                }
            })
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['success'] is True
        assert body['updated_metrics']['alerts_generated'] == 15
        
        # Verify controller was called
        mock_controller.update_session_metrics.assert_called_once_with(
            'test-session-123',
            {
                'alerts_generated': 15,
                'alerts_processed': 12,
                'auto_closed_count': 10
            }
        )
    
    def test_invalid_endpoint(self):
        """Test invalid endpoint handling"""
        event = {
            'httpMethod': 'GET',
            'path': '/demo/invalid-endpoint'
        }
        
        response = handler(event, {})
        
        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'not found' in body['message'].lower()
    
    def test_invalid_json_body(self):
        """Test invalid JSON handling"""
        event = {
            'httpMethod': 'POST',
            'path': '/demo/sessions',
            'body': 'invalid-json'
        }
        
        response = handler(event, {})
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'Invalid JSON' in body['error']
    
    @patch('src.demo.api.DemoSessionController')
    def test_controller_exception_handling(self, mock_controller_class):
        """Test exception handling in API"""
        # Mock controller to raise exception
        mock_controller = Mock()
        mock_controller_class.return_value = mock_controller
        mock_controller.start_demo_session.side_effect = Exception("Database error")
        
        # Create API event
        event = {
            'httpMethod': 'POST',
            'path': '/demo/sessions',
            'body': json.dumps({
                'preset_name': 'technical_deep_dive'
            }),
            'requestContext': {
                'authorizer': {
                    'user_id': 'test-user',
                    'tenant_id': 'test-tenant'
                }
            }
        }
        
        # Call handler
        response = handler(event, {})
        
        # Verify error response
        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['success'] is False
        assert 'Internal server error' in body['message']