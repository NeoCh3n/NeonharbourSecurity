Long-Horizon Planning & Memory

Goals
- Persist investigation memory across related alerts in the same case.
- Maintain a case-level plan that survives new alerts and sessions.
- Provide APIs to read/write memory and sessions for human-in-the-loop workflows.

Schema
- sessions: investigation sessions by user, linked to case/alert.
- memories: typed memory items (fact, ioc, action, hypothesis, lesson, note) with JSON value and tags.
- case_plans: canonical plan per case; alerts snapshot the plan at ingest.

APIs
- GET /cases/:id/memory -> { memory: Memory[] }
- POST /cases/:id/memory { type, key, value, tags?, importance?, sessionId? }
- GET /cases/:id/sessions -> { sessions: Session[] }
- POST /cases/:id/sessions { alertId?, title?, context? }
- GET /sessions/:sessionId -> Session
- GET /cases/:id/plan -> Case plan
- POST /cases/:id/plan { plan } -> Updates case plan
- POST /cases/:id/summarize -> Rebuild context_summary from memories (requires DEEPSEEK_API_KEY)
- POST /jobs/summarize-cases -> Summarize all cases for current user
- Existing: GET/POST /alerts/:id/plan read/update per-alert snapshot; GET uses case plan if available.

How it works
- On ingest, alerts link to a case. The backend calls getOrInitCasePlan(caseId) which
  - Reads recent memory for the case and builds a short context summary
  - Generates a plan tailored with memory context if the case has no plan yet
  - Stores/returns the case plan; alert stores a snapshot
- When fetching an alert plan, the API prefers the case plan if present.

Usage patterns
- Add memory as you learn: POST /cases/:id/memory with type=fact/ioc/action/lesson.
- Create sessions for work streams: POST /cases/:id/sessions and attach notes/memory using sessionId.
- Update case plan when scope changes: POST /cases/:id/plan.

Extending
- Add summarization of memory to update case_plans.context_summary via LLM periodically.
- Add entity-scoped memory tables if cross-case recall is needed.
- Add retention/PKCE rules aligned to HKMA/MAS/FSA.

Automation
- Optional cron: set ENABLE_SUMMARIZER_CRON=true to run background summarization every 15 minutes (requires DEEPSEEK_API_KEY).
