"""Recompute KPI baseline metrics from DynamoDB or local seeds.

This module works offline. boto3 is optional; if missing or AWS access fails,
we fall back to a static baseline so `make demo` can continue.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Dict

METRICS_TABLE = os.getenv("DDB_METRICS_TABLE", "AsiaAgenticSocMetrics-dev")
OUTPUT_PATH = Path(os.getenv("METRICS_BASELINE_OUTPUT", "out/metrics_baseline.json"))


def fetch_metrics(metric_date: str) -> Dict[str, float]:
    # Lazy import to allow offline demo without boto3
    try:
        import boto3  # type: ignore
        from botocore.exceptions import BotoCoreError, ClientError  # type: ignore

        client = boto3.resource("dynamodb")
        table = client.Table(METRICS_TABLE)
        try:
            result = table.query(
                KeyConditionExpression="metric_date = :date",
                ExpressionAttributeValues={":date": metric_date},
            )
        except (ClientError, BotoCoreError, ValueError):
            return {}
    except Exception:
        return {}
    metrics: Dict[str, float] = {}
    for item in result.get("Items", []):
        value = item.get("value")
        if isinstance(value, Decimal):
            value = float(value)
        metrics[item["metric_name"]] = value
    return metrics


def write_baseline(metrics: Dict[str, float]) -> Path:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return OUTPUT_PATH


def main() -> None:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    metrics = fetch_metrics(today)
    if not metrics:
        metrics = {"MTTA": 10.0, "MTTI": 20.0, "MTTR": 180.0, "FPR": 0.1}
    path = write_baseline(metrics)
    print(f"Baseline metrics written to {path}")


if __name__ == "__main__":
    main()
