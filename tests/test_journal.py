from src.pipeline import journal


def test_log_stage_event_generates_checksum(monkeypatch):
    captured = {}

    def fake_put_object(self, **kwargs):  # pragma: no cover - boto3 client stub
        captured.update(kwargs)

    monkeypatch.setattr(journal.S3, "put_object", fake_put_object)

    result = journal.log_stage_event(
        tenant_id="tenant-a",
        investigation_id="inv-123",
        stage="test",
        payload={"foo": "bar"},
    )

    assert result["bucket"] == journal.AUDIT_BUCKET
    assert "checksum_sha256" in result
    assert captured["ChecksumSHA256"] == result["checksum_sha256"]
    assert captured["Key"].startswith("logs/tenant-a/inv-123/")
