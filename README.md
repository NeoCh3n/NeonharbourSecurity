
  # NeoHarbor Security

  ## Current Architecture Direction

  The fastest implementation direction is the LangChain + Qdrant RAG runtime:

  - LangChain executes the six-agent SOC pipeline behind the customer runtime.
  - Qdrant stores and retrieves similar incidents, playbooks, threat intel, and evidence summaries.
  - JIRA, Sonar, Nexus, Harbor, Prometheus, Loki, and Grafana are introduced as allowlisted tools and telemetry sinks after the RAG flow is working.
  - The React control plane keeps using JSON-RPC/WebSocket runtime events, approvals, artifacts, and audit trails.

  See `docs/langchain-qdrant-architecture.md` for the talk track and implementation backlog.
  
  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  
