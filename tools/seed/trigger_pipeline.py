"""Trigger a demo investigation via EventBridge."""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

import boto3

EVENT_BUS_NAME = os.getenv("EVENT_BUS_NAME", "AsiaAgenticSocBus")
client = boto3.client("events")


def trigger():
    investigation_id = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    detail = {
        "investigationId": investigation_id,
        "tenantId": os.getenv("DEFAULT_TENANT_ID", "hk-demo"),
        "alert": {
            "source": "sentinel",
            "title": "Demo suspicious login",
            "severity": "high",
        },
        "receivedAt": datetime.now(timezone.utc).isoformat(),
    }
    client.put_events(
        Entries=[
            {
                "EventBusName": EVENT_BUS_NAME,
                "Source": "asia.agentic.soc.ingestion",
                "DetailType": "AgenticAlert",
                "Detail": json.dumps(detail),
            }
        ]
    )
    print(f"Triggered investigation {investigation_id}")


if __name__ == "__main__":
    trigger()
