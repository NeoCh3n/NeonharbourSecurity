"""Execution agent responsible for context gathering."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict

import boto3

from ..connectors import (
    CrowdStrikeClient,
    DefenderClient,
    EntraClient,
    OktaClient,
    SentinelClient,
    SplunkClient,
)
from ..pipeline.journal import log_stage_event
from .base import Agent

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
dynamodb = boto3.resource("dynamodb")


class ExecutionAgent(Agent):
    name = "execution"
    stage = "execute"

    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        investigation_id = event["investigationId"]
        tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")

        sentinel = SentinelClient()
        splunk = SplunkClient()
        defender = DefenderClient()
        crowdstrike = CrowdStrikeClient()
        entra = EntraClient()
        okta = OktaClient()
        try:
            context_payload = {
                "sentinel_alerts": sentinel.fetch_recent_alerts(limit=5),
                "splunk_events": splunk.search("search index=security | head 10", limit=10),
                "defender_alerts": defender.list_alerts(limit=5),
                "crowdstrike_detections": crowdstrike.list_detections(limit=5),
                "entra_signins": entra.list_sign_in_logs(limit=10),
                "okta_events": okta.list_security_events(limit=10),
            }
        finally:
            sentinel.close()
            splunk.close()
            defender.close()
            crowdstrike.close()
            entra.close()
            okta.close()

        table = dynamodb.Table(DDB_TABLE)
        now = datetime.now(timezone.utc).isoformat()
        table.update_item(
            Key={
                "pk": f"TENANT#{tenant_id}",
                "sk": f"INVESTIGATION#{investigation_id}",
            },
            UpdateExpression="SET #stage = :stage, context = :ctx, updatedAt = :now",
            ExpressionAttributeNames={"#stage": "stage"},
            ExpressionAttributeValues={
                ":stage": "contextualized",
                ":ctx": context_payload,
                ":now": now,
            },
        )

        audit_meta = log_stage_event(
            tenant_id=tenant_id,
            investigation_id=investigation_id,
            stage=self.stage,
            payload={"context_keys": list(context_payload.keys()), "updatedAt": now},
        )

        self.emit({"investigationId": investigation_id, "context": len(context_payload)})

        return {
            **event,
            "context": context_payload,
            "updatedAt": now,
            "audit": audit_meta,
        }
