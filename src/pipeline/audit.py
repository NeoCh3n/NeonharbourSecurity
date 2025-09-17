from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone

import boto3

from .journal import log_stage_event

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
AUDIT_BUCKET = os.getenv("AUDIT_BUCKET", "asia-agentic-soc-audit")
dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")


def handler(event, _context):
    investigation_id = event["investigationId"]
    tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
    now = datetime.now(timezone.utc)
    generated_at = now.isoformat()

    audit_record = {
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "summary": event.get("summary"),
        "risk": event.get("risk"),
        "context": event.get("context"),
        "generatedAt": generated_at,
    }

    serialized = json.dumps(audit_record, sort_keys=True)
    checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    audit_record["checksum_sha256"] = checksum

    body = json.dumps(audit_record, indent=2)
    key = (
        f"audit/{tenant_id}/{investigation_id}-"
        f"{now.strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    s3.put_object(
        Body=body.encode("utf-8"),
        Bucket=AUDIT_BUCKET,
        Key=key,
        ContentType="application/json",
        ChecksumSHA256=checksum,
    )

    table = dynamodb.Table(DDB_TABLE)
    table.update_item(
        Key={
            "pk": f"TENANT#{tenant_id}",
            "sk": f"INVESTIGATION#{investigation_id}",
        },
        UpdateExpression="SET #stage = :stage, status = :status, updatedAt = :now, auditKey = :key",
        ExpressionAttributeNames={"#stage": "stage"},
        ExpressionAttributeValues={
            ":stage": "completed",
            ":status": "closed",
            ":now": generated_at,
            ":key": key,
        },
    )

    audit_meta = log_stage_event(
        tenant_id=tenant_id,
        investigation_id=investigation_id,
        stage="report",
        payload={"auditKey": key, "checksum_sha256": checksum},
    )

    return {
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "auditKey": key,
        "updatedAt": generated_at,
        "audit": audit_meta,
    }
