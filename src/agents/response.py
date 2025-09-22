"""Response agent computing risk and metrics."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict

import boto3

from ..pipeline.journal import log_stage_event
from .base import Agent, EscalationDecision
from .automation_metrics import automation_tracker

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
METRICS_TABLE = os.getenv("DDB_METRICS_TABLE", "AsiaAgenticSocMetrics-dev")
dynamodb = boto3.resource("dynamodb")


class ResponseAgent(Agent):
    name = "response"
    stage = "respond"
    
    # Automation thresholds for 80%+ automation target
    AUTOMATION_THRESHOLDS = {
        "false_positive_threshold": 0.7,  # Auto-close if FP probability > 70%
        "confidence_threshold": 0.6,      # Require 60%+ confidence for automation
        "escalation_threshold": 0.3,      # Escalate if genuine threat probability > 30%
        "automation_target": 0.8          # Target 80%+ automation rate
    }

    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        summary = event.get("summary", {})
        
        # Enhanced risk assessment with automation decision
        escalation_decision = self._make_escalation_decision(event, summary)
        risk_assessment = self._enhanced_risk_assessment(event, summary, escalation_decision)
        
        # Compute metrics including automation statistics
        metrics_snapshot = self._compute_enhanced_metrics(event, escalation_decision)

        tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
        investigation_id = event["investigationId"]
        now = datetime.now(timezone.utc).isoformat()

        # Update investigation with enhanced risk and automation data
        table = dynamodb.Table(DDB_TABLE)
        table.update_item(
            Key={
                "pk": f"TENANT#{tenant_id}",
                "sk": f"INVESTIGATION#{investigation_id}",
            },
            UpdateExpression="SET riskLevel = :risk, metricsSnapshot = :metrics, automationDecision = :automation, escalationDecision = :escalation, updatedAt = :now",
            ExpressionAttributeValues={
                ":risk": risk_assessment["level"],
                ":metrics": metrics_snapshot,
                ":automation": escalation_decision.automation_action,
                ":escalation": {
                    "should_escalate": escalation_decision.should_escalate,
                    "reasoning": escalation_decision.reasoning,
                    "confidence_threshold_met": escalation_decision.confidence_threshold_met,
                    "risk_factors": escalation_decision.risk_factors
                },
                ":now": now,
            },
        )

        # Store enhanced metrics
        metrics_table = dynamodb.Table(METRICS_TABLE)
        date_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for name, value in metrics_snapshot.items():
            metrics_table.put_item(
                Item={
                    "metric_date": date_key,
                    "metric_name": name,
                    "value": Decimal(str(value)),
                    "updatedAt": now,
                }
            )

        audit_meta = log_stage_event(
            tenant_id=tenant_id,
            investigation_id=investigation_id,
            stage=self.stage,
            payload={
                "risk_level": risk_assessment["level"],
                "automation_action": escalation_decision.automation_action,
                "should_escalate": escalation_decision.should_escalate,
                "confidence_score": summary.get("confidence_metrics", {}).get("overall_confidence", 0.5),
                "false_positive_probability": summary.get("confidence_metrics", {}).get("false_positive_probability", 0.5),
                "metrics": metrics_snapshot
            },
        )

        # Record automation metrics
        confidence_metrics = summary.get("confidence_metrics", {})
        automation_tracker.record_automation_decision(
            tenant_id=tenant_id,
            investigation_id=investigation_id,
            automation_action=escalation_decision.automation_action,
            confidence_score=confidence_metrics.get("overall_confidence", 0.5),
            false_positive_probability=confidence_metrics.get("false_positive_probability", 0.5),
            escalated=escalation_decision.should_escalate
        )

        self.emit({
            "investigationId": investigation_id, 
            "risk_level": risk_assessment["level"],
            "automation_action": escalation_decision.automation_action,
            "should_escalate": escalation_decision.should_escalate
        })

        return {
            **event,
            "risk": risk_assessment,
            "escalation": {
                "decision": escalation_decision.automation_action,
                "should_escalate": escalation_decision.should_escalate,
                "reasoning": escalation_decision.reasoning,
                "confidence_threshold_met": escalation_decision.confidence_threshold_met
            },
            "updatedAt": now,
            "audit": audit_meta,
        }

    def _make_escalation_decision(self, event: Dict[str, Any], summary: Dict[str, Any]) -> EscalationDecision:
        """Enhanced escalation decision framework for 80%+ automation."""
        confidence_metrics = summary.get("confidence_metrics", {})
        false_positive_prob = confidence_metrics.get("false_positive_probability", 0.5)
        overall_confidence = confidence_metrics.get("overall_confidence", 0.5)
        automation_confidence = confidence_metrics.get("automation_confidence", 0.5)
        
        alert = event.get("alert", {})
        severity = str(alert.get("severity", "")).lower()
        
        # Risk factors that influence escalation
        risk_factors = {
            "high_severity": severity in ["high", "critical"],
            "external_source": not str(alert.get("source_ip", "")).startswith(("10.", "192.168.", "172.")),
            "low_confidence": overall_confidence < self.AUTOMATION_THRESHOLDS["confidence_threshold"],
            "low_fp_probability": false_positive_prob < self.AUTOMATION_THRESHOLDS["false_positive_threshold"],
            "malware_indicators": "malware" in str(alert.get("description", "")).lower(),
            "privilege_escalation": "privilege" in str(alert.get("description", "")).lower(),
            "data_exfiltration": any(keyword in str(alert.get("description", "")).lower() 
                                   for keyword in ["exfil", "download", "transfer"]),
        }
        
        # Decision logic for 80%+ automation
        should_escalate = False
        automation_action = "auto_close"  # Default to auto-close for high automation rate
        reasoning_parts = []
        
        # High-risk scenarios that require escalation
        if risk_factors["high_severity"] and risk_factors["external_source"]:
            should_escalate = True
            automation_action = "escalate"
            reasoning_parts.append("High severity alert from external source")
            
        elif risk_factors["malware_indicators"] or risk_factors["privilege_escalation"] or risk_factors["data_exfiltration"]:
            should_escalate = True
            automation_action = "escalate"
            reasoning_parts.append("Critical security indicators detected")
            
        elif false_positive_prob < self.AUTOMATION_THRESHOLDS["escalation_threshold"]:
            should_escalate = True
            automation_action = "escalate"
            reasoning_parts.append(f"Low false positive probability ({false_positive_prob:.2f})")
            
        # Medium-risk scenarios for monitoring
        elif overall_confidence < self.AUTOMATION_THRESHOLDS["confidence_threshold"]:
            automation_action = "monitor"
            reasoning_parts.append(f"Low confidence score ({overall_confidence:.2f})")
            
        elif false_positive_prob < 0.5:  # Moderate FP probability
            automation_action = "monitor"
            reasoning_parts.append(f"Moderate false positive probability ({false_positive_prob:.2f})")
            
        # Auto-close scenarios (targeting 80%+ automation)
        else:
            automation_action = "auto_close"
            reasoning_parts.append(f"High false positive probability ({false_positive_prob:.2f})")
            
        # Check confidence thresholds
        confidence_threshold_met = (
            overall_confidence >= self.AUTOMATION_THRESHOLDS["confidence_threshold"] and
            automation_confidence >= self.AUTOMATION_THRESHOLDS["confidence_threshold"]
        )
        
        if not confidence_threshold_met and automation_action == "auto_close":
            automation_action = "monitor"
            reasoning_parts.append("Confidence thresholds not met")
            
        reasoning = "; ".join(reasoning_parts) if reasoning_parts else "Standard automation decision"
        
        return EscalationDecision(
            should_escalate=should_escalate,
            automation_action=automation_action,
            confidence_threshold_met=confidence_threshold_met,
            reasoning=reasoning,
            risk_factors=risk_factors
        )

    def _enhanced_risk_assessment(self, event: Dict[str, Any], summary: Dict[str, Any], escalation_decision: EscalationDecision) -> Dict[str, Any]:
        """Enhanced risk assessment incorporating automation decisions."""
        # Original risk level calculation
        severity = summary.get("risk_level") or summary.get("severity") or event.get("alert", {}).get("severity")
        threshold = os.getenv("RISK_HIGH_SEVERITY", "high")
        base_risk_level = "high" if str(severity).lower() in {"high", "critical", threshold} else "low"
        
        # Adjust risk level based on escalation decision and confidence
        confidence_metrics = summary.get("confidence_metrics", {})
        false_positive_prob = confidence_metrics.get("false_positive_probability", 0.5)
        
        # Risk level adjustment
        if escalation_decision.automation_action == "auto_close":
            adjusted_risk_level = "low"
        elif escalation_decision.automation_action == "escalate":
            adjusted_risk_level = "high"
        else:  # monitor
            adjusted_risk_level = "medium"
            
        return {
            "level": adjusted_risk_level,
            "original_level": base_risk_level,
            "automation_adjusted": adjusted_risk_level != base_risk_level,
            "false_positive_probability": false_positive_prob,
            "confidence_score": confidence_metrics.get("overall_confidence", 0.5),
            "automation_action": escalation_decision.automation_action,
            "risk_factors": escalation_decision.risk_factors,
            "metrics": self._compute_metrics(event)
        }

    def _compute_enhanced_metrics(self, event: Dict[str, Any], escalation_decision: EscalationDecision) -> Dict[str, float]:
        """Compute enhanced metrics including automation statistics."""
        # Base metrics
        base_metrics = self._compute_metrics(event)
        
        # Automation metrics
        automation_metrics = {
            "automation_rate": 1.0 if escalation_decision.automation_action == "auto_close" else 0.0,
            "escalation_rate": 1.0 if escalation_decision.should_escalate else 0.0,
            "monitoring_rate": 1.0 if escalation_decision.automation_action == "monitor" else 0.0,
            "confidence_threshold_met": 1.0 if escalation_decision.confidence_threshold_met else 0.0,
        }
        
        # Combine metrics
        return {**base_metrics, **automation_metrics}

    def _compute_metrics(self, event: Dict[str, Any]) -> Dict[str, float]:
        received = self._parse_ts(event.get("receivedAt"))
        acknowledged = self._parse_ts(event.get("acknowledgedAt")) or received
        investigation_start = self._parse_ts(event.get("investigationStartedAt")) or acknowledged
        resolved = self._parse_ts(event.get("resolvedAt")) or investigation_start

        def delta_minutes(end, start):
            if not end or not start:
                return 0.0
            return max((end - start).total_seconds() / 60.0, 0.0)

        metrics = {
            "MTTA": delta_minutes(acknowledged, received),
            "MTTI": delta_minutes(investigation_start, received),
            "MTTR": delta_minutes(resolved, received),
            "FPR": float(event.get("falsePositiveRate", 0.0)),
        }
        return metrics

    @staticmethod
    def _parse_ts(value):
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value))
        except ValueError:
            return None
