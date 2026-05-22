# LangChain + Qdrant Architecture Direction

## Selected Fast-Start Direction

NeoHarbor should start with the LangChain + Qdrant RAG runtime. This is the fastest
direction to demonstrate because it plugs into the existing six-agent SOC pipeline without
requiring a full JIRA, Sonar, Nexus, Harbor, Prometheus, Loki, or Grafana deployment first.

The DevSecOps and monitoring stacks remain part of the target architecture, but they enter
as tools and telemetry sinks after the RAG workflow is working.

## Architecture

```text
React Control Plane
  -> JSON-RPC / WebSocket runtime client
  -> Customer Data-Plane Runtime
  -> LangChain role-specific chains
  -> Qdrant vector retrieval
  -> Allowlisted tools
  -> Audit events and artifacts
```

## Why This Direction

- LangChain maps directly to the existing agent roles in `src/services/agents.ts`.
- Qdrant gives the Analyst and Audit Reporter grounded evidence instead of free-form LLM
  responses.
- The runtime already has `agent/execute`, `run/start`, approval, artifact, and event-stream
  boundaries, so the LangChain layer can be added behind the runtime API.
- DevSecOps systems can be introduced as tools instead of hard dependencies.
- Prometheus, Loki, and Grafana can be introduced as observability sinks after runtime events
  stabilize.

## Agent Mapping

| Agent | LangChain responsibility | Qdrant responsibility |
| --- | --- | --- |
| Planner | Create a structured investigation plan | Retrieve playbooks and similar alert plans |
| Context Executor | Call tools and retrievers | Fetch similar incidents, threat intel, and policies |
| Analyst | Produce threat type, attack vector, IOCs, confidence, and timeline | Ground findings in retrieved evidence |
| Risk Orchestrator | Score business and compliance risk | Compare against prior confirmed incidents |
| Learning Curator | Summarize feedback and detection improvements | Write reusable incident patterns |
| Audit Reporter | Generate structured compliance narrative | Cite evidence artifacts and historical context |

## Tool Direction

DevSecOps tools should be exposed to LangChain as allowlisted tools:

- JIRA: ticket history, change owner, incident follow-up tasks
- Sonar: code quality and security findings
- Nexus: package and dependency risk
- Harbor: container image provenance and vulnerability scan status
- Prometheus: runtime and service metrics
- Loki: log search by run, asset, and timestamp

## Runtime Execution Model

1. Frontend calls `run/start` or `agent/execute`.
2. Runtime maps `agent_id` to a LangChain chain.
3. Context Executor queries Qdrant for similar incidents, playbooks, and evidence summaries.
4. Agent calls only tools allowed for its role.
5. LangChain returns structured JSON matching the existing TypeScript interfaces.
6. Runtime emits `turn/started`, `item/completed`, `artifact/created`, and approval events.
7. Frontend updates the pipeline UI from runtime events.

## Demo Talk Track

The fastest credible demo is:

1. Show the dashboard AI stack card: LangChain runtime and Qdrant memory are the current
   focus.
2. Open Settings > Analysis and show the configured architecture profile.
3. Explain that DevSecOps and monitoring are integrated as controlled tools, not as direct
   frontend dependencies.
4. Run or describe one alert flow from Planner to Audit Reporter.
5. Emphasize evidence grounding, structured outputs, approvals, and auditability.

## Implementation Backlog

1. Add a runtime LangChain adapter that maps each `agent_id` to a chain.
2. Add Qdrant collection definitions for incidents, playbooks, threat intel, and evidence.
3. Add retrieval metadata to agent outputs.
4. Convert JIRA, Sonar, Nexus, and Harbor calls into role-scoped tools.
5. Export Prometheus metrics from runtime and send structured logs to Loki.
6. Build Grafana dashboards for latency, tool failures, approval rates, and evidence coverage.
