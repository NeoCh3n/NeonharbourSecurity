"""Automation metrics tracking for false positive detection and 80%+ automation target."""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3

METRICS_TABLE = os.getenv("DDB_METRICS_TABLE", "AsiaAgenticSocMetrics-dev")
DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
dynamodb = boto3.resource("dynamodb")


class AutomationMetricsTracker:
    """Tracks automation statistics and false positive detection performance."""
    
    def __init__(self):
        self.metrics_table = dynamodb.Table(METRICS_TABLE)
        self.investigations_table = dynamodb.Table(DDB_TABLE)
    
    def record_automation_decision(
        self, 
        tenant_id: str, 
        investigation_id: str, 
        automation_action: str,
        confidence_score: float,
        false_positive_probability: float,
        escalated: bool
    ) -> None:
        """Record an automation decision for metrics tracking."""
        now = datetime.now(timezone.utc)
        date_key = now.strftime("%Y-%m-%d")
        hour_key = now.strftime("%Y-%m-%d-%H")
        
        # Record individual decision
        self.metrics_table.put_item(
            Item={
                "metric_date": date_key,
                "metric_name": f"automation_decision_{automation_action}",
                "value": Decimal("1"),
                "metadata": {
                    "investigation_id": investigation_id,
                    "tenant_id": tenant_id,
                    "confidence_score": Decimal(str(confidence_score)),
                    "false_positive_probability": Decimal(str(false_positive_probability)),
                    "escalated": escalated,
                    "hour": hour_key
                },
                "updatedAt": now.isoformat(),
            }
        )
        
        # Update daily aggregates
        self._update_daily_aggregates(date_key, automation_action, escalated)
    
    def _update_daily_aggregates(self, date_key: str, automation_action: str, escalated: bool) -> None:
        """Update daily automation rate aggregates."""
        # Total investigations
        self._increment_metric(date_key, "total_investigations", 1)
        
        # Automation actions
        if automation_action == "auto_close":
            self._increment_metric(date_key, "auto_closed_count", 1)
        elif automation_action == "escalate":
            self._increment_metric(date_key, "escalated_count", 1)
        elif automation_action == "monitor":
            self._increment_metric(date_key, "monitored_count", 1)
        
        # Escalation tracking
        if escalated:
            self._increment_metric(date_key, "human_escalation_count", 1)
        else:
            self._increment_metric(date_key, "automated_resolution_count", 1)
    
    def _increment_metric(self, date_key: str, metric_name: str, increment: int) -> None:
        """Increment a metric value atomically."""
        try:
            self.metrics_table.update_item(
                Key={
                    "metric_date": date_key,
                    "metric_name": metric_name,
                },
                UpdateExpression="ADD #value :increment SET updatedAt = :now",
                ExpressionAttributeNames={"#value": "value"},
                ExpressionAttributeValues={
                    ":increment": Decimal(str(increment)),
                    ":now": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            # If item doesn't exist, create it
            self.metrics_table.put_item(
                Item={
                    "metric_date": date_key,
                    "metric_name": metric_name,
                    "value": Decimal(str(increment)),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
    
    def get_automation_rate(self, days: int = 7) -> Dict[str, float]:
        """Calculate automation rate over the specified number of days."""
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        total_investigations = 0
        auto_closed = 0
        escalated = 0
        monitored = 0
        human_escalations = 0
        
        # Query metrics for the date range
        current_date = start_date
        while current_date <= end_date:
            date_key = current_date.strftime("%Y-%m-%d")
            
            # Get daily metrics
            daily_metrics = self._get_daily_metrics(date_key)
            
            total_investigations += daily_metrics.get("total_investigations", 0)
            auto_closed += daily_metrics.get("auto_closed_count", 0)
            escalated += daily_metrics.get("escalated_count", 0)
            monitored += daily_metrics.get("monitored_count", 0)
            human_escalations += daily_metrics.get("human_escalation_count", 0)
            
            current_date += timedelta(days=1)
        
        # Calculate rates
        if total_investigations == 0:
            return {
                "automation_rate": 0.0,
                "auto_close_rate": 0.0,
                "escalation_rate": 0.0,
                "monitoring_rate": 0.0,
                "human_escalation_rate": 0.0,
                "total_investigations": 0,
                "target_met": False
            }
        
        automation_rate = (auto_closed + monitored) / total_investigations
        auto_close_rate = auto_closed / total_investigations
        escalation_rate = escalated / total_investigations
        monitoring_rate = monitored / total_investigations
        human_escalation_rate = human_escalations / total_investigations
        
        return {
            "automation_rate": automation_rate,
            "auto_close_rate": auto_close_rate,
            "escalation_rate": escalation_rate,
            "monitoring_rate": monitoring_rate,
            "human_escalation_rate": human_escalation_rate,
            "total_investigations": total_investigations,
            "target_met": automation_rate >= 0.8  # 80% automation target
        }
    
    def _get_daily_metrics(self, date_key: str) -> Dict[str, int]:
        """Get all metrics for a specific date."""
        try:
            response = self.metrics_table.query(
                KeyConditionExpression="metric_date = :date",
                ExpressionAttributeValues={":date": date_key}
            )
            
            metrics = {}
            for item in response.get("Items", []):
                metric_name = item["metric_name"]
                value = float(item["value"])
                metrics[metric_name] = int(value)
            
            return metrics
        except Exception:
            return {}
    
    def get_confidence_distribution(self, days: int = 7) -> Dict[str, Any]:
        """Analyze confidence score distribution for automation decisions."""
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        confidence_scores = []
        fp_probabilities = []
        automation_actions = {"auto_close": 0, "escalate": 0, "monitor": 0}
        
        # Query automation decisions
        current_date = start_date
        while current_date <= end_date:
            date_key = current_date.strftime("%Y-%m-%d")
            
            try:
                response = self.metrics_table.query(
                    KeyConditionExpression="metric_date = :date",
                    FilterExpression="begins_with(metric_name, :prefix)",
                    ExpressionAttributeValues={
                        ":date": date_key,
                        ":prefix": "automation_decision_"
                    }
                )
                
                for item in response.get("Items", []):
                    metadata = item.get("metadata", {})
                    if metadata:
                        confidence_scores.append(float(metadata.get("confidence_score", 0)))
                        fp_probabilities.append(float(metadata.get("false_positive_probability", 0)))
                        
                        action = item["metric_name"].replace("automation_decision_", "")
                        automation_actions[action] = automation_actions.get(action, 0) + 1
                        
            except Exception:
                pass
            
            current_date += timedelta(days=1)
        
        # Calculate statistics
        if not confidence_scores:
            return {
                "avg_confidence": 0.0,
                "avg_fp_probability": 0.0,
                "confidence_distribution": {},
                "automation_actions": automation_actions,
                "sample_size": 0
            }
        
        avg_confidence = sum(confidence_scores) / len(confidence_scores)
        avg_fp_probability = sum(fp_probabilities) / len(fp_probabilities)
        
        # Confidence distribution buckets
        confidence_buckets = {"low": 0, "medium": 0, "high": 0}
        for score in confidence_scores:
            if score < 0.4:
                confidence_buckets["low"] += 1
            elif score < 0.7:
                confidence_buckets["medium"] += 1
            else:
                confidence_buckets["high"] += 1
        
        return {
            "avg_confidence": avg_confidence,
            "avg_fp_probability": avg_fp_probability,
            "confidence_distribution": confidence_buckets,
            "automation_actions": automation_actions,
            "sample_size": len(confidence_scores)
        }
    
    def get_false_positive_accuracy(self, days: int = 30) -> Dict[str, float]:
        """Calculate false positive detection accuracy (requires feedback data)."""
        # This would require feedback from analysts on whether auto-closed alerts
        # were actually false positives. For now, return placeholder metrics.
        return {
            "precision": 0.85,  # Placeholder: 85% of auto-closed alerts were actually FPs
            "recall": 0.82,     # Placeholder: 82% of actual FPs were auto-closed
            "f1_score": 0.835,  # Placeholder: F1 score
            "sample_size": 0,
            "note": "Requires analyst feedback for accurate calculation"
        }


# Global instance for easy access
automation_tracker = AutomationMetricsTracker()