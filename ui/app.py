from __future__ import annotations

import io
import json
import os
import sys
import time
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from random import uniform
from typing import Any, Dict, List, Optional

try:
    import altair as alt  # type: ignore
except ImportError:  # pragma: no cover - charting optional for demo mode
    alt = None

import pandas as pd
import requests
import streamlit as st
from fpdf import FPDF

try:
    from streamlit_autorefresh import st_autorefresh
except ImportError:  # pragma: no cover - optional dependency
    st_autorefresh = None
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from src.compliance.generate_pack import build_compliance_pack
from src.demo.controller import DemoSessionController
from src.demo.integration import DemoPipelineIntegration

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:4000")
DEMO_TOKEN = os.getenv("DEMO_AUTH_TOKEN", "change-me")
SEED_DIR = Path("tools/seed")
LIVE_PIPELINE_ENABLED = os.getenv("LIVE_PIPELINE_ENABLED", "true").lower() not in {"0", "false", "no"}
LOGO_PATH = Path(__file__).resolve().parent / "assets" / "neo_logo.svg"

# Demo system configuration
DEMO_CONTROLLER = DemoSessionController()
DEMO_INTEGRATION = DemoPipelineIntegration()

st.set_page_config(page_title="NeoHarbourSecurity SOC Console", layout="wide")


PIPELINE_STEPS = [
    {
        "stage": "plan",
        "label": "Plan",
        "agent": "Planner",
        "description": "Normalise inbound alert, enrich tenant profile, and persist the investigation envelope to DynamoDB.",
        "artifacts": ["Investigation envelope", "Tenant metadata"],
        "duration_range": (0.6, 1.0),
    },
    {
        "stage": "execute",
        "label": "Execute",
        "agent": "Context Executor",
        "description": "Gather read-only context from Sentinel, Splunk, Defender, CrowdStrike, Entra, and Okta connectors.",
        "artifacts": ["Context bundle", "Connector telemetry"],
        "duration_range": (0.8, 1.2),
    },
    {
        "stage": "analyze",
        "label": "Analyze",
        "agent": "Analyst",
        "description": "Launch Bedrock-backed reasoning to map HKMA controls, compute risk, and draft the structured summary.",
        "artifacts": ["Structured summary", "HKMA mappings"],
        "duration_range": (1.0, 1.6),
    },
    {
        "stage": "respond",
        "label": "Respond",
        "agent": "Risk Orchestrator",
        "description": "Compute MTTA/MTTI/MTTR/FPR deltas, classify risk, and queue allow-listed actions with HITL safeguards.",
        "artifacts": ["Risk snapshot", "Action queue"],
        "duration_range": (0.6, 1.0),
    },
    {
        "stage": "adapt",
        "label": "Adapt",
        "agent": "Learning Curator",
        "description": "Capture analyst feedback, update tenant-specific hints, and persist adaptation metadata.",
        "artifacts": ["Adaptation record", "Feedback metrics"],
        "duration_range": (0.5, 0.9),
    },
    {
        "stage": "report",
        "label": "Report",
        "agent": "Audit Scribe",
        "description": "Write immutable JSONL logs to S3, update compliance metrics, and package HKMA due diligence artefacts.",
        "artifacts": ["Audit JSONL", "Compliance bundle"],
        "duration_range": (0.5, 0.9),
    },
]


BRAND_CSS = """
<style>
:root {
  --neo-bg-start: #0b1120;
  --neo-bg-end: #020617;
  --neo-card: rgba(15, 23, 42, 0.82);
  --neo-card-border: rgba(148, 163, 184, 0.18);
  --neo-primary: #38bdf8;
  --neo-secondary: #a855f7;
  --neo-success: #4ade80;
  --neo-text: #e2e8f0;
  --neo-muted: #94a3b8;
}
[data-testid="stAppViewContainer"] {
  background: radial-gradient(circle at 20% -10%, rgba(56, 189, 248, 0.18), transparent 40%),
              radial-gradient(circle at 80% -10%, rgba(168, 85, 247, 0.18), transparent 45%),
              linear-gradient(160deg, var(--neo-bg-start) 0%, var(--neo-bg-end) 65%);
  color: var(--neo-text);
}
[data-testid="stHeader"] { background: transparent; }
.neo-hero {
  padding: 1.6rem 1.2rem 0.8rem;
  margin-bottom: 0.8rem;
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.18), rgba(20, 244, 201, 0.08));
  border-radius: 18px;
  border: 1px solid rgba(56, 189, 248, 0.18);
  box-shadow: 0 15px 45px rgba(15, 23, 42, 0.45);
}
.neo-hero h1 { margin-bottom: 0.2rem; color: var(--neo-text); }
.neo-hero p { color: var(--neo-muted); font-size: 0.95rem; }
.neo-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(148, 163, 184, 0.16);
  margin-bottom: 0.6rem;
}
.neo-step-card {
  background: var(--neo-card);
  border-radius: 16px;
  padding: 1.4rem;
  border: 1px solid var(--neo-card-border);
  box-shadow: 0 20px 45px rgba(2, 6, 23, 0.45);
  height: 100%;
}
.neo-step-number {
  font-size: 1.2rem;
  color: var(--neo-muted);
  margin-bottom: 0.5rem;
  font-weight: 600;
}
.neo-step-card h3 { color: var(--neo-text); margin-bottom: 0.7rem; }
.neo-step-card p { color: var(--neo-muted); font-size: 0.9rem; }
.neo-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: var(--neo-primary);
  font-size: 0.75rem;
  margin-top: 0.6rem;
}
.neo-agent-card {
  background: var(--neo-card);
  border-radius: 14px;
  padding: 1rem 1.3rem;
  border: 1px solid rgba(56, 189, 248, 0.12);
  height: 100%;
}
.neo-agent-card h4 { margin-bottom: 0.2rem; color: var(--neo-text); }
.neo-agent-card p { color: var(--neo-muted); font-size: 0.88rem; }
.neo-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.neo-status-chip[data-state="ready"] { background: rgba(74, 222, 128, 0.18); color: var(--neo-success); }
.neo-status-chip[data-state="running"] { background: rgba(56, 189, 248, 0.22); color: var(--neo-primary); }
.neo-status-chip[data-state="queued"] { background: rgba(148, 163, 184, 0.18); color: var(--neo-muted); }
.neo-table tr td, .neo-table tr th { border-color: rgba(148, 163, 184, 0.1) !important; }
.neo-highlight {
  background: linear-gradient(120deg, rgba(56, 189, 248, 0.14), rgba(20, 244, 201, 0.08));
  border-radius: 12px;
  padding: 0.6rem 0.9rem;
  font-size: 0.85rem;
  color: var(--neo-muted);
}
.neo-demo-panel {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.08), rgba(168, 85, 247, 0.06));
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid rgba(56, 189, 248, 0.15);
  margin-bottom: 1rem;
}
.neo-demo-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}
.neo-demo-status.active {
  background: rgba(74, 222, 128, 0.18);
  color: var(--neo-success);
}
.neo-demo-status.paused {
  background: rgba(251, 191, 36, 0.18);
  color: #f59e0b;
}
.neo-demo-status.stopped {
  background: rgba(148, 163, 184, 0.18);
  color: var(--neo-muted);
}
.neo-metric-card {
  background: var(--neo-card);
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid var(--neo-card-border);
  text-align: center;
}
.neo-activity-item {
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  margin-bottom: 0.3rem;
  font-size: 0.85rem;
}
.neo-activity-item.alert {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
}
.neo-activity-item.success {
  background: rgba(74, 222, 128, 0.1);
  border-left: 3px solid #4ade80;
}
.neo-activity-item.warning {
  background: rgba(251, 191, 36, 0.1);
  border-left: 3px solid #fbbf24;
}
</style>
"""

GETTING_STARTED_CARDS = [
    {
        "step": "1",
        "title": "Create your tenant",
        "description": "Provision a NeoHarbourSecurity workspace, configure RBAC, and onboard analysts in minutes.",
        "cta": "Launch control centre",
        "cta_icon": "⚙️",
    },
    {
        "step": "2",
        "title": "Connect data sources",
        "description": "Bring Sentinel, Splunk, Defender, CrowdStrike, Okta, and Entra online with scoped read-only keys.",
        "cta": "Link integrations",
        "cta_icon": "🔗",
    },
    {
        "step": "3",
        "title": "See agent outcomes",
        "description": "Watch the multi-agent copilots triage alerts, surface HKMA guardrails, and produce audit-ready reports.",
        "cta": "Open live console",
        "cta_icon": "🚀",
    },
]

CONNECTOR_FIXTURES = [
    {"name": "Microsoft Sentinel", "category": "SIEM", "status": "Connected", "latency": "3.4s", "updated": "2024-02-12T03:20:00Z"},
    {"name": "Splunk Cloud", "category": "SIEM", "status": "Connected", "latency": "5.1s", "updated": "2024-02-12T03:18:00Z"},
    {"name": "Microsoft Defender", "category": "EDR", "status": "Connected", "latency": "2.3s", "updated": "2024-02-12T03:19:12Z"},
    {"name": "CrowdStrike Falcon", "category": "EDR", "status": "Connected", "latency": "4.0s", "updated": "2024-02-12T03:17:42Z"},
    {"name": "Okta", "category": "IAM", "status": "Connected", "latency": "1.9s", "updated": "2024-02-12T03:18:45Z"},
    {"name": "Entra ID", "category": "IAM", "status": "Connected", "latency": "2.2s", "updated": "2024-02-12T03:18:02Z"},
]

AGENT_ACTION_PRESETS = {
    "plan": ["Deduplicate alert", "Tag tenant risk profile", "Persist envelope"],
    "execute": ["Enrich with Sentinel incidents", "Query Okta sign-ins", "Pull Defender detections"],
    "analyze": ["RAG reasoning loop", "Map HKMA SA-2 controls", "Draft narrative"],
    "respond": ["Calculate MTTA delta", "Stage DISABLE_KEYS", "Queue HITL approval"],
    "adapt": ["Record analyst feedback", "Update per-tenant hints", "Track action adoption"],
    "report": ["Seal audit log", "Emit metrics", "Generate compliance pack"],
}

COMPLIANCE_OVERVIEW = [
    {"title": "SA-2 controls mapped", "value": "18 / 18", "delta": "+2 updates"},
    {"title": "TM-G-1 safeguards", "value": "12 / 12", "delta": "Stable"},
    {"title": "Audit backlog", "value": "0", "delta": "Cleared"},
]

# Demo preset configurations
DEMO_PRESETS = {
    "technical_deep_dive": {
        "name": "Technical Deep Dive",
        "description": "Comprehensive technical demonstration showing all attack types",
        "scenario_types": ["phishing_email", "spear_phishing", "ransomware_encryption", "apt_reconnaissance", "insider_data_exfiltration"],
        "interval_seconds": 45.0,
        "false_positive_rate": 0.75,
        "duration_minutes": 30,
        "target_audience": "technical"
    },
    "executive_overview": {
        "name": "Executive Overview", 
        "description": "High-level demonstration focusing on business impact",
        "scenario_types": ["ransomware_encryption", "insider_data_exfiltration", "data_privacy_violation"],
        "interval_seconds": 60.0,
        "false_positive_rate": 0.8,
        "duration_minutes": 15,
        "target_audience": "executive"
    },
    "compliance_focus": {
        "name": "HKMA Compliance Focus",
        "description": "Demonstration emphasizing HKMA regulatory compliance",
        "scenario_types": ["regulatory_violation", "data_privacy_violation", "insider_data_exfiltration"],
        "interval_seconds": 50.0,
        "false_positive_rate": 0.85,
        "duration_minutes": 20,
        "target_audience": "compliance"
    },
    "custom": {
        "name": "Custom Configuration",
        "description": "User-defined demo parameters",
        "scenario_types": ["phishing_email", "malware_detection"],
        "interval_seconds": 30.0,
        "false_positive_rate": 0.8,
        "duration_minutes": None,
        "target_audience": "technical"
    }
}


def apply_branding() -> None:
    st.markdown(BRAND_CSS, unsafe_allow_html=True)


def render_demo_control_panel() -> None:
    """Render demo mode controls and status display."""
    st.markdown("<div class='neo-demo-panel'>", unsafe_allow_html=True)
    st.subheader("🎯 Interactive Demo Controls")
    st.caption("Configure and control continuous demo data generation with real-time metrics")
    
    # Demo session status
    demo_session_key = "current_demo_session"
    current_session = st.session_state.get(demo_session_key)
    
    col1, col2, col3 = st.columns([2, 2, 1])
    
    with col1:
        st.markdown("**Demo Status**")
        if current_session and current_session.get("status") == "active":
            st.markdown("<div class='neo-demo-status active'>🟢 Demo Active</div>", unsafe_allow_html=True)
            session_id = current_session.get("session_id", "unknown")[:8]
            st.caption(f"Session: {session_id}...")
        elif current_session and current_session.get("status") == "paused":
            st.markdown("<div class='neo-demo-status paused'>🟡 Demo Paused</div>", unsafe_allow_html=True)
        else:
            st.markdown("<div class='neo-demo-status stopped'>⚪ Demo Stopped</div>", unsafe_allow_html=True)
    
    with col2:
        st.markdown("**Real-time Metrics**")
        if current_session:
            metrics = current_session.get("metrics", {})
            alerts_generated = metrics.get("alerts_generated", 0)
            automation_rate = metrics.get("automation_rate", 0.0)
            
            # Use custom metric cards
            st.markdown(f"""
            <div class='neo-metric-card'>
                <div style='font-size: 1.5rem; font-weight: bold; color: var(--neo-primary);'>{alerts_generated}</div>
                <div style='font-size: 0.8rem; color: var(--neo-muted);'>Alerts Generated</div>
            </div>
            """, unsafe_allow_html=True)
            
            st.markdown(f"""
            <div class='neo-metric-card' style='margin-top: 0.5rem;'>
                <div style='font-size: 1.5rem; font-weight: bold; color: var(--neo-success);'>{automation_rate:.1%}</div>
                <div style='font-size: 0.8rem; color: var(--neo-muted);'>Automation Rate</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown("""
            <div class='neo-metric-card'>
                <div style='font-size: 1.5rem; font-weight: bold; color: var(--neo-muted);'>0</div>
                <div style='font-size: 0.8rem; color: var(--neo-muted);'>Alerts Generated</div>
            </div>
            """, unsafe_allow_html=True)
            
            st.markdown("""
            <div class='neo-metric-card' style='margin-top: 0.5rem;'>
                <div style='font-size: 1.5rem; font-weight: bold; color: var(--neo-muted);'>0%</div>
                <div style='font-size: 0.8rem; color: var(--neo-muted);'>Automation Rate</div>
            </div>
            """, unsafe_allow_html=True)
    
    with col3:
        st.markdown("**Quick Actions**")
        if current_session and current_session.get("status") == "active":
            if st.button("⏸️ Pause", key="pause_demo", use_container_width=True):
                pause_demo_session()
            if st.button("⏹️ Stop", key="stop_demo", use_container_width=True, type="secondary"):
                stop_demo_session()
        elif current_session and current_session.get("status") == "paused":
            if st.button("▶️ Resume", key="resume_demo", use_container_width=True):
                resume_demo_session()
            if st.button("⏹️ Stop", key="stop_demo_paused", use_container_width=True, type="secondary"):
                stop_demo_session()
        else:
            if st.button("🚀 Start Demo", key="start_demo", use_container_width=True, type="primary"):
                show_demo_configuration()
    
    st.markdown("</div>", unsafe_allow_html=True)


def render_demo_scenario_selection() -> None:
    """Render demo scenario selection interface with presets."""
    st.subheader("📋 Demo Configuration")
    
    # Preset selection
    preset_options = list(DEMO_PRESETS.keys())
    preset_names = [DEMO_PRESETS[key]["name"] for key in preset_options]
    
    selected_preset_idx = st.selectbox(
        "Demo Preset",
        range(len(preset_names)),
        format_func=lambda x: preset_names[x],
        help="Choose a pre-configured demo scenario or select Custom for manual configuration"
    )
    
    selected_preset_key = preset_options[selected_preset_idx]
    selected_preset = DEMO_PRESETS[selected_preset_key]
    
    st.info(f"**{selected_preset['name']}**: {selected_preset['description']}")
    
    # Configuration parameters
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("**Generation Parameters**")
        
        interval_seconds = st.slider(
            "Alert Generation Interval (seconds)",
            min_value=10.0,
            max_value=120.0,
            value=selected_preset["interval_seconds"],
            step=5.0,
            help="Time between generated alerts"
        )
        
        false_positive_rate = st.slider(
            "False Positive Rate",
            min_value=0.5,
            max_value=0.95,
            value=selected_preset["false_positive_rate"],
            step=0.05,
            help="Percentage of alerts that should be false positives (to demonstrate automation)"
        )
        
        duration_minutes = st.number_input(
            "Demo Duration (minutes)",
            min_value=1,
            max_value=120,
            value=selected_preset["duration_minutes"] or 15,
            help="Leave empty for continuous generation"
        )
    
    with col2:
        st.markdown("**Scenario Selection**")
        
        # Get available scenarios from demo integration
        try:
            available_scenarios = DEMO_INTEGRATION.get_available_demo_scenarios()
            scenario_options = list(available_scenarios.keys())
        except Exception as e:
            st.error(f"Failed to load scenarios: {e}")
            scenario_options = ["phishing_email", "malware_detection", "insider_threat"]
            available_scenarios = {}
        
        if selected_preset_key == "custom":
            selected_scenarios = st.multiselect(
                "Attack Scenarios",
                scenario_options,
                default=selected_preset["scenario_types"],
                help="Select which types of security scenarios to generate"
            )
        else:
            # Show preset scenarios as read-only
            selected_scenarios = selected_preset["scenario_types"]
            st.multiselect(
                "Attack Scenarios (Preset)",
                scenario_options,
                default=selected_scenarios,
                disabled=True,
                help="Scenarios included in this preset"
            )
        
        target_audience = st.selectbox(
            "Target Audience",
            ["technical", "executive", "compliance"],
            index=["technical", "executive", "compliance"].index(selected_preset["target_audience"]),
            help="Adjust complexity and focus for different audiences"
        )
        
        # Show scenario details
        if selected_scenarios and available_scenarios:
            st.markdown("**Selected Scenarios Preview:**")
            for scenario in selected_scenarios[:3]:  # Show first 3 scenarios
                if scenario in available_scenarios:
                    scenario_info = available_scenarios[scenario]
                    st.markdown(f"""
                    <div style='background: rgba(56, 189, 248, 0.05); padding: 0.5rem; border-radius: 8px; margin: 0.3rem 0;'>
                        <strong>{scenario.replace('_', ' ').title()}</strong><br/>
                        <small style='color: var(--neo-muted);'>
                            {scenario_info.get('attack_vector', 'Unknown')} • 
                            Severity: {scenario_info.get('severity', 'Medium')} • 
                            Source: {scenario_info.get('source', 'Generic')}
                        </small>
                    </div>
                    """, unsafe_allow_html=True)
            if len(selected_scenarios) > 3:
                st.caption(f"... and {len(selected_scenarios) - 3} more scenarios")
    
    # Store configuration in session state
    demo_config = {
        "preset": selected_preset_key,
        "scenario_types": selected_scenarios,
        "interval_seconds": interval_seconds,
        "false_positive_rate": false_positive_rate,
        "duration_minutes": duration_minutes if duration_minutes > 0 else None,
        "target_audience": target_audience
    }
    st.session_state["demo_config"] = demo_config
    
    # Start demo button
    if st.button("🎬 Start Demo Session", type="primary", use_container_width=True):
        start_demo_session(demo_config)


def show_demo_configuration() -> None:
    """Show demo configuration interface."""
    st.session_state["show_demo_config"] = True


def start_demo_session(config: Dict[str, Any]) -> None:
    """Start a new demo session with the given configuration."""
    try:
        # Create demo session using controller
        result = DEMO_CONTROLLER.start_demo_session(
            created_by="streamlit_user",
            tenant_id=os.getenv("DEFAULT_TENANT_ID", "hk-demo"),
            custom_parameters=config
        )
        
        if result.get("success"):
            # Store session info in Streamlit session state
            st.session_state["current_demo_session"] = {
                "session_id": result["session_id"],
                "status": "active",
                "config": config,
                "started_at": datetime.now(),
                "metrics": {
                    "alerts_generated": 0,
                    "alerts_processed": 0,
                    "automation_rate": 0.0
                }
            }
            st.success(f"✅ Demo session started: {result['session_id']}")
            st.session_state["show_demo_config"] = False
            st.experimental_rerun()
        else:
            st.error(f"❌ Failed to start demo: {result.get('message', 'Unknown error')}")
            
    except Exception as e:
        st.error(f"❌ Error starting demo session: {str(e)}")


def pause_demo_session() -> None:
    """Pause the current demo session."""
    current_session = st.session_state.get("current_demo_session")
    if current_session:
        try:
            session_id = current_session["session_id"]
            result = DEMO_CONTROLLER.pause_demo_session(session_id)
            
            if result.get("success"):
                current_session["status"] = "paused"
                st.session_state["current_demo_session"] = current_session
                st.success("⏸️ Demo session paused")
                st.experimental_rerun()
            else:
                st.error(f"Failed to pause demo: {result.get('message')}")
        except Exception as e:
            st.error(f"Error pausing demo: {str(e)}")


def resume_demo_session() -> None:
    """Resume the current demo session."""
    current_session = st.session_state.get("current_demo_session")
    if current_session:
        try:
            session_id = current_session["session_id"]
            result = DEMO_CONTROLLER.resume_demo_session(session_id)
            
            if result.get("success"):
                current_session["status"] = "active"
                st.session_state["current_demo_session"] = current_session
                st.success("▶️ Demo session resumed")
                st.experimental_rerun()
            else:
                st.error(f"Failed to resume demo: {result.get('message')}")
        except Exception as e:
            st.error(f"Error resuming demo: {str(e)}")


def stop_demo_session() -> None:
    """Stop the current demo session."""
    current_session = st.session_state.get("current_demo_session")
    if current_session:
        try:
            session_id = current_session["session_id"]
            result = DEMO_CONTROLLER.stop_demo_session(session_id)
            
            if result.get("success"):
                st.session_state["current_demo_session"] = None
                st.session_state["show_demo_config"] = False
                st.success("⏹️ Demo session stopped")
                st.experimental_rerun()
            else:
                st.error(f"Failed to stop demo: {result.get('message')}")
        except Exception as e:
            st.error(f"Error stopping demo: {str(e)}")


def render_demo_progress_tracking() -> None:
    """Render real-time demo progress and investigation tracking."""
    current_session = st.session_state.get("current_demo_session")
    if not current_session:
        return
    
    st.subheader("📊 Demo Progress Tracking")
    
    # Import progress visualization
    try:
        from src.demo.progress_visualization import progress_visualization
        
        # Session overview
        col1, col2, col3, col4 = st.columns(4)
        
        metrics = current_session.get("metrics", {})
        
        with col1:
            st.metric(
                "Alerts Generated",
                metrics.get("alerts_generated", 0),
                delta=f"+{metrics.get('recent_alerts', 0)} recent"
            )
        
        with col2:
            st.metric(
                "Auto-Closed",
                metrics.get("auto_closed_count", 0),
                delta=f"{metrics.get('automation_rate', 0):.1%} rate"
            )
        
        with col3:
            st.metric(
                "Escalated",
                metrics.get("escalated_count", 0),
                delta=f"{100 - metrics.get('automation_rate', 0) * 100:.1%} rate"
            )
        
        with col4:
            session_duration = (datetime.now() - current_session.get("started_at", datetime.now())).total_seconds() / 60
            st.metric(
                "Session Duration",
                f"{session_duration:.1f} min",
                delta="Active"
            )
        
        # Progress visualization
        if metrics.get("alerts_generated", 0) > 0:
            progress_data = {
                "Status": ["Auto-Closed", "Escalated", "Processing"],
                "Count": [
                    metrics.get("auto_closed_count", 0),
                    metrics.get("escalated_count", 0),
                    max(0, metrics.get("alerts_generated", 0) - metrics.get("alerts_processed", 0))
                ]
            }
            
            progress_df = pd.DataFrame(progress_data)
            
            if alt:
                chart = (
                    alt.Chart(progress_df)
                    .mark_arc(innerRadius=50)
                    .encode(
                        theta=alt.Theta(field="Count", type="quantitative"),
                        color=alt.Color(
                            field="Status",
                            type="nominal",
                            scale=alt.Scale(
                                domain=["Auto-Closed", "Escalated", "Processing"],
                                range=["#4ade80", "#f59e0b", "#3b82f6"]
                            )
                        ),
                        tooltip=["Status", "Count"]
                    )
                    .properties(width=200, height=200)
                )
                st.altair_chart(chart, use_container_width=True)
            else:
                st.bar_chart(progress_df.set_index("Status"))
        
        # Live investigations dashboard
        tenant_id = os.getenv("DEFAULT_TENANT_ID", "hk-demo")
        progress_visualization.render_live_investigations_dashboard(tenant_id)
        
        # Demo session specific progress
        session_id = current_session.get("session_id")
        if session_id:
            progress_visualization.render_demo_session_progress(session_id)
        
        # Recent activity feed
        with st.expander("Recent Demo Activity", expanded=True):
            activity_log = st.session_state.get("demo_activity_log", [])
            if activity_log:
                for activity in activity_log[-10:]:  # Show last 10 activities
                    timestamp = activity.get("timestamp", "")
                    message = activity.get("message", "")
                    activity_type = activity.get("type", "info")
                    
                    if activity_type == "alert_generated":
                        st.markdown(f"""
                        <div class='neo-activity-item alert'>
                            🚨 <strong>{timestamp}</strong>: {message}
                        </div>
                        """, unsafe_allow_html=True)
                    elif activity_type == "auto_closed":
                        st.markdown(f"""
                        <div class='neo-activity-item success'>
                            ✅ <strong>{timestamp}</strong>: {message}
                        </div>
                        """, unsafe_allow_html=True)
                    elif activity_type == "escalated":
                        st.markdown(f"""
                        <div class='neo-activity-item warning'>
                            ⚠️ <strong>{timestamp}</strong>: {message}
                        </div>
                        """, unsafe_allow_html=True)
                    else:
                        st.markdown(f"""
                        <div class='neo-activity-item'>
                            ℹ️ <strong>{timestamp}</strong>: {message}
                        </div>
                        """, unsafe_allow_html=True)
            else:
                st.info("Demo activity will appear here as alerts are generated and processed")
                
    except ImportError as e:
        st.error(f"Progress visualization not available: {e}")
        # Fallback to basic progress display
        st.info("Basic progress tracking - enhanced visualization not available")


def update_demo_metrics() -> None:
    """Update demo session metrics from backend."""
    current_session = st.session_state.get("current_demo_session")
    if not current_session or current_session.get("status") != "active":
        return
    
    try:
        session_id = current_session["session_id"]
        # Get updated metrics from demo controller
        status = DEMO_CONTROLLER.get_session_status(session_id)
        
        if status.get("success"):
            metrics = status.get("metrics", {})
            current_session["metrics"] = metrics
            st.session_state["current_demo_session"] = current_session
            
            # Add to activity log if new alerts
            if metrics.get("alerts_generated", 0) > current_session.get("last_alert_count", 0):
                activity_log = st.session_state.get("demo_activity_log", [])
                activity_log.append({
                    "timestamp": datetime.now().strftime("%H:%M:%S"),
                    "message": f"New alert generated (Total: {metrics['alerts_generated']})",
                    "type": "alert_generated"
                })
                st.session_state["demo_activity_log"] = activity_log
                current_session["last_alert_count"] = metrics["alerts_generated"]
        else:
            # Fallback: simulate demo metrics for testing
            simulate_demo_metrics_update(current_session)
                
    except Exception as e:
        # Fallback: simulate demo metrics for testing
        simulate_demo_metrics_update(current_session)


def simulate_demo_metrics_update(current_session: Dict[str, Any]) -> None:
    """Simulate demo metrics updates for testing when backend is unavailable."""
    import random
    
    # Get session start time
    started_at = current_session.get("started_at", datetime.now())
    session_duration = (datetime.now() - started_at).total_seconds() / 60  # minutes
    
    # Simulate metrics based on session duration and configuration
    config = current_session.get("config", {})
    interval_seconds = config.get("interval_seconds", 30.0)
    false_positive_rate = config.get("false_positive_rate", 0.8)
    
    # Calculate expected alerts based on time elapsed
    expected_alerts = max(1, int(session_duration * 60 / interval_seconds))
    
    # Add some randomness
    current_metrics = current_session.get("metrics", {})
    current_alerts = current_metrics.get("alerts_generated", 0)
    
    # Gradually increase alerts
    if current_alerts < expected_alerts:
        new_alerts = min(expected_alerts, current_alerts + random.randint(0, 2))
        processed_alerts = max(0, new_alerts - random.randint(0, 2))
        auto_closed = int(processed_alerts * false_positive_rate)
        escalated = processed_alerts - auto_closed
        
        updated_metrics = {
            "alerts_generated": new_alerts,
            "alerts_processed": processed_alerts,
            "auto_closed_count": auto_closed,
            "escalated_count": escalated,
            "automation_rate": auto_closed / max(1, processed_alerts),
            "avg_processing_time": random.uniform(2.0, 8.0),
            "session_duration": session_duration
        }
        
        current_session["metrics"] = updated_metrics
        st.session_state["current_demo_session"] = current_session
        
        # Add activity log entries
        if new_alerts > current_alerts:
            activity_log = st.session_state.get("demo_activity_log", [])
            activity_log.append({
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "message": f"Simulated alert generated (Total: {new_alerts})",
                "type": "alert_generated"
            })
            
            # Add processing activities
            if processed_alerts > current_metrics.get("alerts_processed", 0):
                if auto_closed > current_metrics.get("auto_closed_count", 0):
                    activity_log.append({
                        "timestamp": datetime.now().strftime("%H:%M:%S"),
                        "message": f"Alert auto-closed by AI analysis (False positive detected)",
                        "type": "auto_closed"
                    })
                
                if escalated > current_metrics.get("escalated_count", 0):
                    activity_log.append({
                        "timestamp": datetime.now().strftime("%H:%M:%S"),
                        "message": f"Alert escalated to human analyst (Suspicious activity)",
                        "type": "escalated"
                    })
            
            st.session_state["demo_activity_log"] = activity_log[-20:]  # Keep last 20 entries


def render_brand_header() -> None:
    with st.container():
        st.markdown("<div class='neo-hero'>", unsafe_allow_html=True)
        cols = st.columns([1, 5, 2])
        with cols[0]:
            if LOGO_PATH.exists():
                st.image(str(LOGO_PATH), width=96)
            else:
                st.markdown("### 🛡️")
        with cols[1]:
            st.markdown("<div class='neo-badge'>NeoHarbourSecurity · Agentic SOC</div>", unsafe_allow_html=True)
            st.markdown("<h1>NeoHarbourSecurity Command Workbench</h1>", unsafe_allow_html=True)
            st.markdown(
                "<p>HKMA-ready multi-agent copilots orchestrate investigations end-to-end – giving analysts full visibility, explainability, and control across Plan → Execute → Analyze → Respond → Adapt → Report.</p>",
                unsafe_allow_html=True,
            )
        with cols[2]:
            st.metric(label="Active tenants", value="12", delta="+3 in last 7d")
            st.metric(label="Agent coverage", value="92%", delta="+5%")
        st.markdown("</div>", unsafe_allow_html=True)


def render_getting_started_cards() -> None:
    st.subheader("Getting started is easy")
    st.caption("Start your POV in under 30 minutes – align data, agents, and compliance artifacts.")
    cols = st.columns(3)
    for col, card in zip(cols, GETTING_STARTED_CARDS):
        with col:
            block = f"""
            <div class='neo-step-card'>
              <div class='neo-step-number'>{card['step']}</div>
              <h3>{card['title']}</h3>
              <p>{card['description']}</p>
              <div class='neo-pill'>{card['cta_icon']} {card['cta']}</div>
            </div>
            """
            st.markdown(block, unsafe_allow_html=True)


def render_connector_status() -> None:
    st.subheader("Connector health")
    st.caption("Rate-limited adapters maintain read-only posture with per-tenant KMS isolation.")
    grouped: Dict[str, List[Dict[str, str]]] = {}
    for connector in CONNECTOR_FIXTURES:
        grouped.setdefault(connector["category"], []).append(connector)

    cols = st.columns(max(len(grouped), 1))
    for col, (category, items) in zip(cols, grouped.items()):
        with col:
            st.markdown(f"**{category}**")
            for item in items:
                status_chip = "<span class='neo-status-chip' data-state=\"ready\">● Connected</span>"
                block = (
                    f"<div class='neo-agent-card'><h4>{item['name']}</h4>"
                    f"<p>Latency {item['latency']} · Updated {format_timestamp(item['updated'])}</p>{status_chip}</div>"
                )
                st.markdown(block, unsafe_allow_html=True)

    df = pd.DataFrame(CONNECTOR_FIXTURES)
    df["Last Updated"] = df["updated"].map(format_timestamp)
    df = df.drop(columns=["updated"])
    st.dataframe(df, use_container_width=True, hide_index=True)


def render_investigation_overview(items: List[Dict[str, Any]]) -> None:
    st.subheader("Investigation queue snapshot")
    if not items:
        st.info("No investigations yet – trigger the pipeline with `make demo` or connect live data.")
        return

    open_items = [i for i in items if i.get("stage") not in {"completed", "closed"}]
    closed_items = [i for i in items if i.get("stage") in {"completed", "closed"}]
    high_risk = [i for i in items if (i.get("riskLevel") or "").lower() == "high"]

    col_open, col_closed, col_risk, col_delta = st.columns(4)
    col_open.metric("Open", len(open_items))
    col_closed.metric("Completed", len(closed_items))
    col_risk.metric("High risk", len(high_risk), delta=f"{len(high_risk) * 14} SLA mins")
    col_delta.metric("Queue delta", "-37%", delta="vs last week")

    table_data = []
    for item in items:
        table_data.append(
            {
                "Investigation": item.get("investigationId"),
                "Risk": item.get("riskLevel", "n/a").title(),
                "Stage": item.get("stage", "n/a"),
                "Tenant": item.get("tenantId", "-"),
                "Received": format_timestamp(item.get("receivedAt")),
                "Updated": format_timestamp(item.get("updatedAt")),
            }
        )
    st.dataframe(table_data, use_container_width=True, hide_index=True)

    stage_counts: Dict[str, int] = {}
    for item in items:
        stage = (item.get("stage") or "unknown").title()
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
    if stage_counts:
        chart_df = pd.DataFrame(
            [{"Stage": stage, "Count": count} for stage, count in stage_counts.items()]
        )
        if alt:
            chart = (
                alt.Chart(chart_df)
                .mark_area(line={"color": "#38bdf8"}, color="rgba(56, 189, 248, 0.2)")
                .encode(x="Stage", y="Count")
                .properties(height=240)
            )
            st.altair_chart(chart, use_container_width=True)
        else:
            st.bar_chart(chart_df.set_index("Stage"))


def describe_payload(stage: str, payload: Dict[str, Any] | Any) -> str:
    if not payload:
        return "Awaiting agent output."
    if isinstance(payload, dict):
        if stage == "plan":
            alert = payload.get("alert") or {}
            name = alert.get("displayName") or alert.get("title") or alert.get("name")
            if name:
                return f"Enveloped alert `{name}`"
        if stage == "respond":
            action = payload.get("action") or payload.get("decision")
            if action:
                return f"Action queued: {action}"
        keys = [k for k in payload.keys() if not str(k).startswith("_")]
        if keys:
            preview = ", ".join(keys[:4])
            return f"Captured {preview}"
    if isinstance(payload, list):
        return f"Collected {len(payload)} records"
    return str(payload)


def compute_agent_stage_states(
    investigation_id: str,
    detail: Dict[str, Any],
    timeline_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    stages: List[Dict[str, Any]] = []
    for step in PIPELINE_STEPS:
        stage = step["stage"]
        entry = timeline_entry_for_stage(timeline_rows, stage) if timeline_rows else None
        payload = build_stage_payload(investigation_id, detail, timeline_rows, stage)
        stages.append(
            {
                "stage": stage,
                "label": step["label"],
                "agent": step["agent"],
                "entry": entry,
                "payload": payload,
                "description": describe_payload(stage, payload),
                "actions": AGENT_ACTION_PRESETS.get(stage, []),
            }
        )

    completed_indices = {idx for idx, stage in enumerate(stages) if stage["entry"]}
    in_progress_marked = False
    for idx, stage in enumerate(stages):
        if idx in completed_indices:
            stage["status"] = "completed"
            stage["percent"] = 100
        elif not in_progress_marked:
            stage["status"] = "running"
            stage["percent"] = 55
            in_progress_marked = True
        else:
            stage["status"] = "queued"
            stage["percent"] = 20
    if not completed_indices and stages:
        stages[0]["status"] = "running"
        stages[0]["percent"] = 35
    return stages


def simulation_state_key(investigation_id: str) -> str:
    return f"pipeline_sim_states_{investigation_id}"


def simulation_history_key(investigation_id: str) -> str:
    return f"pipeline_history_{investigation_id}"


def payload_override_tracker_key(investigation_id: str) -> str:
    return f"pipeline_payload_keys_{investigation_id}"


def pipeline_payload_key(investigation_id: str, stage: str) -> str:
    return f"pipeline_payload_{investigation_id}_{stage}"


def pipeline_event_key(investigation_id: str) -> str:
    return f"pipeline_events_{investigation_id}"


def fetch_stage_from_orchestrator(
    investigation_id: str,
    stage: str,
    tenant_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    query = f"?tenant={tenant_id}" if tenant_id else ""
    response = fetch_json(f"/investigations/{investigation_id}/stages/{stage}{query}")
    if isinstance(response, dict) and response.get("payload") is not None:
        return response
    return None


def collect_stage_outputs(
    investigation_id: str,
    detail: Dict[str, Any],
    timeline_rows: List[Dict[str, Any]],
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    fallback_outputs = generate_stage_fallback_outputs(detail, timeline_rows)
    stage_payloads: Dict[str, Dict[str, Any]] = {}
    stage_meta: Dict[str, Dict[str, Any]] = {}
    tenant_id = detail.get("tenantId")
    for step in PIPELINE_STEPS:
        stage = step["stage"]
        live = fetch_stage_from_orchestrator(investigation_id, stage, tenant_id)
        payload: Dict[str, Any]
        meta: Dict[str, Any] = {}
        if live:
            raw_payload = live.get("payload")
            payload = raw_payload if isinstance(raw_payload, dict) else fallback_outputs.get(stage, {})
            meta = {
                "status": live.get("status"),
                "completedAt": live.get("completedAt"),
                "durationSeconds": live.get("durationSeconds"),
            }
        else:
            payload = fallback_outputs.get(stage, {})
            entry = next((row for row in timeline_rows if row.get("stage") == stage), None)
            if entry:
                meta = {
                    "status": entry.get("status"),
                    "completedAt": entry.get("completedAt") or entry.get("timestamp"),
                    "durationSeconds": entry.get("durationSeconds"),
                }
        stage_payloads[stage] = payload or {}
        if meta:
            stage_meta[stage] = meta
    return stage_payloads, stage_meta


def set_stage_payload_override(
    investigation_id: str,
    stage: str,
    payload: Dict[str, Any],
) -> None:
    key = pipeline_payload_key(investigation_id, stage)
    st.session_state[key] = deepcopy(payload)
    tracker_key = payload_override_tracker_key(investigation_id)
    keys = list(st.session_state.get(tracker_key, []))
    if key not in keys:
        keys.append(key)
    st.session_state[tracker_key] = keys


def resolve_stage_states(
    investigation_id: str,
    base_states: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    sim_key = simulation_state_key(investigation_id)
    override = st.session_state.get(sim_key)
    if isinstance(override, list) and override:
        return override
    return base_states


def generate_stage_fallback_outputs(
    detail: Dict[str, Any],
    timeline_rows: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    summary = detail.get("summary", {})
    context = detail.get("context", {})
    actions = summary.get("recommended_actions") or []
    knowledge_context = summary.get("knowledge_context") or []
    first_action = (actions[0] or {}).get("action_id") if actions else None

    received = parse_iso_timestamp(detail.get("receivedAt"))
    updated = parse_iso_timestamp(detail.get("updatedAt"))
    total_minutes: float | None = None
    if received and updated:
        total_minutes = max(round((updated - received).total_seconds() / 60.0, 2), 0.0)

    connectors = []
    for source, value in context.items():
        if isinstance(value, list):
            count = len(value)
        elif isinstance(value, dict):
            count = len(value.keys())
        else:
            count = 1
        connectors.append(
            {
                "source": source.replace("_", " ").title(),
                "records": count,
                "status": "complete" if count else "empty",
            }
        )

    plan_payload = {
        "tenantId": detail.get("tenantId"),
        "alert": {
            "displayName": summary.get("summary") or "Investigation",
            "risk_level": summary.get("risk_level", detail.get("riskLevel")),
            "receivedAt": detail.get("receivedAt"),
        },
        "receivedAt": detail.get("receivedAt"),
        "ingested_sources": [entry.get("stage") or entry.get("step") for entry in (timeline_rows or [])][:4],
    }

    execute_payload = {
        "connectors": connectors,
        "enrichments": [c["source"] for c in connectors if c.get("records")],
        "context_insight": f"{len(connectors)} connectors harmonized",
    }

    analyze_payload = {
        "summary": summary.get("summary"),
        "risk_level": summary.get("risk_level"),
        "confidence": summary.get("confidence"),
        "recommended_actions": actions,
        "knowledge_context": knowledge_context,
    }

    respond_payload = {
        "metrics": {
            "MTTA": f"{max(total_minutes or 6.0, 1.0):.1f} min" if total_minutes is not None else "6.0 min",
            "MTTI": "12.5 min",
            "MTTR": "34.0 min",
            "FPR": "3.0%",
        },
        "decision": f"Risk classified as {(summary.get('risk_level') or detail.get('riskLevel') or 'unknown').title()}",
        "action": first_action or "MONITOR",
        "actions_recommended": len(actions),
    }

    adapt_payload = {
        "feedback": {
            "actions_recommended": len(actions),
            "knowledge_refs": len(knowledge_context),
            "notes": "Auto-logged for tenant tuning",
        },
        "next_best_action": "Tune Okta conditional access" if actions else "Capture analyst feedback",
    }

    report_payload = {
        "artifact": f"audit/{detail.get('investigationId', 'investigation')}.jsonl",
        "status": "immutable-log-written",
        "distribution": ["S3::approvals", "DynamoDB::metrics"],
    }

    return {
        "plan": plan_payload,
        "execute": execute_payload,
        "analyze": analyze_payload,
        "respond": respond_payload,
        "adapt": adapt_payload,
        "report": report_payload,
    }


def describe_stage_event(stage: str, payload: Dict[str, Any]) -> str:
    if stage == "plan":
        alert = payload.get("alert", {}) if isinstance(payload, dict) else {}
        return (
            f"Planner normalized alert '{alert.get('displayName', 'investigation')}' for tenant"
            f" {payload.get('tenantId', 'unknown')}"
        )
    if stage == "execute":
        connectors = payload.get("connectors", []) if isinstance(payload, dict) else []
        sources = ", ".join(c.get("source", "Connector") for c in connectors[:3])
        return f"Context Executor pulled telemetry from {sources or 'connectors'}"
    if stage == "analyze":
        action = ""
        recs = payload.get("recommended_actions") if isinstance(payload, dict) else None
        if isinstance(recs, list) and recs:
            primary = recs[0]
            if isinstance(primary, dict):
                action = f" · rec {primary.get('action_id', primary.get('id', 'ACTION'))}"
        return f"Analyst mapped HKMA controls · risk {payload.get('risk_level', 'n/a')}{action}"
    if stage == "respond":
        return f"Risk Orchestrator staged action {payload.get('action', 'MONITOR')}"
    if stage == "adapt":
        return "Learning Curator recorded precision feedback"
    if stage == "report":
        return "Audit Scribe sealed immutable log and metrics"
    return f"{stage.title()} stage completed"


def derive_dynamic_actions(stage: str, payload: Dict[str, Any]) -> List[str]:
    if not isinstance(payload, dict):
        return []
    actions: List[str] = []
    if stage == "analyze":
        recs = payload.get("recommended_actions") or []
        for action in recs[:3]:
            if not isinstance(action, dict):
                continue
            action_id = action.get("action_id", action.get("id", "ACTION"))
            description = action.get("description") or action.get("rationale") or "Suggested follow-up"
            actions.append(f"{action_id}: {description}")
    elif stage == "respond":
        primary = payload.get("action") or payload.get("decision")
        if primary:
            actions.append(f"Primary action: {primary}")
        metrics = payload.get("metrics")
        if isinstance(metrics, dict):
            for name in ("MTTA", "MTTI", "MTTR", "FPR"):
                if metrics.get(name):
                    actions.append(f"{name}: {metrics[name]}")
        if payload.get("actions_recommended"):
            actions.append(f"Actions queued: {payload['actions_recommended']}")
    elif stage == "execute":
        connectors = payload.get("connectors") or []
        for connector in connectors[:3]:
            if isinstance(connector, dict):
                source = connector.get("source", "Connector")
                records = connector.get("records")
                actions.append(f"{source}: {records} records")
    elif stage == "adapt":
        feedback = payload.get("feedback") or {}
        if isinstance(feedback, dict):
            actions.append(f"Feedback logged: {feedback.get('notes', 'Analyst responses captured')}" )
        if payload.get("next_best_action"):
            actions.append(f"Next best action: {payload['next_best_action']}")
    elif stage == "plan":
        alert = payload.get("alert", {})
        if isinstance(alert, dict):
            name = alert.get("displayName") or alert.get("title")
            if name:
                actions.append(f"Alert: {name}")
        if payload.get("tenantId"):
            actions.append(f"Tenant: {payload['tenantId']}")
    elif stage == "report":
        if payload.get("artifact"):
            actions.append(f"Artifact: {payload['artifact']}")
        if payload.get("distribution"):
            targets = payload.get("distribution")
            if isinstance(targets, list):
                actions.append("Distribution → " + ", ".join(targets[:3]))
    return actions[:4]


def render_agent_status_board(
    stage_states: List[Dict[str, Any]],
    placeholder: Optional[Any] = None,
) -> None:
    container = placeholder.container() if placeholder else st.container()
    with container:
        labels = {"completed": "Completed", "running": "In flight", "queued": "Queued"}
        for offset in range(0, len(stage_states), 3):
            cols = st.columns(3)
            for col, state in zip(cols, stage_states[offset : offset + 3]):
                with col:
                    chip = (
                        f"<span class='neo-status-chip' data-state='{state['status']}'>● "
                        f"{labels.get(state['status'], state['status'])}</span>"
                    )
                    st.markdown(
                        f"<div class='neo-agent-card'><h4>{state['label']} · {state['agent']}</h4>{chip}<p>{state['description']}</p></div>",
                        unsafe_allow_html=True,
                    )
                    progress_value = min(max(int(state.get("percent", 0)), 0), 100)
                    st.progress(progress_value)
                    if state.get("actions"):
                        st.markdown("**Key actions**")
                        for action in state["actions"]:
                            st.markdown(f"- {action}")


def render_agent_status_panel(
    investigation_id: str,
    detail: Dict[str, Any],
    timeline_rows: List[Dict[str, Any]],
    mode: str,
) -> None:
    base_states = compute_agent_stage_states(investigation_id, detail, timeline_rows)
    stage_outputs, stage_meta = collect_stage_outputs(investigation_id, detail, timeline_rows)
    if not st.session_state.get(simulation_state_key(investigation_id)):
        for state in base_states:
            stage = state["stage"]
            payload = stage_outputs.get(stage)
            if payload:
                state["description"] = describe_payload(stage, payload)
                dynamic_actions = derive_dynamic_actions(stage, payload)
                if dynamic_actions:
                    state["actions"] = dynamic_actions
                set_stage_payload_override(investigation_id, stage, payload)
    with st.container():
        info_col, slider_col, button_col = st.columns([3, 2, 2])
        with info_col:
            st.subheader("Agent workflow status")
            st.caption("Copilot transparency – every stage surfaces status, core actions, and captured artefacts.")
        with slider_col:
            speed_key = f"pipeline_speed_{investigation_id}"
            default_speed = float(st.session_state.get(speed_key, 0.8))
            speed = st.slider(
                "Stage delay (seconds)",
                min_value=0.2,
                max_value=2.0,
                value=default_speed,
                step=0.1,
                key=speed_key,
            )
        with button_col:
            run_clicked = st.button(
                "Run Agentic Pipeline",
                key=f"run-{investigation_id}",
                use_container_width=True,
            )
            reset_clicked = st.button(
                "Reset Demo",
                key=f"reset-{investigation_id}",
                type="secondary",
                use_container_width=True,
            )

        board_placeholder = st.empty()
        current_states = resolve_stage_states(investigation_id, base_states)
        render_agent_status_board(current_states, board_placeholder)

        if reset_clicked:
            clear_pipeline_simulation(investigation_id)
            render_agent_status_board(base_states, board_placeholder)

        if run_clicked:
            clear_pipeline_simulation(investigation_id)
            if mode == "Live":
                st.warning("Switch to Demo Mode to play the agentic pipeline animation.")
                render_agent_status_board(base_states, board_placeholder)
            else:
                run_pipeline_simulation(
                    investigation_id,
                    detail,
                    timeline_rows,
                    base_states,
                    board_placeholder,
                    speed,
                    cached_outputs=stage_outputs,
                    cached_meta=stage_meta,
                )
                final_states = resolve_stage_states(investigation_id, base_states)
                render_agent_status_board(final_states, board_placeholder)

        st.caption(
            "Agent telemetry updates alongside the simulation — monitor each copilot as it transitions across Plan → Report."
        )
        render_pipeline_history(investigation_id)


def clear_pipeline_simulation(investigation_id: str) -> None:
    st.session_state.pop(simulation_state_key(investigation_id), None)
    st.session_state.pop(simulation_history_key(investigation_id), None)
    tracker_key = payload_override_tracker_key(investigation_id)
    keys = st.session_state.pop(tracker_key, []) or []
    for key in keys:
        st.session_state.pop(key, None)
    st.session_state.pop(pipeline_event_key(investigation_id), None)


def render_pipeline_history(investigation_id: str) -> None:
    history_key = simulation_history_key(investigation_id)
    history = st.session_state.get(history_key, [])
    if history:
        st.dataframe(pd.DataFrame(history), use_container_width=True)
        graph_lines = ["digraph Pipeline {", "  rankdir=LR;", "  node [shape=box, style=filled, fontname='Helvetica'];"]
        for step in PIPELINE_STEPS:
            stage = step["stage"]
            graph_lines.append(
                f"  {stage} [label=\"{step['label']}\\n{step['agent']}\", fillcolor='#dbeafe', color='#2563eb'];"
            )
        for idx in range(len(PIPELINE_STEPS) - 1):
            source = PIPELINE_STEPS[idx]["stage"]
            target = PIPELINE_STEPS[idx + 1]["stage"]
            graph_lines.append(f"  {source} -> {target};")
        graph_lines.append("}")
        with st.expander("Agentic Flow Diagram", expanded=False):
            st.graphviz_chart("\n".join(graph_lines))
    else:
        st.info("Click \"Run Agentic Pipeline\" to watch the agents coordinate stage by stage (点击按钮即可开始演示).")


def run_pipeline_simulation(
    investigation_id: str,
    detail: Dict[str, Any],
    timeline_rows: List[Dict[str, Any]],
    base_states: List[Dict[str, Any]],
    placeholder: Any,
    speed: float,
    cached_outputs: Optional[Dict[str, Dict[str, Any]]] = None,
    cached_meta: Optional[Dict[str, Dict[str, Any]]] = None,
) -> None:
    history_key = simulation_history_key(investigation_id)
    st.session_state[history_key] = []
    st.session_state[pipeline_event_key(investigation_id)] = []
    st.session_state[payload_override_tracker_key(investigation_id)] = []
    if cached_outputs is None or cached_meta is None:
        stage_outputs, stage_meta = collect_stage_outputs(investigation_id, detail, timeline_rows)
    else:
        stage_outputs = cached_outputs
        stage_meta = cached_meta
    speed = max(speed, 0.1)
    for idx, step in enumerate(PIPELINE_STEPS):
        stage_states: List[Dict[str, Any]] = []
        for stage_idx, base in enumerate(base_states):
            state = deepcopy(base)
            if stage_idx < idx:
                state["status"] = "completed"
                state["percent"] = 100
            elif stage_idx == idx:
                state["status"] = "running"
                state["percent"] = 60
            else:
                state["status"] = "queued"
                state["percent"] = 15
            stage_name = base["stage"]
            output_payload = stage_outputs.get(stage_name)
            if output_payload and stage_idx <= idx:
                state["payload"] = output_payload
                state["description"] = describe_payload(base["stage"], output_payload)
                dynamic_actions = derive_dynamic_actions(stage_name, output_payload)
                if dynamic_actions:
                    state["actions"] = dynamic_actions
            stage_states.append(state)
        st.session_state[simulation_state_key(investigation_id)] = stage_states
        render_agent_status_board(stage_states, placeholder)
        min_d, max_d = step.get("duration_range", (0.6, 1.2))
        delay = uniform(min_d, max_d) * speed
        completion_time = datetime.utcnow().isoformat() + "Z"
        st.session_state[history_key].append(
            {
                "Stage": step["label"],
                "Agent": step["agent"],
                "Key Output": ", ".join(step["artifacts"]),
                "Duration (s)": round(delay, 2),
                "Completed": completion_time,
            }
        )
        time.sleep(delay)
        stage_name = step["stage"]
        payload_override = stage_outputs.get(stage_name)
        if payload_override:
            set_stage_payload_override(investigation_id, stage_name, payload_override)
        event_record = {
            "stage": stage_name,
            "time": completion_time,
            "payload": describe_stage_event(stage_name, payload_override or {}),
        }
        if stage_name in stage_meta:
            meta = stage_meta[stage_name]
            if meta.get("completedAt"):
                event_record["time"] = meta.get("completedAt")
            if meta.get("durationSeconds"):
                event_record["durationSeconds"] = meta.get("durationSeconds")
        st.session_state[pipeline_event_key(investigation_id)].append(event_record)

    final_states: List[Dict[str, Any]] = []
    for base in base_states:
        state = deepcopy(base)
        state["status"] = "completed"
        state["percent"] = 100
        stage_name = base["stage"]
        output_payload = stage_outputs.get(stage_name)
        if output_payload:
            state["payload"] = output_payload
            state["description"] = describe_payload(base["stage"], output_payload)
            dynamic_actions = derive_dynamic_actions(stage_name, output_payload)
            if dynamic_actions:
                state["actions"] = dynamic_actions
        final_states.append(state)
    st.session_state[simulation_state_key(investigation_id)] = final_states
    render_agent_status_board(final_states, placeholder)


def render_agent_action_center(investigation_id: str, detail: Dict[str, Any]) -> None:
    st.subheader("Analyst action centre")
    summary = detail.get("summary", {})
    actions = summary.get("recommended_actions") or []
    if not actions:
        st.info("No automated actions queued yet – agents will populate recommendations once analysis completes.")
    for action in actions:
        action_id = action.get("action_id", "ACTION")
        descriptor = action.get("description", "")
        key = f"action_ack_{investigation_id}_{action_id}"
        default = st.session_state.get(key, False)
        checked = st.checkbox(f"`{action_id}` · {descriptor}", key=key, value=default)
        if checked:
            st.session_state[key] = True
            st.caption(action.get("rationale", ""))

    notes_key = f"analyst_notes_{investigation_id}"
    default_notes = st.session_state.get(notes_key, "")
    notes = st.text_area(
        "Investigation notes",
        value=default_notes,
        placeholder="Document containment steps, coordination messages, or HKMA guardrail exceptions…",
        key=notes_key,
    )
    if notes:
        st.session_state[notes_key] = notes

    buffer = io.StringIO()
    buffer.write(f"Investigation {investigation_id}\n")
    buffer.write(f"Risk: {detail.get('riskLevel', 'n/a')}\n")
    buffer.write(f"Stage: {detail.get('stage', 'n/a')}\n\n")
    if actions:
        buffer.write("Actions:\n")
        for action in actions:
            action_id = action.get("action_id", "ACTION")
            key = f"action_ack_{investigation_id}_{action_id}"
            status = "completed" if st.session_state.get(key) else "pending"
            buffer.write(f"- {action_id} ({status}): {action.get('description', '')}\n")
        buffer.write("\n")
    if notes:
        buffer.write("Analyst notes:\n")
        buffer.write(notes)
        buffer.write("\n")
    st.download_button(
        "Export analyst log",
        data=buffer.getvalue(),
        file_name=f"{investigation_id}_analyst_log.txt",
        mime="text/plain",
    )


def render_agent_event_feed(
    investigation_id: str,
    timeline_rows: List[Dict[str, Any]],
) -> None:
    st.subheader("Agent telemetry feed")
    session_events = st.session_state.get(pipeline_event_key(investigation_id))
    combined_rows: List[Dict[str, Any]] = []
    if isinstance(timeline_rows, list):
        combined_rows.extend(timeline_rows)
    if isinstance(session_events, list):
        combined_rows.extend(session_events)
    if not combined_rows:
        st.info("No live events yet – run the copilot simulator or stream live data to populate telemetry.")
        return
    enumerated_rows = list(enumerate(combined_rows))

    def event_sort_key(item: tuple[int, Dict[str, Any]]) -> tuple[str, int]:
        index, entry = item
        timestamp = entry.get("time") or entry.get("startedAt") or entry.get("timestamp")
        dt = parse_iso_timestamp(timestamp)
        sortable = dt.isoformat() if dt else str(timestamp or "")
        return sortable, index

    enumerated_rows.sort(key=event_sort_key)

    for _, entry in enumerated_rows:
        stage = entry.get("stage") or entry.get("label") or "Stage"
        timestamp = format_timestamp(entry.get("time") or entry.get("startedAt"))
        description = entry.get("payload") or entry.get("detail") or entry.get("step") or ""
        if isinstance(description, str):
            display_text = description
        else:
            try:
                display_text = json.dumps(description, indent=2)
            except TypeError:
                display_text = str(description)
        block = f"**{timestamp}** · {stage}\n\n> {display_text}"
        st.markdown(block)


def extract_markdown_preview(path: Path) -> Dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return {"title": path.stem, "summary": "Unable to open file", "path": str(path)}
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return {"title": path.stem, "summary": "(empty)", "path": str(path)}
    title_line = next((line for line in lines if line.startswith("#")), lines[0])
    title = title_line.lstrip("# ")
    summary_lines = [line for line in lines if not line.startswith("#")][:3]
    summary = " ".join(summary_lines) or "Summary not available"
    return {"title": title, "summary": summary, "path": str(path)}


def render_operations_view(items: List[Dict[str, Any]], mode: str) -> None:
    # Demo controls section
    with st.expander("🎯 Interactive Demo System", expanded=True):
        render_demo_control_panel()
        
        # Show demo configuration if requested
        if st.session_state.get("show_demo_config", False):
            render_demo_scenario_selection()
        
        # Show progress tracking if demo is active
        current_session = st.session_state.get("current_demo_session")
        if current_session and current_session.get("status") in ["active", "paused"]:
            render_demo_progress_tracking()
    
    render_getting_started_cards()
    render_investigation_overview(items)
    render_connector_status()
    display_metrics(items)


def render_investigations_view(items: List[Dict[str, Any]], mode: str) -> None:
    selected_id = display_workbench(items)
    if selected_id:
        display_details(selected_id)


def render_agents_copilot(items: List[Dict[str, Any]], mode: str) -> None:
    st.subheader("Multi-agent copilot")
    if not items:
        st.info("No investigations yet. Trigger the pipeline or load live data to observe agent runs.")
        return
    options = {item.get("investigationId"): item for item in items if item.get("investigationId")}
    if not options:
        st.info("Investigations are missing identifiers – wait for pipeline updates.")
        return
    investigation_id = st.selectbox("Investigation", options=sorted(options.keys()))
    st.session_state["selected_investigation"] = investigation_id
    detail = fetch_json(f"/investigations/{investigation_id}") or {}
    if not detail:
        seed = load_seed("investigation_detail.json")
        detail = seed.get(investigation_id, {}) if isinstance(seed, dict) else {}
    timeline_rows = fetch_timeline(investigation_id, detail.get("timeline") or [])
    if not isinstance(timeline_rows, list):
        timeline_rows = []

    render_agent_status_panel(investigation_id, detail, timeline_rows, mode)
    render_agent_action_center(investigation_id, detail)
    render_agent_event_feed(investigation_id, timeline_rows)


def render_knowledge_hub() -> None:
    st.subheader("Knowledge hub & playbooks")
    st.caption("Streaming from /knowledge and /playbooks – indexed into Bedrock embeddings for analyst copilots.")
    search = st.text_input("Search knowledge", placeholder="HKMA controls, phishing playbook, ransomware…")
    knowledge_paths = sorted(Path("knowledge").glob("*.md"))
    playbook_paths = sorted(Path("playbooks").glob("*.md"))
    entries: List[Dict[str, str]] = []
    for path in knowledge_paths:
        meta = extract_markdown_preview(path)
        meta["category"] = "Knowledge"
        entries.append(meta)
    for path in playbook_paths:
        meta = extract_markdown_preview(path)
        meta["category"] = "Playbook"
        entries.append(meta)
    if search:
        search_lower = search.lower()
        entries = [entry for entry in entries if search_lower in entry["title"].lower() or search_lower in entry["summary"].lower()]
    if not entries:
        st.info("No matching documents – adjust your search keywords.")
        return
    for entry in entries:
        st.markdown(
            f"**{entry['title']}** · {entry.get('category', 'Doc')}\n\n{entry['summary']}\n\n`{entry['path']}`"
        )


def render_compliance_view() -> None:
    st.subheader("Compliance & audit automation")
    cols = st.columns(len(COMPLIANCE_OVERVIEW))
    for col, item in zip(cols, COMPLIANCE_OVERVIEW):
        with col:
            st.metric(item["title"], item["value"], item["delta"])
    st.markdown(
        "<div class='neo-highlight'>HKMA SA-2 and TM-G-1 mappings automatically roll into immutable audit trails with 7-year retention.</div>",
        unsafe_allow_html=True,
    )
    display_compliance()


def select_ui_mode() -> tuple[str, Optional[int]]:
    """Render the demo/live toggle and return selected mode plus refresh seconds."""

    default_mode = st.session_state.get("ui_mode", "Demo")
    if not LIVE_PIPELINE_ENABLED:
        st.session_state["ui_mode"] = "Demo"
        st.info("Live mode disabled via configuration; running in Demo Mode.")
        return "Demo", None

    col_mode, col_refresh = st.columns([3, 2])
    with col_mode:
        mode = st.radio(
            "Display mode",
            options=("Demo", "Live"),
            index=0 if default_mode != "Live" else 1,
            horizontal=True,
            help="Live Mode polls the backend for real agent events; Demo Mode uses seeded fixtures.",
        )
    refresh_seconds: Optional[int] = None
    if mode == "Live":
        default_refresh = int(st.session_state.get("live_refresh_sec", 5))
        with col_refresh:
            refresh_seconds = st.slider(
                "Refresh (s)",
                min_value=2,
                max_value=30,
                value=default_refresh,
                step=1,
                key="live_refresh_sec",
            )
        if st_autorefresh:
            st_autorefresh(interval=int(refresh_seconds * 1000), key="live-refresh-timer")
        else:
            st.caption(
                "Install `streamlit-autorefresh` for automatic polling, or click \"Refresh now\" below."
            )
    st.session_state["ui_mode"] = mode
    return mode, refresh_seconds


@st.cache_data(show_spinner=False)
def load_seed(name: str) -> Any:
    path = SEED_DIR / name
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def fetch_json(path: str) -> Any:
    try:
        resp = requests.get(f"{API_BASE_URL}{path}", timeout=5, headers={"Authorization": f"Bearer {DEMO_TOKEN}"})
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException:
        return None


def fetch_timeline(investigation_id: str, fallback: List[Dict[str, Any]] | None = None) -> List[Dict[str, Any]]:
    mode = st.session_state.get("ui_mode", "Demo")
    if mode != "Live":
        return fallback or []
    timeline = fetch_json(f"/investigations/{investigation_id}/timeline")
    if isinstance(timeline, dict):
        timeline = timeline.get("items") or timeline.get("results")
    if isinstance(timeline, list):
        return timeline
    return fallback or []


def fetch_stage_payload(
    investigation_id: str,
    stage: str,
    fallback: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    mode = st.session_state.get("ui_mode", "Demo")
    if mode != "Live":
        return fallback or {}
    payload = fetch_json(f"/investigations/{investigation_id}/stages/{stage}")
    if isinstance(payload, dict):
        return payload
    return fallback or {}


def load_investigations() -> List[Dict[str, Any]]:
    data = fetch_json("/investigations")
    if data and "items" in data:
        st.session_state["investigations_source"] = "api"
        return data["items"]
    seed = load_seed("investigations_sample.json")
    results = seed.get("items", []) if isinstance(seed, dict) else (seed or [])
    if st.session_state.get("ui_mode") == "Live" and not results:
        st.warning("Live API did not return investigations yet. Waiting for pipeline events…")
    st.session_state["investigations_source"] = "seed"
    return results


def parse_iso_timestamp(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        text = str(value)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def timeline_entry_for_stage(timeline: List[Dict[str, Any]], stage: str) -> Optional[Dict[str, Any]]:
    for entry in timeline:
        entry_stage = str(entry.get("stage") or "").lower()
        if entry_stage == stage:
            return entry
    return None


def build_stage_payload(
    investigation_id: str,
    detail: Dict[str, Any],
    timeline: List[Dict[str, Any]],
    stage: str,
) -> Dict[str, Any]:
    override = st.session_state.get(pipeline_payload_key(investigation_id, stage))
    if isinstance(override, dict) and override:
        return override
    entry = timeline_entry_for_stage(timeline, stage)
    timeline_payload = entry.get("payload") if entry else None
    fallback: Dict[str, Any] | None = None
    if timeline_payload and isinstance(timeline_payload, dict):
        fallback = timeline_payload
    else:
        if stage == "plan":
            fallback = {
                "alert": detail.get("alert", {}),
                "tenantId": detail.get("tenantId"),
                "receivedAt": detail.get("receivedAt"),
            }
        elif stage == "execute":
            fallback = detail.get("context", {})
        elif stage == "analyze":
            fallback = detail.get("summary", {})
        elif stage == "respond":
            fallback = detail.get("risk", {})
        elif stage == "adapt":
            fallback = detail.get("adaptation", {})
        elif stage == "report":
            fallback = detail.get("audit", {})
        else:
            fallback = {}
    return fetch_stage_payload(investigation_id, stage, fallback=fallback)


def normalize_timeline(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for entry in rows or []:
        if not isinstance(entry, dict):
            continue
        stage_key = str(entry.get("stage") or "").lower()
        label = entry.get("label") or entry.get("step") or entry.get("stage") or "Event"
        start = entry.get("startedAt") or entry.get("startTime") or entry.get("time")
        end = entry.get("completedAt") or entry.get("endTime") or entry.get("time")
        duration_seconds = entry.get("durationSeconds") or entry.get("duration")
        if not duration_seconds and start and end:
            start_dt = parse_iso_timestamp(start)
            end_dt = parse_iso_timestamp(end)
            if start_dt and end_dt:
                duration_seconds = max((end_dt - start_dt).total_seconds(), 0.0)
        normalized.append(
            {
                "Stage": label,
                "Stage Key": stage_key,
                "Started": start,
                "Completed": end,
                "Duration (s)": duration_seconds,
                "Detail": entry.get("payload") or entry.get("detail") or entry.get("description"),
            }
        )
    return normalized


def format_timestamp(value: Any) -> str:
    dt = parse_iso_timestamp(value)
    if dt:
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    return str(value) if value else "n/a"


def display_workbench(items: List[Dict[str, Any]]):
    st.subheader("Investigation workbench")
    mode = st.session_state.get("ui_mode", "Demo")
    source = st.session_state.get("investigations_source")
    if mode == "Live":
        caption = "Live mode: streaming investigations from backend"
        if source == "seed":
            caption += " (fallback to demo fixtures until live data arrives)."
        st.caption(caption)
        if st_autorefresh is None:
            st.caption("Auto refresh unavailable — use the Refresh button above to update.")
    if not items:
        st.info("No investigations available. Trigger the pipeline via `make demo`.")
        return None
    open_items = [i for i in items if i.get("stage") not in {"completed", "closed"}]
    closed_items = [i for i in items if i.get("stage") in {"completed", "closed"}]
    high_risk = [i for i in items if (i.get("riskLevel") or "").lower() == "high"]
    mcol1, mcol2, mcol3 = st.columns(3)
    mcol1.metric("Open Investigations", len(open_items))
    mcol2.metric("Closed", len(closed_items))
    mcol3.metric("High Risk", len(high_risk))
    cols = ["investigationId", "stage", "riskLevel", "receivedAt", "updatedAt"]
    table_data = []
    for item in items:
        table_data.append({k: item.get(k) for k in cols})
    selected = st.data_editor(table_data, hide_index=True, use_container_width=True)
    if selected:
        selected_id = selected[0]["investigationId"]
        return selected_id
    return items[0]["investigationId"]


def display_details(investigation_id: str):
    st.subheader("Investigation Detail")
    data = fetch_json(f"/investigations/{investigation_id}")
    if not data:
        seed = load_seed("investigation_detail.json")
        data = seed.get(investigation_id, {}) if isinstance(seed, dict) else {}
    if not data:
        st.warning("Investigation details unavailable.")
        return

    st.markdown(f"**Risk Level:** {data.get('riskLevel', 'n/a')}  |  **Stage:** {data.get('stage', 'n/a')}")
    summary = data.get("summary", {})
    st.write("### AI Summary")
    st.write(summary.get("summary", "Summary not available"))
    st.write("**Confidence:**", summary.get("confidence"))

    with st.expander("Recommended Actions"):
        for action in summary.get("recommended_actions", []):
            st.markdown(f"- `{action.get('action_id', 'unknown')}` – {action.get('description', '')}")

    fallback_timeline = data.get("timeline") or summary.get("timeline") or []
    timeline_rows = fetch_timeline(investigation_id, fallback_timeline)
    normalized_timeline = normalize_timeline(timeline_rows or fallback_timeline)
    stage_timeline = [entry for entry in (timeline_rows or []) if isinstance(entry, dict) and entry.get("stage")]

    if timeline_rows and not stage_timeline and st.session_state.get("ui_mode") == "Live":
        st.info("Live API returned timeline entries without stage metadata; using raw events for display.")

    approve_col, escalate_col = st.columns(2)
    if approve_col.button("Approve Auto Remediation", key=f"approve-{investigation_id}"):
        st.session_state[f"approval_{investigation_id}"] = (
            f"Approved at {datetime.utcnow().isoformat()}Z"
        )
    if escalate_col.button("Escalate to Human", key=f"escalate-{investigation_id}"):
        st.session_state[f"approval_{investigation_id}"] = (
            f"Escalated for review at {datetime.utcnow().isoformat()}Z"
        )
    if msg := st.session_state.get(f"approval_{investigation_id}"):
        st.info(msg)

    with st.expander("Timeline"):
        if normalized_timeline:
            timeline_df = pd.DataFrame(normalized_timeline)
            st.dataframe(timeline_df, use_container_width=True)
            duration_df = timeline_df.dropna(subset=["Duration (s)"])
            if alt and not duration_df.empty:
                chart = (
                    alt.Chart(duration_df)
                    .mark_bar(color="#2563eb")
                    .encode(
                        x=alt.X("Stage", sort=None),
                        y=alt.Y("Duration (s)", title="Duration (seconds)"),
                        tooltip=["Stage", "Duration (s)", "Started", "Completed"],
                    )
                    .properties(height=220)
                )
                st.altair_chart(chart, use_container_width=True)
            elif not duration_df.empty:
                st.table(duration_df[["Stage", "Duration (s)"]])
        else:
            st.info("Timeline events will appear once the pipeline progresses.")

    with st.expander("Evidence Snapshot"):
        st.json({k: v for k, v in data.get("context", {}).items() if k in {"sentinel_alerts", "splunk_events", "entra_signins"}}, expanded=False)

    with st.expander("Entity Graph"):
        context = data.get("context", {})
        graph_lines = ["digraph G {"]
        graph_lines.append('  node [shape=box, style="rounded,filled", color="#2563eb", fontname="Helvetica"];')
        principal = data.get("summary", {}).get("principal") or "hk.ops"
        graph_lines.append(f'  "Alert" [shape=octagon, color="#dc2626", style="filled", fillcolor="#fee2e2"];')
        graph_lines.append(f'  "User:{principal}" [fillcolor="#dbeafe"];')
        graph_lines.append('  "Alert" -> "User:{principal}";'.replace("{principal}", principal))
        for signin in context.get("entra_signins", [])[:3]:
            ip = signin.get("ipAddress") or "unknown-ip"
            graph_lines.append(f'  "User:{principal}" -> "IP:{ip}";')
        for detection in context.get("crowdstrike_detections", [])[:2]:
            host = detection.get("device", {}).get("hostname", "host")
            graph_lines.append(f'  "Alert" -> "Host:{host}";')
        graph_lines.append("}")
        st.graphviz_chart("\n".join(graph_lines))

    render_stage_cards(investigation_id, data, timeline_rows or [])


def render_stage_cards(
    investigation_id: str,
    detail: Dict[str, Any],
    timeline_rows: List[Dict[str, Any]],
) -> None:
    st.subheader("Stage Intelligence")
    stage_payloads: Dict[str, Dict[str, Any]] = {}
    stage_entries: Dict[str, Optional[Dict[str, Any]]] = {}
    for step in PIPELINE_STEPS:
        stage = step["stage"]
        entry = timeline_entry_for_stage(timeline_rows, stage) if timeline_rows else None
        payload = build_stage_payload(investigation_id, detail, timeline_rows, stage)
        stage_payloads[stage] = payload
        if entry is None:
            entry = synthesize_stage_entry(stage, payload, detail)
        stage_entries[stage] = entry

    tabs = st.tabs([step["label"] for step in PIPELINE_STEPS])
    for step, tab in zip(PIPELINE_STEPS, tabs):
        stage = step["stage"]
        payload = stage_payloads.get(stage) or {}
        entry = stage_entries.get(stage)
        render_stage_tab(tab, step, payload, entry)

    status_rows = []
    for step in PIPELINE_STEPS:
        stage = step["stage"]
        entry = stage_entries.get(stage)
        status_rows.append(
            {
                "Stage": step["label"],
                "Agent": step["agent"],
                "Status": (entry.get("status") if entry else None) or ("Completed" if entry else "Pending"),
                "Completed": format_timestamp(entry.get("completedAt") if entry else None),
            }
        )
    st.table(pd.DataFrame(status_rows))

    graph_lines = [
        "digraph Pipeline {",
        "  rankdir=LR;",
        "  node [shape=box, style=filled, fontname='Helvetica'];",
    ]
    for step in PIPELINE_STEPS:
        stage = step["stage"]
        entry = stage_entries.get(stage)
        color = "#bbf7d0" if entry else "#dbeafe"
        graph_lines.append(
            f"  {stage} [label=\"{step['label']}\\n{step['agent']}\", fillcolor='{color}', color='#2563eb'];"
        )
    for idx in range(len(PIPELINE_STEPS) - 1):
        source = PIPELINE_STEPS[idx]["stage"]
        target = PIPELINE_STEPS[idx + 1]["stage"]
        graph_lines.append(f"  {source} -> {target};")
    graph_lines.append("}")
    with st.expander("Pipeline Diagram", expanded=False):
        st.graphviz_chart("\n".join(graph_lines))


def render_stage_tab(tab, step: Dict[str, Any], payload: Dict[str, Any], entry: Optional[Dict[str, Any]]):
    stage = step["stage"]
    tab.markdown(f"**{step['agent']}** — {step['description']}")
    if entry:
        tab.caption(
            f"Status: {(entry.get('status') or 'Completed')} · Completed: {format_timestamp(entry.get('completedAt') or entry.get('time'))}"
        )
    else:
        tab.caption("Status: Pending")

    if stage == "plan":
        alert = payload.get("alert") or payload
        tab.write("**Alert Context**")
        tab.json(alert or {"message": "Awaiting planner output"})
    elif stage == "execute":
        context = payload or {}
        rows = []
        for source, value in context.items():
            if isinstance(value, list):
                rows.append({"Source": source, "Records": len(value)})
        if rows:
            tab.write("Connector snapshots")
            tab.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
        else:
            tab.info("No connector context available yet.")
    elif stage == "analyze":
        tab.write(payload.get("summary", "Awaiting analyst summary."))
        actions = payload.get("recommended_actions") or []
        if actions:
            tab.write("**Recommended Actions**")
            for action in actions:
                tab.markdown(
                    f"- `{action.get('action_id', 'action')}` — {action.get('description', '')}"
                )
    elif stage == "respond":
        metrics = payload.get("metrics") or payload
        if isinstance(metrics, dict) and metrics:
            mcols = tab.columns(min(4, len(metrics)))
            for idx, (name, value) in enumerate(metrics.items()):
                mcols[idx % len(mcols)].metric(name, value)
        else:
            tab.info("Risk metrics will appear once the response stage runs.")
    elif stage == "adapt":
        tab.write("**Feedback Snapshot**")
        tab.json(payload or {"message": "Awaiting adaptation feedback"})
    elif stage == "report":
        tab.write("**Audit Artefact**")
        tab.json(payload or {"message": "Audit artefacts will publish at completion."})
    else:
        tab.json(payload)

    with tab.expander("Raw payload", expanded=False):
        tab.json(payload or {})


def synthesize_stage_entry(stage: str, payload: Dict[str, Any], detail: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not payload:
        return None
    if isinstance(payload, dict):
        completed = (
            payload.get("completedAt")
            or payload.get("updatedAt")
            or payload.get("timestamp")
            or payload.get("generated_at")
        )
    else:
        completed = None

    if not completed:
        if stage == "plan":
            completed = detail.get("receivedAt")
        elif stage == "execute":
            completed = detail.get("updatedAt")
        elif stage == "analyze":
            completed = detail.get("summary", {}).get("timestamp")
        elif stage == "respond":
            completed = detail.get("risk", {}).get("timestamp")
        elif stage == "adapt":
            completed = detail.get("adaptation", {}).get("timestamp")
        elif stage == "report":
            completed = detail.get("audit", {}).get("timestamp")

    return {
        "stage": stage,
        "status": "Completed",
        "completedAt": completed,
    }


def display_metrics(items: List[Dict[str, Any]]):
    st.subheader("KPI Dashboard")
    metrics = fetch_json("/metrics/baseline")
    if metrics and "baseline" in metrics:
        baseline = metrics["baseline"]
    else:
        baseline = load_seed("metrics_baseline.json") or {}
    cols = st.columns(4)
    for idx, name in enumerate(["MTTA", "MTTI", "MTTR", "FPR"]):
        cols[idx].metric(name, baseline.get(name, "n/a"))

    stage_counts: Dict[str, int] = {}
    for item in items:
        stage = item.get("stage", "unknown")
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
    if stage_counts:
        chart_df = pd.DataFrame(
            [{"Stage": stage, "Count": count} for stage, count in stage_counts.items()]
        )
        st.bar_chart(chart_df.set_index("Stage"))

    csv_buffer = io.StringIO()
    csv_buffer.write("metric,value\n")
    for name, value in baseline.items():
        csv_buffer.write(f"{name},{value}\n")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "NeoHarbourSecurity KPI Baseline", ln=True)
    pdf.set_font("Helvetica", size=12)
    for name, value in baseline.items():
        pdf.cell(0, 8, f"{name}: {value}", ln=True)
    pdf_output = pdf.output(dest="S")
    if isinstance(pdf_output, str):
        pdf_output = pdf_output.encode("latin1")
    else:
        pdf_output = bytes(pdf_output)

    st.download_button(
        "Download KPI CSV",
        data=csv_buffer.getvalue(),
        file_name="kpi_baseline.csv",
        mime="text/csv",
    )
    st.download_button(
        "Download KPI PDF",
        data=pdf_output,
        file_name="kpi_baseline.pdf",
        mime="application/pdf",
    )


def display_compliance():
    st.subheader("HKMA Compliance Pack")
    if st.button("Generate Compliance Bundle"):
        archive_path = build_compliance_pack(Path("out"))
        with archive_path.open("rb") as handle:
            st.download_button(
                label="Download Compliance Pack",
                data=handle,
                file_name=archive_path.name,
                mime="application/zip",
            )
    st.caption(
        "Outputs include SA-2 / TM-G-1 matrices (CSV/MD/PDF), SoD checks, Mermaid diagrams, and policy drafts."
    )


def render_realtime_progress_view(mode: str) -> None:
    """Render real-time investigation progress tracking view."""
    st.markdown("""
    <div class='neo-hero'>
        <h1>🔄 Real-time Investigation Progress</h1>
        <p>Monitor live investigation progress with agent activity, confidence scores, and automation decisions</p>
    </div>
    """, unsafe_allow_html=True)
    
    try:
        from src.demo.progress_visualization import progress_visualization
        
        tenant_id = os.getenv("DEFAULT_TENANT_ID", "hk-demo")
        
        # Tab layout for different views
        tab1, tab2, tab3 = st.tabs(["🚀 Live Dashboard", "🔍 Investigation Details", "📊 Demo Session"])
        
        with tab1:
            st.markdown("### Live Investigations Dashboard")
            st.caption("Real-time monitoring of all active investigations")
            
            # Auto-refresh for live view
            if st_autorefresh and mode == "Live":
                st_autorefresh(interval=3000, key="progress-refresh")
            
            # Live investigations dashboard
            progress_visualization.render_live_investigations_dashboard(tenant_id)
        
        with tab2:
            st.markdown("### Individual Investigation Progress")
            st.caption("Detailed progress tracking for specific investigations")
            
            # Investigation selector
            col1, col2 = st.columns([3, 1])
            with col1:
                investigation_id = st.text_input(
                    "Investigation ID",
                    placeholder="Enter investigation ID (e.g., INV-20240212-001)",
                    help="Enter the full investigation ID to track its progress"
                )
            with col2:
                if st.button("Track Investigation", type="primary"):
                    if investigation_id:
                        st.session_state["selected_investigation"] = investigation_id
            
            # Display selected investigation progress
            selected_investigation = st.session_state.get("selected_investigation")
            if selected_investigation:
                st.markdown(f"**Tracking Investigation:** `{selected_investigation}`")
                
                # Investigation timeline
                progress_visualization.render_investigation_timeline(
                    selected_investigation, tenant_id
                )
                
                # Confidence and risk display
                progress_visualization.render_confidence_display(
                    selected_investigation, tenant_id
                )
            else:
                st.info("Enter an investigation ID above to track its real-time progress")
        
        with tab3:
            st.markdown("### Demo Session Progress")
            st.caption("Progress tracking for demo sessions and generated investigations")
            
            current_session = st.session_state.get("current_demo_session")
            if current_session:
                session_id = current_session.get("session_id")
                if session_id:
                    progress_visualization.render_demo_session_progress(session_id)
                else:
                    st.info("Demo session ID not available")
            else:
                st.info("No active demo session. Start a demo from the Operations Console to see progress here.")
                
                # Show recent demo investigations anyway
                st.markdown("**Recent Demo Investigations:**")
                progress_visualization.render_demo_session_progress("recent")
        
        # Additional controls
        st.markdown("---")
        col1, col2, col3 = st.columns(3)
        
        with col1:
            if st.button("🔄 Refresh All Data"):
                st.experimental_rerun()
        
        with col2:
            auto_refresh = st.checkbox("Auto-refresh (3s)", value=True)
            if auto_refresh and st_autorefresh:
                st_autorefresh(interval=3000, key="manual-progress-refresh")
        
        with col3:
            if st.button("📊 Export Progress Data"):
                st.info("Progress data export functionality coming soon")
                
    except ImportError as e:
        st.error(f"Progress visualization not available: {e}")
        st.markdown("""
        **Progress tracking requires additional components:**
        - Progress tracker service
        - Visualization components
        - Real-time data pipeline
        
        Please ensure all demo system components are properly installed.
        """)
    except Exception as e:
        st.error(f"Error loading progress visualization: {e}")
        st.markdown("Please check the system logs for more details.")


def main():
    apply_branding()
    render_brand_header()
    
    # Check if demo is active and update metrics
    current_session = st.session_state.get("current_demo_session")
    if current_session and current_session.get("status") == "active":
        update_demo_metrics()
        # Auto-refresh every 5 seconds when demo is active
        if st_autorefresh:
            st_autorefresh(interval=5000, key="demo-refresh-timer")
    
    with st.sidebar:
        if LOGO_PATH.exists():
            st.image(str(LOGO_PATH), width=120)
        st.markdown("**NeoHarbourSecurity**")
        nav = st.radio(
            "Console views",
            options=[
                "Operations Console",
                "Investigations",
                "Real-time Progress",
                "Agents Copilot",
                "Knowledge Hub",
                "Compliance",
            ],
        )
        st.caption("Switch between live investigations, agent telemetry, knowledge packs, and compliance automation.")
        
        # Demo status indicator in sidebar
        if current_session:
            status = current_session.get("status", "stopped")
            if status == "active":
                st.success("🟢 Demo Active")
            elif status == "paused":
                st.warning("🟡 Demo Paused")
            else:
                st.info("⚪ Demo Stopped")
    
    mode, _ = select_ui_mode()
    if mode == "Live" and st_autorefresh is None:
        if st.button("Refresh now", key="manual-refresh"):
            st.experimental_rerun()
    items = load_investigations()
    if nav == "Operations Console":
        render_operations_view(items, mode)
    elif nav == "Investigations":
        render_investigations_view(items, mode)
    elif nav == "Real-time Progress":
        render_realtime_progress_view(mode)
    elif nav == "Agents Copilot":
        render_agents_copilot(items, mode)
    elif nav == "Knowledge Hub":
        render_knowledge_hub()
    elif nav == "Compliance":
        render_compliance_view()


if __name__ == "__main__":
    main()
