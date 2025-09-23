"""Real-time investigation progress visualization components."""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st

try:
    import altair as alt
except ImportError:
    alt = None

from .progress_tracker import progress_tracker, InvestigationProgress, AgentProgress


class ProgressVisualization:
    """Real-time progress visualization for investigations."""
    
    def __init__(self):
        self.tracker = progress_tracker
    
    def render_investigation_timeline(
        self, 
        investigation_id: str, 
        tenant_id: str,
        container: Optional[st.container] = None
    ) -> None:
        """Render investigation timeline with stage completion status."""
        if container is None:
            container = st
        
        progress = self.tracker.get_investigation_progress(investigation_id, tenant_id)
        if not progress:
            container.warning("Investigation progress not found")
            return
        
        with container.container():
            st.subheader("🔄 Investigation Timeline")
            
            # Overall progress bar
            col1, col2, col3 = st.columns([3, 1, 1])
            with col1:
                st.progress(progress.overall_progress / 100.0)
            with col2:
                st.metric("Progress", f"{progress.overall_progress:.1f}%")
            with col3:
                status_color = {
                    "queued": "🟡",
                    "running": "🔵", 
                    "completed": "🟢",
                    "failed": "🔴"
                }.get(progress.overall_status, "⚪")
                st.metric("Status", f"{status_color} {progress.overall_status.title()}")
            
            # Stage timeline
            self._render_stage_timeline(progress)
            
            # Current activity
            if progress.overall_status == "running":
                self._render_current_activity(progress)
            
            # Timeline events
            self._render_timeline_events(progress)
    
    def render_confidence_display(
        self, 
        investigation_id: str, 
        tenant_id: str,
        container: Optional[st.container] = None
    ) -> None:
        """Render confidence score and risk assessment display."""
        if container is None:
            container = st
        
        progress = self.tracker.get_investigation_progress(investigation_id, tenant_id)
        if not progress:
            return
        
        with container.container():
            st.subheader("📊 Confidence & Risk Assessment")
            
            col1, col2, col3 = st.columns(3)
            
            with col1:
                # Overall confidence
                confidence = progress.confidence_score
                confidence_color = self._get_confidence_color(confidence)
                st.markdown(f"""
                <div style='text-align: center; padding: 1rem; border-radius: 8px; background: {confidence_color}20; border: 1px solid {confidence_color}40;'>
                    <div style='font-size: 2rem; font-weight: bold; color: {confidence_color};'>{confidence:.1%}</div>
                    <div style='font-size: 0.9rem; color: var(--neo-muted);'>Overall Confidence</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col2:
                # False positive probability
                fp_prob = progress.false_positive_probability
                fp_color = self._get_fp_color(fp_prob)
                st.markdown(f"""
                <div style='text-align: center; padding: 1rem; border-radius: 8px; background: {fp_color}20; border: 1px solid {fp_color}40;'>
                    <div style='font-size: 2rem; font-weight: bold; color: {fp_color};'>{fp_prob:.1%}</div>
                    <div style='font-size: 0.9rem; color: var(--neo-muted);'>False Positive Probability</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col3:
                # Risk level
                risk_level = progress.risk_level
                risk_color = self._get_risk_color(risk_level)
                st.markdown(f"""
                <div style='text-align: center; padding: 1rem; border-radius: 8px; background: {risk_color}20; border: 1px solid {risk_color}40;'>
                    <div style='font-size: 1.5rem; font-weight: bold; color: {risk_color};'>{risk_level.upper()}</div>
                    <div style='font-size: 0.9rem; color: var(--neo-muted);'>Risk Level</div>
                </div>
                """, unsafe_allow_html=True)
            
            # Automation decision
            if progress.automation_decision:
                st.markdown("**Automation Decision:**")
                decision_color = self._get_automation_color(progress.automation_decision)
                st.markdown(f"""
                <div style='padding: 0.5rem 1rem; border-radius: 8px; background: {decision_color}20; border-left: 4px solid {decision_color};'>
                    <strong>{progress.automation_decision.replace('_', ' ').title()}</strong>
                </div>
                """, unsafe_allow_html=True)
    
    def render_live_investigations_dashboard(
        self, 
        tenant_id: str,
        container: Optional[st.container] = None
    ) -> None:
        """Render dashboard showing all active investigations."""
        if container is None:
            container = st
        
        active_investigations = self.tracker.get_active_investigations(tenant_id)
        
        with container.container():
            st.subheader("🚀 Live Investigations Dashboard")
            
            if not active_investigations:
                st.info("No active investigations at the moment")
                return
            
            # Summary metrics
            col1, col2, col3, col4 = st.columns(4)
            
            total_investigations = len(active_investigations)
            running_count = sum(1 for inv in active_investigations if inv.overall_status == "running")
            queued_count = sum(1 for inv in active_investigations if inv.overall_status == "queued")
            avg_progress = sum(inv.overall_progress for inv in active_investigations) / total_investigations if total_investigations > 0 else 0
            
            with col1:
                st.metric("Total Active", total_investigations)
            with col2:
                st.metric("Running", running_count)
            with col3:
                st.metric("Queued", queued_count)
            with col4:
                st.metric("Avg Progress", f"{avg_progress:.1f}%")
            
            # Investigations table
            if active_investigations:
                investigations_data = []
                for inv in active_investigations:
                    investigations_data.append({
                        "Investigation ID": inv.investigation_id[:12] + "...",
                        "Status": inv.overall_status.title(),
                        "Current Stage": inv.current_stage.title(),
                        "Current Agent": inv.current_agent,
                        "Progress": f"{inv.overall_progress:.1f}%",
                        "Confidence": f"{inv.confidence_score:.1%}",
                        "FP Probability": f"{inv.false_positive_probability:.1%}",
                        "Risk Level": inv.risk_level.upper(),
                        "Started": inv.started_at.strftime("%H:%M:%S"),
                        "Demo": "Yes" if inv.is_demo else "No"
                    })
                
                df = pd.DataFrame(investigations_data)
                st.dataframe(df, use_container_width=True)
    
    def render_demo_session_progress(
        self, 
        session_id: str,
        container: Optional[st.container] = None
    ) -> None:
        """Render progress for all investigations in a demo session."""
        if container is None:
            container = st
        
        demo_investigations = self.tracker.get_demo_session_progress(session_id)
        
        with container.container():
            st.subheader("🎯 Demo Session Progress")
            
            if not demo_investigations:
                st.info("No demo investigations found")
                return
            
            # Demo session metrics
            total_demo = len(demo_investigations)
            completed_demo = sum(1 for inv in demo_investigations if inv.overall_status == "completed")
            auto_closed = sum(1 for inv in demo_investigations if inv.automation_decision == "auto_close")
            escalated = sum(1 for inv in demo_investigations if inv.automation_decision == "escalate")
            
            col1, col2, col3, col4 = st.columns(4)
            
            with col1:
                st.metric("Total Investigations", total_demo)
            with col2:
                st.metric("Completed", completed_demo)
            with col3:
                automation_rate = (auto_closed / total_demo * 100) if total_demo > 0 else 0
                st.metric("Auto-Closed", auto_closed, f"{automation_rate:.1f}%")
            with col4:
                escalation_rate = (escalated / total_demo * 100) if total_demo > 0 else 0
                st.metric("Escalated", escalated, f"{escalation_rate:.1f}%")
            
            # Recent investigations
            st.markdown("**Recent Demo Investigations:**")
            for inv in demo_investigations[:5]:  # Show last 5
                with st.expander(f"Investigation {inv.investigation_id[:8]}... - {inv.overall_status.title()}", expanded=False):
                    col1, col2 = st.columns(2)
                    with col1:
                        st.write(f"**Progress:** {inv.overall_progress:.1f}%")
                        st.write(f"**Current Stage:** {inv.current_stage.title()}")
                        st.write(f"**Risk Level:** {inv.risk_level.upper()}")
                    with col2:
                        st.write(f"**Confidence:** {inv.confidence_score:.1%}")
                        st.write(f"**FP Probability:** {inv.false_positive_probability:.1%}")
                        if inv.automation_decision:
                            st.write(f"**Decision:** {inv.automation_decision.replace('_', ' ').title()}")
    
    def _render_stage_timeline(self, progress: InvestigationProgress) -> None:
        """Render the stage timeline visualization."""
        stages = [
            {"name": "Plan", "stage": "plan", "agent": "Planner"},
            {"name": "Execute", "stage": "execute", "agent": "Context Executor"},
            {"name": "Analyze", "stage": "analyze", "agent": "Analyst"},
            {"name": "Respond", "stage": "respond", "agent": "Risk Orchestrator"},
            {"name": "Adapt", "stage": "adapt", "agent": "Learning Curator"},
            {"name": "Report", "stage": "report", "agent": "Audit Scribe"},
        ]
        
        cols = st.columns(len(stages))
        
        for i, stage_info in enumerate(stages):
            with cols[i]:
                stage = stage_info["stage"]
                agent_progress = progress.agent_progress.get(stage)
                
                if agent_progress:
                    status = agent_progress.status
                    progress_pct = agent_progress.progress_percentage
                    
                    # Status icon and color
                    if status == "completed":
                        icon = "✅"
                        color = "#4ade80"
                    elif status == "running":
                        icon = "🔄"
                        color = "#3b82f6"
                    elif status == "failed":
                        icon = "❌"
                        color = "#ef4444"
                    else:  # queued
                        icon = "⏳"
                        color = "#94a3b8"
                    
                    st.markdown(f"""
                    <div style='text-align: center; padding: 0.5rem; border-radius: 8px; background: {color}20; border: 1px solid {color}40;'>
                        <div style='font-size: 1.5rem;'>{icon}</div>
                        <div style='font-weight: bold; color: {color};'>{stage_info['name']}</div>
                        <div style='font-size: 0.8rem; color: var(--neo-muted);'>{stage_info['agent']}</div>
                        <div style='font-size: 0.8rem; color: var(--neo-muted);'>{progress_pct:.0f}%</div>
                    </div>
                    """, unsafe_allow_html=True)
                else:
                    st.markdown(f"""
                    <div style='text-align: center; padding: 0.5rem; border-radius: 8px; background: #94a3b820; border: 1px solid #94a3b840;'>
                        <div style='font-size: 1.5rem;'>⏳</div>
                        <div style='font-weight: bold; color: #94a3b8;'>{stage_info['name']}</div>
                        <div style='font-size: 0.8rem; color: var(--neo-muted);'>{stage_info['agent']}</div>
                        <div style='font-size: 0.8rem; color: var(--neo-muted);'>0%</div>
                    </div>
                    """, unsafe_allow_html=True)
    
    def _render_current_activity(self, progress: InvestigationProgress) -> None:
        """Render current agent activity."""
        current_agent_progress = progress.agent_progress.get(progress.current_stage)
        if current_agent_progress and current_agent_progress.current_task:
            st.markdown("**Current Activity:**")
            st.info(f"🤖 {progress.current_agent}: {current_agent_progress.current_task}")
    
    def _render_timeline_events(self, progress: InvestigationProgress) -> None:
        """Render timeline events."""
        if not progress.timeline_events:
            return
        
        with st.expander("Investigation Timeline", expanded=False):
            # Show last 10 events
            recent_events = progress.timeline_events[-10:]
            
            for event in reversed(recent_events):  # Most recent first
                timestamp = event.get("timestamp", "")
                message = event.get("message", "")
                event_type = event.get("event_type", "")
                
                # Format timestamp
                try:
                    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    time_str = dt.strftime("%H:%M:%S")
                except:
                    time_str = timestamp
                
                # Event icon
                if "started" in event_type or "running" in event_type:
                    icon = "🔄"
                elif "completed" in event_type:
                    icon = "✅"
                elif "failed" in event_type:
                    icon = "❌"
                elif "automation" in event_type:
                    icon = "🤖"
                else:
                    icon = "ℹ️"
                
                st.markdown(f"""
                <div style='padding: 0.3rem 0.5rem; margin: 0.2rem 0; border-left: 3px solid var(--neo-primary); background: rgba(56, 189, 248, 0.05);'>
                    {icon} <strong>{time_str}</strong>: {message}
                </div>
                """, unsafe_allow_html=True)
    
    def _get_confidence_color(self, confidence: float) -> str:
        """Get color for confidence score."""
        if confidence >= 0.8:
            return "#4ade80"  # Green
        elif confidence >= 0.6:
            return "#fbbf24"  # Yellow
        else:
            return "#ef4444"  # Red
    
    def _get_fp_color(self, fp_prob: float) -> str:
        """Get color for false positive probability."""
        if fp_prob >= 0.7:
            return "#4ade80"  # Green (high FP = good for automation)
        elif fp_prob >= 0.4:
            return "#fbbf24"  # Yellow
        else:
            return "#ef4444"  # Red (low FP = needs attention)
    
    def _get_risk_color(self, risk_level: str) -> str:
        """Get color for risk level."""
        risk_colors = {
            "low": "#4ade80",
            "medium": "#fbbf24", 
            "high": "#ef4444",
            "critical": "#dc2626",
            "unknown": "#94a3b8"
        }
        return risk_colors.get(risk_level.lower(), "#94a3b8")
    
    def _get_automation_color(self, decision: str) -> str:
        """Get color for automation decision."""
        decision_colors = {
            "auto_close": "#4ade80",
            "monitor": "#fbbf24",
            "escalate": "#ef4444"
        }
        return decision_colors.get(decision, "#94a3b8")


# Global visualization instance
progress_visualization = ProgressVisualization()