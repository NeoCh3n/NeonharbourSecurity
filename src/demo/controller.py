"""
Demo Session Controller

Provides high-level API for demo session management and control operations.
"""

import os
from typing import Dict, List, Optional, Any
from datetime import datetime

from .session import (
    DemoSessionManager, 
    DemoSession, 
    DemoParameters, 
    DemoMetrics,
    SessionStatus,
    DEMO_PRESETS
)


class DemoSessionController:
    """
    High-level controller for demo session operations
    """
    
    def __init__(self, table_name: str = None):
        self.session_manager = DemoSessionManager(table_name)
        self._active_sessions: Dict[str, DemoSession] = {}
    
    def start_demo_session(
        self,
        created_by: str,
        tenant_id: str,
        preset_name: str = None,
        custom_parameters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Start a new demo session with specified parameters
        
        Args:
            created_by: User ID who created the session
            tenant_id: Tenant identifier
            preset_name: Name of demo preset to use
            custom_parameters: Custom parameter overrides
            
        Returns:
            Dict containing session info and status
        """
        try:
            # Get base parameters from preset or defaults
            if preset_name and preset_name in DEMO_PRESETS:
                parameters = DEMO_PRESETS[preset_name]
            else:
                parameters = DemoParameters()
            
            # Apply custom parameter overrides
            if custom_parameters:
                for key, value in custom_parameters.items():
                    if hasattr(parameters, key):
                        setattr(parameters, key, value)
            
            # Create the session
            session = self.session_manager.create_session(
                created_by=created_by,
                tenant_id=tenant_id,
                parameters=parameters
            )
            
            # Cache active session
            self._active_sessions[session.session_id] = session
            
            return {
                "success": True,
                "session_id": session.session_id,
                "status": session.status,
                "parameters": session.parameters.__dict__,
                "created_at": session.created_at.isoformat(),
                "message": "Demo session started successfully"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to start demo session"
            }
    
    def pause_demo_session(self, session_id: str) -> Dict[str, Any]:
        """
        Pause an active demo session
        
        Args:
            session_id: ID of session to pause
            
        Returns:
            Dict containing operation result
        """
        try:
            success = self.session_manager.pause_session(session_id)
            
            if success and session_id in self._active_sessions:
                self._active_sessions[session_id].status = SessionStatus.PAUSED.value
            
            return {
                "success": success,
                "session_id": session_id,
                "status": "paused" if success else "error",
                "message": "Session paused successfully" if success else "Failed to pause session"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error pausing demo session"
            }
    
    def resume_demo_session(self, session_id: str) -> Dict[str, Any]:
        """
        Resume a paused demo session
        
        Args:
            session_id: ID of session to resume
            
        Returns:
            Dict containing operation result
        """
        try:
            success = self.session_manager.resume_session(session_id)
            
            if success and session_id in self._active_sessions:
                self._active_sessions[session_id].status = SessionStatus.ACTIVE.value
            
            return {
                "success": success,
                "session_id": session_id,
                "status": "active" if success else "error",
                "message": "Session resumed successfully" if success else "Failed to resume session"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error resuming demo session"
            }
    
    def stop_demo_session(self, session_id: str) -> Dict[str, Any]:
        """
        Stop a demo session
        
        Args:
            session_id: ID of session to stop
            
        Returns:
            Dict containing operation result and final metrics
        """
        try:
            # Get final metrics before stopping
            session = self.get_session_status(session_id)
            
            success = self.session_manager.stop_session(session_id)
            
            if success and session_id in self._active_sessions:
                del self._active_sessions[session_id]
            
            result = {
                "success": success,
                "session_id": session_id,
                "status": "stopped" if success else "error",
                "message": "Session stopped successfully" if success else "Failed to stop session"
            }
            
            # Include final metrics if available
            if session and session.get("success"):
                result["final_metrics"] = session.get("metrics", {})
            
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error stopping demo session"
            }
    
    def update_session_parameters(
        self, 
        session_id: str, 
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update demo session parameters in real-time
        
        Args:
            session_id: ID of session to update
            parameters: New parameter values
            
        Returns:
            Dict containing operation result
        """
        try:
            # Validate parameters
            valid_params = self._validate_parameters(parameters)
            if not valid_params["valid"]:
                return {
                    "success": False,
                    "error": valid_params["error"],
                    "message": "Invalid parameters provided"
                }
            
            success = self.session_manager.update_session_parameters(
                session_id, parameters
            )
            
            # Update cached session if exists
            if success and session_id in self._active_sessions:
                for key, value in parameters.items():
                    if hasattr(self._active_sessions[session_id].parameters, key):
                        setattr(self._active_sessions[session_id].parameters, key, value)
            
            return {
                "success": success,
                "session_id": session_id,
                "updated_parameters": parameters,
                "message": "Parameters updated successfully" if success else "Failed to update parameters"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error updating session parameters"
            }
    
    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """
        Get current status and metrics for a demo session
        
        Args:
            session_id: ID of session to query
            
        Returns:
            Dict containing session status and metrics
        """
        try:
            session = self.session_manager.get_session(session_id)
            
            if not session:
                return {
                    "success": False,
                    "error": "Session not found",
                    "message": f"No session found with ID: {session_id}"
                }
            
            return {
                "success": True,
                "session_id": session.session_id,
                "status": session.status,
                "created_at": session.created_at.isoformat(),
                "created_by": session.created_by,
                "tenant_id": session.tenant_id,
                "parameters": session.parameters.__dict__,
                "metrics": session.metrics.__dict__,
                "last_updated": session.last_updated.isoformat() if session.last_updated else None,
                "error_message": session.error_message
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error retrieving session status"
            }
    
    def list_active_sessions(self, tenant_id: str = None) -> Dict[str, Any]:
        """
        List all active demo sessions
        
        Args:
            tenant_id: Optional tenant filter
            
        Returns:
            Dict containing list of active sessions
        """
        try:
            sessions = self.session_manager.list_active_sessions(tenant_id)
            
            session_list = []
            for session in sessions:
                session_list.append({
                    "session_id": session.session_id,
                    "status": session.status,
                    "created_at": session.created_at.isoformat(),
                    "created_by": session.created_by,
                    "tenant_id": session.tenant_id,
                    "parameters": session.parameters.__dict__,
                    "metrics": session.metrics.__dict__
                })
            
            return {
                "success": True,
                "sessions": session_list,
                "count": len(session_list),
                "message": f"Found {len(session_list)} active sessions"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error listing active sessions"
            }
    
    def update_session_metrics(
        self, 
        session_id: str, 
        metrics_update: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update session metrics (typically called by demo data generator)
        
        Args:
            session_id: ID of session to update
            metrics_update: Metrics to update
            
        Returns:
            Dict containing operation result
        """
        try:
            # Get current session to update metrics
            session = self.session_manager.get_session(session_id)
            if not session:
                return {
                    "success": False,
                    "error": "Session not found",
                    "message": f"No session found with ID: {session_id}"
                }
            
            # Update metrics object
            metrics = session.metrics
            for key, value in metrics_update.items():
                if hasattr(metrics, key):
                    setattr(metrics, key, value)
            
            # Recalculate automation rate
            metrics.update_automation_rate()
            
            # Save updated metrics
            success = self.session_manager.update_session_metrics(session_id, metrics)
            
            return {
                "success": success,
                "session_id": session_id,
                "updated_metrics": metrics.__dict__,
                "message": "Metrics updated successfully" if success else "Failed to update metrics"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error updating session metrics"
            }
    
    def get_available_presets(self) -> Dict[str, Any]:
        """
        Get list of available demo presets
        
        Returns:
            Dict containing available presets and their configurations
        """
        presets = {}
        for name, params in DEMO_PRESETS.items():
            presets[name] = {
                "name": name,
                "description": self._get_preset_description(name),
                "parameters": params.__dict__
            }
        
        return {
            "success": True,
            "presets": presets,
            "count": len(presets),
            "message": f"Found {len(presets)} available presets"
        }
    
    def cleanup_old_sessions(self, max_age_hours: int = 24) -> Dict[str, Any]:
        """
        Clean up old demo sessions
        
        Args:
            max_age_hours: Maximum age in hours before cleanup
            
        Returns:
            Dict containing cleanup results
        """
        try:
            deleted_count = self.session_manager.cleanup_expired_sessions(max_age_hours)
            
            return {
                "success": True,
                "deleted_count": deleted_count,
                "message": f"Cleaned up {deleted_count} expired sessions"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error during session cleanup"
            }
    
    def _validate_parameters(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Validate parameter values"""
        try:
            # Check interval_seconds
            if 'interval_seconds' in parameters:
                interval = parameters['interval_seconds']
                if not isinstance(interval, (int, float)) or interval < 1 or interval > 300:
                    return {"valid": False, "error": "interval_seconds must be between 1 and 300"}
            
            # Check false_positive_rate
            if 'false_positive_rate' in parameters:
                rate = parameters['false_positive_rate']
                if not isinstance(rate, (int, float)) or rate < 0 or rate > 1:
                    return {"valid": False, "error": "false_positive_rate must be between 0 and 1"}
            
            # Check duration_minutes
            if 'duration_minutes' in parameters:
                duration = parameters['duration_minutes']
                if duration is not None and (not isinstance(duration, int) or duration < 1):
                    return {"valid": False, "error": "duration_minutes must be a positive integer or null"}
            
            return {"valid": True}
            
        except Exception as e:
            return {"valid": False, "error": f"Parameter validation error: {str(e)}"}
    
    def _get_preset_description(self, preset_name: str) -> str:
        """Get description for demo preset"""
        descriptions = {
            "technical_deep_dive": "Advanced technical demonstration with complex scenarios",
            "executive_overview": "High-level overview focused on business value and ROI",
            "compliance_focus": "Compliance-oriented demo highlighting regulatory features",
            "continuous_monitoring": "Long-running demo for continuous monitoring scenarios"
        }
        return descriptions.get(preset_name, "Custom demo configuration")