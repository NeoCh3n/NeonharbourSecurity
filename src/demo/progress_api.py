"""API endpoints for real-time investigation progress tracking."""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from flask import Flask, jsonify, request
from flask_cors import CORS

from .progress_tracker import progress_tracker, InvestigationProgress


def create_progress_api() -> Flask:
    """Create Flask API for progress tracking."""
    app = Flask(__name__)
    CORS(app)  # Enable CORS for frontend access
    
    @app.route("/api/progress/investigations/<tenant_id>", methods=["GET"])
    def get_active_investigations(tenant_id: str):
        """Get all active investigations for a tenant."""
        try:
            investigations = progress_tracker.get_active_investigations(tenant_id)
            return jsonify({
                "success": True,
                "investigations": [_serialize_progress(inv) for inv in investigations]
            })
        except Exception as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    @app.route("/api/progress/investigation/<tenant_id>/<investigation_id>", methods=["GET"])
    def get_investigation_progress(tenant_id: str, investigation_id: str):
        """Get detailed progress for a specific investigation."""
        try:
            progress = progress_tracker.get_investigation_progress(investigation_id, tenant_id)
            if not progress:
                return jsonify({
                    "success": False,
                    "error": "Investigation not found"
                }), 404
            
            return jsonify({
                "success": True,
                "progress": _serialize_progress(progress)
            })
        except Exception as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    @app.route("/api/progress/demo/<session_id>", methods=["GET"])
    def get_demo_session_progress(session_id: str):
        """Get progress for all investigations in a demo session."""
        try:
            investigations = progress_tracker.get_demo_session_progress(session_id)
            return jsonify({
                "success": True,
                "investigations": [_serialize_progress(inv) for inv in investigations],
                "session_id": session_id
            })
        except Exception as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    @app.route("/api/progress/metrics/<tenant_id>", methods=["GET"])
    def get_progress_metrics(tenant_id: str):
        """Get aggregated progress metrics for a tenant."""
        try:
            investigations = progress_tracker.get_active_investigations(tenant_id)
            
            # Calculate metrics
            total_investigations = len(investigations)
            running_count = sum(1 for inv in investigations if inv.overall_status == "running")
            queued_count = sum(1 for inv in investigations if inv.overall_status == "queued")
            completed_count = sum(1 for inv in investigations if inv.overall_status == "completed")
            
            avg_progress = 0.0
            if total_investigations > 0:
                avg_progress = sum(inv.overall_progress for inv in investigations) / total_investigations
            
            # Automation metrics
            auto_closed_count = sum(1 for inv in investigations if inv.automation_decision == "auto_close")
            escalated_count = sum(1 for inv in investigations if inv.automation_decision == "escalate")
            
            automation_rate = 0.0
            if total_investigations > 0:
                automation_rate = auto_closed_count / total_investigations
            
            return jsonify({
                "success": True,
                "metrics": {
                    "total_investigations": total_investigations,
                    "running_count": running_count,
                    "queued_count": queued_count,
                    "completed_count": completed_count,
                    "avg_progress": avg_progress,
                    "auto_closed_count": auto_closed_count,
                    "escalated_count": escalated_count,
                    "automation_rate": automation_rate,
                    "timestamp": datetime.now().isoformat()
                }
            })
        except Exception as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    @app.route("/api/progress/timeline/<tenant_id>/<investigation_id>", methods=["GET"])
    def get_investigation_timeline(tenant_id: str, investigation_id: str):
        """Get timeline events for a specific investigation."""
        try:
            progress = progress_tracker.get_investigation_progress(investigation_id, tenant_id)
            if not progress:
                return jsonify({
                    "success": False,
                    "error": "Investigation not found"
                }), 404
            
            return jsonify({
                "success": True,
                "timeline": progress.timeline_events,
                "investigation_id": investigation_id
            })
        except Exception as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 500
    
    @app.route("/api/progress/health", methods=["GET"])
    def health_check():
        """Health check endpoint."""
        return jsonify({
            "success": True,
            "service": "progress-api",
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0"
        })
    
    return app


def _serialize_progress(progress: InvestigationProgress) -> Dict[str, Any]:
    """Serialize InvestigationProgress for JSON response."""
    # Serialize agent progress
    agent_progress_serialized = {}
    for stage, agent_prog in progress.agent_progress.items():
        agent_data = {
            "agent_name": agent_prog.agent_name,
            "stage": agent_prog.stage,
            "status": agent_prog.status,
            "progress_percentage": agent_prog.progress_percentage,
            "artifacts_generated": agent_prog.artifacts_generated,
            "current_task": agent_prog.current_task,
            "error_message": agent_prog.error_message
        }
        
        # Convert datetime objects to ISO strings
        if agent_prog.started_at:
            agent_data["started_at"] = agent_prog.started_at.isoformat()
        if agent_prog.completed_at:
            agent_data["completed_at"] = agent_prog.completed_at.isoformat()
            
        agent_progress_serialized[stage] = agent_data
    
    return {
        "investigation_id": progress.investigation_id,
        "tenant_id": progress.tenant_id,
        "overall_status": progress.overall_status,
        "current_stage": progress.current_stage,
        "current_agent": progress.current_agent,
        "started_at": progress.started_at.isoformat(),
        "updated_at": progress.updated_at.isoformat(),
        "completed_at": progress.completed_at.isoformat() if progress.completed_at else None,
        "overall_progress": progress.overall_progress,
        "confidence_score": progress.confidence_score,
        "false_positive_probability": progress.false_positive_probability,
        "risk_level": progress.risk_level,
        "automation_decision": progress.automation_decision,
        "agent_progress": agent_progress_serialized,
        "timeline_events": progress.timeline_events,
        "is_demo": progress.is_demo
    }


def run_progress_api(host: str = "0.0.0.0", port: int = 5001, debug: bool = False) -> None:
    """Run the progress API server."""
    app = create_progress_api()
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    # Run the API server
    run_progress_api(debug=True)