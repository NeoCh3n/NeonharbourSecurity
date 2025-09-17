"""Base agent abstractions for multi-agent orchestration."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class Agent(ABC):
    """Abstract agent used inside the orchestrated investigation pipeline."""

    name: str
    stage: str

    def __init__(self, messaging):
        self.messaging = messaging

    @abstractmethod
    def handle(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Process the investigation event and return an updated payload."""

    def emit(self, detail: Dict[str, Any]) -> None:
        """Publish telemetry about agent activity."""
        self.messaging.publish(agent_name=self.name, stage=self.stage, detail=detail)
