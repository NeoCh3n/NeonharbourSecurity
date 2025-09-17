"""Learning curator agent to capture feedback for adaptive tuning."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict

import boto3

from ..ai import AmazonQAnalyst, BedrockAnalyst, KiroAnalyst
from ..pipeline.journal import log_stage_event
from .base import Agent

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
dynamodb = boto3.resource("dynamodb")


class AdaptAgent(Agent):
    name = "adapt"
    stage = "adapt"

    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        investigation_id = event["investigationId"]
        tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
        analyst = self._select_analyst()

        feedback = {
            "risk": event.get("risk"),
            "recommended_actions": (event.get("summary", {}) or {}).get("recommended_actions", []),
            "metrics": event.get("risk", {}).get("metrics", {}),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            adaptation = analyst.record_feedback(
                investigation_id=investigation_id,
                tenant_id=tenant_id,
                feedback=feedback,
            )
        except NotImplementedError:
            adaptation = {"status": "queued", "provider": analyst.provider}

        table = dynamodb.Table(DDB_TABLE)
        table.update_item(
            Key={
                "pk": f"TENANT#{tenant_id}",
                "sk": f"INVESTIGATION#{investigation_id}",
            },
            UpdateExpression="SET adaptation = :adapt, updatedAt = :now",
            ExpressionAttributeValues={
                ":adapt": adaptation,
                ":now": feedback["timestamp"],
            },
        )

        audit_meta = log_stage_event(
            tenant_id=tenant_id,
            investigation_id=investigation_id,
            stage=self.stage,
            payload={
                "provider": getattr(analyst, "provider", "unknown"),
                "status": adaptation.get("status") if isinstance(adaptation, dict) else None,
            },
        )

        self.emit({"investigationId": investigation_id, "status": adaptation})

        return {
            **event,
            "adaptation": adaptation,
            "audit": audit_meta,
        }

    def _select_analyst(self):
        provider = (os.getenv("AI_PROVIDER") or "bedrock").lower()
        if provider == "kiro":
            try:
                return KiroAnalyst()
            except NotImplementedError:
                pass
        if provider == "amazonq":
            try:
                return AmazonQAnalyst()
            except NotImplementedError:
                pass
        return BedrockAnalyst()
