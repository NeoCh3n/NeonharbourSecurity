"""Response agent computing risk and metrics."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict

import boto3

from ..pipeline.journal import log_stage_event
from .base import Agent

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
METRICS_TABLE = os.getenv("DDB_METRICS_TABLE", "AsiaAgenticSocMetrics-dev")
dynamodb = boto3.resource("dynamodb")


class ResponseAgent(Agent):
    name = "response"
    stage = "respond"

    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        summary = event.get("summary", {})
        severity = summary.get("risk_level") or summary.get("severity") or event.get("alert", {}).get("severity")
        threshold = os.getenv("RISK_HIGH_SEVERITY", "high")
        risk_level = "high" if str(severity).lower() in {"high", "critical", threshold} else "low"

        metrics_snapshot = self._compute_metrics(event)

        tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
        investigation_id = event["investigationId"]
        now = datetime.now(timezone.utc).isoformat()

        table = dynamodb.Table(DDB_TABLE)
        table.update_item(
            Key={
                "pk": f"TENANT#{tenant_id}",
                "sk": f"INVESTIGATION#{investigation_id}",
            },
            UpdateExpression="SET riskLevel = :risk, metricsSnapshot = :metrics, updatedAt = :now",
            ExpressionAttributeValues={
                ":risk": risk_level,
                ":metrics": metrics_snapshot,
                ":now": now,
            },
        )

        metrics_table = dynamodb.Table(METRICS_TABLE)
        date_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for name, value in metrics_snapshot.items():
            metrics_table.put_item(
                Item={
                    "metric_date": date_key,
                    "metric_name": name,
                    "value": Decimal(str(value)),
                    "updatedAt": now,
                }
            )

        audit_meta = log_stage_event(
            tenant_id=tenant_id,
            investigation_id=investigation_id,
            stage=self.stage,
            payload={"risk_level": risk_level, "metrics": metrics_snapshot},
        )

        self.emit({"investigationId": investigation_id, "risk_level": risk_level})

        return {
            **event,
            "risk": {
                "level": risk_level,
                "metrics": metrics_snapshot,
            },
            "updatedAt": now,
            "audit": audit_meta,
        }

    def _compute_metrics(self, event: Dict[str, Any]) -> Dict[str, float]:
        received = self._parse_ts(event.get("receivedAt"))
        acknowledged = self._parse_ts(event.get("acknowledgedAt")) or received
        investigation_start = self._parse_ts(event.get("investigationStartedAt")) or acknowledged
        resolved = self._parse_ts(event.get("resolvedAt")) or investigation_start

        def delta_minutes(end, start):
            if not end or not start:
                return 0.0
            return max((end - start).total_seconds() / 60.0, 0.0)

        metrics = {
            "MTTA": delta_minutes(acknowledged, received),
            "MTTI": delta_minutes(investigation_start, received),
            "MTTR": delta_minutes(resolved, received),
            "FPR": float(event.get("falsePositiveRate", 0.0)),
        }
        return metrics

    @staticmethod
    def _parse_ts(value):
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value))
        except ValueError:
            return None
