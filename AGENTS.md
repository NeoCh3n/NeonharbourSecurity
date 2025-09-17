# Asia Agentic SOC

## Multi-Agent Pipeline (Plan → Execute → Analyze → Respond → Report)

| Stage | Primary Agent | AWS Orchestration | Responsibilities | Key Artifacts |
|-------|---------------|-------------------|------------------|---------------|
| Plan | **Planner** | EventBridge `AgenticAlert` event + Lambda Ingest | Normalise inbound Sentinel/Splunk/Defender/Okta signals, enrich with tenant metadata, persist to DynamoDB | Investigation envelope (`TENANT#*` partition) |
| Execute | **Context Executor** | Step Functions `GatherContext` task → Lambda Context | Fan-out read-only connector calls (Sentinel, Splunk, Defender, CrowdStrike, Entra, Okta) with rate-limited adapters, merge fixtures when credentials absent | Context bundle (`context` document in DDB) |
| Analyze | **Analyst** | Step Functions `SummarizeWithAI` task → Lambda Summarize + Bedrock | Run RAG-backed reasoning loop (BedrockAnalyst runnable, TODO: KiroAnalyst, AmazonQAnalyst), map findings to HKMA SA-2 / TM-G-1, return confidence, timeline, guard-railed actions | Structured summary JSON (AI provider tagged) |
| Respond | **Risk Orchestrator** | Step Functions `RiskDecider` Choice + `RequestApproval` | Compute MTTA/MTTI/MTTR/FPR deltas, classify risk, queue HITL approval (Phase B Slack/Teams/ServiceNow integration planned), enforce allow-list actions | Risk snapshot + approval request (S3 `approvals/…`) |
| Adapt | **Learning Curator** | Step Functions `AdaptInsights` task → Lambda Adapt | Capture feedback (risk outcome, actions, metrics) and call `AnalystLLM.record_feedback` for per-tenant tuning; persist adaptation hints in DynamoDB | Adaptation record (`adaptation` attribute) + JSONL audit |
| Report | **Audit Scribe** | Step Functions `WriteAuditTrail` task → Lambda Audit | Write immutable S3 JSONL, update DynamoDB status, emit metrics to CloudWatch dashboard + DynamoDB metrics table, feed compliance pack generation | Audit artifact (`audit/...json`), metrics rows |

### Agent Contract Highlights
- **Shared Memory**: DynamoDB tables `AsiaAgenticSocInvestigations-*` and `AsiaAgenticSocMetrics-*` act as short-term shared memory with KMS encryption. Each agent writes stage-specific fields while respecting tenant partitions.
- **Knowledge Retrieval**: `src/knowledge/ingest.py` builds a Bedrock-embedded RAG corpus from `/knowledge/*.md` and `/playbooks/*.md` (10–20 HK-local SOPs). Analyst agents consume this via `knowledge_context` binding.
- **Adaptive Feedback**: `AdaptInsights` stage calls `AnalystLLM.record_feedback` and stores `adaptation` hints (risk level, action counts) per tenant for future precision tuning.
- **Registry & Messaging**: `src/agents/registry.py` persists agent metadata in DynamoDB, while `src/agents/messaging.py` publishes EventBridge telemetry for each stage.
- **Compliance Hooks**: Report stage triggers `src/compliance/generate_pack.py`, bundling SA-2/TM-G-1 matrices, Mermaid diagrams, and HK encryption/retention drafts (ZIP archive) for HKMA due diligence.
- **Guardrails & Actions**: Allowed actions restricted to `ISOLATE_EC2`, `BLOCK_IP_WAF`, `DISABLE_KEYS`, `TICKET_UPSERT`. Additional actions require Phase B governance with human approvals logged to S3 Object Lock bucket.
- **Extensibility Roadmap**: Phase B introduces HITL automation (Teams/Slack approvals, ServiceNow/Jira tickets) and Detection Advisor cadence; Phase C extends integrations (email gateways, data lakes, threat intel) and SOC 2 readiness.

### AWS AI Hackathon Alignment
- **Infrastructure Footprint**: `infra/sam-template.yaml` codifies EventBridge → Lambda → Step Functions → DynamoDB/S3/KMS pipeline, CloudWatch dashboards, and least-privilege IAM policies mandated by HKMA.
- **GenAI Strategy**: Bedrock is runnable baseline (Claude 3 Haiku + Titan embeddings). `KiroAnalyst` and `AmazonQAnalyst` interfaces are stubbed with TODOs detailing expected payloads per hackathon brief, ensuring future integration without blocking the demo.
- **Compliance Focus**: `docs/hkma/` templates and `Makefile compliance` target produce HKMA SA-2/TM-G-1 packs, encryption/retention policies, and Mermaid data-flow diagrams, satisfying Phase A compliance deliverables.
- **Demo Path**: `make demo` seeds synthetic alerts (`tools/seed`) via EventBridge, recomputes KPI baselines, and launches the Streamlit workbench (`ui/app.py`) to narrate the fintech ransomware scenario within 3 minutes as required by the hackathon playbook.
- **KPIs & Auditability**: Metrics table captures MTTA/MTTI/MTTR/FPR with DynamoDB TTL for hygiene, CloudWatch dashboard surfaces state machine health, and audit bucket enforces WORM retention (7-year) via Object Lock.

## Phase A (Day 0–30) | POV Launch

**Objective:** Deliver a minimal but credible proof-of-value by integrating key data sources, ingesting local knowledge, and producing compliance-ready artifacts.

### Deliverables
1. **Anchor Data Sources**  
   - Integrate 2–3 key security data streams in read-only mode.  
     *Recommended targets:* Microsoft Sentinel or Splunk, Microsoft Defender or CrowdStrike Falcon, and Entra ID or Okta.  
   - Produce initial investigation reports with baseline KPIs:
     - MTTA (Mean Time to Acknowledge)
     - MTTI (Mean Time to Investigate)
     - MTTR (Mean Time to Resolve)
     - False Positive Rate

2. **Global Context Knowledge Base**  
   - Ingest 10–20 locally relevant SOPs, IR reports, or Wiki pages.  
   - Validate that the system can learn and apply local context in reasoning.

3. **Compliance Module (HKMA Focus)**  
   - Produce initial compliance assets to support financial sector due diligence:
     - SA-2 / TM-G-1 control matrices  
     - Data flow diagrams  
     - Encryption & retention policy drafts  
     - Segregation of duties and privilege escalation checks

---

## Phase B (Day 31–90) | Semi-Automated Response & Human-in-the-Loop

**Objective:** Move beyond read-only analysis to controlled, auditable human-in-the-loop responses, while optimizing detection coverage.

### Deliverables
1. **Human-in-the-Loop Automation**  
   - Integrate with ServiceNow/Jira for ticketing and Teams/Slack for collaboration.  
   - Enable controlled execution of remediation actions (e.g., endpoint isolation, account disablement, email recall) with mandatory human approval.  
   - Ensure complete audit logging of all actions.

2. **Detection Advisor**  
   - Deploy “noise reduction and coverage optimization” advisor.  
   - Establish bi-weekly cadence with SIEM teams for alert tuning and governance.  
   - Track metrics for alert backlog reduction.

3. **FSS Pilot Program**  
   - Co-design pilot packages with 1–2 licensed financial institutions.  
   - Define scope, user counts, exit strategy, and risk/audit controls.  
   - Establish feedback loop for iteration.

---

## Phase C (Day 91–180) | Scale & Certification

**Objective:** Broaden integrations, strengthen compliance, and leverage KPI improvements to secure first commercial contracts.

### Deliverables
1. **Expanded Integrations**  
   - Add coverage for email security gateways, data lakes, and threat intelligence feeds.  
   - Provide a “deep-dive investigation” experience that spans multiple domains.

2. **Certification & Assurance**  
   - Initiate SOC 2 Type 2 audit readiness, supported by penetration testing and red team exercises.  
   - Prepare data residency and deployment playbooks for regional compliance (e.g., Singapore MAS, Japan FSA).

3. **Commercialization**  
   - Package KPI improvements (e.g., 90% reduction in investigation time, 10× throughput increase, reduced backlog).  
   - Use pilot success metrics to negotiate and close first wave of commercial contracts.

---

## KPIs Across Phases

- **Phase A:** Demonstrated data access, first KPI baseline reports, compliance pack delivered.  
- **Phase B:** Human-in-the-loop responses executed with audit trail, detection advisor running, FSS pilot initiated.  
- **Phase C:** SOC 2 readiness confirmed, expanded integrations live, first contracts signed based on quantified KPI impact.  

---

## Notes

- **Target Customers:** Financial institutions under HKMA regulation, with expansion to Singapore and Japan.  
- **Deployment Model:** Initial POV in hybrid/on-premise environments, with optional cloud expansion.  
- **Differentiators:** Local compliance readiness, explainable reasoning, and integration-first approach.

Here’s the English conversion of your PRD + Agentic AI SOC product spec, rewritten in a structured way for Agents.md.

⸻

Product Requirements Document (PRD) – AI SOC SaaS

1. Product Overview

Positioning
A global SaaS platform providing AI-driven Security Operations Center (SOC) functions. It helps enterprises automatically analyze alerts, reduce false positives, and accelerate response speed.
Users can upload logs, integrate with SIEM/EDR tools, or call APIs to feed data. The system automatically investigates alerts and generates reports.

Target Customers
	•	SMBs (IT teams without full SOCs)
	•	SaaS & cloud-native companies (high log volume, lack of security headcount)
	•	MSSPs (Managed Security Service Providers needing efficiency gains)

⸻

2. Functional Requirements

2.1 User & Tenant Management
	•	User registration/login (email + password / SSO)
	•	Multi-tenant architecture: strict data isolation per enterprise
	•	Role-based access: Admin / Analyst / Read-only

2.2 Alert Data Ingestion
	•	File upload: CSV / JSON
	•	API integrations:
	•	Splunk (REST API)
	•	Microsoft Sentinel (Log Analytics API)
	•	Okta (login logs)
	•	Custom API (Webhook)
	•	Data storage:
	•	Postgres (metadata)
	•	S3 / MinIO (raw logs)
	•	Milvus / Weaviate (vectorized context)

2.3 AI Analysis Engine
	•	Workflow: Plan → Investigate → Report
	•	External threat intel integrations:
	•	VirusTotal API (IP/Hash reputation)
	•	AbuseIPDB (IP reputation)
	•	Output:
	•	Verdict (True Positive / False Positive)
	•	Key investigation evidence
	•	Recommended actions (quarantine host, block IP, etc.)

2.4 Reporting & Notifications
	•	Report generation: bilingual (EN/CH)
	•	Formats: Web view / PDF export / Email push
	•	Content: event summary, investigation steps, intel citations, remediation advice

2.5 Dashboard
	•	Overview: processed alerts, avg. response time, false positive rate
	•	Timeline: security incident trends
	•	Drill-down: detailed AI investigation steps per alert

2.6 Billing & Plans
	•	Free: 500 alerts/month, manual upload
	•	Pro: 10,000 alerts/month, API integrations, $99/month
	•	Enterprise: unlimited, custom/private deployment

⸻

3. User Flow

3.1 Registration & Login
	1.	User registers on SaaS platform
	2.	Email activation → Dashboard
	3.	Guided onboarding: upload logs or connect Splunk

3.2 Alert Processing
	1.	User uploads JSON/CSV or configures API key
	2.	System ingests alert → stores in DB
	3.	AI engine analyzes → extracts entities → calls intel → generates report
	4.	Report stored & visible in dashboard

3.3 Report Viewing
	1.	Dashboard → Alert list
	2.	Click an alert → view AI results
	3.	Export as PDF / send via email

3.4 Upgrade Flow
	1.	Free users hit 500 alerts → upgrade prompt
	2.	Go to Billing → choose Pro/Enterprise
	3.	Payment via Stripe/Paddle

⸻

4. API Specification (Initial)

4.1 Auth

POST /auth/register  
POST /auth/login  
GET  /auth/me  

4.2 Alert Upload

POST /alerts/upload  
Content-Type: application/json  
Body: { "alerts": [ { "src_ip": "1.2.3.4", "event": "failed login", ... } ] }

4.3 Alert Analysis

POST /alerts/analyze/{alert_id}  
Response: {
  "summary": "Suspicious login attempt from malicious IP",
  "verdict": "True Positive",
  "recommendation": "Block IP 1.2.3.4",
  "report_pdf_url": "https://.../report.pdf"
}

4.4 Alert Query

GET /alerts?status=analyzed  
Response: [ { "id": 123, "summary": "..." }, ... ]

4.5 Billing

GET /billing/usage  
POST /billing/upgrade  


⸻

5. Non-functional Requirements
	•	Security: JWT + RBAC + tenant isolation
	•	Performance: <10s per alert analysis
	•	Scalability: 1000+ concurrent enterprises
	•	Compliance: AES-256 encrypted storage, TLS in transit

⸻

6. Future Expansion (V2+)
	•	More EDR integrations (CrowdStrike, Defender ATP)
	•	Automated response (SOAR actions)
	•	Multi-agent collaboration (intel, forensics, reporting)
	•	Team collaboration (multi-user annotation & review)

⸻

Agentic AI SOC – Enhanced Product Spec

2.1 Overview

Positioning: Next-gen SOC platform combining agentic AI with orchestration.
Core Idea: AI analysts (autonomous agents with reasoning/decision-making) perform the full loop: alert analysis → investigation → response → reporting.

Flagship Modules
	•	 AI SOC Analyst: Passive alert triage & closure
	•	 AI Threat Hunter: NL-driven proactive hunting
	•	 AI Detection Advisor: Noise reduction & detection tuning

Objective: Clear backlogs, reduce false positives, cut MTTR/MTTI.

⸻

2.2 Core Workflow (Plan → Investigate → Respond → Adapt → Report)

Plan
	•	Deduplication & routing (severity, type)
	•	Entity extraction (IP, host, user, hash, geo)
	•	Generate investigation plan (key questions checklist)

Investigate
	•	ReAct-style loop: reasoning + tool calls
	•	Data sources: SIEM, EDR/XDR, IAM, Cloud, Threat Intel, Tickets, Comms, Code Repos, Email Gateways
	•	Parallel evidence collection & causal chain building

Respond
	•	Verdict + severity
	•	Remediation suggestions (block IP, isolate host, reset creds)
	•	Merge duplicates/related alerts
	•	Push outputs into SIEM/SOAR/Tickets/Collab tools

Adapt
	•	Feedback-based learning, step relevance scoring
	•	Per-tenant adaptive tuning (no cross-tenant data mixing)
	•	Precision improves over time

Report
	•	Dashboards with KPIs: backlog, MTTR, FP rate, noise sources
	•	Timeline replay of AI reasoning & actions
	•	Detection optimization insights

⸻

2.3 Agentic Architecture
	•	LLM + Agent engine: Planner, Executor, Memory, Reasoner
	•	ReAct / CoT loops
	•	Vector retrieval / RAG for context & historical correlation
	•	Light SOAR orchestration via unified connectors
	•	Auditability: full action logs, HITL guardrails

⸻

2.4 UI/UX
	•	Alert Workbench: list, AI verdicts, auto-closed tags
	•	Alert Detail: summary, evidence, timeline, actions, feedback
	•	Threat Hunter Chat: NL query → multi-source queries → evidence cards
	•	Ops Dashboard: KPIs, trends, heatmaps, top noisy rules

⸻

2.5 Integrations (Priority Set)
	•	SIEM: Sentinel, Splunk, Elastic, Sumo
	•	EDR/XDR: CrowdStrike, Cortex XDR, Defender ATP
	•	IAM: Okta, Entra ID
	•	Cloud Sec: AWS/Azure/GCP, GuardDuty, Wiz
	•	Email Sec: Proofpoint, Mimecast, M365
	•	Ops/Collab: Slack, Teams, PagerDuty, ServiceNow, Jira
	•	Threat Intel: VirusTotal, AbuseIPDB, OTX

Goal: core integrations in ≤60 minutes setup.

⸻

2.6 Deployment & Compliance
	•	SaaS (multi-tenant / isolated instances)
	•	Enterprise (On-Prem / Private Cloud)
	•	Privacy: no customer logs used for general training
	•	SOC 2 Type II (SaaS)
	•	HITL approval for critical actions

⸻

2.7 Use Cases
	1.	Large enterprise SOCs: clear backlogs, free L2/L3
	2.	Mid-size/Startups: SOC-like capabilities without 24/7 team
	3.	Tool integration glue: unify SIEM, EDR, Cloud, IAM, Tickets
	4.	MSSPs: scalable multi-tenant SOC service

⸻

2.8 Key Metrics
	•	Efficiency: MTTI, MTTR, backlog size
	•	Quality: FP reduction, AI-human alignment, review pass rate
	•	Coverage: integrated sources, cross-system hit rate
	•	Ops: auto-close ratio, HITL ratio, adoption of recs

MVP Targets
	•	≥80% faster investigations vs human
	•	≥90% FP reduction (sample/PoC)
	•	Auto-close low/medium severity, HITL for critical

⸻

2.9 Engineering Alignment

APIs
	•	Investigations: Plan, Execute, Timeline, Feedback
	•	Connectors: CRUD for integrations
	•	Actions: Quarantine, Block IP, with HITL option
	•	Reporting: Metrics, Noise sources, PDF exports

Data Models
	•	Alerts, PlanSteps, TimelineEvents, Recommendations, Feedback

Frontend
	•	Workbench, Detail with timeline/actions/feedback, Threat Hunter chat

⸻

2.10 SaaS vs Enterprise
	•	SaaS: multi-tenant, quickstart templates, regional deployment
	•	Enterprise: local inference, data residency, compliance exports

Process

                           [Data Layer (at rest)]
                     - Alerts (DB) / Existing Evidence
                     - Policies & Business Context
                     - Settings (LLM/Triage) / Audit Logs
                                   |
                                   v

                            [User / Frontend]
                                   |
                                   v
                     [Investigation API (Express)]
       /investigations/start | status | timeline | report | feedback
                                   |
                                   v
                       [Investigation Orchestrator]
        - lifecycle: planning -> executing -> analyzing -> responding -> complete
        - priority queue, concurrency limits, expiration handling
                                   |
                 +-----------------+------------------+
                 |                                    |
                 v                                    v
          [Agent Registry]                    [Agent Communication]
         (create/manage agents)              (events/messages per investigation)
                 |
                 | (shared context)
                 v
      +--------------------+      +--------------------+      +--------------------+
      |   Execution Agent  |      |   Analysis Agent   |      |   Response Agent   |
      | - parallel steps   |      | - core AI analysis |      | - recommendations  |
      | - connectors (SIEM |      | - threat intel +   |      | - approval/auto-   |
      |   /EDR/VT)         |      |   MITRE mapping    |      |   execute + rollback|
      | - evidence collect |      | - verdict + conf.  |      | - verification      |
      +---------+----------+      +----------+---------+      +----------+---------+
                |                            |                           |
                v                            v                           v
      [Connector Framework]            [AI Service]            [Policies / Approvals]
     (registry, auth, rate limit,   (LLM via `callModel`       (risk-based decisions,
      circuit breaker)                with retry/fallback)       business context)
                |                            ^                           ^
                v                            |                           |
        [External Systems]                   |                           |
        (SIEM, EDR, VirusTotal)              |                           |
                |                            |                           |
                +-------------+--------------+---------------------------+
                              |
                              v
                       [Evidence Store]
              (normalize, entities, relationships, tags)
                              |
                              v
                     [Evidence Correlator]
         (temporal, entity, behavioral, chains, lateral movement)
                              |
                              v
                      [Evidence Search]
                 (FTS, facets, similarity)
                              |
                              v
                           [Database]
                              ^
                              |
                        [Audit Logging]
      (investigation actions, API calls, AI decisions with checksums)

                              ^
                              |
                        [Reporting via API]
