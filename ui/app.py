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

import altair as alt

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


st.set_page_config(page_title="Asia Agentic SOC", layout="wide")
st.title("Asia Agentic SOC Workbench")


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
    st.subheader("Alert Workbench")
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
            if not duration_df.empty:
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
    pdf.cell(0, 10, "Asia Agentic SOC KPI Baseline", ln=True)
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
    mode, _ = select_ui_mode()
    if mode == "Live" and st_autorefresh is None:
        if st.button("Refresh now", key="manual-refresh"):
            st.experimental_rerun()

    items = load_investigations()
    selected_id = display_workbench(items)
    if selected_id:
        display_details(selected_id)
        display_pipeline_simulator(selected_id, mode)
    display_metrics(items)
    display_compliance()


if __name__ == "__main__":
    main()
