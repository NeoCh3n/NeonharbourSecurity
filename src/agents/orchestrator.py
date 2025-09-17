"""Coordinator that dispatches investigation stages to registered agents."""
from __future__ import annotations

from typing import Any, Dict

from .registry import AgentRegistry


class Orchestrator:
    def __init__(self) -> None:
        self._registry = AgentRegistry()

    def dispatch(self, stage: str, event: Dict[str, Any]) -> Dict[str, Any]:
        agent = self._registry.instantiate(stage)
        return agent.handle(event)


_default_orchestrator: Orchestrator | None = None


def get_orchestrator() -> Orchestrator:
    global _default_orchestrator
    if _default_orchestrator is None:
        _default_orchestrator = Orchestrator()
    return _default_orchestrator
