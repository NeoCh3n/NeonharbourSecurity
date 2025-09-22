"""Analysis agent leveraging Bedrock/Kiro/AmazonQ backends."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import boto3

from ..ai import AmazonQAnalyst, AnalystLLM, BedrockAnalyst, KiroAnalyst
from ..pipeline.journal import log_stage_event
from .base import Agent, ConfidenceScore
from decimal import Decimal

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
dynamodb = boto3.resource("dynamodb")


class AnalysisAgent(Agent):
    name = "analysis"
    stage = "analyze"

    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        investigation_id = event["investigationId"]
        tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
        analyst = self._select_analyst()
        try:
            summary = analyst.summarize_investigation(event)
        except NotImplementedError:
            fallback = BedrockAnalyst()
            summary = fallback.summarize_investigation(event)
            summary["provider"] = "bedrock"

        knowledge = self._load_knowledge_summary()
        summary["knowledge_context"] = list(knowledge.values())[:5]

        # Enhanced confidence scoring and false positive detection
        confidence_score = self.calculate_enhanced_confidence_score(event, summary)
        summary["confidence_metrics"] = {
            "overall_confidence": float(confidence_score.overall_confidence),
            "false_positive_probability": float(confidence_score.false_positive_probability),
            "automation_confidence": float(confidence_score.automation_confidence),
            "reasoning": confidence_score.reasoning,
            "factors": {k: float(v) for k, v in confidence_score.factors.items()}
        }

        # Enhanced false positive detection
        fp_assessment = self._assess_false_positive_likelihood(event, summary)
        summary["false_positive_assessment"] = fp_assessment

        now = datetime.now(timezone.utc).isoformat()
        table = dynamodb.Table(DDB_TABLE)
        table.update_item(
            Key={
                "pk": f"TENANT#{tenant_id}",
                "sk": f"INVESTIGATION#{investigation_id}",
            },
            UpdateExpression="SET #stage = :stage, summary = :summary, updatedAt = :now",
            ExpressionAttributeNames={"#stage": "stage"},
            ExpressionAttributeValues={
                ":stage": "summarized",
                ":summary": summary,
                ":now": now,
            },
        )

        audit_meta = log_stage_event(
            tenant_id=tenant_id,
            investigation_id=investigation_id,
            stage=self.stage,
            payload={
                "provider": summary.get("provider"),
                "latency_ms": summary.get("latency_ms"),
                "risk_level": summary.get("risk_level"),
                "confidence_score": confidence_score.overall_confidence,
                "false_positive_probability": confidence_score.false_positive_probability,
            },
        )

        self.emit({
            "investigationId": investigation_id, 
            "provider": summary.get("provider"),
            "confidence_score": confidence_score.overall_confidence,
            "false_positive_probability": confidence_score.false_positive_probability
        })

        return {
            **event,
            "summary": summary,
            "updatedAt": now,
            "audit": audit_meta,
        }

    def _select_analyst(self) -> AnalystLLM:
        provider = (os.getenv("AI_PROVIDER") or "bedrock").lower()
        if provider == "kiro":
            try:
                return KiroAnalyst()
            except NotImplementedError:
                pass
        if provider == "amazonq":
            try:
                return AmazonQAnalyst()
            except NotImplementedError:
                pass
        return BedrockAnalyst()

    def calculate_enhanced_confidence_score(self, event: Dict[str, Any], summary: Dict[str, Any]) -> ConfidenceScore:
        """Enhanced confidence scoring for false positive detection."""
        alert = event.get("alert", {})
        context = event.get("context", {})
        
        # Base confidence from AI analysis
        base_confidence = summary.get("confidence", 0.5)
        
        # False positive indicators
        fp_factors = {}
        
        # 1. Alert characteristics
        severity = str(alert.get("severity", "")).lower()
        if severity in ["low", "info", "informational"]:
            fp_factors["low_severity"] = 0.8
        elif severity in ["medium", "moderate"]:
            fp_factors["medium_severity"] = 0.4
        else:
            fp_factors["high_severity"] = 0.1
            
        # 2. Source analysis
        source_ip = alert.get("source_ip", "")
        if source_ip:
            if source_ip.startswith(("10.", "192.168.", "172.")):
                fp_factors["internal_source"] = 0.6
            elif self._is_known_safe_ip(source_ip):
                fp_factors["known_safe_source"] = 0.7
            else:
                fp_factors["external_source"] = 0.2
                
        # 3. Alert frequency and patterns
        repeat_count = alert.get("repeat_count", 0)
        if repeat_count > 10:
            fp_factors["high_frequency"] = 0.7
        elif repeat_count > 5:
            fp_factors["medium_frequency"] = 0.5
        else:
            fp_factors["low_frequency"] = 0.2
            
        # 4. Time-based patterns
        alert_time = alert.get("timestamp", "")
        if self._is_business_hours(alert_time):
            fp_factors["business_hours"] = 0.4
        else:
            fp_factors["off_hours"] = 0.3
            
        # 5. Context enrichment quality
        context_quality = self._assess_context_quality(context)
        fp_factors["context_quality"] = 1.0 - context_quality  # Lower quality = higher FP likelihood
        
        # 6. AI analysis confidence
        ai_confidence = summary.get("confidence", 0.5)
        if ai_confidence < 0.3:
            fp_factors["low_ai_confidence"] = 0.8
        elif ai_confidence < 0.6:
            fp_factors["medium_ai_confidence"] = 0.5
        else:
            fp_factors["high_ai_confidence"] = 0.2
            
        # Calculate weighted false positive probability
        if fp_factors:
            false_positive_prob = sum(fp_factors.values()) / len(fp_factors)
        else:
            false_positive_prob = 0.5
            
        # Automation confidence based on data completeness and reliability
        automation_confidence = self._calculate_automation_confidence(event, summary, context_quality)
        
        # Overall confidence adjustment
        overall_confidence = base_confidence * (1.0 - false_positive_prob * 0.3)
        
        reasoning = self._build_confidence_reasoning(fp_factors, context_quality, ai_confidence)
        
        return ConfidenceScore(
            overall_confidence=max(0.0, min(1.0, overall_confidence)),
            false_positive_probability=max(0.0, min(1.0, false_positive_prob)),
            automation_confidence=max(0.0, min(1.0, automation_confidence)),
            reasoning=reasoning,
            factors=fp_factors
        )

    def _assess_false_positive_likelihood(self, event: Dict[str, Any], summary: Dict[str, Any]) -> Dict[str, Any]:
        """Comprehensive false positive assessment."""
        alert = event.get("alert", {})
        
        # Known false positive patterns
        fp_patterns = []
        
        # Pattern 1: Benign administrative activities
        if "admin" in str(alert.get("description", "")).lower():
            fp_patterns.append("administrative_activity")
            
        # Pattern 2: Automated system processes
        if any(keyword in str(alert.get("process_name", "")).lower() 
               for keyword in ["system", "service", "backup", "update"]):
            fp_patterns.append("system_process")
            
        # Pattern 3: Known safe applications
        if self._is_known_safe_application(alert.get("application", "")):
            fp_patterns.append("safe_application")
            
        # Pattern 4: Whitelisted domains/IPs
        if self._is_whitelisted_resource(alert):
            fp_patterns.append("whitelisted_resource")
            
        return {
            "likelihood_score": summary.get("confidence_metrics", {}).get("false_positive_probability", 0.5),
            "detected_patterns": fp_patterns,
            "risk_factors": self._identify_risk_factors(alert),
            "recommendation": self._get_fp_recommendation(fp_patterns, summary)
        }

    def _is_known_safe_ip(self, ip: str) -> bool:
        """Check if IP is in known safe list."""
        # This would typically check against a whitelist or threat intelligence
        safe_ranges = ["8.8.8.8", "1.1.1.1"]  # Example safe IPs
        return ip in safe_ranges

    def _is_business_hours(self, timestamp: str) -> bool:
        """Check if alert occurred during business hours."""
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            # Assuming HK business hours: 9 AM - 6 PM HKT (UTC+8)
            hk_hour = (dt.hour + 8) % 24
            return 9 <= hk_hour <= 18
        except (ValueError, AttributeError):
            return True  # Default to business hours if parsing fails

    def _assess_context_quality(self, context: Dict[str, Any]) -> float:
        """Assess the quality and completeness of context data."""
        if not context:
            return 0.0
            
        quality_score = 0.0
        total_factors = 0
        
        # Check for key context elements
        context_elements = [
            "user_info", "network_info", "system_info", 
            "historical_data", "threat_intelligence"
        ]
        
        for element in context_elements:
            if context.get(element):
                quality_score += 1.0
            total_factors += 1
            
        return quality_score / total_factors if total_factors > 0 else 0.0

    def _calculate_automation_confidence(self, event: Dict[str, Any], summary: Dict[str, Any], context_quality: float) -> float:
        """Calculate confidence in automated decision making."""
        confidence_factors = []
        
        # Data completeness
        alert = event.get("alert", {})
        required_fields = ["severity", "source_ip", "timestamp", "alert_type", "description"]
        completeness = sum(1 for field in required_fields if alert.get(field)) / len(required_fields)
        confidence_factors.append(completeness)
        
        # Context quality
        confidence_factors.append(context_quality)
        
        # AI analysis confidence
        ai_confidence = summary.get("confidence", 0.5)
        confidence_factors.append(ai_confidence)
        
        # Historical precedent (placeholder - would check against historical decisions)
        confidence_factors.append(0.7)  # Default moderate confidence
        
        return sum(confidence_factors) / len(confidence_factors)

    def _build_confidence_reasoning(self, fp_factors: Dict[str, float], context_quality: float, ai_confidence: float) -> str:
        """Build human-readable reasoning for confidence assessment."""
        reasoning_parts = []
        
        if ai_confidence < 0.4:
            reasoning_parts.append("Low AI analysis confidence")
        elif ai_confidence > 0.8:
            reasoning_parts.append("High AI analysis confidence")
            
        if context_quality < 0.3:
            reasoning_parts.append("Limited context data available")
        elif context_quality > 0.7:
            reasoning_parts.append("Rich context data available")
            
        high_fp_factors = [k for k, v in fp_factors.items() if v > 0.6]
        if high_fp_factors:
            reasoning_parts.append(f"Strong false positive indicators: {', '.join(high_fp_factors)}")
            
        if not reasoning_parts:
            reasoning_parts.append("Standard confidence assessment")
            
        return "; ".join(reasoning_parts)

    def _is_known_safe_application(self, application: str) -> bool:
        """Check if application is known to be safe."""
        safe_apps = ["windows update", "antivirus", "backup service", "system monitor"]
        return any(safe_app in application.lower() for safe_app in safe_apps)

    def _is_whitelisted_resource(self, alert: Dict[str, Any]) -> bool:
        """Check if alert involves whitelisted resources."""
        # This would check against organizational whitelists
        return False  # Placeholder implementation

    def _identify_risk_factors(self, alert: Dict[str, Any]) -> List[str]:
        """Identify factors that increase genuine threat likelihood."""
        risk_factors = []
        
        severity = str(alert.get("severity", "")).lower()
        if severity in ["high", "critical"]:
            risk_factors.append("high_severity")
            
        if alert.get("source_ip", "").startswith(("192.168.", "10.", "172.")):
            pass  # Internal IP, lower risk
        else:
            risk_factors.append("external_source")
            
        if "malware" in str(alert.get("description", "")).lower():
            risk_factors.append("malware_indicator")
            
        return risk_factors

    def _get_fp_recommendation(self, fp_patterns: List[str], summary: Dict[str, Any]) -> str:
        """Get recommendation based on false positive assessment."""
        fp_prob = summary.get("confidence_metrics", {}).get("false_positive_probability", 0.5)
        
        if fp_prob > 0.8:
            return "auto_close"
        elif fp_prob > 0.6:
            return "low_priority_review"
        elif fp_prob < 0.3:
            return "escalate"
        else:
            return "standard_review"

    def _load_knowledge_summary(self) -> Dict[str, str]:
        store_path = Path(os.getenv("KNOWLEDGE_STORE", "out/knowledge_store.json"))
        if not store_path.exists():
            return {}
        try:
            data = json.loads(store_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
        topics: Dict[str, str] = {}
        for entry in data:
            tags = ",".join(entry.get("tags", []))
            topics[entry.get("chunk_id") or entry.get("doc_id")] = (
                f"Tags: {tags}\n{entry.get('content', '')[:300]}"
            )
        return topics
