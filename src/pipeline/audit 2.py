from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
AUDIT_BUCKET = os.getenv("AUDIT_BUCKET", "asia-agentic-soc-audit")
dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")


def handler(event, _context):
    investigation_id = event["investigationId"]
    tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
    now = datetime.now(timezone.utc).isoformat()

    audit_record = {
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "summary": event.get("summary"),
        "risk": event.get("risk"),
        "context": event.get("context"),
        "generatedAt": now,
    }

    key = f"audit/{tenant_id}/{investigation_id}-{int(datetime.now(timezone.utc).timestamp())}.json"
    s3.put_object(Body=json.dumps(audit_record, indent=2).encode("utf-8"), Bucket=AUDIT_BUCKET, Key=key)

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
            ":now": now,
            ":key": key,
        },
    )

    return {
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "auditKey": key,
        "updatedAt": now,
    }
