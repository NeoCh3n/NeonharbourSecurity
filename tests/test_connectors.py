from src.connectors.sentinel import SentinelClient
from src.connectors.splunk import SplunkClient
from src.connectors.okta import OktaClient


def test_sentinel_fixture_fallback(tmp_path):
    client = SentinelClient(fixture_dir=tmp_path)
    (tmp_path / "sentinel_alerts.json").write_text("[{\"alertId\": \"demo\"}]", encoding="utf-8")
    alerts = client.fetch_recent_alerts()
    assert alerts[0]["alertId"] == "demo"


def test_splunk_fixture_structure(tmp_path):
    client = SplunkClient(fixture_dir=tmp_path)
    (tmp_path / "splunk_events.json").write_text('{"results": [{"action": "login"}]}', encoding="utf-8")
    events = client.search("search", limit=5)
    assert events[0]["action"] == "login"


def test_okta_fixture(tmp_path):
    client = OktaClient(fixture_dir=tmp_path)
    (tmp_path / "okta_security_events.json").write_text('{"events": [{"eventType": "user.session.start"}]}', encoding="utf-8")
    events = client.list_security_events()
    assert events[0]["eventType"] == "user.session.start"
