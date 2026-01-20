# NeoHarbor Runtime Event Contract

This document captures the JSON-RPC event envelope, required fields, and example payloads
for UI development and replayable audit trails.

## JSON-RPC Envelope

Notifications are server -> client event streams:

```json
{"method": "run/started", "params": {"run_id": "run_123", "sequence": 1}}
```

Responses are request -> response:

```json
{"id": 1, "result": {"run_id": "run_123"}}
```

## Required Fields

Every emitted event must include:

- `run_id`
- `agent_id`
- `thread_id`
- `turn_id`
- `item_id`
- `sequence`
- `ts`
- `schema_version`

The control plane validates these fields and quarantines events missing `run_id`.

## Event Types

- `run/started`, `run/completed`, `run/failed`
- `turn/started`, `turn/completed`, `turn/failed`
- `item/created`, `item/updated`, `item/completed`
- `tool/started`, `tool/completed`, `tool/failed`
- `approval/requested`, `approval/approved`, `approval/rejected`, `approval/expired`
- `artifact/created`

## Artifact Ref Schema

```json
{
  "artifact_ref": {
    "sha256": "...",
    "size": 10240,
    "content_type": "application/pdf",
    "redaction": "metadata-only",
    "uri": "s3://customer-bucket/evidence/sha256"
  }
}
```

## Sample Payloads

### Run started

```json
{
  "method": "run/started",
  "params": {
    "run_id": "run_123",
    "agent_id": "planner",
    "thread_id": "thread_01",
    "turn_id": "turn_01",
    "item_id": "item_01",
    "sequence": 1,
    "ts": "2025-01-20T12:00:00Z",
    "schema_version": "1.0",
    "alert": {
      "id": "AL-2025-001",
      "title": "Suspicious API calls",
      "severity": "high",
      "source": "GuardDuty",
      "timestamp": "2025-01-20T11:58:00Z"
    }
  }
}
```

### Approval request

```json
{
  "method": "approval/requested",
  "params": {
    "run_id": "run_123",
    "agent_id": "risk-orchestrator",
    "thread_id": "thread_01",
    "turn_id": "turn_04",
    "item_id": "item_42",
    "sequence": 17,
    "ts": "2025-01-20T12:03:00Z",
    "schema_version": "1.0",
    "request_id": "approval_989",
    "title": "Isolate endpoint",
    "description": "Quarantine host ec2-123",
    "risk": "high",
    "payload": {"asset_id": "ec2-123", "action": "isolate"}
  }
}
```

### Artifact created

```json
{
  "method": "artifact/created",
  "params": {
    "run_id": "run_123",
    "agent_id": "audit-reporter",
    "thread_id": "thread_01",
    "turn_id": "turn_07",
    "item_id": "item_91",
    "sequence": 31,
    "ts": "2025-01-20T12:10:00Z",
    "schema_version": "1.0",
    "artifact_ref": {
      "sha256": "abc123",
      "size": 2048,
      "content_type": "application/pdf",
      "redaction": "metadata-only",
      "uri": "s3://customer-bucket/evidence/abc123"
    }
  }
}
```

## Resume From Sequence

When reconnecting, the client calls `run/subscribe` with `resume_from_sequence`. The runtime
should replay all events with `sequence` greater than the cursor.
