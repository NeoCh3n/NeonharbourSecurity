"""Safe auto-remediation placeholder for Phase A."""
from __future__ import annotations

import os
from datetime import datetime, timezone

import boto3

from ..pipeline.journal import log_stage_event

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
dynamodb = boto3.resource("dynamodb")


def handler(event, _context):
    investigation_id = event["investigationId"]
    tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
    now = datetime.now(timezone.utc).isoformat()

    table = dynamodb.Table(DDB_TABLE)
    table.update_item(
        Key={
            "pk": f"TENANT#{tenant_id}",
            "sk": f"INVESTIGATION#{investigation_id}",
        },
        UpdateExpression="SET autoRemediation = :auto, updatedAt = :now",
        ExpressionAttributeValues={
            ":auto": {
                "status": "noop",
                "reason": "Phase A demo - no real action executed",
                "timestamp": now,
            },
            ":now": now,
        },
    )

    audit_meta = log_stage_event(
        tenant_id=tenant_id,
        investigation_id=investigation_id,
        stage="respond-auto",
        payload={"mode": "noop", "timestamp": now},
    )

    return {
        **event,
        "autoRemediation": {"status": "noop", "timestamp": now},
        "audit": audit_meta,
    }
