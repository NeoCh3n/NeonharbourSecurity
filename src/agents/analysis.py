"""Analysis agent leveraging Bedrock/Kiro/AmazonQ backends."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import boto3

from ..ai import AmazonQAnalyst, AnalystLLM, BedrockAnalyst, KiroAnalyst
from ..pipeline.journal import log_stage_event
from .base import Agent

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
dynamodb = boto3.resource("dynamodb")


class AnalysisAgent(Agent):
    name = "analysis"
    stage = "analyze"

    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        investigation_id = event["investigationId"]
        tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
        analyst = self._select_analyst()
        try:
            summary = analyst.summarize_investigation(event)
        except NotImplementedError:
            fallback = BedrockAnalyst()
            summary = fallback.summarize_investigation(event)
            summary["provider"] = "bedrock"

        knowledge = self._load_knowledge_summary()
        summary["knowledge_context"] = list(knowledge.values())[:5]

        now = datetime.now(timezone.utc).isoformat()
        table = dynamodb.Table(DDB_TABLE)
        table.update_item(
            Key={
                "pk": f"TENANT#{tenant_id}",
                "sk": f"INVESTIGATION#{investigation_id}",
            },
            UpdateExpression="SET #stage = :stage, summary = :summary, updatedAt = :now",
            ExpressionAttributeNames={"#stage": "stage"},
            ExpressionAttributeValues={
                ":stage": "summarized",
                ":summary": summary,
                ":now": now,
            },
        )

        audit_meta = log_stage_event(
            tenant_id=tenant_id,
            investigation_id=investigation_id,
            stage=self.stage,
            payload={
                "provider": summary.get("provider"),
                "latency_ms": summary.get("latency_ms"),
                "risk_level": summary.get("risk_level"),
            },
        )

        self.emit({"investigationId": investigation_id, "provider": summary.get("provider")})

        return {
            **event,
            "summary": summary,
            "updatedAt": now,
            "audit": audit_meta,
        }

    def _select_analyst(self) -> AnalystLLM:
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

    def _load_knowledge_summary(self) -> Dict[str, str]:
        store_path = Path(os.getenv("KNOWLEDGE_STORE", "out/knowledge_store.json"))
        if not store_path.exists():
            return {}
        try:
            data = json.loads(store_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
        topics: Dict[str, str] = {}
        for entry in data:
            tags = ",".join(entry.get("tags", []))
            topics[entry.get("chunk_id") or entry.get("doc_id")] = (
                f"Tags: {tags}\n{entry.get('content', '')[:300]}"
            )
        return topics
