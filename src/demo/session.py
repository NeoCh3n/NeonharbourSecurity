"""
Demo Session Management System

Handles demo session lifecycle, parameter management, and real-time control
for the Interactive Demo System.
"""

import json
import os
import uuid
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any
from enum import Enum
from decimal import Decimal

# Optional AWS deps for offline demo mode
try:  # pragma: no cover - exercised in integration tests
    import boto3  # type: ignore
    from botocore.exceptions import (  # type: ignore
        ClientError,
        EndpointConnectionError,
        NoCredentialsError,
        BotoCoreError,
    )
except Exception:  # Allow running without boto3
    boto3 = None  # type: ignore
    ClientError = EndpointConnectionError = NoCredentialsError = BotoCoreError = Exception  # type: ignore


class SessionStatus(Enum):
    """Demo session status enumeration"""

    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"


class AudienceType(Enum):
    """Target audience types for demo presets"""

    TECHNICAL = "technical"
    EXECUTIVE = "executive"
    COMPLIANCE = "compliance"


class ComplexityLevel(Enum):
    """Demo complexity levels"""

    BASIC = "basic"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


@dataclass
class DemoParameters:
    """Demo session configuration parameters"""

    interval_seconds: float = 30.0
    false_positive_rate: float = 0.8
    complexity_level: str = ComplexityLevel.INTERMEDIATE.value
    target_audience: str = AudienceType.TECHNICAL.value
    duration_minutes: Optional[int] = None
    scenario_types: List[str] = None

    def __post_init__(self):
        if self.scenario_types is None:
            self.scenario_types = ["phishing", "malware", "insider_threat"]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to regular dictionary"""
        return {
            "interval_seconds": self.interval_seconds,
            "false_positive_rate": self.false_positive_rate,
            "complexity_level": self.complexity_level,
            "target_audience": self.target_audience,
            "duration_minutes": self.duration_minutes,
            "scenario_types": self.scenario_types,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DemoParameters":
        """Create from dictionary"""
        return cls(
            interval_seconds=data.get("interval_seconds", 30.0),
            false_positive_rate=data.get("false_positive_rate", 0.8),
            complexity_level=data.get(
                "complexity_level", ComplexityLevel.INTERMEDIATE.value
            ),
            target_audience=data.get("target_audience", AudienceType.TECHNICAL.value),
            duration_minutes=data.get("duration_minutes"),
            scenario_types=data.get(
                "scenario_types", ["phishing", "malware", "insider_threat"]
            ),
        )

    def validate(self) -> Dict[str, Any]:
        """Validate parameter values"""
        errors = []

        if self.interval_seconds < 10.0:
            errors.append("interval_seconds must be at least 10.0 seconds")

        if not (0.0 <= self.false_positive_rate <= 1.0):
            errors.append("false_positive_rate must be between 0.0 and 1.0")

        if self.duration_minutes is not None and self.duration_minutes <= 0:
            errors.append("duration_minutes must be positive")

        if not self.scenario_types or len(self.scenario_types) == 0:
            errors.append("At least one scenario type must be specified")

        return {"valid": len(errors) == 0, "errors": errors}

    def to_dynamodb_dict(self):
        """Convert to DynamoDB-compatible dict with Decimal types"""
        return {
            "interval_seconds": Decimal(str(self.interval_seconds)),
            "false_positive_rate": Decimal(str(self.false_positive_rate)),
            "complexity_level": self.complexity_level,
            "target_audience": self.target_audience,
            "duration_minutes": self.duration_minutes,
            "scenario_types": self.scenario_types,
        }


@dataclass
class DemoMetrics:
    """Real-time demo session metrics"""

    alerts_generated: int = 0
    alerts_processed: int = 0
    auto_closed_count: int = 0
    escalated_count: int = 0
    automation_rate: float = 0.0
    avg_processing_time: float = 0.0
    session_duration: float = 0.0

    def update_automation_rate(self):
        """Calculate current automation rate"""
        if self.alerts_processed > 0:
            self.automation_rate = self.auto_closed_count / self.alerts_processed
        else:
            self.automation_rate = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to regular dictionary"""
        return {
            "alerts_generated": self.alerts_generated,
            "alerts_processed": self.alerts_processed,
            "auto_closed_count": self.auto_closed_count,
            "escalated_count": self.escalated_count,
            "automation_rate": self.automation_rate,
            "avg_processing_time": self.avg_processing_time,
            "session_duration": self.session_duration,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DemoMetrics":
        """Create from dictionary"""
        return cls(
            alerts_generated=data.get("alerts_generated", 0),
            alerts_processed=data.get("alerts_processed", 0),
            auto_closed_count=data.get("auto_closed_count", 0),
            escalated_count=data.get("escalated_count", 0),
            automation_rate=data.get("automation_rate", 0.0),
            avg_processing_time=data.get("avg_processing_time", 0.0),
            session_duration=data.get("session_duration", 0.0),
        )

    def to_dynamodb_dict(self):
        """Convert to DynamoDB-compatible dict with Decimal types"""
        return {
            "alerts_generated": self.alerts_generated,
            "alerts_processed": self.alerts_processed,
            "auto_closed_count": self.auto_closed_count,
            "escalated_count": self.escalated_count,
            "automation_rate": Decimal(str(self.automation_rate)),
            "avg_processing_time": Decimal(str(self.avg_processing_time)),
            "session_duration": Decimal(str(self.session_duration)),
        }


@dataclass
class DemoSession:
    """Demo session model"""

    session_id: str
    created_at: datetime
    created_by: str
    tenant_id: str
    parameters: DemoParameters
    status: str = SessionStatus.ACTIVE.value
    metrics: DemoMetrics = None
    last_updated: Optional[datetime] = None
    error_message: Optional[str] = None

    def __post_init__(self):
        if self.metrics is None:
            self.metrics = DemoMetrics()
        if self.last_updated is None:
            self.last_updated = self.created_at


class DemoSessionManager:
    """
    Manages demo session lifecycle and database operations
    """

    def __init__(self, table_name: str = None, region: str = "us-east-1"):
        self.table_name = table_name or os.getenv(
            "DDB_DEMO_SESSIONS_TABLE", "AsiaAgenticSocDemoSessions"
        )
        self.region = region
        self._local_sessions: Dict[str, DemoSession] = {}
        self._use_local_store = False
        self.dynamodb = None
        self.table = None

        disable_dynamo = os.getenv("DEMO_DISABLE_DYNAMODB", "").lower() in {
            "1",
            "true",
            "yes",
        }

        if disable_dynamo:
            self._activate_local_store("DEMO_DISABLE_DYNAMODB set")
            return

        if boto3 is None:
            self._activate_local_store("boto3 unavailable; using in-memory store")
            return
        try:
            self.dynamodb = boto3.resource("dynamodb", region_name=region)  # type: ignore[arg-type]
            self.table = self.dynamodb.Table(self.table_name)
        except (
            NoCredentialsError,
            EndpointConnectionError,
            BotoCoreError,
            ClientError,
        ) as exc:
            self._activate_local_store(f"DynamoDB unavailable: {exc}")
        except Exception as exc:
            self._activate_local_store(f"Unexpected DynamoDB error: {exc}")

    def create_session(
        self, created_by: str, tenant_id: str, parameters: DemoParameters = None
    ) -> DemoSession:
        """Create a new demo session"""
        session_id = str(uuid.uuid4())
        now = datetime.utcnow()

        if parameters is None:
            parameters = DemoParameters()

        session = DemoSession(
            session_id=session_id,
            created_at=now,
            created_by=created_by,
            tenant_id=tenant_id,
            parameters=parameters,
            status=SessionStatus.ACTIVE.value,
            metrics=DemoMetrics(),
            last_updated=now,
        )

        # Store in DynamoDB
        self._save_session(session)

        return session

    def get_session(self, session_id: str) -> Optional[DemoSession]:
        """Retrieve a demo session by ID"""
        if self._use_local_store:
            return self._local_sessions.get(session_id)

        try:
            response = self.table.get_item(Key={"session_id": session_id})

            if "Item" not in response:
                return None

            return self._deserialize_session(response["Item"])

        except (ClientError, BotoCoreError) as e:
            print(f"Error retrieving session {session_id}: {e}")
            self._activate_local_store(str(e))
            return self._local_sessions.get(session_id)

    def update_session_parameters(
        self, session_id: str, parameters: Dict[str, Any]
    ) -> bool:
        """Update session parameters in real-time"""
        if self._use_local_store:
            return self._update_local_parameters(session_id, parameters)
        try:
            # Build update expression dynamically
            update_expr = "SET last_updated = :timestamp"
            expr_values = {":timestamp": datetime.utcnow().isoformat()}
            expr_names = {}

            for key, value in parameters.items():
                param_key = f"#params.{key}"
                value_key = f":param_{key}"
                update_expr += f", {param_key} = {value_key}"

                # Use expression attribute names for reserved keywords
                expr_names["#params"] = "parameters"

                # Convert float values to Decimal for DynamoDB
                if isinstance(value, float):
                    expr_values[value_key] = Decimal(str(value))
                else:
                    expr_values[value_key] = value

            self.table.update_item(
                Key={"session_id": session_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names,
            )

            return True

        except (ClientError, BotoCoreError) as e:
            print(f"Error updating session parameters: {e}")
            self._activate_local_store(str(e))
            return self._update_local_parameters(session_id, parameters)

    def update_session_status(
        self, session_id: str, status: SessionStatus, error_message: str = None
    ) -> bool:
        """Update session status"""
        if self._use_local_store:
            return self._update_local_status(session_id, status, error_message)
        try:
            update_expr = "SET #status = :status, last_updated = :timestamp"
            expr_values = {
                ":status": status.value,
                ":timestamp": datetime.utcnow().isoformat(),
            }
            expr_names = {"#status": "status"}

            if error_message:
                update_expr += ", error_message = :error"
                expr_values[":error"] = error_message

            self.table.update_item(
                Key={"session_id": session_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names,
            )

            return True

        except (ClientError, BotoCoreError) as e:
            print(f"Error updating session status: {e}")
            self._activate_local_store(str(e))
            return self._update_local_status(session_id, status, error_message)

    def update_session_metrics(self, session_id: str, metrics: DemoMetrics) -> bool:
        """Update session metrics"""
        if self._use_local_store:
            return self._update_local_metrics(session_id, metrics)
        try:
            # Calculate session duration
            session = self.get_session(session_id)
            if self._use_local_store:
                return self._update_local_metrics(session_id, metrics)
            if session:
                duration = (datetime.utcnow() - session.created_at).total_seconds()
                metrics.session_duration = duration
                metrics.update_automation_rate()

            self.table.update_item(
                Key={"session_id": session_id},
                UpdateExpression="SET metrics = :metrics, last_updated = :timestamp",
                ExpressionAttributeValues={
                    ":metrics": metrics.to_dynamodb_dict(),
                    ":timestamp": datetime.utcnow().isoformat(),
                },
            )

            return True

        except (ClientError, BotoCoreError) as e:
            print(f"Error updating session metrics: {e}")
            self._activate_local_store(str(e))
            return self._update_local_metrics(session_id, metrics)

    def list_active_sessions(self, tenant_id: str = None) -> List[DemoSession]:
        """List all active demo sessions"""
        if self._use_local_store:
            return self._list_local_active_sessions(tenant_id)
        try:
            # Scan for active sessions
            filter_expr = "#status = :status"
            expr_values = {":status": SessionStatus.ACTIVE.value}
            expr_names = {"#status": "status"}

            if tenant_id:
                filter_expr += " AND tenant_id = :tenant_id"
                expr_values[":tenant_id"] = tenant_id

            response = self.table.scan(
                FilterExpression=filter_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names,
            )

            sessions = []
            for item in response.get("Items", []):
                sessions.append(self._deserialize_session(item))

            return sessions

        except (ClientError, BotoCoreError) as e:
            print(f"Error listing active sessions: {e}")
            self._activate_local_store(str(e))
            return self._list_local_active_sessions(tenant_id)

    def pause_session(self, session_id: str) -> bool:
        """Pause an active demo session"""
        return self.update_session_status(session_id, SessionStatus.PAUSED)

    def resume_session(self, session_id: str) -> bool:
        """Resume a paused demo session"""
        return self.update_session_status(session_id, SessionStatus.ACTIVE)

    def stop_session(self, session_id: str) -> bool:
        """Stop a demo session"""
        return self.update_session_status(session_id, SessionStatus.STOPPED)

    def cleanup_expired_sessions(self, max_age_hours: int = 24) -> int:
        """Clean up old demo sessions"""
        if self._use_local_store:
            cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
            return self._cleanup_local_sessions(cutoff_time)
        try:
            cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)

            # Scan for old sessions
            response = self.table.scan(
                FilterExpression="created_at < :cutoff",
                ExpressionAttributeValues={":cutoff": cutoff_time.isoformat()},
            )

            deleted_count = 0
            for item in response.get("Items", []):
                self.table.delete_item(Key={"session_id": item["session_id"]})
                deleted_count += 1

            return deleted_count

        except (ClientError, BotoCoreError) as e:
            print(f"Error cleaning up expired sessions: {e}")
            self._activate_local_store(str(e))
            return self._cleanup_local_sessions(
                datetime.utcnow() - timedelta(hours=max_age_hours)
            )

    def _activate_local_store(self, reason: str = "") -> None:
        if not self._use_local_store:
            msg = "[demo.session] Falling back to in-memory session store"
            if reason:
                msg = f"{msg}: {reason}"
            print(msg)
        self._use_local_store = True
        if not hasattr(self, "_local_sessions") or self._local_sessions is None:
            self._local_sessions = {}
        self.dynamodb = None
        self.table = None

    def _update_local_parameters(
        self, session_id: str, parameters: Dict[str, Any]
    ) -> bool:
        session = self._local_sessions.get(session_id)
        if not session:
            return False
        for key, value in parameters.items():
            if hasattr(session.parameters, key):
                setattr(session.parameters, key, value)
        session.last_updated = datetime.utcnow()
        self._local_sessions[session_id] = session
        return True

    def _update_local_status(
        self, session_id: str, status: SessionStatus, error_message: str = None
    ) -> bool:
        session = self._local_sessions.get(session_id)
        if not session:
            return False
        session.status = status.value
        session.error_message = error_message
        session.last_updated = datetime.utcnow()
        self._local_sessions[session_id] = session
        return True

    def _update_local_metrics(self, session_id: str, metrics: DemoMetrics) -> bool:
        session = self._local_sessions.get(session_id)
        if not session:
            return False
        metrics.session_duration = (
            datetime.utcnow() - session.created_at
        ).total_seconds()
        metrics.update_automation_rate()
        session.metrics = metrics
        session.last_updated = datetime.utcnow()
        self._local_sessions[session_id] = session
        return True

    def _list_local_active_sessions(self, tenant_id: str = None) -> List[DemoSession]:
        sessions = []
        for session in self._local_sessions.values():
            if session.status != SessionStatus.ACTIVE.value:
                continue
            if tenant_id and session.tenant_id != tenant_id:
                continue
            sessions.append(session)
        return sessions

    def _cleanup_local_sessions(self, cutoff_time: datetime) -> int:
        to_delete = [
            session_id
            for session_id, session in self._local_sessions.items()
            if session.created_at < cutoff_time
        ]
        for session_id in to_delete:
            del self._local_sessions[session_id]
        return len(to_delete)

    def _save_session(self, session: DemoSession):
        """Save session to DynamoDB"""
        if self._use_local_store:
            self._local_sessions[session.session_id] = session
            return

        item = {
            "session_id": session.session_id,
            "created_at": session.created_at.isoformat(),
            "created_by": session.created_by,
            "tenant_id": session.tenant_id,
            "parameters": session.parameters.to_dynamodb_dict(),
            "status": session.status,
            "metrics": session.metrics.to_dynamodb_dict(),
            "last_updated": session.last_updated.isoformat(),
        }

        if session.error_message:
            item["error_message"] = session.error_message

        try:
            self.table.put_item(Item=item)
        except (ClientError, BotoCoreError) as exc:
            print(f"Error saving session to DynamoDB: {exc}")
            self._activate_local_store(str(exc))
            self._local_sessions[session.session_id] = session

    def _deserialize_session(self, item: Dict[str, Any]) -> DemoSession:
        """Convert DynamoDB item to DemoSession object"""
        # Convert Decimal types back to float for parameters
        params_dict = item["parameters"]
        params_dict["interval_seconds"] = float(params_dict["interval_seconds"])
        params_dict["false_positive_rate"] = float(params_dict["false_positive_rate"])
        parameters = DemoParameters(**params_dict)

        # Convert Decimal types back to float for metrics
        metrics_dict = item["metrics"]
        metrics_dict["automation_rate"] = float(metrics_dict["automation_rate"])
        metrics_dict["avg_processing_time"] = float(metrics_dict["avg_processing_time"])
        metrics_dict["session_duration"] = float(metrics_dict["session_duration"])
        metrics = DemoMetrics(**metrics_dict)

        return DemoSession(
            session_id=item["session_id"],
            created_at=datetime.fromisoformat(item["created_at"]),
            created_by=item["created_by"],
            tenant_id=item["tenant_id"],
            parameters=parameters,
            status=item["status"],
            metrics=metrics,
            last_updated=datetime.fromisoformat(item["last_updated"]),
            error_message=item.get("error_message"),
        )


# Demo preset configurations
DEMO_PRESETS = {
    "technical_deep_dive": DemoParameters(
        interval_seconds=15.0,
        false_positive_rate=0.75,
        complexity_level=ComplexityLevel.ADVANCED.value,
        target_audience=AudienceType.TECHNICAL.value,
        duration_minutes=45,
        scenario_types=[
            "advanced_persistent_threat",
            "insider_threat",
            "supply_chain_attack",
        ],
    ),
    "executive_overview": DemoParameters(
        interval_seconds=45.0,
        false_positive_rate=0.85,
        complexity_level=ComplexityLevel.BASIC.value,
        target_audience=AudienceType.EXECUTIVE.value,
        duration_minutes=20,
        scenario_types=["phishing", "malware", "data_exfiltration"],
    ),
    "compliance_focus": DemoParameters(
        interval_seconds=30.0,
        false_positive_rate=0.8,
        complexity_level=ComplexityLevel.INTERMEDIATE.value,
        target_audience=AudienceType.COMPLIANCE.value,
        duration_minutes=30,
        scenario_types=["regulatory_violation", "data_breach", "insider_threat"],
    ),
    "continuous_monitoring": DemoParameters(
        interval_seconds=60.0,
        false_positive_rate=0.9,
        complexity_level=ComplexityLevel.BASIC.value,
        target_audience=AudienceType.TECHNICAL.value,
        duration_minutes=None,  # Continuous
        scenario_types=["phishing", "malware", "network_anomaly", "insider_threat"],
    ),
    "quick_demo": DemoParameters(
        interval_seconds=20.0,
        false_positive_rate=0.8,
        complexity_level=ComplexityLevel.BASIC.value,
        target_audience=AudienceType.TECHNICAL.value,
        duration_minutes=10,
        scenario_types=["phishing", "malware"],
    ),
}
