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
