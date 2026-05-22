export type AiStackCapability = {
  id: string;
  name: string;
  status: 'ready' | 'planned';
  description: string;
  implementation: string;
};

export const aiStackProfile = {
  name: 'LangChain RAG Runtime',
  llmFramework: 'LangChain',
  vectorDb: 'Qdrant',
  primaryUseCase: 'SOC alert triage with evidence-grounded threat analysis',
  runtimeBoundary: 'Customer data-plane runtime',
  orchestration: 'Six-agent incident pipeline with structured outputs',
  capabilities: [
    {
      id: 'langchain',
      name: 'LangChain agent runtime',
      status: 'ready',
      description: 'Planner, context, analyst, risk, learning, and audit agents execute as runtime chains.',
      implementation: 'Runtime receives agent/execute requests and maps each role to a structured LangChain chain.',
    },
    {
      id: 'qdrant',
      name: 'Qdrant evidence memory',
      status: 'ready',
      description: 'Similar incidents, playbooks, threat intel, and evidence summaries are retrieved before analysis.',
      implementation: 'Context Executor retrieves vector matches and passes grounded evidence to Analyst and Audit Reporter.',
    },
    {
      id: 'devsecops',
      name: 'DevSecOps evidence tools',
      status: 'planned',
      description: 'JIRA, Sonar, Nexus, and Harbor become allowlisted tools for change, code, artifact, and image context.',
      implementation: 'Tool calls enrich alerts with ticket history, code quality findings, package risk, and image provenance.',
    },
    {
      id: 'monitoring',
      name: 'Observability pipeline',
      status: 'planned',
      description: 'Prometheus, Loki, and Grafana provide runtime health, agent latency, and audit-event dashboards.',
      implementation: 'Runtime emits metrics and logs per run_id, agent_id, tool_name, and approval decision.',
    },
  ] satisfies AiStackCapability[],
};

export const getCapabilityStatus = (id: string) => (
  aiStackProfile.capabilities.find((capability) => capability.id === id)?.status ?? 'planned'
);
