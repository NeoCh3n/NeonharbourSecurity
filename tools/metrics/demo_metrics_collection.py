#!/usr/bin/env python3
"""
Demo script for real-time metrics collection and automation statistics tracking.

This script demonstrates the metrics collection system by simulating investigation
outcomes and showing real-time dashboard updates.
"""
import os
import sys
import time
import random
from datetime import datetime, timezone
from typing import List, Dict, Any

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.metrics.collector import metrics_collector, InvestigationOutcome
from src.metrics.roi_calculator import roi_calculator
from src.metrics.dashboard import dashboard_aggregator


def simulate_investigation_outcomes(count: int = 50, tenant_id: str = "demo-tenant") -> List[InvestigationOutcome]:
    """Simulate realistic investigation outcomes for demo purposes."""
    outcomes = []
    scenario_types = ["phishing", "malware", "insider_threat", "network_anomaly", "data_exfiltration"]
    
    for i in range(count):
        # Simulate 80% automation rate with realistic distributions
        is_automated = random.random() < 0.8
        
        if is_automated:
            # Automated investigations (mostly auto-closed or monitored)
            automation_decision = random.choices(
                ["auto_close", "monitor"], 
                weights=[0.85, 0.15]
            )[0]
            outcome = "auto_closed" if automation_decision == "auto_close" else "monitoring"
            escalated_to_human = False
            confidence_score = random.uniform(0.7, 0.95)
            false_positive_probability = random.uniform(0.6, 0.95)
            processing_time = random.uniform(30, 180)  # 30 seconds to 3 minutes
            risk_level = "low" if automation_decision == "auto_close" else "medium"
        else:
            # Manual investigations (escalated)
            automation_decision = "escalate"
            outcome = "escalated"
            escalated_to_human = True
            confidence_score = random.uniform(0.3, 0.7)
            false_positive_probability = random.uniform(0.1, 0.4)
            processing_time = random.uniform(600, 3600)  # 10 minutes to 1 hour
            risk_level = random.choices(["medium", "high"], weights=[0.6, 0.4])[0]
        
        outcome_record = InvestigationOutcome(
            investigation_id=f"INV-DEMO-{i+1:03d}",
            tenant_id=tenant_id,
            outcome=outcome,
            confidence_score=confidence_score,
            false_positive_probability=false_positive_probability,
            processing_time_seconds=processing_time,
            automation_decision=automation_decision,
            escalated_to_human=escalated_to_human,
            risk_level=risk_level,
            scenario_type=random.choice(scenario_types),
            is_demo=True
        )
        
        outcomes.append(outcome_record)
    
    return outcomes


def record_outcomes_with_delay(outcomes: List[InvestigationOutcome], delay_seconds: float = 0.5):
    """Record investigation outcomes with a delay to simulate real-time processing."""
    print(f"Recording {len(outcomes)} investigation outcomes...")
    
    for i, outcome in enumerate(outcomes):
        try:
            metrics_collector.record_investigation_outcome(
                investigation_id=outcome.investigation_id,
                tenant_id=outcome.tenant_id,
                outcome=outcome.outcome,
                confidence_score=outcome.confidence_score,
                false_positive_probability=outcome.false_positive_probability,
                processing_time_seconds=outcome.processing_time_seconds,
                automation_decision=outcome.automation_decision,
                escalated_to_human=outcome.escalated_to_human,
                risk_level=outcome.risk_level,
                scenario_type=outcome.scenario_type,
                is_demo=outcome.is_demo
            )
            
            print(f"  [{i+1:3d}/{len(outcomes)}] {outcome.investigation_id}: {outcome.outcome} "
                  f"(confidence: {outcome.confidence_score:.2f}, "
                  f"fp_prob: {outcome.false_positive_probability:.2f}, "
                  f"time: {outcome.processing_time_seconds:.0f}s)")
            
            if delay_seconds > 0:
                time.sleep(delay_seconds)
                
        except Exception as e:
            print(f"  Error recording {outcome.investigation_id}: {e}")


def display_realtime_metrics(tenant_id: str = "demo-tenant"):
    """Display real-time metrics and dashboard data."""
    print("\n" + "="*80)
    print("REAL-TIME METRICS DASHBOARD")
    print("="*80)
    
    try:
        # Get real-time summary
        summary = dashboard_aggregator.get_realtime_summary(tenant_id)
        
        print("\n📊 CURRENT PERFORMANCE")
        print("-" * 40)
        current = summary.get("current_hour", {})
        today = summary.get("today", {})
        status = summary.get("status", {})
        
        print(f"Current Hour:")
        print(f"  • Investigations: {current.get('investigations', 0)}")
        print(f"  • Automation Rate: {current.get('automation_rate', 0):.1%}")
        print(f"  • Auto-Closed: {current.get('auto_closed', 0)}")
        print(f"  • Escalated: {current.get('escalated', 0)}")
        
        print(f"\nToday's Summary:")
        print(f"  • Total Investigations: {today.get('investigations', 0)}")
        print(f"  • Automation Rate: {today.get('automation_rate', 0):.1%}")
        print(f"  • Target Met: {'✅ Yes' if today.get('target_met', False) else '❌ No'}")
        print(f"  • Avg Processing Time: {today.get('avg_processing_time', 0):.1f} minutes")
        
        print(f"\nSystem Status:")
        print(f"  • Target Rate: {status.get('target_automation_rate', 0.8):.0%}")
        print(f"  • Performance: {status.get('current_performance', 'unknown').title()}")
        
    except Exception as e:
        print(f"Error retrieving real-time metrics: {e}")
    
    try:
        # Get detailed dashboard data
        dashboard_data = dashboard_aggregator.get_dashboard_data(tenant_id, 24)
        
        print("\n💰 EFFICIENCY & ROI METRICS")
        print("-" * 40)
        print(f"Time Saved: {dashboard_data.time_saved_hours:.1f} hours")
        print(f"Cost Savings: ${dashboard_data.cost_savings_usd:,.0f}")
        print(f"Analyst Hours Saved: {dashboard_data.analyst_hours_saved:.1f}")
        print(f"Accuracy Rate: {dashboard_data.accuracy_rate:.1%}")
        print(f"Avg Confidence: {dashboard_data.avg_confidence_score:.1%}")
        print(f"Avg FP Probability: {dashboard_data.avg_fp_probability:.1%}")
        
        print("\n🎯 TARGET TRACKING")
        print("-" * 40)
        print(f"Target Automation Rate: {dashboard_data.target_automation_rate:.0%}")
        print(f"Current Automation Rate: {dashboard_data.automation_rate:.1%}")
        print(f"Target Progress: {dashboard_data.target_progress:.1f}%")
        print(f"Target Status: {'✅ Achieved' if dashboard_data.target_met else '⚠️ Not Met'}")
        
    except Exception as e:
        print(f"Error retrieving dashboard data: {e}")


def display_roi_analysis(tenant_id: str = "demo-tenant"):
    """Display comprehensive ROI analysis."""
    print("\n" + "="*80)
    print("ROI ANALYSIS REPORT")
    print("="*80)
    
    try:
        # Generate ROI report
        roi_report = roi_calculator.generate_roi_report(
            tenant_id=tenant_id,
            period_days=30,
            include_projections=True
        )
        
        # Executive Summary
        exec_summary = roi_report.get("executive_summary", {})
        print("\n📈 EXECUTIVE SUMMARY")
        print("-" * 40)
        print(f"Automation Rate: {exec_summary.get('automation_rate', 'N/A')}")
        print(f"Cost Savings: ${exec_summary.get('cost_savings_usd', 0):,.0f}")
        print(f"Time Saved: {exec_summary.get('time_saved_days', 0):.1f} days")
        print(f"ROI Percentage: {exec_summary.get('roi_percentage', 0):.1f}%")
        print(f"Target Achievement: {'✅ Met' if exec_summary.get('target_met', False) else '❌ Not Met'}")
        
        # Key Insights
        insights = roi_report.get("key_insights", [])
        if insights:
            print("\n💡 KEY INSIGHTS")
            print("-" * 40)
            for insight in insights:
                print(f"  • {insight}")
        
        # Recommendations
        recommendations = roi_report.get("recommendations", [])
        if recommendations:
            print("\n🎯 RECOMMENDATIONS")
            print("-" * 40)
            for rec in recommendations:
                print(f"  • {rec}")
        
        # Projections
        projections = roi_report.get("projections", {})
        if projections:
            annual = projections.get("annual_projections", {})
            scaling = projections.get("scaling_projections", {})
            
            print("\n🔮 PROJECTIONS")
            print("-" * 40)
            print(f"Annual Cost Savings: ${annual.get('cost_savings_usd', 0):,.0f}")
            print(f"Annual Time Saved: {annual.get('time_saved_days', 0):.0f} days")
            print(f"Annual Investigations Automated: {annual.get('investigations_automated', 0):,.0f}")
            
            if scaling:
                print(f"\nScaling Projections:")
                print(f"  • 2x Volume Cost Savings: ${scaling.get('2x_volume_cost_savings', 0):,.0f}")
                print(f"  • 5x Volume Analyst Need: {scaling.get('5x_volume_analyst_need', 0):.1f} FTE")
        
    except Exception as e:
        print(f"Error generating ROI analysis: {e}")


def main():
    """Main demo function."""
    print("🚀 REAL-TIME METRICS COLLECTION DEMO")
    print("="*80)
    
    tenant_id = "demo-tenant"
    
    # Start background refresh for dashboard
    dashboard_aggregator.start_background_refresh(refresh_interval_seconds=30)
    
    try:
        # Simulate investigation outcomes
        print("\n1. Simulating Investigation Outcomes...")
        outcomes = simulate_investigation_outcomes(count=100, tenant_id=tenant_id)
        
        # Record outcomes with delay to simulate real-time processing
        print("\n2. Recording Outcomes (simulating real-time processing)...")
        record_outcomes_with_delay(outcomes, delay_seconds=0.1)
        
        # Display real-time metrics
        print("\n3. Displaying Real-Time Metrics...")
        display_realtime_metrics(tenant_id)
        
        # Display ROI analysis
        print("\n4. Generating ROI Analysis...")
        display_roi_analysis(tenant_id)
        
        print("\n" + "="*80)
        print("✅ DEMO COMPLETED SUCCESSFULLY")
        print("="*80)
        print("\nThe metrics collection system has successfully:")
        print("  • Recorded 100 investigation outcomes")
        print("  • Calculated real-time automation statistics")
        print("  • Generated efficiency and ROI metrics")
        print("  • Provided dashboard-ready data aggregation")
        print("\nKey achievements:")
        print("  • 80%+ automation rate target tracking")
        print("  • Real-time processing time monitoring")
        print("  • Cost savings and ROI calculations")
        print("  • Executive-level performance summaries")
        
    except KeyboardInterrupt:
        print("\n\n⚠️ Demo interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Demo failed with error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Stop background refresh
        dashboard_aggregator.stop_background_refresh()
        print("\n🛑 Background services stopped")


if __name__ == "__main__":
    main()