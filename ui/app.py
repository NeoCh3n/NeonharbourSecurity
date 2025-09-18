from __future__ import annotations

import io
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
import requests
import streamlit as st
from fpdf import FPDF

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from src.compliance.generate_pack import build_compliance_pack

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:4000")
DEMO_TOKEN = os.getenv("DEMO_AUTH_TOKEN", "change-me")
SEED_DIR = Path("tools/seed")


st.set_page_config(page_title="Asia Agentic SOC", layout="wide")
st.title("Asia Agentic SOC Workbench")


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


def load_investigations() -> List[Dict[str, Any]]:
    data = fetch_json("/investigations")
    if data and "items" in data:
        return data["items"]
    seed = load_seed("investigations_sample.json")
    return seed.get("items", []) if isinstance(seed, dict) else (seed or [])


def display_workbench(items: List[Dict[str, Any]]):
    st.subheader("Alert Workbench")
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
        timeline = data.get("timeline") or summary.get("timeline") or []
        for entry in timeline:
            st.markdown(f"- {entry.get('time', 'n/a')}: {entry.get('step', entry.get('action'))}")

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
    items = load_investigations()
    selected_id = display_workbench(items)
    if selected_id:
        display_details(selected_id)
    display_metrics(items)
    display_compliance()


if __name__ == "__main__":
    main()
