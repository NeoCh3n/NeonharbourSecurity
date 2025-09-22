"""
Demo Session API Handler

Lambda function handler for demo session management API endpoints.
"""

import json
import os
from typing import Dict, Any

from .controller import DemoSessionController


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for demo session API operations
    
    Expected event structure:
    {
        "httpMethod": "POST|GET|PUT|DELETE",
        "path": "/demo/sessions/{operation}",
        "pathParameters": {"session_id": "..."},
        "body": "{...}",
        "requestContext": {
            "authorizer": {
                "user_id": "...",
                "tenant_id": "..."
            }
        }
    }
    """
    
    try:
        # Initialize controller
        controller = DemoSessionController()
        
        # Extract request details
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}
        
        # Parse request body
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except json.JSONDecodeError:
                return _error_response(400, "Invalid JSON in request body")
        
        # Extract user context from authorizer
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        user_id = authorizer.get('user_id') or body.get('created_by', 'anonymous')
        tenant_id = authorizer.get('tenant_id') or body.get('tenant_id') or os.getenv('DEFAULT_TENANT_ID', 'default')
        
        # Route to appropriate handler
        if http_method == 'POST' and '/sessions' in path:
            return _handle_create_session(controller, body, user_id, tenant_id)
        
        elif http_method == 'GET' and '/sessions' in path:
            session_id = path_params.get('session_id')
            if session_id:
                return _handle_get_session(controller, session_id)
            else:
                return _handle_list_sessions(controller, query_params, tenant_id)
        
        elif http_method == 'PUT' and '/sessions' in path:
            session_id = path_params.get('session_id')
            if not session_id:
                return _error_response(400, "Session ID required")
            
            if '/parameters' in path:
                return _handle_update_parameters(controller, session_id, body)
            elif '/status' in path:
                return _handle_update_status(controller, session_id, body)
            elif '/metrics' in path:
                return _handle_update_metrics(controller, session_id, body)
            else:
                return _error_response(400, "Invalid update operation")
        
        elif http_method == 'DELETE' and '/sessions' in path:
            session_id = path_params.get('session_id')
            if not session_id:
                return _error_response(400, "Session ID required")
            return _handle_stop_session(controller, session_id)
        
        elif http_method == 'GET' and '/presets' in path:
            return _handle_get_presets(controller)
        
        elif http_method == 'POST' and '/cleanup' in path:
            max_age_hours = body.get('max_age_hours', 24)
            return _handle_cleanup(controller, max_age_hours)
        
        else:
            return _error_response(404, f"Endpoint not found: {http_method} {path}")
    
    except Exception as e:
        print(f"Error in demo session API handler: {str(e)}")
        return _error_response(500, f"Internal server error: {str(e)}")


def _handle_create_session(
    controller: DemoSessionController, 
    body: Dict[str, Any], 
    user_id: str, 
    tenant_id: str
) -> Dict[str, Any]:
    """Handle session creation"""
    preset_name = body.get('preset_name')
    custom_parameters = body.get('parameters', {})
    
    result = controller.start_demo_session(
        created_by=user_id,
        tenant_id=tenant_id,
        preset_name=preset_name,
        custom_parameters=custom_parameters
    )
    
    status_code = 201 if result.get('success') else 400
    return _json_response(status_code, result)


def _handle_get_session(
    controller: DemoSessionController, 
    session_id: str
) -> Dict[str, Any]:
    """Handle get session status"""
    result = controller.get_session_status(session_id)
    status_code = 200 if result.get('success') else 404
    return _json_response(status_code, result)


def _handle_list_sessions(
    controller: DemoSessionController, 
    query_params: Dict[str, Any], 
    tenant_id: str
) -> Dict[str, Any]:
    """Handle list active sessions"""
    filter_tenant = query_params.get('tenant_id', tenant_id)
    result = controller.list_active_sessions(filter_tenant)
    return _json_response(200, result)


def _handle_update_parameters(
    controller: DemoSessionController, 
    session_id: str, 
    body: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle parameter updates"""
    parameters = body.get('parameters', {})
    result = controller.update_session_parameters(session_id, parameters)
    status_code = 200 if result.get('success') else 400
    return _json_response(status_code, result)


def _handle_update_status(
    controller: DemoSessionController, 
    session_id: str, 
    body: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle status updates (pause/resume)"""
    action = body.get('action')  # 'pause' or 'resume'
    
    if action == 'pause':
        result = controller.pause_demo_session(session_id)
    elif action == 'resume':
        result = controller.resume_demo_session(session_id)
    else:
        return _error_response(400, "Invalid action. Use 'pause' or 'resume'")
    
    status_code = 200 if result.get('success') else 400
    return _json_response(status_code, result)


def _handle_update_metrics(
    controller: DemoSessionController, 
    session_id: str, 
    body: Dict[str, Any]
) -> Dict[str, Any]:
    """Handle metrics updates"""
    metrics_update = body.get('metrics', {})
    result = controller.update_session_metrics(session_id, metrics_update)
    status_code = 200 if result.get('success') else 400
    return _json_response(status_code, result)


def _handle_stop_session(
    controller: DemoSessionController, 
    session_id: str
) -> Dict[str, Any]:
    """Handle session stop/deletion"""
    result = controller.stop_demo_session(session_id)
    status_code = 200 if result.get('success') else 400
    return _json_response(status_code, result)


def _handle_get_presets(controller: DemoSessionController) -> Dict[str, Any]:
    """Handle get available presets"""
    result = controller.get_available_presets()
    return _json_response(200, result)


def _handle_cleanup(
    controller: DemoSessionController, 
    max_age_hours: int
) -> Dict[str, Any]:
    """Handle cleanup old sessions"""
    result = controller.cleanup_old_sessions(max_age_hours)
    return _json_response(200, result)


def _json_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Create JSON API response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps(body, default=str)
    }


def _error_response(status_code: int, message: str) -> Dict[str, Any]:
    """Create error response"""
    return _json_response(status_code, {
        'success': False,
        'error': message,
        'message': message
    })