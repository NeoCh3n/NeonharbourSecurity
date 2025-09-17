from src.agents.orchestrator import Orchestrator


class FakeAgent:
    name = "fake"
    stage = "execute"

    def __init__(self, *args, **kwargs):
        pass

    def handle(self, event):
        event["handled"] = True
        return event


class FakeRegistry:
    def instantiate(self, stage):
        assert stage == "execute"
        return FakeAgent()


def test_orchestrator_dispatch(monkeypatch):
    from src.agents import registry as registry_module

    class StubTable:
        def put_item(self, **kwargs):  # pragma: no cover - noop
            pass

        def get_item(self, **kwargs):  # pragma: no cover - default definition
            return {"Item": None}

    class StubDynamo:
        def Table(self, _name):
            return StubTable()

    monkeypatch.setattr(registry_module, "dynamodb", StubDynamo())

    orchestrator = Orchestrator()
    monkeypatch.setattr(orchestrator, "_registry", FakeRegistry())

    result = orchestrator.dispatch("execute", {"investigationId": "inv"})
    assert result["handled"] is True
