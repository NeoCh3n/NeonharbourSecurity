#!/usr/bin/env python3
"""
Real-time Investigation Progress Tracking Demo

This script demonstrates the real-time progress tracking system for investigations.
It simulates an investigation going through all pipeline stages with progress updates.
"""

import sys
import time
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT_DIR))

from src.demo.progress_tracker import ProgressTracker
from src.demo.progress_visualization import ProgressVisualization


def simulate_investigation_progress():
    """Simulate a complete investigation with progress tracking."""
    print("🚀 Starting Real-time Investigation Progress Tracking Demo")
    print("=" * 60)
    
    # Initialize tracker
    tracker = ProgressTracker()
    viz = ProgressVisualization()
    
    # Investigation details
    investigation_id = "DEMO-20240212-001"
    tenant_id = "hk-demo"
    
    print(f"📋 Investigation ID: {investigation_id}")
    print(f"🏢 Tenant ID: {tenant_id}")
    print(f"💾 Storage Mode: {'DynamoDB' if tracker.tables_available else 'In-Memory'}")
    print()
    
    # Start investigation tracking
    print("1️⃣ Starting investigation tracking...")
    progress = tracker.start_investigation_tracking(
        investigation_id=investigation_id,
        tenant_id=tenant_id,
        is_demo=True
    )
    print(f"   ✅ Investigation started - Progress: {progress.overall_progress:.1f}%")
    print(f"   📊 Timeline events: {len(progress.timeline_events)}")
    print()
    
    # Simulate pipeline stages
    stages = [
        {
            "stage": "plan",
            "agent": "Planner",
            "tasks": [
                ("Normalizing inbound alert", 25),
                ("Enriching tenant profile", 50),
                ("Persisting investigation envelope", 75),
                ("Completing planning stage", 100)
            ]
        },
        {
            "stage": "execute", 
            "agent": "Context Executor",
            "tasks": [
                ("Initializing security connectors", 20),
                ("Fetching Sentinel alerts", 40),
                ("Querying Defender detections", 60),
                ("Gathering Okta events", 80),
                ("Completing context gathering", 100)
            ]
        },
        {
            "stage": "analyze",
            "agent": "Analyst", 
            "tasks": [
                ("Launching AI analysis", 30),
                ("Mapping HKMA controls", 60),
                ("Computing confidence scores", 80),
                ("Generating structured summary", 100)
            ]
        },
        {
            "stage": "respond",
            "agent": "Risk Orchestrator",
            "tasks": [
                ("Calculating risk metrics", 40),
                ("Making escalation decision", 70),
                ("Queuing automation actions", 90),
                ("Completing risk assessment", 100)
            ]
        }
    ]
    
    for stage_num, stage_info in enumerate(stages, 2):
        stage = stage_info["stage"]
        agent = stage_info["agent"]
        tasks = stage_info["tasks"]
        
        print(f"{stage_num}️⃣ {stage.title()} Stage - {agent}")
        
        # Start stage
        tracker.update_agent_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            stage=stage,
            agent_name=agent,
            status="running",
            current_task=tasks[0][0],
            progress_percentage=0.0
        )
        
        # Simulate task progression
        for task_name, task_progress in tasks:
            tracker.update_agent_progress(
                investigation_id=investigation_id,
                tenant_id=tenant_id,
                stage=stage,
                agent_name=agent,
                status="running",
                current_task=task_name,
                progress_percentage=task_progress
            )
            
            # Get updated progress
            current_progress = tracker.get_investigation_progress(investigation_id, tenant_id)
            print(f"   🔄 {task_name} - Stage: {task_progress}% | Overall: {current_progress.overall_progress:.1f}%")
            
            # Small delay for demo effect
            time.sleep(0.5)
        
        # Complete stage
        artifacts = {
            "plan": ["Investigation envelope", "Tenant metadata"],
            "execute": ["Context bundle", "Connector telemetry"],
            "analyze": ["Structured summary", "HKMA mappings", "Confidence metrics"],
            "respond": ["Risk snapshot", "Automation decision", "Action queue"]
        }.get(stage, ["Stage artifacts"])
        
        tracker.update_agent_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            stage=stage,
            agent_name=agent,
            status="completed",
            progress_percentage=100.0,
            artifacts=artifacts,
            confidence_score=0.85 if stage == "analyze" else None,
            false_positive_probability=0.25 if stage == "analyze" else None,
            risk_level="medium" if stage == "respond" else None
        )
        
        current_progress = tracker.get_investigation_progress(investigation_id, tenant_id)
        print(f"   ✅ {stage.title()} completed - Overall: {current_progress.overall_progress:.1f}%")
        print()
    
    # Add automation decision
    print("🤖 Making automation decision...")
    tracker.update_automation_decision(
        investigation_id=investigation_id,
        tenant_id=tenant_id,
        automation_decision="monitor",
        should_escalate=False,
        reasoning="Medium confidence with moderate false positive probability"
    )
    print("   ✅ Automation decision: Monitor (human review recommended)")
    print()
    
    # Final progress check
    final_progress = tracker.get_investigation_progress(investigation_id, tenant_id)
    print("📊 Final Investigation Status")
    print("-" * 30)
    print(f"Overall Progress: {final_progress.overall_progress:.1f}%")
    print(f"Current Status: {final_progress.overall_status}")
    print(f"Confidence Score: {final_progress.confidence_score:.1%}")
    print(f"FP Probability: {final_progress.false_positive_probability:.1%}")
    print(f"Risk Level: {final_progress.risk_level.upper()}")
    print(f"Automation Decision: {final_progress.automation_decision}")
    print(f"Timeline Events: {len(final_progress.timeline_events)}")
    print()
    
    # Show timeline
    print("📅 Investigation Timeline")
    print("-" * 30)
    for event in final_progress.timeline_events[-5:]:  # Show last 5 events
        timestamp = event.get("timestamp", "")[:19]  # Remove microseconds
        message = event.get("message", "")
        print(f"   {timestamp}: {message}")
    print()
    
    # Test visualization colors
    print("🎨 Visualization Color Mapping")
    print("-" * 30)
    confidence_color = viz._get_confidence_color(final_progress.confidence_score)
    fp_color = viz._get_fp_color(final_progress.false_positive_probability)
    risk_color = viz._get_risk_color(final_progress.risk_level)
    automation_color = viz._get_automation_color(final_progress.automation_decision)
    
    print(f"   Confidence Color: {confidence_color}")
    print(f"   FP Probability Color: {fp_color}")
    print(f"   Risk Level Color: {risk_color}")
    print(f"   Automation Color: {automation_color}")
    print()
    
    # Test active investigations
    active_investigations = tracker.get_active_investigations(tenant_id)
    print(f"🔍 Active Investigations: {len(active_investigations)}")
    for inv in active_investigations:
        print(f"   - {inv.investigation_id}: {inv.overall_status} ({inv.overall_progress:.1f}%)")
    print()
    
    print("✅ Real-time Investigation Progress Tracking Demo Completed!")
    print("=" * 60)


if __name__ == "__main__":
    simulate_investigation_progress()