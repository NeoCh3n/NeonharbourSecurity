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

        # Start progress tracking
        self.start_processing(investigation_id, tenant_id, "Gathering context from security platforms")
        
        try:
            # Initialize connectors
            self.track_progress(
                investigation_id, tenant_id, "running", 
                "Initializing security platform connectors", 10.0
            )
            
            sentinel = SentinelClient()
            splunk = SplunkClient()
            defender = DefenderClient()
            crowdstrike = CrowdStrikeClient()
            entra = EntraClient()
            okta = OktaClient()
            
            context_payload = {}
            total_connectors = 6
            completed_connectors = 0
            
            try:
                # Gather context from each connector with progress updates
                self.track_progress(
                    investigation_id, tenant_id, "running", 
                    "Fetching alerts from Microsoft Sentinel", 20.0
                )
                context_payload["sentinel_alerts"] = sentinel.fetch_recent_alerts(limit=5)
                completed_connectors += 1
                
                self.track_progress(
                    investigation_id, tenant_id, "running", 
                    "Searching Splunk security events", 30.0
                )
                context_payload["splunk_events"] = splunk.search("search index=security | head 10", limit=10)
                completed_connectors += 1
                
                self.track_progress(
                    investigation_id, tenant_id, "running", 
                    "Retrieving Microsoft Defender alerts", 45.0
                )
                context_payload["defender_alerts"] = defender.list_alerts(limit=5)
                completed_connectors += 1
                
                self.track_progress(
                    investigation_id, tenant_id, "running", 
                    "Collecting CrowdStrike detections", 60.0
                )
                context_payload["crowdstrike_detections"] = crowdstrike.list_detections(limit=5)
                completed_connectors += 1
                
                self.track_progress(
                    investigation_id, tenant_id, "running", 
                    "Gathering Entra ID sign-in logs", 75.0
                )
                context_payload["entra_signins"] = entra.list_sign_in_logs(limit=10)
                completed_connectors += 1
                
                self.track_progress(
                    investigation_id, tenant_id, "running", 
                    "Fetching Okta security events", 90.0
                )
                context_payload["okta_events"] = okta.list_security_events(limit=10)
                completed_connectors += 1
                
            finally:
                sentinel.close()
                splunk.close()
                defender.close()
                crowdstrike.close()
                entra.close()
                okta.close()

            # Persist context data
            self.track_progress(
                investigation_id, tenant_id, "running", 
                "Persisting enriched context data", 95.0
            )

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

            # Complete progress tracking
            self.complete_processing(
                investigation_id, tenant_id,
                artifacts=["Context bundle", "Connector telemetry", f"{len(context_payload)} data sources"]
            )

            return {
                **event,
                "context": context_payload,
                "updatedAt": now,
                "audit": audit_meta,
            }
            
        except Exception as e:
            # Track failure
            self.fail_processing(investigation_id, tenant_id, str(e))
            raise
