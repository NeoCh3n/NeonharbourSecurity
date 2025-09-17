# Architecture

```mermaid
digraph G {
  rankdir=LR
  subgraph cluster_external {
    label="Read-Only Integrations"
    style="dashed"
    Sentinel["Microsoft Sentinel"]
    Splunk["Splunk"]
    Defender["Microsoft Defender"]
    CrowdStrike["CrowdStrike Falcon"]
    Entra["Entra ID"]
    Okta["Okta"]
  }

  subgraph cluster_pipeline {
    label="AWS Agentic Pipeline"
    EventBridge["Amazon EventBridge\nAgenticAlert"]
    StepFn["AWS Step Functions\nAsiaAgenticSocStateMachine"]
    Ingest["Lambda\nIngestFinding"]
    Context["Lambda\nGatherContext"]
    Summarize["Lambda\nSummarizeWithAI"]
    Risk["Lambda\nRiskDecider"]
    Auto["Lambda\nAutoRemediate"]
    Approval["Lambda\nRequestApproval"]
    Adapt["Lambda\nAdaptInsights"]
    Audit["Lambda\nWriteAuditTrail"]
  }

  DDBInv["DynamoDB\nInvestigations"]
  DDBMetrics["DynamoDB\nMetrics"]
  Artifacts["S3\nArtifacts Bucket"]
  AuditS3["S3 (Object Lock)\nAudit Logs"]
  Bedrock["Amazon Bedrock\nClaude 3 Haiku + Titan"]

  Sentinel -> EventBridge
  Splunk -> EventBridge
  Defender -> EventBridge
  CrowdStrike -> EventBridge
  Entra -> EventBridge
  Okta -> EventBridge

  EventBridge -> StepFn
  StepFn -> Ingest
  StepFn -> Context
  StepFn -> Summarize
  StepFn -> Risk
  StepFn -> Auto
  StepFn -> Approval
  StepFn -> Adapt
  StepFn -> Audit

  Ingest -> DDBInv
  Context -> DDBInv
  Summarize -> Bedrock
  Summarize -> DDBInv
  Risk -> DDBInv
  Risk -> DDBMetrics
  Auto -> DDBInv
  Approval -> AuditS3
  Adapt -> DDBInv
  Audit -> Artifacts
  Audit -> AuditS3
  Audit -> DDBInv
}
```

## Component Responsibilities
- **EventBridge** – central bus for `asia.agentic.soc.ingestion` events routed to Step Functions.
- **Step Functions** – orchestrates Plan → Execute → Analyze → Respond → Adapt → Report states with retries and IAM-scoped Lambda invocations.
- **Lambda Handlers** – thin Python functions stored under `src/pipeline/` and `src/remediation/`.
- **Amazon Bedrock** – executes AI summaries and embeddings with BedrockAnalyst.
- **DynamoDB Tables** – store investigation envelopes, context, metrics, and adaptation feedback per tenant.
- **S3 Buckets** – `Artifacts` for reports, `Audit` (Object Lock + KMS) for immutable JSONL log lines with checksums.
- **Connectors** – `src/connectors/*.py` provide rate-limited, read-only adapters to Sentinel/Splunk/Defender/CrowdStrike/Entra/Okta.

## Data Flow Highlights
1. EventBridge receives an `AgenticAlert` and starts the state machine.
2. Each Lambda stage writes to DynamoDB and appends an immutable JSONL audit entry (checksum recorded in metadata).
3. Bedrock produces the investigation summary and recommendations with HKMA-aware prompts.
4. Low-risk paths hit `AutoRemediate` (Phase A no-op); high-risk routes create HITL artifacts for future Slack/ServiceNow integrations.
5. `AdaptInsights` records feedback for future precision tuning per tenant, keeping data isolated.
6. `WriteAuditTrail` finalises the investigation, writes audit bundles to S3 Object Lock, and updates KPI metrics.

## Permissions Matrix (Least-Privilege Highlights)
- Lambda roles scoped to specific DynamoDB tables via SAM `*CrudPolicy` macros.
- Only Bedrock Lambda has `bedrock:InvokeModel` permissions.
- Audit bucket enforces Object Lock COMPLIANCE mode with KMS CMK rotation.
- EventBridge uses a dedicated IAM role (`EventBridgeInvokeRole`) limited to `states:StartExecution` on the state machine.
