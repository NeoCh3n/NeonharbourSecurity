# Asia Agentic SOC

AI-powered SOC accelerator for HKMA-regulated institutions: ingest alerts, orchestrate agentic investigations on AWS, and ship compliance-ready artifacts in minutes.

## Quick Start (≈5 minutes)
1. **Bootstrap tooling**
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   make bootstrap
   ```
2. **Deploy the AWS footprint** (creates EventBridge → Step Functions → Lambda → DynamoDB/S3/KMS stack).
   ```bash
   sam build
   sam deploy --guided
   ```
   Capture the generated resource ARNs and update `.env` as needed (`STATE_MACHINE_ARN`, `EVENT_BUS_NAME`, etc.).
3. **Seed demo data & launch the UI**
   ```bash
   source .venv/bin/activate
   make demo  # triggers synthetic findings and opens the Streamlit workbench
   ```

## Demo Flow (≈3 minutes)
1. **Workbench tour** – highlight open/high-risk investigations, drill into the ransomware scenario, review AI summary + entity graph.
2. **Human-in-the-loop** – use the approval buttons to simulate escalation vs approval and note the S3 audit trail with checksums.
3. **Metrics & Compliance** – download KPI CSV/PDF, generate the HKMA compliance bundle (CSV/MD/PDF matrices, SoD report, Mermaid diagrams).

## AI Provider Switch
Set `AI_PROVIDER=bedrock|kiro|amazonq` in `.env`.
- `bedrock` – fully runnable using Claude 3 Haiku + Titan embeddings.
- `kiro` / `amazonq` – TODO integrations; stubs document the expected POST payloads and feedback endpoints.

## Project Layout Highlights
- `infra/sam-template.yaml` – SAM template for the AWS-native pipeline with least-privilege IAM + KMS.
- `src/pipeline/` – Lambda handlers for Ingest → Context → Summarize → Risk → Adapt → Audit (each stage logs immutable JSONL entries).
- `src/connectors/` – Read-only adapters (Sentinel, Splunk, Defender, CrowdStrike, Entra, Okta) with fixture fallbacks.
- `src/ai/analyst.py` – Analyst interface + Bedrock implementation, TODO stubs for Kiro/Amazon Q.
- `src/compliance/generate_pack.py` – HKMA compliance pack generator (CSV/MD/PDF + SoD report).
- `ui/app.py` – Streamlit workbench with KPIs, entity graph, approval mocks, and compliance downloads.

## Cleanup
When finished testing:
```bash
sam delete --no-prompts
```
This removes the deployed resources (EventBridge, Step Functions, Lambdas, DynamoDB, S3, KMS alias).

## Limitations & Next Steps
- Kiro/Amazon Q connectors are stubs awaiting GA APIs.
- Auto-remediation is a no-op in Phase A; Phase B will wire ServiceNow/Jira + Slack/Teams approvals.
- Detection Advisor cadence and SOC 2 evidence automation are roadmap items for Phases B/C.
