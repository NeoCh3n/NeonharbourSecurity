# Product Overview

NeoHarbour Security is an AI-powered Security Operations Center accelerator designed specifically for HKMA-regulated financial institutions in Hong Kong. The platform orchestrates multi-agent investigations that automatically ingest security alerts, perform contextual analysis, AI-driven Security Operations Center (SOC) functions. It helps enterprises automatically analyze alerts, reduce false positives, and accelerate response speed. Users can upload logs, integrate with SIEM/EDR tools, or call APIs to feed data. The system automatically investigates alerts and generates reports. and generate compliance-ready artifacts.

## Core Value Proposition
- **Automated Investigation Pipeline**: EventBridge → Step Functions → Lambda orchestration that processes security alerts end-to-end
- **HKMA Compliance**: Built-in mapping to SA-2 controls and TM-G-1 requirements with audit-ready documentation
- **Multi-Agent Architecture**: Six specialized agents (Planner, Context Executor, Analyst, Risk Orchestrator, Learning Curator, Audit Scribe) handle different investigation phases
- **Human-in-the-Loop**: Approval workflows for high-risk scenarios with immutable audit trails

## Key Features
- Read-only integrations with major security platforms (Sentinel, Splunk, Defender, CrowdStrike, Entra, Okta)
- AI-powered analysis using Amazon Bedrock (Claude 3 Haiku + Titan embeddings)
- Immutable audit logging with S3 Object Lock and KMS encryption
- Real-time metrics and compliance reporting
- Streamlit-based analyst workbench for investigation management

## Target Users
- SOC analysts at Hong Kong financial institutions
- Compliance officers requiring HKMA documentation
- Security managers overseeing incident response workflows