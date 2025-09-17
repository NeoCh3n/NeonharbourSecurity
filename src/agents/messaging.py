"""Simple EventBridge-backed pub/sub for agent coordination."""
from __future__ import annotations

import json
import os
from typing import Any, Dict

import boto3


class AgentBus:
    def __init__(self) -> None:
        self._bus_name = os.getenv("EVENT_BUS_NAME", "AsiaAgenticSocBus")
        self._client = boto3.client("events")

    def publish(self, *, agent_name: str, stage: str, detail: Dict[str, Any]) -> None:
        payload = {
            "agent": agent_name,
            "stage": stage,
            "detail": detail,
        }
        self._client.put_events(
            Entries=[
                {
                    "EventBusName": self._bus_name,
                    "Source": "asia.agentic.soc.agent",
                    "DetailType": "AgentStageTransition",
                    "Detail": json.dumps(payload, default=str),
                }
            ]
        )
