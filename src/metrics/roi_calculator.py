"""
ROI calculation engine for analyst time savings and operational impact.

This module provides comprehensive ROI calculations for the automation system,
including analyst time savings, cost reductions, and operational efficiency improvements.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import logging

import boto3
from botocore.exceptions import ClientError

from .collector import RealTimeMetricsCollector, AutomationMetrics, EfficiencyMetrics

logger = logging.getLogger(__name__)


@dataclass
class ROIMetrics:
    """Comprehensive ROI metrics for automation system."""
    # Time savings
    total_investigations: int
    automated_investigations: int
    manual_investigations: int
    time_saved_hours: float
    time_saved_days: float
    
    # Cost savings
    analyst_hours_saved: float
    cost_savings_usd: float
    annual_cost_savings_projection: float
    
    # Efficiency improvements
    automation_rate: float
    efficiency_improvement_percent: float
    productivity_multiplier: float
    
    # Quality metrics
    false_positive_reduction: float
    accuracy_improvement: float
    mean_time_to_resolution_improvement: float
    
    # Operational impact
    analyst_capacity_freed: float  # FTE equivalent
    investigations_per_analyst_per_day: float
    scalability_factor: float
    
    # Period information
    calculation_period_days: int
    calculation_date: datetime
    
    @property
    def roi_percentage(self) -> float:
        """Calculate ROI as percentage."""
        # Simplified ROI calculation based on cost savings
        # In a real implementation, this would include system costs
        system_cost_estimate = 50000.0  # Annual system cost estimate
        if system_cost_estimate > 0:
            return (self.annual_cost_savings_projection / system_cost_estimate) * 100
        return 0.0


@dataclass
class ComparisonMetrics:
    """Comparison metrics between automated and manual processes."""
    # Processing time comparison
    avg_automated_time_minutes: float
    avg_manual_time_minutes: float
    time_reduction_percent: float
    
    # Accuracy comparison
    automated_accuracy_rate: float
    manual_accuracy_rate: float
    accuracy_improvement_percent: float
    
    # Throughput comparison
    automated_throughput_per_hour: float
    manual_throughput_per_hour: float
    throughput_improvement_percent: float
    
    # Cost comparison
    cost_per_automated_investigation: float
    cost_per_manual_investigation: float
    cost_reduction_percent: float


class ROICalculationEngine:
    """
    Engine for calculating ROI metrics and analyst time savings.
    
    This class provides comprehensive ROI calculations including:
    - Direct time savings from automation
    - Cost reductions from reduced manual work
    - Efficiency improvements and productivity gains
    - Quality improvements from reduced false positives
    - Operational impact and scalability benefits
    """
    
    # Default configuration values
    DEFAULT_CONFIG = {
        "analyst_hourly_rate_usd": 75.0,
        "analyst_hours_per_day": 8.0,
        "analyst_working_days_per_year": 250,
        "baseline_manual_investigation_minutes": 30.0,
        "baseline_manual_accuracy_rate": 0.85,
        "system_annual_cost_usd": 50000.0,
        "false_positive_manual_time_minutes": 45.0,
        "escalation_handling_time_minutes": 120.0
    }
    
    def __init__(self, metrics_collector: Optional[RealTimeMetricsCollector] = None):
        self.metrics_collector = metrics_collector or RealTimeMetricsCollector()
        self.config = self._load_configuration()
    
    def calculate_comprehensive_roi(
        self,
        tenant_id: str,
        period_days: int = 30,
        custom_config: Optional[Dict[str, float]] = None
    ) -> ROIMetrics:
        """
        Calculate comprehensive ROI metrics for a tenant over a specified period.
        
        Args:
            tenant_id: Tenant identifier
            period_days: Analysis period in days
            custom_config: Custom configuration overrides
            
        Returns:
            ROIMetrics object with comprehensive ROI analysis
        """
        # Merge custom configuration
        config = {**self.config, **(custom_config or {})}
        
        # Get automation metrics
        automation_metrics = self.metrics_collector.get_realtime_automation_metrics(
            tenant_id, period_days * 24
        )
        
        # Get efficiency metrics
        efficiency_metrics = self.metrics_collector.get_efficiency_metrics(
            tenant_id, 
            period_days * 24,
            baseline_manual_time=config["baseline_manual_investigation_minutes"] * 60,
            analyst_hourly_rate=config["analyst_hourly_rate_usd"]
        )
        
        # Calculate time savings
        time_saved_hours = efficiency_metrics.time_saved_hours
        time_saved_days = time_saved_hours / config["analyst_hours_per_day"]
        
        # Calculate cost savings
        analyst_hours_saved = time_saved_hours
        cost_savings_usd = analyst_hours_saved * config["analyst_hourly_rate_usd"]
        
        # Project annual savings
        daily_savings = cost_savings_usd / period_days
        annual_cost_savings_projection = daily_savings * config["analyst_working_days_per_year"]
        
        # Calculate efficiency improvements
        automation_rate = automation_metrics.automation_rate
        efficiency_improvement_percent = efficiency_metrics.efficiency_improvement
        
        # Calculate productivity multiplier
        if automation_metrics.total_investigations > 0:
            baseline_capacity = automation_metrics.total_investigations
            automated_capacity = baseline_capacity / (1 - automation_rate) if automation_rate < 1 else baseline_capacity * 2
            productivity_multiplier = automated_capacity / baseline_capacity if baseline_capacity > 0 else 1.0
        else:
            productivity_multiplier = 1.0
        
        # Calculate quality improvements
        false_positive_reduction = self._calculate_false_positive_reduction(tenant_id, period_days)
        accuracy_improvement = self._calculate_accuracy_improvement(automation_metrics)
        mttr_improvement = self._calculate_mttr_improvement(automation_metrics, config)
        
        # Calculate operational impact
        analyst_capacity_freed = time_saved_hours / (config["analyst_hours_per_day"] * period_days)
        investigations_per_analyst_per_day = self._calculate_investigations_per_analyst_per_day(
            automation_metrics, config
        )
        scalability_factor = self._calculate_scalability_factor(automation_rate)
        
        return ROIMetrics(
            total_investigations=automation_metrics.total_investigations,
            automated_investigations=automation_metrics.auto_closed_count + automation_metrics.monitoring_count,
            manual_investigations=automation_metrics.escalated_count,
            time_saved_hours=time_saved_hours,
            time_saved_days=time_saved_days,
            analyst_hours_saved=analyst_hours_saved,
            cost_savings_usd=cost_savings_usd,
            annual_cost_savings_projection=annual_cost_savings_projection,
            automation_rate=automation_rate,
            efficiency_improvement_percent=efficiency_improvement_percent,
            productivity_multiplier=productivity_multiplier,
            false_positive_reduction=false_positive_reduction,
            accuracy_improvement=accuracy_improvement,
            mean_time_to_resolution_improvement=mttr_improvement,
            analyst_capacity_freed=analyst_capacity_freed,
            investigations_per_analyst_per_day=investigations_per_analyst_per_day,
            scalability_factor=scalability_factor,
            calculation_period_days=period_days,
            calculation_date=datetime.now(timezone.utc)
        )
    
    def calculate_comparison_metrics(
        self,
        tenant_id: str,
        period_days: int = 30,
        custom_config: Optional[Dict[str, float]] = None
    ) -> ComparisonMetrics:
        """
        Calculate comparison metrics between automated and manual processes.
        
        Args:
            tenant_id: Tenant identifier
            period_days: Analysis period in days
            custom_config: Custom configuration overrides
            
        Returns:
            ComparisonMetrics object with detailed comparisons
        """
        config = {**self.config, **(custom_config or {})}
        
        # Get automation metrics
        automation_metrics = self.metrics_collector.get_realtime_automation_metrics(
            tenant_id, period_days * 24
        )
        
        # Calculate processing time comparison
        avg_automated_time_minutes = automation_metrics.avg_processing_time / 60.0
        avg_manual_time_minutes = config["baseline_manual_investigation_minutes"]
        time_reduction_percent = (
            (avg_manual_time_minutes - avg_automated_time_minutes) / avg_manual_time_minutes * 100
            if avg_manual_time_minutes > 0 else 0.0
        )
        
        # Calculate accuracy comparison
        automated_accuracy_rate = self._estimate_automated_accuracy(automation_metrics)
        manual_accuracy_rate = config["baseline_manual_accuracy_rate"]
        accuracy_improvement_percent = (
            (automated_accuracy_rate - manual_accuracy_rate) / manual_accuracy_rate * 100
            if manual_accuracy_rate > 0 else 0.0
        )
        
        # Calculate throughput comparison
        automated_throughput_per_hour = 60.0 / avg_automated_time_minutes if avg_automated_time_minutes > 0 else 0.0
        manual_throughput_per_hour = 60.0 / avg_manual_time_minutes if avg_manual_time_minutes > 0 else 0.0
        throughput_improvement_percent = (
            (automated_throughput_per_hour - manual_throughput_per_hour) / manual_throughput_per_hour * 100
            if manual_throughput_per_hour > 0 else 0.0
        )
        
        # Calculate cost comparison
        cost_per_automated_investigation = (avg_automated_time_minutes / 60.0) * config["analyst_hourly_rate_usd"] * 0.1  # 10% analyst oversight
        cost_per_manual_investigation = (avg_manual_time_minutes / 60.0) * config["analyst_hourly_rate_usd"]
        cost_reduction_percent = (
            (cost_per_manual_investigation - cost_per_automated_investigation) / cost_per_manual_investigation * 100
            if cost_per_manual_investigation > 0 else 0.0
        )
        
        return ComparisonMetrics(
            avg_automated_time_minutes=avg_automated_time_minutes,
            avg_manual_time_minutes=avg_manual_time_minutes,
            time_reduction_percent=time_reduction_percent,
            automated_accuracy_rate=automated_accuracy_rate,
            manual_accuracy_rate=manual_accuracy_rate,
            accuracy_improvement_percent=accuracy_improvement_percent,
            automated_throughput_per_hour=automated_throughput_per_hour,
            manual_throughput_per_hour=manual_throughput_per_hour,
            throughput_improvement_percent=throughput_improvement_percent,
            cost_per_automated_investigation=cost_per_automated_investigation,
            cost_per_manual_investigation=cost_per_manual_investigation,
            cost_reduction_percent=cost_reduction_percent
        )
    
    def generate_roi_report(
        self,
        tenant_id: str,
        period_days: int = 30,
        include_projections: bool = True,
        custom_config: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive ROI report with all metrics and analysis.
        
        Args:
            tenant_id: Tenant identifier
            period_days: Analysis period in days
            include_projections: Whether to include future projections
            custom_config: Custom configuration overrides
            
        Returns:
            Dictionary with comprehensive ROI report
        """
        roi_metrics = self.calculate_comprehensive_roi(tenant_id, period_days, custom_config)
        comparison_metrics = self.calculate_comparison_metrics(tenant_id, period_days, custom_config)
        
        report = {
            "executive_summary": {
                "automation_rate": f"{roi_metrics.automation_rate:.1%}",
                "cost_savings_usd": roi_metrics.cost_savings_usd,
                "time_saved_days": roi_metrics.time_saved_days,
                "roi_percentage": roi_metrics.roi_percentage,
                "target_met": roi_metrics.automation_rate >= 0.8
            },
            "detailed_metrics": {
                "roi_metrics": asdict(roi_metrics),
                "comparison_metrics": asdict(comparison_metrics)
            },
            "key_insights": self._generate_key_insights(roi_metrics, comparison_metrics),
            "recommendations": self._generate_recommendations(roi_metrics),
            "report_metadata": {
                "tenant_id": tenant_id,
                "period_days": period_days,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "configuration": custom_config or {}
            }
        }
        
        if include_projections:
            report["projections"] = self._generate_projections(roi_metrics)
        
        return report
    
    def _load_configuration(self) -> Dict[str, float]:
        """Load ROI calculation configuration from environment or defaults."""
        config = {}
        for key, default_value in self.DEFAULT_CONFIG.items():
            env_key = f"ROI_{key.upper()}"
            config[key] = float(os.getenv(env_key, default_value))
        return config
    
    def _calculate_false_positive_reduction(self, tenant_id: str, period_days: int) -> float:
        """Calculate false positive reduction percentage."""
        # Get confidence distribution
        confidence_dist = self.metrics_collector.get_confidence_distribution(
            tenant_id, period_days * 24
        )
        
        # Estimate false positive reduction based on high FP probability detections
        high_fp_count = confidence_dist.get("fp_probability_buckets", {}).get("high", 0)
        total_count = confidence_dist.get("sample_size", 1)
        
        if total_count > 0:
            return (high_fp_count / total_count) * 100
        return 0.0
    
    def _calculate_accuracy_improvement(self, automation_metrics: AutomationMetrics) -> float:
        """Calculate accuracy improvement from automation."""
        # Estimate based on confidence scores and automation success
        if automation_metrics.total_investigations > 0:
            # Higher confidence scores indicate better accuracy
            confidence_factor = automation_metrics.avg_confidence_score
            automation_factor = automation_metrics.automation_rate
            
            # Simplified accuracy improvement calculation
            return (confidence_factor * automation_factor) * 15.0  # Up to 15% improvement
        return 0.0
    
    def _calculate_mttr_improvement(self, automation_metrics: AutomationMetrics, config: Dict[str, float]) -> float:
        """Calculate mean time to resolution improvement."""
        baseline_mttr_minutes = config["baseline_manual_investigation_minutes"]
        current_mttr_minutes = automation_metrics.avg_processing_time / 60.0
        
        if baseline_mttr_minutes > 0:
            improvement = (baseline_mttr_minutes - current_mttr_minutes) / baseline_mttr_minutes
            return max(0.0, improvement * 100)
        return 0.0
    
    def _calculate_investigations_per_analyst_per_day(
        self, 
        automation_metrics: AutomationMetrics, 
        config: Dict[str, float]
    ) -> float:
        """Calculate investigations per analyst per day with automation."""
        hours_per_day = config["analyst_hours_per_day"]
        avg_time_per_investigation_hours = automation_metrics.avg_processing_time / 3600.0
        
        if avg_time_per_investigation_hours > 0:
            return hours_per_day / avg_time_per_investigation_hours
        return 0.0
    
    def _calculate_scalability_factor(self, automation_rate: float) -> float:
        """Calculate scalability factor based on automation rate."""
        # Higher automation rate means better scalability
        return 1.0 + (automation_rate * 2.0)  # Up to 3x scalability improvement
    
    def _estimate_automated_accuracy(self, automation_metrics: AutomationMetrics) -> float:
        """Estimate automated process accuracy."""
        # Base accuracy on confidence scores and successful automation
        base_accuracy = 0.85  # Baseline accuracy
        confidence_bonus = automation_metrics.avg_confidence_score * 0.15  # Up to 15% bonus
        
        return min(0.99, base_accuracy + confidence_bonus)  # Cap at 99%
    
    def _generate_key_insights(
        self, 
        roi_metrics: ROIMetrics, 
        comparison_metrics: ComparisonMetrics
    ) -> List[str]:
        """Generate key insights from ROI analysis."""
        insights = []
        
        if roi_metrics.automation_rate >= 0.8:
            insights.append(f"✅ Automation target achieved: {roi_metrics.automation_rate:.1%} automation rate")
        else:
            insights.append(f"⚠️ Automation target not met: {roi_metrics.automation_rate:.1%} (target: 80%)")
        
        if roi_metrics.cost_savings_usd > 1000:
            insights.append(f"💰 Significant cost savings: ${roi_metrics.cost_savings_usd:,.0f} in {roi_metrics.calculation_period_days} days")
        
        if comparison_metrics.time_reduction_percent > 50:
            insights.append(f"⚡ Major time savings: {comparison_metrics.time_reduction_percent:.0f}% reduction in processing time")
        
        if roi_metrics.analyst_capacity_freed > 0.1:
            insights.append(f"👥 Analyst capacity freed: {roi_metrics.analyst_capacity_freed:.1f} FTE equivalent")
        
        if roi_metrics.productivity_multiplier > 1.5:
            insights.append(f"📈 Productivity boost: {roi_metrics.productivity_multiplier:.1f}x productivity multiplier")
        
        return insights
    
    def _generate_recommendations(self, roi_metrics: ROIMetrics) -> List[str]:
        """Generate recommendations based on ROI analysis."""
        recommendations = []
        
        if roi_metrics.automation_rate < 0.8:
            recommendations.append("Increase automation rate by tuning confidence thresholds")
        
        if roi_metrics.false_positive_reduction < 70:
            recommendations.append("Improve false positive detection to reduce manual review overhead")
        
        if roi_metrics.efficiency_improvement_percent < 50:
            recommendations.append("Optimize investigation workflows to improve efficiency")
        
        if roi_metrics.annual_cost_savings_projection > 100000:
            recommendations.append("Consider expanding automation to additional use cases")
        
        return recommendations
    
    def _generate_projections(self, roi_metrics: ROIMetrics) -> Dict[str, Any]:
        """Generate future projections based on current metrics."""
        return {
            "annual_projections": {
                "cost_savings_usd": roi_metrics.annual_cost_savings_projection,
                "time_saved_days": roi_metrics.time_saved_days * (365 / roi_metrics.calculation_period_days),
                "investigations_automated": roi_metrics.automated_investigations * (365 / roi_metrics.calculation_period_days)
            },
            "scaling_projections": {
                "2x_volume_cost_savings": roi_metrics.annual_cost_savings_projection * roi_metrics.scalability_factor,
                "5x_volume_analyst_need": max(1, 5 / roi_metrics.scalability_factor),
                "break_even_volume": roi_metrics.total_investigations * 2  # Simplified break-even
            }
        }


# Global instance for easy access
roi_calculator = ROICalculationEngine()