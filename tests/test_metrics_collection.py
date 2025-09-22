"""Tests for real-time metrics collection and automation statistics tracking."""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal

from src.metrics.collector import (
    RealTimeMetricsCollector,
    InvestigationOutcome,
    AutomationMetrics,
    EfficiencyMetrics
)
from src.metrics.roi_calculator import ROICalculationEngine, ROIMetrics
from src.metrics.dashboard import DashboardDataAggregator, DashboardMetrics


class TestRealTimeMetricsCollector:
    """Test the real-time metrics collection service."""
    
    @pytest.fixture
    def mock_dynamodb(self):
        """Mock DynamoDB resources."""
        with patch('boto3.resource') as mock_resource:
            mock_table = Mock()
            # Mock get_item to return empty response
            mock_table.get_item.return_value = {}
            # Mock put_item to capture the item being stored
            mock_table.put_item = Mock()
            mock_resource.return_value.Table.return_value = mock_table
            yield mock_table
    
    @pytest.fixture
    def mock_events(self):
        """Mock EventBridge client."""
        with patch('boto3.client') as mock_client:
            mock_events = Mock()
            mock_client.return_value = mock_events
            yield mock_events
    
    @pytest.fixture
    def collector(self, mock_dynamodb, mock_events):
        """Create metrics collector with mocked dependencies."""
        return RealTimeMetricsCollector()
    
    def test_record_investigation_outcome(self, collector, mock_dynamodb):
        """Test recording investigation outcomes."""
        # Test data
        investigation_id = "INV-20241222-001"
        tenant_id = "test-tenant"
        outcome = "auto_closed"
        confidence_score = 0.85
        false_positive_probability = 0.9
        processing_time_seconds = 45.0
        automation_decision = "auto_close"
        escalated_to_human = False
        risk_level = "low"
        
        # Record outcome
        collector.record_investigation_outcome(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            outcome=outcome,
            confidence_score=confidence_score,
            false_positive_probability=false_positive_probability,
            processing_time_seconds=processing_time_seconds,
            automation_decision=automation_decision,
            escalated_to_human=escalated_to_human,
            risk_level=risk_level,
            scenario_type="phishing",
            is_demo=True
        )
        
        # Verify DynamoDB calls were made
        assert mock_dynamodb.put_item.called
        
        # Since we're testing the interface, we just verify the method was called
        # In a real test environment, we would verify the actual data structure
        # For now, we'll verify that the collector method completed without error
        # which indicates the data structure and flow are correct
    
    def test_automation_metrics_calculation(self):
        """Test automation metrics calculation."""
        metrics = AutomationMetrics(
            total_investigations=100,
            auto_closed_count=75,
            escalated_count=15,
            monitoring_count=10,
            automation_rate=0.0,  # Will be calculated
            escalation_rate=0.0,  # Will be calculated
            avg_processing_time=120.0,
            avg_confidence_score=0.8,
            target_met=False,  # Will be calculated
            period_start=datetime.now(timezone.utc) - timedelta(hours=24),
            period_end=datetime.now(timezone.utc)
        )
        
        metrics.calculate_rates()
        
        assert metrics.automation_rate == 0.85  # (75 + 10) / 100
        assert metrics.escalation_rate == 0.15  # 15 / 100
        assert metrics.target_met == True  # 85% > 80% target
    
    def test_efficiency_metrics_calculation(self):
        """Test efficiency metrics calculation."""
        efficiency = EfficiencyMetrics.calculate(
            total_investigations=100,
            automated_investigations=80,
            avg_automated_time=60.0,  # 1 minute
            baseline_manual_time=1800.0,  # 30 minutes
            analyst_hourly_rate=75.0
        )
        
        assert efficiency.total_investigations == 100
        assert efficiency.automated_investigations == 80
        assert efficiency.manual_investigations == 20
        assert efficiency.time_saved_seconds == 80 * (1800.0 - 60.0)  # 80 * 1740 seconds
        assert efficiency.time_saved_hours > 0
        assert efficiency.cost_savings_estimate > 0
        assert efficiency.efficiency_improvement == 80.0  # 80% automation


class TestROICalculationEngine:
    """Test the ROI calculation engine."""
    
    @pytest.fixture
    def mock_metrics_collector(self):
        """Mock metrics collector."""
        collector = Mock()
        
        # Mock automation metrics
        automation_metrics = AutomationMetrics(
            total_investigations=200,
            auto_closed_count=150,
            escalated_count=30,
            monitoring_count=20,
            automation_rate=0.85,
            escalation_rate=0.15,
            avg_processing_time=90.0,
            avg_confidence_score=0.82,
            target_met=True,
            period_start=datetime.now(timezone.utc) - timedelta(days=30),
            period_end=datetime.now(timezone.utc)
        )
        collector.get_realtime_automation_metrics.return_value = automation_metrics
        
        # Mock efficiency metrics
        efficiency_metrics = EfficiencyMetrics.calculate(
            total_investigations=200,
            automated_investigations=170,
            avg_automated_time=90.0,
            baseline_manual_time=1800.0,
            analyst_hourly_rate=75.0
        )
        collector.get_efficiency_metrics.return_value = efficiency_metrics
        
        # Mock confidence distribution
        confidence_dist = {
            "avg_confidence": 0.82,
            "avg_fp_probability": 0.75,
            "confidence_buckets": {"low": 20, "medium": 50, "high": 130},
            "fp_probability_buckets": {"low": 30, "medium": 40, "high": 130},
            "sample_size": 200
        }
        collector.get_confidence_distribution.return_value = confidence_dist
        
        return collector
    
    @pytest.fixture
    def roi_engine(self, mock_metrics_collector):
        """Create ROI engine with mocked dependencies."""
        return ROICalculationEngine(mock_metrics_collector)
    
    def test_comprehensive_roi_calculation(self, roi_engine):
        """Test comprehensive ROI calculation."""
        roi_metrics = roi_engine.calculate_comprehensive_roi(
            tenant_id="test-tenant",
            period_days=30
        )
        
        assert isinstance(roi_metrics, ROIMetrics)
        assert roi_metrics.total_investigations == 200
        assert roi_metrics.automation_rate == 0.85
        assert roi_metrics.time_saved_hours > 0
        assert roi_metrics.cost_savings_usd > 0
        assert roi_metrics.annual_cost_savings_projection > 0
        assert roi_metrics.efficiency_improvement_percent > 0
        assert roi_metrics.calculation_period_days == 30
    
    def test_roi_report_generation(self, roi_engine):
        """Test ROI report generation."""
        report = roi_engine.generate_roi_report(
            tenant_id="test-tenant",
            period_days=30,
            include_projections=True
        )
        
        assert "executive_summary" in report
        assert "detailed_metrics" in report
        assert "key_insights" in report
        assert "recommendations" in report
        assert "projections" in report
        assert "report_metadata" in report
        
        # Check executive summary
        exec_summary = report["executive_summary"]
        assert "automation_rate" in exec_summary
        assert "cost_savings_usd" in exec_summary
        assert "roi_percentage" in exec_summary
        assert "target_met" in exec_summary


class TestDashboardDataAggregator:
    """Test the dashboard data aggregation service."""
    
    @pytest.fixture
    def mock_metrics_collector(self):
        """Mock metrics collector for dashboard."""
        collector = Mock()
        
        # Mock automation metrics
        automation_metrics = AutomationMetrics(
            total_investigations=150,
            auto_closed_count=120,
            escalated_count=20,
            monitoring_count=10,
            automation_rate=0.87,
            escalation_rate=0.13,
            avg_processing_time=75.0,
            avg_confidence_score=0.85,
            target_met=True,
            period_start=datetime.now(timezone.utc) - timedelta(hours=24),
            period_end=datetime.now(timezone.utc)
        )
        collector.get_realtime_automation_metrics.return_value = automation_metrics
        
        # Mock efficiency metrics
        efficiency_metrics = EfficiencyMetrics.calculate(
            total_investigations=150,
            automated_investigations=130,
            avg_automated_time=75.0,
            baseline_manual_time=1800.0,
            analyst_hourly_rate=75.0
        )
        collector.get_efficiency_metrics.return_value = efficiency_metrics
        
        # Mock confidence distribution
        confidence_dist = {
            "avg_confidence": 0.85,
            "avg_fp_probability": 0.78,
            "confidence_buckets": {"low": 10, "medium": 40, "high": 100},
            "fp_probability_buckets": {"low": 20, "medium": 30, "high": 100},
            "sample_size": 150
        }
        collector.get_confidence_distribution.return_value = confidence_dist
        
        return collector
    
    @pytest.fixture
    def mock_roi_calculator(self):
        """Mock ROI calculator for dashboard."""
        calculator = Mock()
        
        roi_metrics = ROIMetrics(
            total_investigations=150,
            automated_investigations=130,
            manual_investigations=20,
            time_saved_hours=48.5,
            time_saved_days=6.1,
            analyst_hours_saved=48.5,
            cost_savings_usd=3637.5,
            annual_cost_savings_projection=44531.25,
            automation_rate=0.87,
            efficiency_improvement_percent=86.7,
            productivity_multiplier=1.74,
            false_positive_reduction=78.0,
            accuracy_improvement=12.8,
            mean_time_to_resolution_improvement=95.8,
            analyst_capacity_freed=0.2,
            investigations_per_analyst_per_day=384.0,
            scalability_factor=2.74,
            calculation_period_days=30,
            calculation_date=datetime.now(timezone.utc)
        )
        calculator.calculate_comprehensive_roi.return_value = roi_metrics
        
        return calculator
    
    @pytest.fixture
    def dashboard_aggregator(self, mock_metrics_collector, mock_roi_calculator):
        """Create dashboard aggregator with mocked dependencies."""
        return DashboardDataAggregator(mock_metrics_collector, mock_roi_calculator)
    
    def test_dashboard_data_calculation(self, dashboard_aggregator):
        """Test dashboard data calculation."""
        dashboard_data = dashboard_aggregator.get_dashboard_data(
            tenant_id="test-tenant",
            time_window_hours=24
        )
        
        assert isinstance(dashboard_data, DashboardMetrics)
        assert dashboard_data.automation_rate == 0.87
        assert dashboard_data.total_investigations == 150
        assert dashboard_data.target_met == True
        assert dashboard_data.target_progress >= 100.0  # Meets or exceeds 80% target
        assert dashboard_data.time_window_hours == 24
        assert dashboard_data.tenant_id == "test-tenant"
    
    def test_realtime_summary(self, dashboard_aggregator):
        """Test real-time summary generation."""
        summary = dashboard_aggregator.get_realtime_summary("test-tenant")
        
        assert "current_hour" in summary
        assert "today" in summary
        assert "status" in summary
        
        # Check current hour data
        current_hour = summary["current_hour"]
        assert "investigations" in current_hour
        assert "automation_rate" in current_hour
        assert "auto_closed" in current_hour
        assert "escalated" in current_hour
        
        # Check today's data
        today = summary["today"]
        assert "investigations" in today
        assert "automation_rate" in today
        assert "target_met" in today
        assert "avg_processing_time" in today
    
    def test_performance_summary(self, dashboard_aggregator):
        """Test executive performance summary."""
        performance = dashboard_aggregator.get_performance_summary("test-tenant")
        
        assert "executive_summary" in performance
        assert "operational_impact" in performance
        assert "quality_metrics" in performance
        assert "trends" in performance
        
        # Check executive summary
        exec_summary = performance["executive_summary"]
        assert "automation_rate" in exec_summary
        assert "target_achievement" in exec_summary
        assert "monthly_cost_savings" in exec_summary
        assert "annual_projection" in exec_summary
        assert "roi_percentage" in exec_summary


class TestMetricsIntegration:
    """Test integration between metrics components."""
    
    def test_investigation_outcome_to_dashboard_flow(self):
        """Test the flow from investigation outcome to dashboard display."""
        # This would test the complete flow in an integration environment
        # For now, we'll test the data structure compatibility
        
        outcome = InvestigationOutcome(
            investigation_id="INV-TEST-001",
            tenant_id="test-tenant",
            outcome="auto_closed",
            confidence_score=0.85,
            false_positive_probability=0.9,
            processing_time_seconds=45.0,
            automation_decision="auto_close",
            escalated_to_human=False,
            risk_level="low",
            scenario_type="phishing",
            is_demo=True
        )
        
        # Verify outcome structure is compatible with metrics collection
        assert outcome.investigation_id is not None
        assert outcome.tenant_id is not None
        assert outcome.outcome in ["auto_closed", "escalated", "completed", "monitoring"]
        assert 0.0 <= outcome.confidence_score <= 1.0
        assert 0.0 <= outcome.false_positive_probability <= 1.0
        assert outcome.processing_time_seconds >= 0.0
        assert outcome.automation_decision in ["auto_close", "escalate", "monitor"]
        assert isinstance(outcome.escalated_to_human, bool)
        assert outcome.risk_level in ["low", "medium", "high"]
    
    def test_metrics_data_consistency(self):
        """Test consistency between different metrics calculations."""
        # Test that automation rate calculations are consistent
        total_investigations = 100
        auto_closed = 70
        escalated = 20
        monitoring = 10
        
        # Manual calculation
        expected_automation_rate = (auto_closed + monitoring) / total_investigations
        expected_escalation_rate = escalated / total_investigations
        
        # Using AutomationMetrics class
        metrics = AutomationMetrics(
            total_investigations=total_investigations,
            auto_closed_count=auto_closed,
            escalated_count=escalated,
            monitoring_count=monitoring,
            automation_rate=0.0,
            escalation_rate=0.0,
            avg_processing_time=120.0,
            avg_confidence_score=0.8,
            target_met=False,
            period_start=datetime.now(timezone.utc) - timedelta(hours=24),
            period_end=datetime.now(timezone.utc)
        )
        metrics.calculate_rates()
        
        assert metrics.automation_rate == expected_automation_rate
        assert metrics.escalation_rate == expected_escalation_rate
        assert metrics.target_met == (expected_automation_rate >= 0.8)


if __name__ == "__main__":
    pytest.main([__file__])