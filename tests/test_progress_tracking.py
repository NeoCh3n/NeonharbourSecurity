"""Tests for real-time investigation progress tracking."""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from unittest.mock import Mock, patch

import pytest

from src.demo.progress_tracker import ProgressTracker, InvestigationProgress, AgentProgress


class TestProgressTracker:
    """Test suite for progress tracking functionality."""
    
    def setup_method(self):
        """Set up test environment."""
        self.tracker = ProgressTracker()
        self.investigation_id = f"TEST-{uuid.uuid4().hex[:8]}"
        self.tenant_id = "test-tenant"
    
    def test_start_investigation_tracking(self):
        """Test starting investigation progress tracking."""
        progress = self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            is_demo=True
        )
        
        assert progress.investigation_id == self.investigation_id
        assert progress.tenant_id == self.tenant_id
        assert progress.overall_status == "queued"
        assert progress.current_stage == "plan"
        assert progress.current_agent == "Planner"
        assert progress.is_demo is True
        assert len(progress.agent_progress) == 6  # All pipeline stages
        assert len(progress.timeline_events) == 1  # Initial event
    
    def test_update_agent_progress(self):
        """Test updating agent progress."""
        # Start tracking
        progress = self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id
        )
        
        # Update progress
        updated_progress = self.tracker.update_agent_progress(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            stage="plan",
            agent_name="Planner",
            status="running",
            current_task="Normalizing alert data",
            progress_percentage=50.0,
            confidence_score=0.8,
            false_positive_probability=0.3,
            risk_level="medium"
        )
        
        assert updated_progress.overall_status == "running"
        assert updated_progress.confidence_score == 0.8
        assert updated_progress.false_positive_probability == 0.3
        assert updated_progress.risk_level == "medium"
        
        # Check agent-specific progress
        plan_progress = updated_progress.agent_progress["plan"]
        assert plan_progress.status == "running"
        assert plan_progress.current_task == "Normalizing alert data"
        assert plan_progress.progress_percentage == 50.0
        assert plan_progress.started_at is not None
        
        # Check timeline events
        assert len(updated_progress.timeline_events) == 2  # Initial + update
        latest_event = updated_progress.timeline_events[-1]
        assert latest_event["event_type"] == "agent_running"
        assert latest_event["stage"] == "plan"
        assert latest_event["agent"] == "Planner"
    
    def test_complete_agent_processing(self):
        """Test completing agent processing."""
        # Start tracking
        self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id
        )
        
        # Complete processing
        updated_progress = self.tracker.update_agent_progress(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            stage="plan",
            agent_name="Planner",
            status="completed",
            progress_percentage=100.0,
            artifacts=["Investigation envelope", "Tenant metadata"]
        )
        
        plan_progress = updated_progress.agent_progress["plan"]
        assert plan_progress.status == "completed"
        assert plan_progress.progress_percentage == 100.0
        assert plan_progress.completed_at is not None
        assert "Investigation envelope" in plan_progress.artifacts_generated
        assert "Tenant metadata" in plan_progress.artifacts_generated
    
    def test_automation_decision_tracking(self):
        """Test tracking automation decisions."""
        # Start tracking
        self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id
        )
        
        # Update automation decision
        updated_progress = self.tracker.update_automation_decision(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            automation_decision="auto_close",
            should_escalate=False,
            reasoning="High false positive probability (85%)"
        )
        
        assert updated_progress.automation_decision == "auto_close"
        
        # Check timeline event
        automation_events = [
            event for event in updated_progress.timeline_events 
            if event["event_type"] == "automation_decision"
        ]
        assert len(automation_events) == 1
        assert "auto_close" in automation_events[0]["message"]
    
    def test_overall_progress_calculation(self):
        """Test overall progress calculation based on stage weights."""
        # Start tracking
        progress = self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id
        )
        
        # Complete first stage (plan - 15% weight)
        self.tracker.update_agent_progress(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            stage="plan",
            agent_name="Planner",
            status="completed",
            progress_percentage=100.0
        )
        
        updated_progress = self.tracker.get_investigation_progress(
            self.investigation_id, self.tenant_id
        )
        
        # Should be approximately 15% (plan stage weight)
        assert 14.0 <= updated_progress.overall_progress <= 16.0
        
        # Complete second stage (execute - 20% weight)
        self.tracker.update_agent_progress(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            stage="execute",
            agent_name="Context Executor",
            status="completed",
            progress_percentage=100.0
        )
        
        updated_progress = self.tracker.get_investigation_progress(
            self.investigation_id, self.tenant_id
        )
        
        # Should be approximately 35% (15% + 20%)
        assert 34.0 <= updated_progress.overall_progress <= 36.0
    
    def test_timeline_message_generation(self):
        """Test timeline message generation."""
        # Start tracking
        self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id
        )
        
        # Test different status messages
        test_cases = [
            ("running", "Analyzing alert data", "Planner started Plan: Analyzing alert data"),
            ("completed", None, "Planner completed Plan stage"),
            ("failed", None, "Planner failed during Plan stage"),
        ]
        
        for status, task, expected_message in test_cases:
            self.tracker.update_agent_progress(
                investigation_id=self.investigation_id,
                tenant_id=self.tenant_id,
                stage="plan",
                agent_name="Planner",
                status=status,
                current_task=task
            )
            
            progress = self.tracker.get_investigation_progress(
                self.investigation_id, self.tenant_id
            )
            
            # Find the latest event with this status
            status_events = [
                event for event in progress.timeline_events
                if event["event_type"] == f"agent_{status}"
            ]
            
            if status_events:
                latest_event = status_events[-1]
                assert expected_message in latest_event["message"]
    
    @patch('src.demo.progress_tracker.dynamodb')
    def test_persistence_error_handling(self, mock_dynamodb):
        """Test error handling during persistence."""
        # Mock DynamoDB to raise an exception
        mock_table = Mock()
        mock_table.put_item.side_effect = Exception("DynamoDB error")
        mock_dynamodb.Table.return_value = mock_table
        
        # Should not raise exception even if persistence fails
        progress = self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id
        )
        
        assert progress is not None
        assert progress.investigation_id == self.investigation_id
    
    def test_serialization_deserialization(self):
        """Test progress serialization and deserialization."""
        # Create progress with complex data
        progress = self.tracker.start_investigation_tracking(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            is_demo=True
        )
        
        # Update with various data types
        self.tracker.update_agent_progress(
            investigation_id=self.investigation_id,
            tenant_id=self.tenant_id,
            stage="analyze",
            agent_name="Analyst",
            status="completed",
            progress_percentage=100.0,
            artifacts=["Summary", "Risk assessment"],
            confidence_score=0.85,
            false_positive_probability=0.25,
            risk_level="high"
        )
        
        # Serialize
        serialized = self.tracker._serialize_progress(progress)
        
        # Check serialized data
        assert serialized["investigation_id"] == self.investigation_id
        assert serialized["is_demo"] is True
        assert "analyze" in serialized["agent_progress"]
        assert serialized["agent_progress"]["analyze"]["status"] == "completed"
        
        # Deserialize
        deserialized = self.tracker._deserialize_progress(serialized)
        
        # Check deserialized data
        assert deserialized.investigation_id == progress.investigation_id
        assert deserialized.is_demo == progress.is_demo
        assert deserialized.agent_progress["analyze"].status == "completed"
        assert len(deserialized.agent_progress["analyze"].artifacts_generated) == 2


class TestProgressVisualization:
    """Test suite for progress visualization components."""
    
    def test_confidence_color_mapping(self):
        """Test confidence score color mapping."""
        from src.demo.progress_visualization import ProgressVisualization
        
        viz = ProgressVisualization()
        
        # Test confidence colors
        assert viz._get_confidence_color(0.9) == "#4ade80"  # Green for high confidence
        assert viz._get_confidence_color(0.7) == "#fbbf24"  # Yellow for medium confidence
        assert viz._get_confidence_color(0.3) == "#ef4444"  # Red for low confidence
    
    def test_risk_color_mapping(self):
        """Test risk level color mapping."""
        from src.demo.progress_visualization import ProgressVisualization
        
        viz = ProgressVisualization()
        
        # Test risk colors
        assert viz._get_risk_color("low") == "#4ade80"
        assert viz._get_risk_color("medium") == "#fbbf24"
        assert viz._get_risk_color("high") == "#ef4444"
        assert viz._get_risk_color("unknown") == "#94a3b8"
    
    def test_automation_color_mapping(self):
        """Test automation decision color mapping."""
        from src.demo.progress_visualization import ProgressVisualization
        
        viz = ProgressVisualization()
        
        # Test automation colors
        assert viz._get_automation_color("auto_close") == "#4ade80"
        assert viz._get_automation_color("monitor") == "#fbbf24"
        assert viz._get_automation_color("escalate") == "#ef4444"


if __name__ == "__main__":
    # Run basic functionality test
    tracker = ProgressTracker()
    investigation_id = f"TEST-{uuid.uuid4().hex[:8]}"
    tenant_id = "test-tenant"
    
    print("Testing progress tracking...")
    
    # Start tracking
    progress = tracker.start_investigation_tracking(investigation_id, tenant_id, True)
    print(f"✓ Started tracking investigation {investigation_id}")
    
    # Update progress
    tracker.update_agent_progress(
        investigation_id, tenant_id, "plan", "Planner", "running",
        "Normalizing alert data", 50.0
    )
    print("✓ Updated agent progress")
    
    # Complete stage
    tracker.update_agent_progress(
        investigation_id, tenant_id, "plan", "Planner", "completed",
        progress_percentage=100.0, artifacts=["Investigation envelope"]
    )
    print("✓ Completed stage")
    
    # Get progress
    final_progress = tracker.get_investigation_progress(investigation_id, tenant_id)
    if final_progress:
        print(f"✓ Retrieved progress: {final_progress.overall_progress:.1f}% complete")
        print(f"✓ Timeline events: {len(final_progress.timeline_events)}")
    
    print("Progress tracking test completed successfully!")