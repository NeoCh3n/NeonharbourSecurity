"""Human-in-the-loop approval placeholder for Phase B."""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone

import boto3

from ..pipeline.journal import log_stage_event

AUDIT_BUCKET = os.getenv("AUDIT_BUCKET", "asia-agentic-soc-audit")
S3 = boto3.client("s3")


def handler(event, _context):
    approval_record = {
        "requestedAt": datetime.now(timezone.utc).isoformat(),
        "investigationId": event.get("investigationId"),
        "tenantId": event.get("tenantId"),
        "recommendedActions": event.get("summary", {}).get("recommended_actions", []),
        "status": "pending",
        "notes": "Phase B placeholder – integrate Slack/Teams approvals.",
    }
    serialized = json.dumps(approval_record, sort_keys=True)
    checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    key = (
        f"approvals/{approval_record['tenantId']}/"
        f"{approval_record['investigationId']}_"
        f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    S3.put_object(
        Body=json.dumps(approval_record, indent=2).encode("utf-8"),
        Bucket=AUDIT_BUCKET,
        Key=key,
        ContentType="application/json",
        ChecksumSHA256=checksum,
    )

    audit_meta = log_stage_event(
        tenant_id=approval_record["tenantId"] or "default",
        investigation_id=approval_record["investigationId"] or "unknown",
        stage="respond-hitl",
        payload={"artifact": key, "status": "pending"},
    )
    return {
        **event,
        "approval": {"status": "pending", "artifact": key, "audit": audit_meta},
    }
