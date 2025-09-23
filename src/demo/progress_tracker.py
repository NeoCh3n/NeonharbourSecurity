"""Real-time investigation progress tracking system."""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict
from decimal import Decimal

import boto3

from ..utils.dynamodb import prepare_item_for_dynamodb, to_decimal

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
PROGRESS_TABLE = os.getenv("DDB_PROGRESS_TABLE", "AsiaAgenticSocProgress-dev")
dynamodb = boto3.resource("dynamodb")


@dataclass
class AgentProgress:
    """Progress information for a single agent."""
    agent_name: str
    stage: str
    status: str  # "queued", "running", "completed", "failed"
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    current_task: Optional[str] = None
    progress_percentage: float = 0.0
    artifacts_generated: List[str] = None
    error_message: Optional[str] = None
    
    def __post_init__(self):
        if self.artifacts_generated is None:
            self.artifacts_generated = []


@dataclass
class InvestigationProgress:
    """Complete progress tracking for an investigation."""
    investigation_id: str
    tenant_id: str
    overall_status: str  # "queued", "running", "completed", "failed"
    current_stage: str
    current_agent: str
    started_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    overall_progress: float = 0.0
    confidence_score: float = 0.0
    false_positive_probability: float = 0.5
    risk_level: str = "unknown"
    automation_decision: Optional[str] = None
    agent_progress: Dict[str, AgentProgress] = None
    timeline_events: List[Dict[str, Any]] = None
    is_demo: bool = False
    
    def __post_init__(self):
        if self.agent_progress is None:
            self.agent_progress = {}
        if self.timeline_events is None:
            self.timeline_events = []


class ProgressTracker:
    """Real-time investigation progress tracking service."""
    
    # Pipeline stages and their expected agents
    PIPELINE_STAGES = [
        {"stage": "plan", "agent": "Planner", "weight": 0.15},
        {"stage": "execute", "agent": "Context Executor", "weight": 0.20},
        {"stage": "analyze", "agent": "Analyst", "weight": 0.25},
        {"stage": "respond", "agent": "Risk Orchestrator", "weight": 0.20},
        {"stage": "adapt", "agent": "Learning Curator", "weight": 0.10},
        {"stage": "report", "agent": "Audit Scribe", "weight": 0.10},
    ]
    
    def __init__(self):
        self.table = None
        self.progress_table = None
        self.tables_available = False
        self._in_memory_progress = {}  # Fallback storage
        
        # Try to initialize DynamoDB tables
        try:
            self.table = dynamodb.Table(DDB_TABLE)
            # Test table access
            self.table.meta.client.describe_table(TableName=DDB_TABLE)
            self.tables_available = True
            
            try:
                self.progress_table = dynamodb.Table(PROGRESS_TABLE)
                # Test progress table access
                self.progress_table.meta.client.describe_table(TableName=PROGRESS_TABLE)
            except Exception:
                # Progress table might not exist, use main table as fallback
                self.progress_table = None
                
        except Exception as e:
            # Tables don't exist or not accessible, use in-memory storage
            print(f"DynamoDB tables not available, using in-memory storage: {e}")
            self.tables_available = False
    
    def start_investigation_tracking(
        self, 
        investigation_id: str, 
        tenant_id: str,
        is_demo: bool = False
    ) -> InvestigationProgress:
        """Initialize progress tracking for a new investigation."""
        now = datetime.now(timezone.utc)
        
        # Initialize agent progress for all stages
        agent_progress = {}
        for stage_info in self.PIPELINE_STAGES:
            agent_progress[stage_info["stage"]] = AgentProgress(
                agent_name=stage_info["agent"],
                stage=stage_info["stage"],
                status="queued",
                progress_percentage=0.0
            )
        
        progress = InvestigationProgress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            overall_status="queued",
            current_stage="plan",
            current_agent="Planner",
            started_at=now,
            updated_at=now,
            overall_progress=0.0,
            agent_progress=agent_progress,
            timeline_events=[{
                "timestamp": now.isoformat(),
                "event_type": "investigation_started",
                "stage": "plan",
                "agent": "Planner",
                "message": "Investigation queued for processing",
                "details": {"is_demo": is_demo}
            }],
            is_demo=is_demo
        )
        
        self._persist_progress(progress)
        return progress
    
    def update_agent_progress(
        self,
        investigation_id: str,
        tenant_id: str,
        stage: str,
        agent_name: str,
        status: str,
        current_task: Optional[str] = None,
        progress_percentage: Optional[float] = None,
        artifacts: Optional[List[str]] = None,
        error_message: Optional[str] = None,
        confidence_score: Optional[float] = None,
        false_positive_probability: Optional[float] = None,
        risk_level: Optional[str] = None
    ) -> InvestigationProgress:
        """Update progress for a specific agent/stage."""
        progress = self.get_investigation_progress(investigation_id, tenant_id)
        if not progress:
            # Initialize if not exists
            progress = self.start_investigation_tracking(investigation_id, tenant_id)
        
        now = datetime.now(timezone.utc)
        
        # Update agent-specific progress
        if stage in progress.agent_progress:
            agent_prog = progress.agent_progress[stage]
            agent_prog.status = status
            agent_prog.current_task = current_task
            
            if progress_percentage is not None:
                agent_prog.progress_percentage = progress_percentage
            
            if artifacts:
                agent_prog.artifacts_generated.extend(artifacts)
            
            if error_message:
                agent_prog.error_message = error_message
            
            # Update timestamps
            if status == "running" and not agent_prog.started_at:
                agent_prog.started_at = now
            elif status in ["completed", "failed"]:
                agent_prog.completed_at = now
                if status == "completed":
                    agent_prog.progress_percentage = 100.0
        
        # Update overall progress
        progress.current_stage = stage
        progress.current_agent = agent_name
        progress.updated_at = now
        
        # Update confidence and risk metrics if provided
        if confidence_score is not None:
            progress.confidence_score = confidence_score
        if false_positive_probability is not None:
            progress.false_positive_probability = false_positive_probability
        if risk_level is not None:
            progress.risk_level = risk_level
        
        # Calculate overall progress
        progress.overall_progress = self._calculate_overall_progress(progress)
        
        # Update overall status
        if status == "failed":
            progress.overall_status = "failed"
        elif status == "completed" and stage == "report":
            progress.overall_status = "completed"
            progress.completed_at = now
        elif status == "running":
            progress.overall_status = "running"
        
        # Add timeline event
        event_message = self._generate_timeline_message(stage, agent_name, status, current_task)
        progress.timeline_events.append({
            "timestamp": now.isoformat(),
            "event_type": f"agent_{status}",
            "stage": stage,
            "agent": agent_name,
            "message": event_message,
            "details": {
                "current_task": current_task,
                "progress_percentage": progress_percentage,
                "confidence_score": confidence_score,
                "false_positive_probability": false_positive_probability,
                "risk_level": risk_level,
                "artifacts": artifacts
            }
        })
        
        self._persist_progress(progress)
        return progress
    
    def update_automation_decision(
        self,
        investigation_id: str,
        tenant_id: str,
        automation_decision: str,
        should_escalate: bool,
        reasoning: str
    ) -> InvestigationProgress:
        """Update automation decision and escalation status."""
        progress = self.get_investigation_progress(investigation_id, tenant_id)
        if not progress:
            return None
        
        progress.automation_decision = automation_decision
        progress.updated_at = datetime.now(timezone.utc)
        
        # Add timeline event for automation decision
        progress.timeline_events.append({
            "timestamp": progress.updated_at.isoformat(),
            "event_type": "automation_decision",
            "stage": progress.current_stage,
            "agent": progress.current_agent,
            "message": f"Automation decision: {automation_decision}" + 
                      (f" - {reasoning}" if reasoning else ""),
            "details": {
                "automation_decision": automation_decision,
                "should_escalate": should_escalate,
                "reasoning": reasoning
            }
        })
        
        self._persist_progress(progress)
        return progress
    
    def get_investigation_progress(
        self, 
        investigation_id: str, 
        tenant_id: str
    ) -> Optional[InvestigationProgress]:
        """Retrieve current progress for an investigation."""
        # First check in-memory storage
        key = f"{tenant_id}#{investigation_id}"
        if key in self._in_memory_progress:
            return self._in_memory_progress[key]
        
        # Try DynamoDB if available
        if self.tables_available and self.progress_table:
            try:
                response = self.progress_table.get_item(
                    Key={
                        "pk": f"TENANT#{tenant_id}",
                        "sk": f"PROGRESS#{investigation_id}"
                    }
                )
                
                if "Item" in response:
                    item = response["Item"]
                    progress = self._deserialize_progress(item)
                    # Cache in memory
                    self._in_memory_progress[key] = progress
                    return progress
                    
            except Exception:
                # Silently handle DynamoDB errors
                pass
        
        # Fallback to main investigations table
        if self.tables_available and self.table:
            return self._get_progress_from_main_table(investigation_id, tenant_id)
        
        return None
    
    def get_active_investigations(self, tenant_id: str) -> List[InvestigationProgress]:
        """Get all active investigations for real-time monitoring."""
        active_investigations = []
        
        # Get from in-memory storage first
        for key, progress in self._in_memory_progress.items():
            if (progress.tenant_id == tenant_id and 
                progress.overall_status in ["running", "queued"]):
                active_investigations.append(progress)
        
        # Try DynamoDB if available and no in-memory results
        if not active_investigations and self.tables_available and self.progress_table:
            try:
                response = self.progress_table.query(
                    KeyConditionExpression="pk = :pk AND begins_with(sk, :sk_prefix)",
                    FilterExpression="overall_status IN (:running, :queued)",
                    ExpressionAttributeValues={
                        ":pk": f"TENANT#{tenant_id}",
                        ":sk_prefix": "PROGRESS#",
                        ":running": "running",
                        ":queued": "queued"
                    }
                )
                
                active_investigations = [self._deserialize_progress(item) for item in response.get("Items", [])]
                
            except Exception:
                # Silently handle DynamoDB errors
                pass
        
        return active_investigations
    
    def get_demo_session_progress(self, session_id: str) -> List[InvestigationProgress]:
        """Get progress for all investigations in a demo session."""
        demo_investigations = []
        
        # Get from in-memory storage first
        for key, progress in self._in_memory_progress.items():
            if progress.is_demo:
                demo_investigations.append(progress)
        
        # Try DynamoDB if available and no in-memory results
        if not demo_investigations and self.tables_available and self.progress_table:
            try:
                # Query for recent demo investigations
                response = self.progress_table.scan(
                    FilterExpression="is_demo = :is_demo",
                    ExpressionAttributeValues={":is_demo": True},
                    Limit=20
                )
                
                demo_investigations = [self._deserialize_progress(item) for item in response.get("Items", [])]
                
            except Exception:
                # Silently handle DynamoDB errors
                pass
        
        # Sort by most recent
        if demo_investigations:
            demo_investigations.sort(key=lambda x: x.started_at, reverse=True)
            return demo_investigations[:10]  # Return last 10
        
        return []
    
    def _calculate_overall_progress(self, progress: InvestigationProgress) -> float:
        """Calculate overall progress percentage based on stage weights."""
        total_progress = 0.0
        
        for stage_info in self.PIPELINE_STAGES:
            stage = stage_info["stage"]
            weight = stage_info["weight"]
            
            if stage in progress.agent_progress:
                agent_progress = progress.agent_progress[stage].progress_percentage
                total_progress += (agent_progress / 100.0) * weight
        
        return min(100.0, total_progress * 100.0)
    
    def _generate_timeline_message(
        self, 
        stage: str, 
        agent_name: str, 
        status: str, 
        current_task: Optional[str]
    ) -> str:
        """Generate human-readable timeline message."""
        stage_display = stage.replace("_", " ").title()
        
        if status == "running":
            if current_task:
                return f"{agent_name} started {stage_display}: {current_task}"
            else:
                return f"{agent_name} started {stage_display} stage"
        elif status == "completed":
            return f"{agent_name} completed {stage_display} stage"
        elif status == "failed":
            return f"{agent_name} failed during {stage_display} stage"
        elif status == "queued":
            return f"{agent_name} queued for {stage_display} stage"
        else:
            return f"{agent_name} {status} in {stage_display} stage"
    
    def _persist_progress(self, progress: InvestigationProgress) -> None:
        """Persist progress data to DynamoDB or in-memory storage."""
        # Always store in memory as fallback
        key = f"{progress.tenant_id}#{progress.investigation_id}"
        self._in_memory_progress[key] = progress
        
        # Try to persist to DynamoDB if available
        if self.tables_available and self.progress_table:
            try:
                # Convert to DynamoDB-compatible format
                item = self._serialize_progress(progress)
                self.progress_table.put_item(Item=item)
            except Exception as e:
                # Silently handle DynamoDB errors, in-memory storage is the fallback
                pass
        elif self.tables_available and self.table:
            # Fallback to main table if progress table not available
            try:
                # Store basic progress info in main investigations table
                self.table.update_item(
                    Key={
                        "pk": f"TENANT#{progress.tenant_id}",
                        "sk": f"INVESTIGATION#{progress.investigation_id}",
                    },
                    UpdateExpression="SET progressStatus = :status, progressPercentage = :progress, updatedAt = :now",
                    ExpressionAttributeValues={
                        ":status": progress.overall_status,
                        ":progress": to_decimal(progress.overall_progress),
                        ":now": progress.updated_at.isoformat(),
                    },
                    ReturnValues="NONE"
                )
            except Exception:
                # Silently handle errors, in-memory storage is sufficient
                pass
    
    def _serialize_progress(self, progress: InvestigationProgress) -> Dict[str, Any]:
        """Convert InvestigationProgress to DynamoDB item."""
        # Convert agent progress
        agent_progress_serialized = {}
        for stage, agent_prog in progress.agent_progress.items():
            agent_data = asdict(agent_prog)
            # Convert datetime objects
            if agent_data.get("started_at"):
                agent_data["started_at"] = agent_data["started_at"].isoformat()
            if agent_data.get("completed_at"):
                agent_data["completed_at"] = agent_data["completed_at"].isoformat()
            agent_progress_serialized[stage] = agent_data
        
        item = {
            "pk": f"TENANT#{progress.tenant_id}",
            "sk": f"PROGRESS#{progress.investigation_id}",
            "investigation_id": progress.investigation_id,
            "tenant_id": progress.tenant_id,
            "overall_status": progress.overall_status,
            "current_stage": progress.current_stage,
            "current_agent": progress.current_agent,
            "started_at": progress.started_at.isoformat(),
            "updated_at": progress.updated_at.isoformat(),
            "overall_progress": to_decimal(progress.overall_progress),
            "confidence_score": to_decimal(progress.confidence_score),
            "false_positive_probability": to_decimal(progress.false_positive_probability),
            "risk_level": progress.risk_level,
            "agent_progress": agent_progress_serialized,
            "timeline_events": progress.timeline_events,
            "is_demo": progress.is_demo
        }
        
        if progress.completed_at:
            item["completed_at"] = progress.completed_at.isoformat()
        if progress.automation_decision:
            item["automation_decision"] = progress.automation_decision
        
        return prepare_item_for_dynamodb(item)
    
    def _deserialize_progress(self, item: Dict[str, Any]) -> InvestigationProgress:
        """Convert DynamoDB item to InvestigationProgress."""
        # Convert agent progress
        agent_progress = {}
        for stage, agent_data in item.get("agent_progress", {}).items():
            agent_prog = AgentProgress(
                agent_name=agent_data["agent_name"],
                stage=agent_data["stage"],
                status=agent_data["status"],
                progress_percentage=float(agent_data.get("progress_percentage", 0)),
                artifacts_generated=agent_data.get("artifacts_generated", []),
                current_task=agent_data.get("current_task"),
                error_message=agent_data.get("error_message")
            )
            
            # Convert datetime strings back to datetime objects
            if agent_data.get("started_at"):
                agent_prog.started_at = datetime.fromisoformat(agent_data["started_at"])
            if agent_data.get("completed_at"):
                agent_prog.completed_at = datetime.fromisoformat(agent_data["completed_at"])
                
            agent_progress[stage] = agent_prog
        
        progress = InvestigationProgress(
            investigation_id=item["investigation_id"],
            tenant_id=item["tenant_id"],
            overall_status=item["overall_status"],
            current_stage=item["current_stage"],
            current_agent=item["current_agent"],
            started_at=datetime.fromisoformat(item["started_at"]),
            updated_at=datetime.fromisoformat(item["updated_at"]),
            overall_progress=float(item.get("overall_progress", 0)),
            confidence_score=float(item.get("confidence_score", 0)),
            false_positive_probability=float(item.get("false_positive_probability", 0.5)),
            risk_level=item.get("risk_level", "unknown"),
            agent_progress=agent_progress,
            timeline_events=item.get("timeline_events", []),
            is_demo=item.get("is_demo", False)
        )
        
        if item.get("completed_at"):
            progress.completed_at = datetime.fromisoformat(item["completed_at"])
        if item.get("automation_decision"):
            progress.automation_decision = item["automation_decision"]
        
        return progress
    
    def _get_progress_from_main_table(
        self, 
        investigation_id: str, 
        tenant_id: str
    ) -> Optional[InvestigationProgress]:
        """Fallback to get basic progress from main investigations table."""
        if not self.tables_available or not self.table:
            return None
            
        try:
            response = self.table.get_item(
                Key={
                    "pk": f"TENANT#{tenant_id}",
                    "sk": f"INVESTIGATION#{investigation_id}"
                }
            )
            
            if "Item" not in response:
                return None
            
            item = response["Item"]
            
            # Create basic progress from investigation data
            now = datetime.now(timezone.utc)
            stage = item.get("stage", "received")
            status = item.get("status", "queued")
            
            # Map stage to agent
            agent_map = {stage_info["stage"]: stage_info["agent"] for stage_info in self.PIPELINE_STAGES}
            current_agent = agent_map.get(stage, "Unknown")
            
            progress = InvestigationProgress(
                investigation_id=investigation_id,
                tenant_id=tenant_id,
                overall_status="completed" if status == "closed" else "running",
                current_stage=stage,
                current_agent=current_agent,
                started_at=datetime.fromisoformat(item.get("receivedAt", now.isoformat())),
                updated_at=datetime.fromisoformat(item.get("updatedAt", now.isoformat())),
                confidence_score=float(item.get("summary", {}).get("confidence_metrics", {}).get("overall_confidence", 0)),
                false_positive_probability=float(item.get("summary", {}).get("confidence_metrics", {}).get("false_positive_probability", 0.5)),
                risk_level=item.get("riskLevel", "unknown"),
                automation_decision=item.get("automationDecision"),
                is_demo=item.get("alert", {}).get("isDemo", False)
            )
            
            # Cache in memory
            key = f"{tenant_id}#{investigation_id}"
            self._in_memory_progress[key] = progress
            
            return progress
            
        except Exception:
            # Silently handle errors
            return None


# Global progress tracker instance
progress_tracker = ProgressTracker()