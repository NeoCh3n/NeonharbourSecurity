"""Stage-transition audit logging helpers."""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict

import boto3
from botocore.exceptions import ClientError

AUDIT_BUCKET = os.getenv("AUDIT_BUCKET", "asia-agentic-soc-audit")
S3 = boto3.client("s3")


def log_stage_event(
    *,
    tenant_id: str,
    investigation_id: str,
    stage: str,
    payload: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Persist a JSONL audit entry per stage with checksum metadata."""
    timestamp = datetime.now(timezone.utc).isoformat()
    entry = {
        "tenantId": tenant_id,
        "investigationId": investigation_id,
        "stage": stage,
        "timestamp": timestamp,
        "payload": payload or {},
    }
    serialized = json.dumps(entry, sort_keys=True)
    checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    entry["checksum_sha256"] = checksum
    body = json.dumps(entry) + "\n"
    key = (
        f"logs/{tenant_id}/{investigation_id}/"
        f"{timestamp.replace(':', '').replace('-', '')}-{stage}.jsonl"
    )
    try:
        S3.put_object(
            Bucket=AUDIT_BUCKET,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType="application/json",
            ChecksumSHA256=checksum,
        )
    except ClientError as exc:  # pragma: no cover - smoke logged via Step Functions metrics
        # Re-raise after adding context so Step Functions can catch and retry if desired
        raise RuntimeError(f"Failed to write audit log {key}: {exc}") from exc
    return {"bucket": AUDIT_BUCKET, "key": key, "checksum_sha256": checksum}
