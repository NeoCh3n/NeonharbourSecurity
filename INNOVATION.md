# Innovation & Originality

## Agentic Loop
- Multi-agent design executes **Plan → Execute → Analyze → Respond → Adapt → Report** with dedicated Lambdas per stage and immutable JSONL audits.
- `BedrockAnalyst` delivers agentic reasoning with HK-specific prompts while preserving guardrails (action allow-list, SoD reminders).
- `AdaptInsights` collects feedback for per-tenant tuning, enabling precision scoring and historical learning without cross-tenant data mixing.

## HITL Safety
- Low-risk paths execute a safe auto-remediation no-op; high-risk alerts generate approval artifacts for Slack/Teams/ServiceNow integration (Phase B).
- Streamlit workbench exposes approval buttons to demonstrate human governance even in PoV mode.
- S3 Object Lock + checksum metadata ensure tamper-evident audit chains for regulator-ready reviews.

## Compliance-First RAG
- Local knowledge base ingests 10+ HK-specific SOPs/playbooks; Bedrock embeddings power rapid retrieval of HKMA expectations.
- Compliance pack automation exports PDF-ready matrices, SoD reports, and policy drafts aligned to SA-2 / TM-G-1.

## AWS-First Footprint
- Single SAM template provisions EventBridge, Step Functions, DynamoDB, S3 (KMS-encrypted), and Bedrock integrations within minutes.
- Synthetic connectors + fixtures grant a frictionless demo without external credentials, ideal for hackathon judging and pilot storytelling.

## Future Ready (Phases B/C)
- Detection Advisor cadence, ticketing connectors, and SOC 2 readiness checkpoints documented in `AGENTS.md` for roadmap clarity.
- Kiro and Amazon Q stubs outline payload contracts, ensuring easy adoption once endpoints are available.
