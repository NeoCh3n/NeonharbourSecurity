from __future__ import annotations

import io
import json
import os
import sys
import time
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

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:4000")
DEMO_TOKEN = os.getenv("DEMO_AUTH_TOKEN", "change-me")
SEED_DIR = Path("tools/seed")
LIVE_PIPELINE_ENABLED = os.getenv("LIVE_PIPELINE_ENABLED", "true").lower() not in {"0", "false", "no"}
LOGO_PATH = Path(__file__).resolve().parent / "assets" / "neo_logo.svg"


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


def apply_branding() -> None:
    st.markdown(BRAND_CSS, unsafe_allow_html=True)


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


def render_agent_status_board(stage_states: List[Dict[str, Any]]) -> None:
    st.subheader("Agent workflow status")
    st.caption("Copilot transparency – every stage surfaces status, core actions, and captured artefacts.")
    labels = {"completed": "Completed", "running": "In flight", "queued": "Queued"}
    for offset in range(0, len(stage_states), 3):
        cols = st.columns(3)
        for col, state in zip(cols, stage_states[offset : offset + 3]):
            with col:
                chip = f"<span class='neo-status-chip' data-state='{state['status']}'>● {labels.get(state['status'], state['status'])}</span>"
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
    timeline_rows: List[Dict[str, Any]],
) -> None:
    st.subheader("Agent telemetry feed")
    if not timeline_rows:
        st.info("No live events yet – run the copilot simulator or stream live data to populate telemetry.")
        return
    for entry in timeline_rows:
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
    detail = fetch_json(f"/investigations/{investigation_id}") or {}
    if not detail:
        seed = load_seed("investigation_detail.json")
        detail = seed.get(investigation_id, {}) if isinstance(seed, dict) else {}
    timeline_rows = fetch_timeline(investigation_id, detail.get("timeline") or [])

    stage_states = compute_agent_stage_states(investigation_id, detail, timeline_rows)
    render_agent_status_board(stage_states)
    render_agent_action_center(investigation_id, detail)
    render_agent_event_feed(timeline_rows)
    display_pipeline_simulator(investigation_id, mode)


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


def display_pipeline_simulator(investigation_id: str, mode: str):
    if mode == "Live":
        return
    st.subheader("Agentic Pipeline Simulator")
    st.caption("Run a stage-by-stage animation to observe how each agent collaborates across the pipeline.")

    speed_key = f"pipeline_speed_{investigation_id}"
    default_speed = st.session_state.get(speed_key, 0.8)
    speed = st.slider(
        "Stage delay (seconds)",
        min_value=0.2,
        max_value=2.0,
        value=float(default_speed),
        step=0.1,
        key=speed_key,
    )

    history_key = f"pipeline_history_{investigation_id}"
    col_run, col_reset = st.columns(2)

    if col_run.button("Run Agentic Pipeline", key=f"run-{investigation_id}"):
        st.session_state[history_key] = []
        progress = st.progress(0)
        status = st.status("Pipeline executing…", expanded=True)
        total = len(PIPELINE_STEPS)
        for idx, step in enumerate(PIPELINE_STEPS, start=1):
            status.write(
                f"**{step['label']} · {step['agent']}**\n"
                f"{step['description']}\n"
                f"Artifacts: {', '.join(step['artifacts'])}"
            )
            min_d, max_d = step["duration_range"]
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
            progress.progress(idx / total)
            time.sleep(delay)
        status.update(label="Pipeline completed", state="complete", expanded=False)

    if col_reset.button("Clear Run", key=f"reset-{investigation_id}"):
        st.session_state.pop(history_key, None)

    history = st.session_state.get(history_key, [])
    if history:
        st.dataframe(pd.DataFrame(history), use_container_width=True)
        graph_lines = ["digraph Pipeline {", "  rankdir=LR;", "  node [shape=box, style=filled, color='#2563eb', fontname='Helvetica'];"]
        for step in PIPELINE_STEPS:
            graph_lines.append(
                f"  {step['stage']} [label=\"{step['label']}\\n{step['agent']}\", fillcolor='#dbeafe'];"
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


def main():
    apply_branding()
    render_brand_header()
    with st.sidebar:
        if LOGO_PATH.exists():
            st.image(str(LOGO_PATH), width=120)
        st.markdown("**NeoHarbourSecurity**")
        nav = st.radio(
            "Console views",
            options=[
                "Operations Console",
                "Investigations",
                "Agents Copilot",
                "Knowledge Hub",
                "Compliance",
            ],
        )
        st.caption("Switch between live investigations, agent telemetry, knowledge packs, and compliance automation.")
    mode, _ = select_ui_mode()
    if mode == "Live" and st_autorefresh is None:
        if st.button("Refresh now", key="manual-refresh"):
            st.experimental_rerun()
    items = load_investigations()
    if nav == "Operations Console":
        render_operations_view(items, mode)
    elif nav == "Investigations":
        render_investigations_view(items, mode)
    elif nav == "Agents Copilot":
        render_agents_copilot(items, mode)
    elif nav == "Knowledge Hub":
        render_knowledge_hub()
    elif nav == "Compliance":
        render_compliance_view()


if __name__ == "__main__":
    main()
