from __future__ import annotations

from ..agents import get_orchestrator


def handler(event, _context):
    orchestrator = get_orchestrator()
    return orchestrator.dispatch("adapt", event)
