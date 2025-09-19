"""Data access helpers for API endpoints."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    EndpointConnectionError,
    NoCredentialsError,
)

PIPELINE_STAGES: List[Dict[str, str]] = [
    {"stage": "plan", "label": "Plan", "agent": "Planner"},
    {"stage": "execute", "label": "Execute", "agent": "Context Executor"},
    {"stage": "analyze", "label": "Analyze", "agent": "Analyst"},
    {"stage": "respond", "label": "Respond", "agent": "Risk Orchestrator"},
    {"stage": "adapt", "label": "Adapt", "agent": "Learning Curator"},
    {"stage": "report", "label": "Report", "agent": "Audit Scribe"},
]

SEED_INVESTIGATIONS_PATH = Path(
    os.getenv("SEED_INVESTIGATIONS_PATH", "tools/seed/investigations_sample.json")
)
SEED_DETAILS_PATH = Path(
    os.getenv("SEED_INVESTIGATION_DETAILS_PATH", "tools/seed/investigation_detail.json")
)

INVESTIGATIONS_TABLE = os.getenv(
    "DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev"
)
AUDIT_BUCKET = os.getenv("AUDIT_BUCKET", "asia-agentic-soc-audit")

BOTO_CONFIG = Config(connect_timeout=1, read_timeout=1, retries={"max_attempts": 1})


@dataclass
class InvestigationRecord:
    data: Dict[str, Any]

    @property
    def investigation_id(self) -> Optional[str]:
        return self.data.get("investigationId")

    @property
    def tenant_id(self) -> Optional[str]:
        return self.data.get("tenantId")

    def normalised(self) -> Dict[str, Any]:
        record = dict(self.data)
        record.setdefault("investigationId", self.investigation_id)
        record.setdefault("tenantId", self.tenant_id)
        return record


class InvestigationRepository:
    """Abstraction over DynamoDB/S3 with seed fallback."""

    def __init__(self) -> None:
        self._dynamodb = boto3.resource("dynamodb", config=BOTO_CONFIG)
        self._table = self._dynamodb.Table(INVESTIGATIONS_TABLE)
        self._s3 = boto3.client("s3", config=BOTO_CONFIG)
        self._seed_investigations = self._load_seed_investigations()
        self._seed_details = self._load_seed_details()

    # ------------------------------------------------------------------
    # Seed helpers
    def _load_seed_investigations(self) -> List[Dict[str, Any]]:
        if not SEED_INVESTIGATIONS_PATH.exists():
            return []
        try:
            payload = json.loads(SEED_INVESTIGATIONS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        if isinstance(payload, dict):
            return payload.get("items") or []
        if isinstance(payload, list):
            return payload
        return []

    def _load_seed_details(self) -> Dict[str, Dict[str, Any]]:
        if not SEED_DETAILS_PATH.exists():
            return {}
        try:
            payload = json.loads(SEED_DETAILS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
        if isinstance(payload, dict):
            return payload
        return {}

    # ------------------------------------------------------------------
    # Dynamo access with graceful fallback
    def list_investigations(self) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        try:
            response = self._table.scan(Limit=200)
            records.extend(self._extract_scan_items(response))
            while "LastEvaluatedKey" in response:
                response = self._table.scan(
                    ExclusiveStartKey=response["LastEvaluatedKey"],
                    Limit=200,
                )
                records.extend(self._extract_scan_items(response))
        except (ClientError, BotoCoreError, NoCredentialsError, EndpointConnectionError):
            return [dict(item) for item in self._seed_investigations]

        if not records:
            return [dict(item) for item in self._seed_investigations]
        return records

    def _extract_scan_items(self, response: Dict[str, Any]) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for item in response.get("Items", []):
            record = self._normalise_item(item)
            results.append(record)
        return results

    def get_investigation(self, investigation_id: str) -> Optional[Dict[str, Any]]:
        seed = self._seed_details.get(investigation_id)
        record: Optional[Dict[str, Any]] = None
        try:
            items = self._table.scan(
                FilterExpression="investigationId = :iid",
                ExpressionAttributeValues={":iid": investigation_id},
                Limit=1,
            )
            results = items.get("Items") or []
            if results:
                record = self._normalise_item(results[0])
        except (ClientError, BotoCoreError, NoCredentialsError, EndpointConnectionError):
            record = None
        if record:
            return record
        if seed:
            return dict(seed)
        return None

    def get_stage_payload(
        self, investigation_id: str, stage: str
    ) -> Optional[Dict[str, Any]]:
        detail = self.get_investigation(investigation_id)
        if not detail:
            return None
        timeline = self.get_timeline(investigation_id)
        timeline_entry = next(
            (entry for entry in timeline if entry.get("stage") == stage), None
        )
        if timeline_entry and isinstance(timeline_entry.get("payload"), dict):
            return timeline_entry["payload"]
        return self._derive_stage_payload(detail, stage)

    def get_timeline(self, investigation_id: str) -> List[Dict[str, Any]]:
        detail = self.get_investigation(investigation_id)
        if not detail:
            return []
        tenant_id = detail.get("tenantId")
        events: List[Dict[str, Any]] = []

        # Try DynamoDB stored timeline first
        timeline_attr = detail.get("timeline")
        if isinstance(timeline_attr, list):
            events.extend(self._normalise_raw_events(timeline_attr))

        # Attempt S3 audit logs
        if tenant_id:
            events.extend(self._load_audit_events(tenant_id, investigation_id))

        # Remove duplicates by stage + timestamp
        deduped: Dict[str, Dict[str, Any]] = {}
        for event in events:
            key = f"{event.get('stage')}::{event.get('timestamp')}"
            deduped[key] = event
        ordered_events = sorted(
            deduped.values(), key=lambda item: item.get("timestamp") or ""
        )

        synthesized = self._build_stage_timeline(detail, ordered_events)
        return synthesized

    # ------------------------------------------------------------------
    def _normalise_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        result = {k: v for k, v in item.items() if k not in {"pk", "sk"}}
        if "investigationId" not in result:
            sk = item.get("sk", "")
            if isinstance(sk, str) and "INVESTIGATION#" in sk:
                result["investigationId"] = sk.split("#", 1)[-1]
        if "tenantId" not in result:
            pk = item.get("pk", "")
            if isinstance(pk, str) and "TENANT#" in pk:
                result["tenantId"] = pk.split("#", 1)[-1]
        return result

    def _derive_stage_payload(
        self, detail: Dict[str, Any], stage: str
    ) -> Dict[str, Any]:
        if stage == "plan":
            return {
                "alert": detail.get("alert", {}),
                "tenantId": detail.get("tenantId"),
                "receivedAt": detail.get("receivedAt"),
            }
        if stage == "execute":
            return detail.get("context", {}) or {}
        if stage == "analyze":
            return detail.get("summary", {}) or {}
        if stage == "respond":
            return detail.get("risk", {}) or {}
        if stage == "adapt":
            return detail.get("adaptation", {}) or {}
        if stage == "report":
            return detail.get("audit", {}) or {}
        return {}

    def _load_audit_events(
        self, tenant_id: str, investigation_id: str
    ) -> List[Dict[str, Any]]:
        prefix = f"logs/{tenant_id}/{investigation_id}/"
        events: List[Dict[str, Any]] = []
        try:
            response = self._s3.list_objects_v2(Bucket=AUDIT_BUCKET, Prefix=prefix)
        except (ClientError, BotoCoreError, NoCredentialsError, EndpointConnectionError):
            return []
        for obj in response.get("Contents", []):
            key = obj.get("Key")
            if not key:
                continue
            try:
                body = self._s3.get_object(Bucket=AUDIT_BUCKET, Key=key)["Body"].read()
            except (ClientError, BotoCoreError, NoCredentialsError, EndpointConnectionError):
                continue
            try:
                lines = body.decode("utf-8").splitlines()
            except UnicodeDecodeError:
                continue
            for line in lines:
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                events.append(self._normalise_audit_event(payload))
        return events

    def _normalise_audit_event(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "stage": (payload.get("stage") or "").lower(),
            "timestamp": payload.get("timestamp"),
            "payload": payload.get("payload", {}),
        }

    def _normalise_raw_events(
        self, events: Iterable[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for event in events:
            if not isinstance(event, dict):
                continue
            normalized.append(self._normalise_audit_event(event))
        return normalized

    # ------------------------------------------------------------------
    def _build_stage_timeline(
        self,
        detail: Dict[str, Any],
        ordered_events: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        events_by_stage: Dict[str, Dict[str, Any]] = {}
        for event in ordered_events:
            stage_key = event.get("stage")
            if stage_key:
                events_by_stage[stage_key] = event

        timeline: List[Dict[str, Any]] = []
        prev_completed = _parse_iso(detail.get("receivedAt"))
        for stage in PIPELINE_STAGES:
            stage_key = stage["stage"]
            entry = events_by_stage.get(stage_key, {})
            payload = entry.get("payload") if isinstance(entry, dict) else {}
            derived_payload = self._derive_stage_payload(detail, stage_key)
            if not payload:
                payload = derived_payload
            started_at = entry.get("startedAt") or entry.get("timestamp")
            completed_at = entry.get("completedAt") or entry.get("timestamp")
            if not started_at and prev_completed:
                started_at = _format_iso(prev_completed)
            if not completed_at:
                completed_at = _extract_timestamp(payload) or started_at
            started_dt = _parse_iso(started_at)
            completed_dt = _parse_iso(completed_at)
            if completed_dt and started_dt and completed_dt < started_dt:
                completed_dt = started_dt
            duration = None
            if started_dt and completed_dt:
                duration = max((completed_dt - started_dt).total_seconds(), 0.0)
                prev_completed = completed_dt
            elif completed_dt:
                prev_completed = completed_dt

            status = "Completed" if payload else "Pending"
            timeline.append(
                {
                    "stage": stage_key,
                    "label": stage["label"],
                    "agent": stage["agent"],
                    "status": status,
                    "startedAt": _format_iso(started_dt) if started_dt else None,
                    "completedAt": _format_iso(completed_dt) if completed_dt else None,
                    "durationSeconds": duration,
                    "payload": payload,
                }
            )
        return timeline


# ----------------------------------------------------------------------
# Utilities


def _parse_iso(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        text = str(value)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _format_iso(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _extract_timestamp(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    for key in ("completedAt", "updatedAt", "timestamp", "generated_at"):
        if payload.get(key):
            return str(payload[key])
    return None
