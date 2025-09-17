# Compliance Overview

## HKMA SA-2 / TM-G-1 Mapping
- `src/compliance/generate_pack.py` compiles SA-2 / TM-G-1 control matrices into CSV, Markdown, and PDF, highlighting implementation evidence.
- `docs/hkma/templates/` stores policy drafts for Information Security Management (SA-2) and Technology Risk (TM-G-1).
- `docs/hkma/diagrams/` contains Mermaid diagrams illustrating hybrid/on-prem + AWS data flows and encryption controls.

## Pack Contents
Running `make compliance` produces `out/hkma_compliance_pack_*` containing:
- `sa2_tm-g1_control_matrix.{csv,md,pdf}` – baseline control coverage.
- `segregation_of_duties.json` – privilege escalation and SoD checks with remediation notes.
- Policy drafts (encryption, retention) and drill templates tailored to Hong Kong regulators.
- Retention of generated packs aligns with S3 bucket Object Lock (7-year retention) and KMS encryption as codified in the SAM template.

## Segregation of Duties & Privilege Escalation
- `segregation_of_duties.json` enumerates pass/monitor findings for admin separation, emergency access expiry, and privilege monitoring.
- Pipeline risk stage (`src/pipeline/risk.py`) captures risk level + metrics per investigation; adapt stage stores feedback for future SoD analytics.

## Data Residency & Privacy
- DynamoDB partitions (`TENANT#…`) ensure per-tenant isolation; metrics and artifacts tagged with tenant IDs for residency reporting.
- `knowledge/*.md` and `playbooks/*.md` document Hong Kong/Singapore/Japan residency expectations, reinforcing region-aware deployments.
- No customer data is used for general model training; Bedrock usage remains within the tenant’s selected region (`BEDROCK_REGION`).

## SOC 2 & Future Expansion
- Object Lock + checksum logging lay groundwork for SOC 2 Type II evidence collection.
- Step Functions execution history + DynamoDB metrics support automated audit trails.
- Roadmap items (Phase B/C) include penetration testing placeholders, MAS/FSA playbooks, and ServiceNow/Jira ticket exports noted in `AGENTS.md`.
