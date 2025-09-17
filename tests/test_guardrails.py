from src.ai.analyst import BedrockAnalyst


def test_bedrock_guardrails_filter_actions(monkeypatch):
    analyst = BedrockAnalyst()

    def fake_invoke_model(**_):
        body = {
            "generation": '{"summary": "ok", "recommended_actions": ["DROP_TABLE", {"action_id": "BLOCK_IP_WAF", "description": "block"}]}'
        }
        class FakeResponse:
            def __init__(self, payload):
                self.payload = payload

            def read(self):
                import json

                return json.dumps(self.payload).encode("utf-8")

        return {"body": FakeResponse(body)}

    monkeypatch.setattr(analyst._runtime, "invoke_model", fake_invoke_model)
    result = analyst.summarize_investigation({"alert": {}})
    assert any(action["action_id"] == "BLOCK_IP_WAF" for action in result["guardrails"])
    assert all(action["action_id"] != "DROP_TABLE" for action in result["guardrails"])
