"""Trigger a demo investigation.

If boto3 is available, send an EventBridge event. Otherwise, fall back to
writing a local JSON file so `make demo` can proceed offline.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

try:
    import boto3  # type: ignore
    from botocore.exceptions import BotoCoreError, ClientError  # type: ignore
except Exception:  # pragma: no cover - optional dependency for offline demos
    boto3 = None
    BotoCoreError = ClientError = Exception


EVENT_BUS_NAME = os.getenv("EVENT_BUS_NAME", "AsiaAgenticSocBus")


def _trigger_eventbridge(detail: dict) -> bool:
    if boto3 is None:
        return False
    try:
        client = boto3.client("events")
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
        return True
    except (BotoCoreError, ClientError, ValueError):
        return False


def _write_local(detail: dict) -> Path:
    out_dir = Path("out")
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "last_trigger.json"
    path.write_text(json.dumps(detail, indent=2), encoding="utf-8")
    return path


def trigger() -> None:
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

    if _trigger_eventbridge(detail):
        print(f"Triggered investigation {investigation_id} via EventBridge")
    else:
        path = _write_local(detail)
        print(f"EventBridge unavailable — wrote fallback trigger to {path}")


if __name__ == "__main__":
    trigger()
