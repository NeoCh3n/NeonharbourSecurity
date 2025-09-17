"""Agent registry backed by DynamoDB with in-memory fallback."""
from __future__ import annotations

import os
from typing import Dict, Type

import boto3
from botocore.exceptions import ClientError

from .base import Agent
from .messaging import AgentBus

DDB_AGENTS_TABLE = os.getenv("DDB_AGENTS_TABLE", "AsiaAgenticSocAgents-dev")

dynamodb = boto3.resource("dynamodb")

_DEFAULT_DEFINITIONS = {
    "execute": {"agent_name": "execution", "stage": "execute", "class": "ExecutionAgent"},
    "analyze": {"agent_name": "analysis", "stage": "analyze", "class": "AnalysisAgent"},
    "respond": {"agent_name": "response", "stage": "respond", "class": "ResponseAgent"},
    "adapt": {"agent_name": "adapt", "stage": "adapt", "class": "AdaptAgent"},
}


class AgentRegistry:
    def __init__(self) -> None:
        self._table = dynamodb.Table(DDB_AGENTS_TABLE)
        self._cache: Dict[str, Dict[str, str]] = {}
        self._ensure_defaults()

    def _ensure_defaults(self) -> None:
        for stage, definition in _DEFAULT_DEFINITIONS.items():
            try:
                self._table.put_item(
                    Item={
                        "agent_name": definition["agent_name"],
                        "stage": stage,
                        "class": definition["class"],
                    },
                    ConditionExpression="attribute_not_exists(agent_name)",
                )
            except ClientError as exc:  # ignore conditional failures
                if exc.response["Error"].get("Code") != "ConditionalCheckFailedException":
                    raise

    def _load_definition(self, stage: str) -> Dict[str, str]:
        if stage in self._cache:
            return self._cache[stage]
        response = self._table.get_item(Key={"agent_name": _DEFAULT_DEFINITIONS[stage]["agent_name"]})
        item = response.get("Item")
        if not item:
            item = _DEFAULT_DEFINITIONS[stage]
        self._cache[stage] = item
        return item

    def instantiate(self, stage: str) -> Agent:
        definition = self._load_definition(stage)
        klass = _resolve_class(stage)
        agent = klass(AgentBus())
        agent.name = definition.get("agent_name", agent.name)
        agent.stage = stage
        return agent


def _resolve_class(stage: str) -> Type[Agent]:
    from .execution import ExecutionAgent
    from .analysis import AnalysisAgent
    from .response import ResponseAgent
    from .adapt import AdaptAgent

    mapping: Dict[str, Type[Agent]] = {
        "execute": ExecutionAgent,
        "analyze": AnalysisAgent,
        "respond": ResponseAgent,
        "adapt": AdaptAgent,
    }
    if stage not in mapping:
        raise ValueError(f"Unknown agent stage: {stage}")
    return mapping[stage]
