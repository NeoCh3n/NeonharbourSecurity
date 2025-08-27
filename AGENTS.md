# Claude Roadmap: Asia Agentic SOC Rollout (90–180 Days)

This document outlines the phased rollout strategy for the Asia version of the Agentic AI SOC platform. It translates the strategic plan into actionable tasks, with clear deliverables, timelines, and KPIs. The goal is to validate the POV (Proof of Value), achieve semi-automated SOC workflows, and scale into compliant, certifiable deployments within 180 days.

---

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

---