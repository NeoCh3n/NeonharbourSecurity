from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import boto3

from .journal import log_stage_event

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
DEFAULT_TENANT = os.getenv("DEFAULT_TENANT_ID", "default")

dynamodb = boto3.resource("dynamodb")


def handler(event, _context):
    detail = event.get("detail", event)
    investigation_id = detail.get("investigationId") or str(uuid.uuid4())
    tenant_id = detail.get("tenantId") or DEFAULT_TENANT
    received_at = detail.get("receivedAt") or datetime.now(timezone.utc).isoformat()

    record = {
        "pk": f"TENANT#{tenant_id}",
        "sk": f"INVESTIGATION#{investigation_id}",
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "stage": "received",
        "status": "received",
        "alert": detail.get("alert", {}),
        "receivedAt": received_at,
        "createdAt": received_at,
        "updatedAt": received_at,
    }

    table = dynamodb.Table(DDB_TABLE)
    table.put_item(Item=record)

    audit_meta = log_stage_event(
        tenant_id=tenant_id,
        investigation_id=investigation_id,
        stage="plan",
        payload={
            "receivedAt": received_at,
            "alert": detail.get("alert", {}),
            "source": detail.get("source", "eventbridge"),
        },
    )

    return {
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "alert": detail.get("alert", {}),
        "receivedAt": received_at,
        "audit": audit_meta,
    }
