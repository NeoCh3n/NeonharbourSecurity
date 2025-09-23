"""Base agent abstractions for multi-agent orchestration."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from dataclasses import dataclass


@dataclass
class ConfidenceScore:
    """Confidence metrics for agent analysis."""
    overall_confidence: float  # 0.0 to 1.0
    false_positive_probability: float  # 0.0 to 1.0
    automation_confidence: float  # 0.0 to 1.0
    reasoning: str
    factors: Dict[str, float]  # Contributing factors to confidence


@dataclass
class EscalationDecision:
    """Decision framework for alert escalation."""
    should_escalate: bool
    automation_action: str  # "auto_close", "escalate", "monitor"
    confidence_threshold_met: bool
    reasoning: str
    risk_factors: Dict[str, Any]


class Agent(ABC):
    """Abstract agent used inside the orchestrated investigation pipeline."""

    name: str
    stage: str

    def __init__(self, messaging):
        self.messaging = messaging
        # Import here to avoid circular imports
        try:
            from ..demo.progress_tracker import progress_tracker
            self.progress_tracker = progress_tracker
        except ImportError:
            self.progress_tracker = None

    @abstractmethod
    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Process the investigation event and return an updated payload."""

    def emit(self, detail: Dict[str, Any]) -> None:
        """Publish telemetry about agent activity."""
        self.messaging.publish(agent_name=self.name, stage=self.stage, detail=detail)

    def track_progress(
        self,
        investigation_id: str,
        tenant_id: str,
        status: str,
        current_task: Optional[str] = None,
        progress_percentage: Optional[float] = None,
        artifacts: Optional[list] = None,
        confidence_score: Optional[float] = None,
        false_positive_probability: Optional[float] = None,
        risk_level: Optional[str] = None
    ) -> None:
        """Track agent progress for real-time monitoring."""
        if self.progress_tracker:
            try:
                self.progress_tracker.update_agent_progress(
                    investigation_id=investigation_id,
                    tenant_id=tenant_id,
                    stage=self.stage,
                    agent_name=self.name,
                    status=status,
                    current_task=current_task,
                    progress_percentage=progress_percentage,
                    artifacts=artifacts,
                    confidence_score=confidence_score,
                    false_positive_probability=false_positive_probability,
                    risk_level=risk_level
                )
            except Exception as e:
                print(f"Error tracking progress for {self.name}: {e}")

    def start_processing(self, investigation_id: str, tenant_id: str, task_description: str = None) -> None:
        """Mark agent as starting processing."""
        self.track_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            status="running",
            current_task=task_description or f"Processing {self.stage} stage",
            progress_percentage=0.0
        )

    def complete_processing(
        self,
        investigation_id: str,
        tenant_id: str,
        artifacts: Optional[list] = None,
        confidence_score: Optional[float] = None,
        false_positive_probability: Optional[float] = None,
        risk_level: Optional[str] = None
    ) -> None:
        """Mark agent as completed processing."""
        self.track_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            status="completed",
            progress_percentage=100.0,
            artifacts=artifacts,
            confidence_score=confidence_score,
            false_positive_probability=false_positive_probability,
            risk_level=risk_level
        )

    def fail_processing(self, investigation_id: str, tenant_id: str, error_message: str) -> None:
        """Mark agent as failed processing."""
        if self.progress_tracker:
            try:
                self.progress_tracker.update_agent_progress(
                    investigation_id=investigation_id,
                    tenant_id=tenant_id,
                    stage=self.stage,
                    agent_name=self.name,
                    status="failed",
                    error_message=error_message
                )
            except Exception as e:
                print(f"Error tracking failure for {self.name}: {e}")

    def calculate_confidence_score(self, analysis_data: Dict[str, Any]) -> ConfidenceScore:
        """Calculate confidence metrics for false positive detection."""
        # Default implementation - can be overridden by specific agents
        base_confidence = analysis_data.get("confidence", 0.5)
        
        # Calculate false positive probability based on common indicators
        fp_indicators = self._assess_false_positive_indicators(analysis_data)
        false_positive_prob = sum(fp_indicators.values()) / len(fp_indicators) if fp_indicators else 0.5
        
        # Automation confidence based on data quality and completeness
        automation_confidence = self._assess_automation_readiness(analysis_data)
        
        return ConfidenceScore(
            overall_confidence=base_confidence,
            false_positive_probability=false_positive_prob,
            automation_confidence=automation_confidence,
            reasoning=f"Base confidence assessment for {self.name} agent",
            factors=fp_indicators
        )

    def _assess_false_positive_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Assess indicators that suggest false positive likelihood."""
        indicators = {}
        
        # Common false positive patterns
        alert = data.get("alert", {})
        severity = str(alert.get("severity", "")).lower()
        
        # Low severity alerts are more likely to be false positives
        if severity in ["low", "info", "informational"]:
            indicators["low_severity"] = 0.7
        elif severity in ["medium", "moderate"]:
            indicators["medium_severity"] = 0.4
        else:
            indicators["high_severity"] = 0.1
            
        # Repetitive alerts from same source
        if alert.get("repeat_count", 0) > 5:
            indicators["repetitive_alert"] = 0.6
            
        # Known benign patterns
        source_ip = alert.get("source_ip", "")
        if source_ip.startswith("10.") or source_ip.startswith("192.168."):
            indicators["internal_source"] = 0.5
            
        return indicators

    def _assess_automation_readiness(self, data: Dict[str, Any]) -> float:
        """Assess readiness for automated processing."""
        readiness_score = 0.0
        factors = 0
        
        # Data completeness
        alert = data.get("alert", {})
        required_fields = ["severity", "source_ip", "timestamp", "alert_type"]
        complete_fields = sum(1 for field in required_fields if alert.get(field))
        readiness_score += (complete_fields / len(required_fields)) * 0.4
        factors += 1
        
        # Context availability
        context = data.get("context", {})
        if context:
            readiness_score += 0.3
            factors += 1
            
        # Historical data
        if data.get("historical_context"):
            readiness_score += 0.3
            factors += 1
            
        return readiness_score / factors if factors > 0 else 0.5
