Policy Guardrails and Approval Workflow

Overview
- A lightweight policy engine determines if an action is allowed, denied, or requires approval.
- Approval requests can be created, reviewed, approved/denied, and executed with full audit logging.
- Tool calls (e.g., AI, VirusTotal, stubs) use retry/backoff and error classification with optional parallelization.

Database
- policies: stores user policies with effect, action/resource patterns, and conditions.
- approval_requests: tracks per-action approval status and actors.
- action_executions: logs each tool call execution with status, retries, and error class.

Policy Evaluation
- Module: backend/policy/engine.js
- Decision: { decision: allow|deny|require_approval, reason, risk, policyId }
- Default policies installed per user on first use (backend/policy/defaults.js).

HTTP API (MVP)
- POST /actions/:id/request
  - body: { action, resource?, params?, reason? }
  - Evaluates policy; if allow => executes immediately. If require_approval => creates approval_request (pending). If deny => 403.
  - returns: { executed: boolean, result? or approvalRequestId, status, traceId }

- POST /actions/:id/execute
  - body: { action, resource?, params?, approvalRequestId? }
  - Evaluates policy; if require_approval, must include approved approvalRequestId.
  - returns: { success, result }

- GET /approvals
  - returns: { mine: ApprovalRequest[], inbox: ApprovalRequest[] }

- GET /approvals/:id
  - returns: ApprovalRequest

- POST /approvals/:id/approve
  - Enforces segregation of duties (requestor != approver).
  - returns: { success, approval }

- POST /approvals/:id/deny
  - body: { reason }
  - returns: { success, approval }

Execution Utilities
- Module: backend/utils/execution.js
  - classifyError(err): maps to timeout, network, rate_limit, server_error, auth, not_found, invalid_request, unknown.
  - withRetry(fn, opts): exponential backoff with jitter; retry on retryable classes.
  - parallelMap(items, fn, { concurrency }): run tasks concurrently with a cap.
  - toolExecutor(name, execFn, opts): wraps execution, uses withRetry, and writes to action_executions.

AI and Intel Calls
- backend/ai.js uses withRetry for DeepSeek and VirusTotal, and parallelMap for VirusTotal lookups.

Notes
- Tools are stubbed in backend/tools/; replace with real integrations.
- Extend policies/conditions for HKMA/MAS/FSA rules as needed.
- All actions and decisions are logged to audit_logs.

