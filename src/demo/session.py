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

import boto3
from botocore.exceptions import ClientError


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
    
    def to_dynamodb_dict(self):
        """Convert to DynamoDB-compatible dict with Decimal types"""
        return {
            'interval_seconds': Decimal(str(self.interval_seconds)),
            'false_positive_rate': Decimal(str(self.false_positive_rate)),
            'complexity_level': self.complexity_level,
            'target_audience': self.target_audience,
            'duration_minutes': self.duration_minutes,
            'scenario_types': self.scenario_types
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
    
    def to_dynamodb_dict(self):
        """Convert to DynamoDB-compatible dict with Decimal types"""
        return {
            'alerts_generated': self.alerts_generated,
            'alerts_processed': self.alerts_processed,
            'auto_closed_count': self.auto_closed_count,
            'escalated_count': self.escalated_count,
            'automation_rate': Decimal(str(self.automation_rate)),
            'avg_processing_time': Decimal(str(self.avg_processing_time)),
            'session_duration': Decimal(str(self.session_duration))
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
        self.table_name = table_name or os.getenv('DDB_DEMO_SESSIONS_TABLE', 'AsiaAgenticSocDemoSessions')
        self.region = region
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(self.table_name)
    
    def create_session(
        self, 
        created_by: str,
        tenant_id: str,
        parameters: DemoParameters = None
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
            last_updated=now
        )
        
        # Store in DynamoDB
        self._save_session(session)
        
        return session
    
    def get_session(self, session_id: str) -> Optional[DemoSession]:
        """Retrieve a demo session by ID"""
        try:
            response = self.table.get_item(
                Key={'session_id': session_id}
            )
            
            if 'Item' not in response:
                return None
            
            return self._deserialize_session(response['Item'])
            
        except ClientError as e:
            print(f"Error retrieving session {session_id}: {e}")
            return None
    
    def update_session_parameters(
        self, 
        session_id: str, 
        parameters: Dict[str, Any]
    ) -> bool:
        """Update session parameters in real-time"""
        try:
            # Build update expression dynamically
            update_expr = "SET last_updated = :timestamp"
            expr_values = {':timestamp': datetime.utcnow().isoformat()}
            expr_names = {}
            
            for key, value in parameters.items():
                param_key = f"#params.{key}"
                value_key = f":param_{key}"
                update_expr += f", {param_key} = {value_key}"
                
                # Use expression attribute names for reserved keywords
                expr_names['#params'] = 'parameters'
                
                # Convert float values to Decimal for DynamoDB
                if isinstance(value, float):
                    expr_values[value_key] = Decimal(str(value))
                else:
                    expr_values[value_key] = value
            
            self.table.update_item(
                Key={'session_id': session_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names
            )
            
            return True
            
        except ClientError as e:
            print(f"Error updating session parameters: {e}")
            return False
    
    def update_session_status(
        self, 
        session_id: str, 
        status: SessionStatus,
        error_message: str = None
    ) -> bool:
        """Update session status"""
        try:
            update_expr = "SET #status = :status, last_updated = :timestamp"
            expr_values = {
                ':status': status.value,
                ':timestamp': datetime.utcnow().isoformat()
            }
            expr_names = {'#status': 'status'}
            
            if error_message:
                update_expr += ", error_message = :error"
                expr_values[':error'] = error_message
            
            self.table.update_item(
                Key={'session_id': session_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names
            )
            
            return True
            
        except ClientError as e:
            print(f"Error updating session status: {e}")
            return False
    
    def update_session_metrics(
        self, 
        session_id: str, 
        metrics: DemoMetrics
    ) -> bool:
        """Update session metrics"""
        try:
            # Calculate session duration
            session = self.get_session(session_id)
            if session:
                duration = (datetime.utcnow() - session.created_at).total_seconds()
                metrics.session_duration = duration
                metrics.update_automation_rate()
            
            self.table.update_item(
                Key={'session_id': session_id},
                UpdateExpression="SET metrics = :metrics, last_updated = :timestamp",
                ExpressionAttributeValues={
                    ':metrics': metrics.to_dynamodb_dict(),
                    ':timestamp': datetime.utcnow().isoformat()
                }
            )
            
            return True
            
        except ClientError as e:
            print(f"Error updating session metrics: {e}")
            return False
    
    def list_active_sessions(self, tenant_id: str = None) -> List[DemoSession]:
        """List all active demo sessions"""
        try:
            # Scan for active sessions
            filter_expr = "#status = :status"
            expr_values = {':status': SessionStatus.ACTIVE.value}
            expr_names = {'#status': 'status'}
            
            if tenant_id:
                filter_expr += " AND tenant_id = :tenant_id"
                expr_values[':tenant_id'] = tenant_id
            
            response = self.table.scan(
                FilterExpression=filter_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names
            )
            
            sessions = []
            for item in response.get('Items', []):
                sessions.append(self._deserialize_session(item))
            
            return sessions
            
        except ClientError as e:
            print(f"Error listing active sessions: {e}")
            return []
    
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
        try:
            cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
            
            # Scan for old sessions
            response = self.table.scan(
                FilterExpression="created_at < :cutoff",
                ExpressionAttributeValues={
                    ':cutoff': cutoff_time.isoformat()
                }
            )
            
            deleted_count = 0
            for item in response.get('Items', []):
                self.table.delete_item(
                    Key={'session_id': item['session_id']}
                )
                deleted_count += 1
            
            return deleted_count
            
        except ClientError as e:
            print(f"Error cleaning up expired sessions: {e}")
            return 0
    
    def _save_session(self, session: DemoSession):
        """Save session to DynamoDB"""
        item = {
            'session_id': session.session_id,
            'created_at': session.created_at.isoformat(),
            'created_by': session.created_by,
            'tenant_id': session.tenant_id,
            'parameters': session.parameters.to_dynamodb_dict(),
            'status': session.status,
            'metrics': session.metrics.to_dynamodb_dict(),
            'last_updated': session.last_updated.isoformat()
        }
        
        if session.error_message:
            item['error_message'] = session.error_message
        
        self.table.put_item(Item=item)
    
    def _deserialize_session(self, item: Dict[str, Any]) -> DemoSession:
        """Convert DynamoDB item to DemoSession object"""
        # Convert Decimal types back to float for parameters
        params_dict = item['parameters']
        params_dict['interval_seconds'] = float(params_dict['interval_seconds'])
        params_dict['false_positive_rate'] = float(params_dict['false_positive_rate'])
        parameters = DemoParameters(**params_dict)
        
        # Convert Decimal types back to float for metrics
        metrics_dict = item['metrics']
        metrics_dict['automation_rate'] = float(metrics_dict['automation_rate'])
        metrics_dict['avg_processing_time'] = float(metrics_dict['avg_processing_time'])
        metrics_dict['session_duration'] = float(metrics_dict['session_duration'])
        metrics = DemoMetrics(**metrics_dict)
        
        return DemoSession(
            session_id=item['session_id'],
            created_at=datetime.fromisoformat(item['created_at']),
            created_by=item['created_by'],
            tenant_id=item['tenant_id'],
            parameters=parameters,
            status=item['status'],
            metrics=metrics,
            last_updated=datetime.fromisoformat(item['last_updated']),
            error_message=item.get('error_message')
        )


# Demo preset configurations
DEMO_PRESETS = {
    "technical_deep_dive": DemoParameters(
        interval_seconds=15.0,
        false_positive_rate=0.75,
        complexity_level=ComplexityLevel.ADVANCED.value,
        target_audience=AudienceType.TECHNICAL.value,
        duration_minutes=45,
        scenario_types=["advanced_persistent_threat", "insider_threat", "supply_chain_attack"]
    ),
    
    "executive_overview": DemoParameters(
        interval_seconds=45.0,
        false_positive_rate=0.85,
        complexity_level=ComplexityLevel.BASIC.value,
        target_audience=AudienceType.EXECUTIVE.value,
        duration_minutes=20,
        scenario_types=["phishing", "malware", "data_exfiltration"]
    ),
    
    "compliance_focus": DemoParameters(
        interval_seconds=30.0,
        false_positive_rate=0.8,
        complexity_level=ComplexityLevel.INTERMEDIATE.value,
        target_audience=AudienceType.COMPLIANCE.value,
        duration_minutes=30,
        scenario_types=["regulatory_violation", "data_breach", "insider_threat"]
    ),
    
    "continuous_monitoring": DemoParameters(
        interval_seconds=60.0,
        false_positive_rate=0.9,
        complexity_level=ComplexityLevel.BASIC.value,
        target_audience=AudienceType.TECHNICAL.value,
        duration_minutes=None,  # Continuous
        scenario_types=["phishing", "malware", "network_anomaly", "insider_threat"]
    )
}