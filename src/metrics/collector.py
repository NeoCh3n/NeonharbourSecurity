"""
Real-time metrics collection service for investigation outcomes and processing times.

This service tracks investigation outcomes, processing times, automation rates,
and efficiency metrics in real-time for the Interactive Demo System.
"""
from __future__ import annotations

import os
import json
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from threading import Lock
import logging

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# DynamoDB table names
METRICS_TABLE = os.getenv("DDB_METRICS_TABLE", "AsiaAgenticSocMetrics-dev")
INVESTIGATIONS_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")

# EventBridge for real-time updates
EVENT_BUS_NAME = os.getenv("EVENT_BUS_NAME", "AsiaAgenticSocBus")


@dataclass
class InvestigationOutcome:
    """Investigation outcome record for metrics tracking."""
    investigation_id: str
    tenant_id: str
    outcome: str  # "auto_closed" | "escalated" | "completed" | "monitoring"
    confidence_score: float
    false_positive_probability: float
    processing_time_seconds: float
    automation_decision: str  # "auto_close" | "escalate" | "monitor"
    escalated_to_human: bool
    risk_level: str
    scenario_type: Optional[str] = None
    is_demo: bool = False
    completed_at: datetime = None
    
    def __post_init__(self):
        if self.completed_at is None:
            self.completed_at = datetime.now(timezone.utc)


@dataclass
class AutomationMetrics:
    """Real-time automation metrics snapshot."""
    total_investigations: int
    auto_closed_count: int
    escalated_count: int
    monitoring_count: int
    automation_rate: float
    escalation_rate: float
    avg_processing_time: float
    avg_confidence_score: float
    target_met: bool  # 80%+ automation rate achieved
    period_start: datetime
    period_end: datetime
    
    def calculate_rates(self):
        """Recalculate automation and escalation rates."""
        if self.total_investigations > 0:
            self.automation_rate = (self.auto_closed_count + self.monitoring_count) / self.total_investigations
            self.escalation_rate = self.escalated_count / self.total_investigations
            self.target_met = self.automation_rate >= 0.8
        else:
            self.automation_rate = 0.0
            self.escalation_rate = 0.0
            self.target_met = False


@dataclass
class EfficiencyMetrics:
    """Efficiency and ROI metrics for analyst time savings."""
    total_investigations: int
    automated_investigations: int
    manual_investigations: int
    avg_automated_time: float  # seconds
    avg_manual_time: float  # seconds
    time_saved_seconds: float
    time_saved_hours: float
    analyst_hours_saved: float
    cost_savings_estimate: float  # USD
    efficiency_improvement: float  # percentage
    
    @classmethod
    def calculate(
        cls,
        total_investigations: int,
        automated_investigations: int,
        avg_automated_time: float,
        baseline_manual_time: float = 1800.0,  # 30 minutes baseline
        analyst_hourly_rate: float = 75.0  # USD per hour
    ) -> 'EfficiencyMetrics':
        """Calculate efficiency metrics from investigation data."""
        manual_investigations = total_investigations - automated_investigations
        avg_manual_time = baseline_manual_time
        
        # Calculate time savings
        if automated_investigations > 0:
            time_saved_per_auto = max(0, baseline_manual_time - avg_automated_time)
            time_saved_seconds = automated_investigations * time_saved_per_auto
        else:
            time_saved_seconds = 0.0
        
        time_saved_hours = time_saved_seconds / 3600.0
        analyst_hours_saved = time_saved_hours  # 1:1 mapping for now
        cost_savings_estimate = analyst_hours_saved * analyst_hourly_rate
        
        # Calculate efficiency improvement
        if total_investigations > 0:
            efficiency_improvement = (automated_investigations / total_investigations) * 100
        else:
            efficiency_improvement = 0.0
        
        return cls(
            total_investigations=total_investigations,
            automated_investigations=automated_investigations,
            manual_investigations=manual_investigations,
            avg_automated_time=avg_automated_time,
            avg_manual_time=avg_manual_time,
            time_saved_seconds=time_saved_seconds,
            time_saved_hours=time_saved_hours,
            analyst_hours_saved=analyst_hours_saved,
            cost_savings_estimate=cost_savings_estimate,
            efficiency_improvement=efficiency_improvement
        )


class RealTimeMetricsCollector:
    """
    Real-time metrics collection service that tracks investigation outcomes,
    processing times, and automation statistics.
    """
    
    def __init__(self):
        self.dynamodb = boto3.resource("dynamodb")
        self.metrics_table = self.dynamodb.Table(METRICS_TABLE)
        self.investigations_table = self.dynamodb.Table(INVESTIGATIONS_TABLE)
        self.events_client = boto3.client("events")
        
        # Thread-safe caching for real-time aggregation
        self._cache_lock = Lock()
        self._metrics_cache: Dict[str, AutomationMetrics] = {}
        self._cache_expiry: Dict[str, datetime] = {}
        self._cache_ttl = timedelta(minutes=5)  # 5-minute cache TTL
    
    def record_investigation_outcome(
        self,
        investigation_id: str,
        tenant_id: str,
        outcome: str,
        confidence_score: float,
        false_positive_probability: float,
        processing_time_seconds: float,
        automation_decision: str,
        escalated_to_human: bool,
        risk_level: str,
        scenario_type: Optional[str] = None,
        is_demo: bool = False
    ) -> None:
        """
        Record an investigation outcome for real-time metrics tracking.
        
        Args:
            investigation_id: Unique investigation identifier
            tenant_id: Tenant identifier
            outcome: Investigation outcome ("auto_closed", "escalated", "completed", "monitoring")
            confidence_score: AI confidence score (0.0-1.0)
            false_positive_probability: Probability of false positive (0.0-1.0)
            processing_time_seconds: Total processing time in seconds
            automation_decision: Automation decision made ("auto_close", "escalate", "monitor")
            escalated_to_human: Whether investigation was escalated to human analyst
            risk_level: Risk level assessment ("low", "medium", "high")
            scenario_type: Type of security scenario (optional)
            is_demo: Whether this is a demo investigation
        """
        outcome_record = InvestigationOutcome(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            outcome=outcome,
            confidence_score=confidence_score,
            false_positive_probability=false_positive_probability,
            processing_time_seconds=processing_time_seconds,
            automation_decision=automation_decision,
            escalated_to_human=escalated_to_human,
            risk_level=risk_level,
            scenario_type=scenario_type,
            is_demo=is_demo
        )
        
        # Store detailed outcome record
        self._store_outcome_record(outcome_record)
        
        # Update real-time aggregates
        self._update_realtime_aggregates(outcome_record)
        
        # Publish real-time event
        self._publish_metrics_event(outcome_record)
        
        # Invalidate cache for affected tenant
        self._invalidate_cache(tenant_id)
        
        logger.info(
            f"Recorded investigation outcome: {investigation_id} -> {outcome} "
            f"(automation: {automation_decision}, confidence: {confidence_score:.2f})"
        )
    
    def get_realtime_automation_metrics(
        self,
        tenant_id: str,
        time_window_hours: int = 24
    ) -> AutomationMetrics:
        """
        Get real-time automation metrics for a tenant within a time window.
        
        Args:
            tenant_id: Tenant identifier
            time_window_hours: Time window in hours (default: 24)
            
        Returns:
            AutomationMetrics object with current statistics
        """
        cache_key = f"{tenant_id}:{time_window_hours}h"
        
        # Check cache first
        with self._cache_lock:
            if (cache_key in self._metrics_cache and 
                cache_key in self._cache_expiry and
                datetime.now(timezone.utc) < self._cache_expiry[cache_key]):
                return self._metrics_cache[cache_key]
        
        # Calculate metrics from database
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=time_window_hours)
        
        metrics = self._calculate_automation_metrics(tenant_id, start_time, end_time)
        
        # Cache the result
        with self._cache_lock:
            self._metrics_cache[cache_key] = metrics
            self._cache_expiry[cache_key] = datetime.now(timezone.utc) + self._cache_ttl
        
        return metrics
    
    def get_efficiency_metrics(
        self,
        tenant_id: str,
        time_window_hours: int = 24,
        baseline_manual_time: float = 1800.0,
        analyst_hourly_rate: float = 75.0
    ) -> EfficiencyMetrics:
        """
        Calculate efficiency and ROI metrics for analyst time savings.
        
        Args:
            tenant_id: Tenant identifier
            time_window_hours: Time window in hours
            baseline_manual_time: Baseline manual investigation time in seconds
            analyst_hourly_rate: Analyst hourly rate for cost calculations
            
        Returns:
            EfficiencyMetrics object with ROI calculations
        """
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=time_window_hours)
        
        # Get investigation data
        investigations = self._get_investigations_in_window(tenant_id, start_time, end_time)
        
        total_investigations = len(investigations)
        automated_investigations = sum(
            1 for inv in investigations 
            if inv.get("automation_decision") in ["auto_close", "monitor"]
        )
        
        # Calculate average automated processing time
        automated_times = [
            inv.get("processing_time", 0) for inv in investigations
            if inv.get("automation_decision") in ["auto_close", "monitor"]
        ]
        avg_automated_time = sum(automated_times) / len(automated_times) if automated_times else 0.0
        
        return EfficiencyMetrics.calculate(
            total_investigations=total_investigations,
            automated_investigations=automated_investigations,
            avg_automated_time=avg_automated_time,
            baseline_manual_time=baseline_manual_time,
            analyst_hourly_rate=analyst_hourly_rate
        )
    
    def get_confidence_distribution(
        self,
        tenant_id: str,
        time_window_hours: int = 24
    ) -> Dict[str, Any]:
        """
        Get confidence score distribution and analysis.
        
        Args:
            tenant_id: Tenant identifier
            time_window_hours: Time window in hours
            
        Returns:
            Dictionary with confidence distribution statistics
        """
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=time_window_hours)
        
        investigations = self._get_investigations_in_window(tenant_id, start_time, end_time)
        
        if not investigations:
            return {
                "avg_confidence": 0.0,
                "avg_fp_probability": 0.0,
                "confidence_buckets": {"low": 0, "medium": 0, "high": 0},
                "fp_probability_buckets": {"low": 0, "medium": 0, "high": 0},
                "sample_size": 0
            }
        
        confidence_scores = [inv.get("confidence_score", 0.5) for inv in investigations]
        fp_probabilities = [inv.get("false_positive_probability", 0.5) for inv in investigations]
        
        # Calculate averages
        avg_confidence = sum(confidence_scores) / len(confidence_scores)
        avg_fp_probability = sum(fp_probabilities) / len(fp_probabilities)
        
        # Create distribution buckets
        confidence_buckets = {"low": 0, "medium": 0, "high": 0}
        fp_buckets = {"low": 0, "medium": 0, "high": 0}
        
        for score in confidence_scores:
            if score < 0.4:
                confidence_buckets["low"] += 1
            elif score < 0.7:
                confidence_buckets["medium"] += 1
            else:
                confidence_buckets["high"] += 1
        
        for prob in fp_probabilities:
            if prob < 0.3:
                fp_buckets["low"] += 1
            elif prob < 0.7:
                fp_buckets["medium"] += 1
            else:
                fp_buckets["high"] += 1
        
        return {
            "avg_confidence": avg_confidence,
            "avg_fp_probability": avg_fp_probability,
            "confidence_buckets": confidence_buckets,
            "fp_probability_buckets": fp_buckets,
            "sample_size": len(investigations)
        }
    
    def get_dashboard_data(
        self,
        tenant_id: str,
        time_window_hours: int = 24
    ) -> Dict[str, Any]:
        """
        Get comprehensive dashboard data for real-time display.
        
        Args:
            tenant_id: Tenant identifier
            time_window_hours: Time window in hours
            
        Returns:
            Dictionary with all dashboard metrics
        """
        automation_metrics = self.get_realtime_automation_metrics(tenant_id, time_window_hours)
        efficiency_metrics = self.get_efficiency_metrics(tenant_id, time_window_hours)
        confidence_dist = self.get_confidence_distribution(tenant_id, time_window_hours)
        
        return {
            "automation": asdict(automation_metrics),
            "efficiency": asdict(efficiency_metrics),
            "confidence_distribution": confidence_dist,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "time_window_hours": time_window_hours,
            "tenant_id": tenant_id
        }
    
    def _store_outcome_record(self, outcome: InvestigationOutcome) -> None:
        """Store detailed outcome record in DynamoDB."""
        try:
            date_key = outcome.completed_at.strftime("%Y-%m-%d")
            hour_key = outcome.completed_at.strftime("%Y-%m-%d-%H")
            
            # Store individual outcome record
            self.metrics_table.put_item(
                Item={
                    "metric_date": date_key,
                    "metric_name": f"investigation_outcome_{outcome.investigation_id}",
                    "value": Decimal("1"),
                    "metadata": {
                        "investigation_id": outcome.investigation_id,
                        "tenant_id": outcome.tenant_id,
                        "outcome": outcome.outcome,
                        "confidence_score": Decimal(str(outcome.confidence_score)),
                        "false_positive_probability": Decimal(str(outcome.false_positive_probability)),
                        "processing_time_seconds": Decimal(str(outcome.processing_time_seconds)),
                        "automation_decision": outcome.automation_decision,
                        "escalated_to_human": outcome.escalated_to_human,
                        "risk_level": outcome.risk_level,
                        "scenario_type": outcome.scenario_type,
                        "is_demo": outcome.is_demo,
                        "hour": hour_key,
                        "completed_at": outcome.completed_at.isoformat()
                    },
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            
        except ClientError as e:
            logger.error(f"Failed to store outcome record: {e}")
            raise
    
    def _update_realtime_aggregates(self, outcome: InvestigationOutcome) -> None:
        """Update real-time aggregate metrics."""
        try:
            date_key = outcome.completed_at.strftime("%Y-%m-%d")
            
            # Update daily counters
            self._increment_metric(date_key, "total_investigations", 1)
            
            if outcome.automation_decision == "auto_close":
                self._increment_metric(date_key, "auto_closed_count", 1)
            elif outcome.automation_decision == "escalate":
                self._increment_metric(date_key, "escalated_count", 1)
            elif outcome.automation_decision == "monitor":
                self._increment_metric(date_key, "monitoring_count", 1)
            
            if outcome.escalated_to_human:
                self._increment_metric(date_key, "human_escalation_count", 1)
            
            # Update processing time metrics
            self._update_avg_metric(date_key, "avg_processing_time", outcome.processing_time_seconds)
            self._update_avg_metric(date_key, "avg_confidence_score", outcome.confidence_score)
            
        except ClientError as e:
            logger.error(f"Failed to update aggregates: {e}")
    
    def _increment_metric(self, date_key: str, metric_name: str, increment: int) -> None:
        """Atomically increment a metric value."""
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
        except ClientError:
            # If item doesn't exist, create it
            self.metrics_table.put_item(
                Item={
                    "metric_date": date_key,
                    "metric_name": metric_name,
                    "value": Decimal(str(increment)),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
    
    def _update_avg_metric(self, date_key: str, metric_name: str, new_value: float) -> None:
        """Update running average metric."""
        try:
            # Get current average and count
            response = self.metrics_table.get_item(
                Key={"metric_date": date_key, "metric_name": metric_name}
            )
            
            if "Item" in response:
                current_avg = float(response["Item"]["value"])
                count_response = self.metrics_table.get_item(
                    Key={"metric_date": date_key, "metric_name": f"{metric_name}_count"}
                )
                current_count = float(count_response.get("Item", {}).get("value", 1))
                
                # Calculate new average
                new_avg = ((current_avg * current_count) + new_value) / (current_count + 1)
                new_count = current_count + 1
            else:
                new_avg = new_value
                new_count = 1
            
            # Update average
            self.metrics_table.put_item(
                Item={
                    "metric_date": date_key,
                    "metric_name": metric_name,
                    "value": Decimal(str(new_avg)),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            
            # Update count
            self.metrics_table.put_item(
                Item={
                    "metric_date": date_key,
                    "metric_name": f"{metric_name}_count",
                    "value": Decimal(str(new_count)),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            
        except ClientError as e:
            logger.error(f"Failed to update average metric {metric_name}: {e}")
    
    def _calculate_automation_metrics(
        self,
        tenant_id: str,
        start_time: datetime,
        end_time: datetime
    ) -> AutomationMetrics:
        """Calculate automation metrics from stored data."""
        investigations = self._get_investigations_in_window(tenant_id, start_time, end_time)
        
        total_investigations = len(investigations)
        auto_closed_count = sum(
            1 for inv in investigations 
            if inv.get("automation_decision") == "auto_close"
        )
        escalated_count = sum(
            1 for inv in investigations 
            if inv.get("automation_decision") == "escalate"
        )
        monitoring_count = sum(
            1 for inv in investigations 
            if inv.get("automation_decision") == "monitor"
        )
        
        # Calculate averages
        processing_times = [inv.get("processing_time", 0) for inv in investigations]
        avg_processing_time = sum(processing_times) / len(processing_times) if processing_times else 0.0
        
        confidence_scores = [inv.get("confidence_score", 0.5) for inv in investigations]
        avg_confidence_score = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
        
        metrics = AutomationMetrics(
            total_investigations=total_investigations,
            auto_closed_count=auto_closed_count,
            escalated_count=escalated_count,
            monitoring_count=monitoring_count,
            automation_rate=0.0,  # Will be calculated
            escalation_rate=0.0,  # Will be calculated
            avg_processing_time=avg_processing_time,
            avg_confidence_score=avg_confidence_score,
            target_met=False,  # Will be calculated
            period_start=start_time,
            period_end=end_time
        )
        
        metrics.calculate_rates()
        return metrics
    
    def _get_investigations_in_window(
        self,
        tenant_id: str,
        start_time: datetime,
        end_time: datetime
    ) -> List[Dict[str, Any]]:
        """Get investigations within time window from DynamoDB."""
        try:
            # Query investigations table for the tenant
            response = self.investigations_table.query(
                KeyConditionExpression="pk = :pk",
                FilterExpression="updatedAt BETWEEN :start AND :end",
                ExpressionAttributeValues={
                    ":pk": f"TENANT#{tenant_id}",
                    ":start": start_time.isoformat(),
                    ":end": end_time.isoformat()
                }
            )
            
            investigations = []
            for item in response.get("Items", []):
                # Extract relevant metrics data
                investigation = {
                    "investigation_id": item.get("investigationId"),
                    "automation_decision": item.get("automationDecision"),
                    "confidence_score": float(item.get("metricsSnapshot", {}).get("confidence_score", 0.5)),
                    "false_positive_probability": float(item.get("metricsSnapshot", {}).get("false_positive_probability", 0.5)),
                    "processing_time": float(item.get("metricsSnapshot", {}).get("MTTR", 0)),
                    "risk_level": item.get("riskLevel"),
                    "updated_at": item.get("updatedAt")
                }
                investigations.append(investigation)
            
            return investigations
            
        except ClientError as e:
            logger.error(f"Failed to query investigations: {e}")
            return []
    
    def _publish_metrics_event(self, outcome: InvestigationOutcome) -> None:
        """Publish real-time metrics event to EventBridge."""
        try:
            event_detail = {
                "investigation_id": outcome.investigation_id,
                "tenant_id": outcome.tenant_id,
                "outcome": outcome.outcome,
                "automation_decision": outcome.automation_decision,
                "confidence_score": outcome.confidence_score,
                "processing_time_seconds": outcome.processing_time_seconds,
                "escalated_to_human": outcome.escalated_to_human,
                "is_demo": outcome.is_demo,
                "timestamp": outcome.completed_at.isoformat()
            }
            
            self.events_client.put_events(
                Entries=[
                    {
                        "EventBusName": EVENT_BUS_NAME,
                        "Source": "asia.agentic.soc.metrics",
                        "DetailType": "InvestigationOutcome",
                        "Detail": json.dumps(event_detail),
                    }
                ]
            )
            
        except ClientError as e:
            logger.warning(f"Failed to publish metrics event: {e}")
    
    def _invalidate_cache(self, tenant_id: str) -> None:
        """Invalidate cached metrics for a tenant."""
        with self._cache_lock:
            keys_to_remove = [key for key in self._metrics_cache.keys() if key.startswith(f"{tenant_id}:")]
            for key in keys_to_remove:
                self._metrics_cache.pop(key, None)
                self._cache_expiry.pop(key, None)


# Global instance for easy access
metrics_collector = RealTimeMetricsCollector()