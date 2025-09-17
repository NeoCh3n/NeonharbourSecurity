# Demo Script (≈3 minutes)

## 0:00 – Setup
- Open terminal tab with project root.
- Ensure `.env` is populated (Bedrock credentials, AWS region) and virtualenv activated.

## 0:15 – Trigger Pipeline
```bash
make demo
```
- Explains: seeds EventBridge with synthetic Sentinel/Defender/Okta findings, recomputes KPIs, launches Streamlit UI.

## 0:45 – Workbench Overview
- Highlight metrics banner (open/high-risk counts) and investigation table.
- Select latest high-risk investigation (e.g., `INV-20240212-001`).

## 1:15 – AI Detail & Entity Graph
- Walk through AI summary (risk level, confidence, HKMA references).
- Expand Recommended Actions; show allow-listed actions.
- Demonstrate approval buttons (Approve vs Escalate) and note S3 audit evidence.
- Open Entity Graph expander: explain user/IP/host relationships discovered from connectors.

## 1:55 – Metrics Dashboard
- Scroll to KPI Dashboard; call out MTTA/MTTR improvements.
- Download KPI CSV/PDF (shows export buttons; mention automation for exec reporting).
- Reference backlog bar chart tracking pipeline throughput.

## 2:25 – Compliance Automation
- Hit "Generate Compliance Bundle"; download ZIP.
- Explain content: SA-2/TM-G-1 matrices (CSV/MD/PDF), SoD report, policy drafts, Mermaid diagrams.
- Mention zipped pack stored in KMS-encrypted S3 bucket during production deploys.

## 2:50 – Wrap-Up
- Summarise AWS-native differentiators (EventBridge→Step Functions agentic loop, Bedrock fallback, immutable audit).
- Call out roadmap: ServiceNow/Jira HITL, Detection Advisor, SOC 2 readiness.
