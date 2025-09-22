"""
Real-time dashboard data aggregation for automation rates and efficiency metrics.

This module provides real-time data aggregation and formatting for dashboard display,
including WebSocket support for live updates and caching for performance.
"""
from __future__ import annotations

import json
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set, Callable
from dataclasses import dataclass, asdict
from threading import Lock, Thread
import logging
import time

import boto3
from botocore.exceptions import ClientError

from .collector import RealTimeMetricsCollector, metrics_collector
from .roi_calculator import ROICalculationEngine, roi_calculator

logger = logging.getLogger(__name__)


@dataclass
class DashboardMetrics:
    """Real-time dashboard metrics snapshot."""
    # Current period metrics
    automation_rate: float
    total_investigations: int
    auto_closed_count: int
    escalated_count: int
    monitoring_count: int
    
    # Efficiency metrics
    avg_processing_time_minutes: float
    time_saved_hours: float
    cost_savings_usd: float
    analyst_hours_saved: float
    
    # Quality metrics
    avg_confidence_score: float
    avg_fp_probability: float
    accuracy_rate: float
    
    # Target tracking
    target_automation_rate: float
    target_met: bool
    target_progress: float
    
    # Trend data (last 24 hours)
    hourly_automation_rates: List[float]
    hourly_investigation_counts: List[int]
    hourly_processing_times: List[float]
    
    # Metadata
    last_updated: datetime
    time_window_hours: int
    tenant_id: str


@dataclass
class LiveUpdate:
    """Live update event for dashboard."""
    event_type: str  # "investigation_completed" | "metrics_updated" | "alert_generated"
    investigation_id: Optional[str]
    tenant_id: str
    data: Dict[str, Any]
    timestamp: datetime


class DashboardDataAggregator:
    """
    Real-time dashboard data aggregation service.
    
    Provides:
    - Real-time metrics aggregation
    - Cached dashboard data with automatic refresh
    - Live update streaming for WebSocket connections
    - Historical trend data
    - Performance optimization through intelligent caching
    """
    
    def __init__(
        self,
        metrics_collector: Optional[RealTimeMetricsCollector] = None,
        roi_calculator: Optional[ROICalculationEngine] = None
    ):
        self.metrics_collector = metrics_collector or RealTimeMetricsCollector()
        self.roi_calculator = roi_calculator or ROICalculationEngine()
        
        # Caching infrastructure
        self._cache_lock = Lock()
        self._dashboard_cache: Dict[str, DashboardMetrics] = {}
        self._cache_expiry: Dict[str, datetime] = {}
        self._cache_ttl = timedelta(minutes=2)  # 2-minute cache TTL
        
        # Live update infrastructure
        self._subscribers: Dict[str, Set[Callable]] = {}  # tenant_id -> set of callbacks
        self._update_queue: List[LiveUpdate] = []
        self._queue_lock = Lock()
        
        # Background refresh
        self._refresh_thread: Optional[Thread] = None
        self._refresh_running = False
        
        # EventBridge for real-time events
        self.events_client = boto3.client("events")
        
    def start_background_refresh(self, refresh_interval_seconds: int = 60) -> None:
        """Start background refresh thread for cache updates."""
        if self._refresh_running:
            return
        
        self._refresh_running = True
        self._refresh_thread = Thread(
            target=self._background_refresh_loop,
            args=(refresh_interval_seconds,),
            daemon=True
        )
        self._refresh_thread.start()
        logger.info("Started dashboard background refresh")
    
    def stop_background_refresh(self) -> None:
        """Stop background refresh thread."""
        self._refresh_running = False
        if self._refresh_thread:
            self._refresh_thread.join(timeout=5.0)
        logger.info("Stopped dashboard background refresh")
    
    def get_dashboard_data(
        self,
        tenant_id: str,
        time_window_hours: int = 24,
        force_refresh: bool = False
    ) -> DashboardMetrics:
        """
        Get comprehensive dashboard data for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            time_window_hours: Time window for metrics calculation
            force_refresh: Force cache refresh
            
        Returns:
            DashboardMetrics object with all dashboard data
        """
        cache_key = f"{tenant_id}:{time_window_hours}h"
        
        # Check cache first (unless force refresh)
        if not force_refresh:
            with self._cache_lock:
                if (cache_key in self._dashboard_cache and 
                    cache_key in self._cache_expiry and
                    datetime.now(timezone.utc) < self._cache_expiry[cache_key]):
                    return self._dashboard_cache[cache_key]
        
        # Calculate fresh metrics
        dashboard_metrics = self._calculate_dashboard_metrics(tenant_id, time_window_hours)
        
        # Cache the result
        with self._cache_lock:
            self._dashboard_cache[cache_key] = dashboard_metrics
            self._cache_expiry[cache_key] = datetime.now(timezone.utc) + self._cache_ttl
        
        return dashboard_metrics
    
    def get_realtime_summary(self, tenant_id: str) -> Dict[str, Any]:
        """
        Get real-time summary for quick dashboard updates.
        
        Args:
            tenant_id: Tenant identifier
            
        Returns:
            Dictionary with key real-time metrics
        """
        # Get current hour metrics
        current_metrics = self.metrics_collector.get_realtime_automation_metrics(tenant_id, 1)
        
        # Get today's metrics
        today_metrics = self.metrics_collector.get_realtime_automation_metrics(tenant_id, 24)
        
        return {
            "current_hour": {
                "investigations": current_metrics.total_investigations,
                "automation_rate": current_metrics.automation_rate,
                "auto_closed": current_metrics.auto_closed_count,
                "escalated": current_metrics.escalated_count
            },
            "today": {
                "investigations": today_metrics.total_investigations,
                "automation_rate": today_metrics.automation_rate,
                "target_met": today_metrics.target_met,
                "avg_processing_time": today_metrics.avg_processing_time / 60.0  # minutes
            },
            "status": {
                "target_automation_rate": 0.8,
                "current_performance": "excellent" if today_metrics.automation_rate >= 0.8 else "needs_improvement",
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
        }
    
    def get_trend_data(
        self,
        tenant_id: str,
        hours: int = 24,
        granularity: str = "hourly"
    ) -> Dict[str, List[Any]]:
        """
        Get trend data for dashboard charts.
        
        Args:
            tenant_id: Tenant identifier
            hours: Number of hours to include
            granularity: Data granularity ("hourly" or "daily")
            
        Returns:
            Dictionary with trend data arrays
        """
        end_time = datetime.now(timezone.utc)
        
        if granularity == "hourly":
            time_points = [end_time - timedelta(hours=i) for i in range(hours, 0, -1)]
        else:  # daily
            days = hours // 24
            time_points = [end_time - timedelta(days=i) for i in range(days, 0, -1)]
        
        automation_rates = []
        investigation_counts = []
        processing_times = []
        confidence_scores = []
        timestamps = []
        
        for time_point in time_points:
            # Get metrics for this time window
            window_hours = 1 if granularity == "hourly" else 24
            window_start = time_point
            window_end = time_point + timedelta(hours=window_hours)
            
            # Calculate metrics for this window
            window_metrics = self._get_metrics_for_window(tenant_id, window_start, window_end)
            
            automation_rates.append(window_metrics.get("automation_rate", 0.0))
            investigation_counts.append(window_metrics.get("total_investigations", 0))
            processing_times.append(window_metrics.get("avg_processing_time", 0.0) / 60.0)  # minutes
            confidence_scores.append(window_metrics.get("avg_confidence_score", 0.0))
            timestamps.append(time_point.isoformat())
        
        return {
            "timestamps": timestamps,
            "automation_rates": automation_rates,
            "investigation_counts": investigation_counts,
            "processing_times_minutes": processing_times,
            "confidence_scores": confidence_scores
        }
    
    def subscribe_to_updates(self, tenant_id: str, callback: Callable[[LiveUpdate], None]) -> str:
        """
        Subscribe to live updates for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            callback: Callback function for updates
            
        Returns:
            Subscription ID for unsubscribing
        """
        subscription_id = f"{tenant_id}:{id(callback)}"
        
        with self._cache_lock:
            if tenant_id not in self._subscribers:
                self._subscribers[tenant_id] = set()
            self._subscribers[tenant_id].add(callback)
        
        logger.info(f"Added subscription {subscription_id}")
        return subscription_id
    
    def unsubscribe_from_updates(self, tenant_id: str, callback: Callable[[LiveUpdate], None]) -> None:
        """
        Unsubscribe from live updates.
        
        Args:
            tenant_id: Tenant identifier
            callback: Callback function to remove
        """
        with self._cache_lock:
            if tenant_id in self._subscribers:
                self._subscribers[tenant_id].discard(callback)
                if not self._subscribers[tenant_id]:
                    del self._subscribers[tenant_id]
    
    def publish_live_update(self, update: LiveUpdate) -> None:
        """
        Publish a live update to subscribers.
        
        Args:
            update: LiveUpdate object to publish
        """
        # Add to queue for processing
        with self._queue_lock:
            self._update_queue.append(update)
        
        # Notify subscribers immediately
        with self._cache_lock:
            if update.tenant_id in self._subscribers:
                for callback in self._subscribers[update.tenant_id]:
                    try:
                        callback(update)
                    except Exception as e:
                        logger.error(f"Error in update callback: {e}")
        
        # Invalidate cache for affected tenant
        self._invalidate_cache(update.tenant_id)
    
    def get_performance_summary(self, tenant_id: str) -> Dict[str, Any]:
        """
        Get performance summary for executive dashboard.
        
        Args:
            tenant_id: Tenant identifier
            
        Returns:
            Dictionary with executive-level performance metrics
        """
        # Get 30-day ROI metrics
        roi_metrics = self.roi_calculator.calculate_comprehensive_roi(tenant_id, 30)
        
        # Get current automation metrics
        automation_metrics = self.metrics_collector.get_realtime_automation_metrics(tenant_id, 24)
        
        return {
            "executive_summary": {
                "automation_rate": f"{automation_metrics.automation_rate:.1%}",
                "target_achievement": "Met" if automation_metrics.target_met else "Not Met",
                "monthly_cost_savings": f"${roi_metrics.cost_savings_usd:,.0f}",
                "annual_projection": f"${roi_metrics.annual_cost_savings_projection:,.0f}",
                "roi_percentage": f"{roi_metrics.roi_percentage:.1f}%"
            },
            "operational_impact": {
                "investigations_processed": automation_metrics.total_investigations,
                "time_saved_days": f"{roi_metrics.time_saved_days:.1f}",
                "analyst_capacity_freed": f"{roi_metrics.analyst_capacity_freed:.1f} FTE",
                "productivity_multiplier": f"{roi_metrics.productivity_multiplier:.1f}x"
            },
            "quality_metrics": {
                "avg_confidence_score": f"{automation_metrics.avg_confidence_score:.1%}",
                "false_positive_reduction": f"{roi_metrics.false_positive_reduction:.1f}%",
                "accuracy_improvement": f"{roi_metrics.accuracy_improvement:.1f}%"
            },
            "trends": {
                "automation_trend": "Improving" if automation_metrics.automation_rate > 0.75 else "Stable",
                "efficiency_trend": "Improving" if roi_metrics.efficiency_improvement_percent > 50 else "Stable",
                "cost_trend": "Decreasing" if roi_metrics.cost_savings_usd > 1000 else "Stable"
            }
        }
    
    def _calculate_dashboard_metrics(self, tenant_id: str, time_window_hours: int) -> DashboardMetrics:
        """Calculate comprehensive dashboard metrics."""
        # Get automation metrics
        automation_metrics = self.metrics_collector.get_realtime_automation_metrics(
            tenant_id, time_window_hours
        )
        
        # Get efficiency metrics
        efficiency_metrics = self.metrics_collector.get_efficiency_metrics(
            tenant_id, time_window_hours
        )
        
        # Get confidence distribution
        confidence_dist = self.metrics_collector.get_confidence_distribution(
            tenant_id, time_window_hours
        )
        
        # Get trend data for last 24 hours
        trend_data = self.get_trend_data(tenant_id, 24, "hourly")
        
        # Calculate target progress
        target_automation_rate = 0.8
        target_progress = min(100.0, (automation_metrics.automation_rate / target_automation_rate) * 100)
        
        # Estimate accuracy rate
        accuracy_rate = 0.85 + (automation_metrics.avg_confidence_score * 0.15)  # 85-100% range
        
        return DashboardMetrics(
            automation_rate=automation_metrics.automation_rate,
            total_investigations=automation_metrics.total_investigations,
            auto_closed_count=automation_metrics.auto_closed_count,
            escalated_count=automation_metrics.escalated_count,
            monitoring_count=automation_metrics.monitoring_count,
            avg_processing_time_minutes=automation_metrics.avg_processing_time / 60.0,
            time_saved_hours=efficiency_metrics.time_saved_hours,
            cost_savings_usd=efficiency_metrics.cost_savings_estimate,
            analyst_hours_saved=efficiency_metrics.analyst_hours_saved,
            avg_confidence_score=confidence_dist["avg_confidence"],
            avg_fp_probability=confidence_dist["avg_fp_probability"],
            accuracy_rate=accuracy_rate,
            target_automation_rate=target_automation_rate,
            target_met=automation_metrics.target_met,
            target_progress=target_progress,
            hourly_automation_rates=trend_data["automation_rates"],
            hourly_investigation_counts=trend_data["investigation_counts"],
            hourly_processing_times=trend_data["processing_times_minutes"],
            last_updated=datetime.now(timezone.utc),
            time_window_hours=time_window_hours,
            tenant_id=tenant_id
        )
    
    def _get_metrics_for_window(
        self,
        tenant_id: str,
        start_time: datetime,
        end_time: datetime
    ) -> Dict[str, float]:
        """Get metrics for a specific time window."""
        # This is a simplified implementation
        # In a real system, this would query time-series data
        window_hours = (end_time - start_time).total_seconds() / 3600.0
        
        try:
            metrics = self.metrics_collector.get_realtime_automation_metrics(tenant_id, int(window_hours))
            return {
                "automation_rate": metrics.automation_rate,
                "total_investigations": metrics.total_investigations,
                "avg_processing_time": metrics.avg_processing_time,
                "avg_confidence_score": metrics.avg_confidence_score
            }
        except Exception as e:
            logger.error(f"Error getting metrics for window: {e}")
            return {
                "automation_rate": 0.0,
                "total_investigations": 0,
                "avg_processing_time": 0.0,
                "avg_confidence_score": 0.0
            }
    
    def _background_refresh_loop(self, refresh_interval_seconds: int) -> None:
        """Background loop for refreshing cached data."""
        while self._refresh_running:
            try:
                # Refresh cached dashboard data for active tenants
                with self._cache_lock:
                    cache_keys = list(self._dashboard_cache.keys())
                
                for cache_key in cache_keys:
                    if not self._refresh_running:
                        break
                    
                    try:
                        # Parse tenant_id and time_window from cache key
                        tenant_id, time_window_str = cache_key.split(":")
                        time_window_hours = int(time_window_str.replace("h", ""))
                        
                        # Refresh this cache entry
                        self.get_dashboard_data(tenant_id, time_window_hours, force_refresh=True)
                        
                    except Exception as e:
                        logger.error(f"Error refreshing cache key {cache_key}: {e}")
                
                # Process update queue
                self._process_update_queue()
                
                # Sleep until next refresh
                time.sleep(refresh_interval_seconds)
                
            except Exception as e:
                logger.error(f"Error in background refresh loop: {e}")
                time.sleep(refresh_interval_seconds)
    
    def _process_update_queue(self) -> None:
        """Process queued live updates."""
        with self._queue_lock:
            updates_to_process = self._update_queue.copy()
            self._update_queue.clear()
        
        # Process updates (could include additional logic like batching, filtering, etc.)
        for update in updates_to_process:
            logger.debug(f"Processed update: {update.event_type} for {update.tenant_id}")
    
    def _invalidate_cache(self, tenant_id: str) -> None:
        """Invalidate cached data for a tenant."""
        with self._cache_lock:
            keys_to_remove = [key for key in self._dashboard_cache.keys() if key.startswith(f"{tenant_id}:")]
            for key in keys_to_remove:
                self._dashboard_cache.pop(key, None)
                self._cache_expiry.pop(key, None)


# Global instance for easy access
dashboard_aggregator = DashboardDataAggregator()