from src.agents.adapt import AdaptAgent


class StubBus:
    def publish(self, **kwargs):  # pragma: no cover - noop
        return None


class StubTable:
    def update_item(self, **kwargs):  # pragma: no cover - noop
        pass


class StubDynamo:
    def Table(self, _name):  # pragma: no cover - always return stub
        return StubTable()


class StubAnalyst:
    provider = "bedrock"

    def record_feedback(self, **kwargs):
        return {"status": "recorded", "provider": self.provider}


def test_adapt_agent_records_feedback(monkeypatch):
    from src.agents import adapt as adapt_module

    monkeypatch.setattr(adapt_module, "dynamodb", StubDynamo())
    monkeypatch.setattr(adapt_module, "log_stage_event", lambda **kwargs: {"stage": kwargs["stage"]})
    monkeypatch.setattr(AdaptAgent, "_select_analyst", lambda self: StubAnalyst())

    agent = AdaptAgent(StubBus())
    event = {
        "investigationId": "inv-1",
        "tenantId": "tenant-1",
        "risk": {"level": "low", "metrics": {}},
        "summary": {"recommended_actions": []},
    }

    result = agent.handle(event)
    assert result["adaptation"]["status"] == "recorded"
    assert result["audit"]["stage"] == "adapt"
