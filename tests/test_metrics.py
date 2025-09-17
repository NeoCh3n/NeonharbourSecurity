from datetime import datetime, timezone

from src.agents.response import ResponseAgent


class StubBus:
    def publish(self, **kwargs):  # pragma: no cover - noop bus
        return None


class StubTable:
    def __init__(self):
        self.items = []

    def update_item(self, **kwargs):  # pragma: no cover - simple stub
        self.items.append(("update", kwargs))

    def put_item(self, **kwargs):  # pragma: no cover - simple stub
        self.items.append(("put", kwargs))


class StubDynamo:
    def __init__(self):
        self.tables = {}

    def Table(self, name):
        table = self.tables.setdefault(name, StubTable())
        return table


def test_response_agent_metrics(monkeypatch):
    from src.agents import response as response_module

    stub_dynamo = StubDynamo()
    monkeypatch.setattr(response_module, "dynamodb", stub_dynamo)
    monkeypatch.setattr(response_module, "log_stage_event", lambda **kwargs: {"stage": kwargs["stage"]})

    agent = ResponseAgent(StubBus())

    event = {
        "investigationId": "inv-1",
        "tenantId": "tenant-1",
        "receivedAt": datetime(2024, 2, 12, 3, 0, tzinfo=timezone.utc).isoformat(),
        "acknowledgedAt": datetime(2024, 2, 12, 3, 5, tzinfo=timezone.utc).isoformat(),
        "investigationStartedAt": datetime(2024, 2, 12, 3, 15, tzinfo=timezone.utc).isoformat(),
        "resolvedAt": datetime(2024, 2, 12, 6, 0, tzinfo=timezone.utc).isoformat(),
        "summary": {"risk_level": "high"},
    }

    result = agent.handle(event)

    assert result["risk"]["metrics"]["MTTA"] == 5.0
    assert result["risk"]["level"] == "high"
