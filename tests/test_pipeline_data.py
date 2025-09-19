from __future__ import annotations

from src.api.data import InvestigationRepository, PIPELINE_STAGES


def test_repository_returns_seed_investigations():
    repo = InvestigationRepository()
    items = repo.list_investigations()
    assert items, "Seed data should be available for investigations"
    assert all("investigationId" in item for item in items)


def test_timeline_includes_all_stages_with_durations():
    repo = InvestigationRepository()
    investigation_id = repo.list_investigations()[0]["investigationId"]
    timeline = repo.get_timeline(investigation_id)
    assert len(timeline) == len(PIPELINE_STAGES)
    stages = {entry["stage"] for entry in timeline}
    assert stages == {stage["stage"] for stage in PIPELINE_STAGES}
    for entry in timeline:
        assert "status" in entry
        assert "agent" in entry
        assert "durationSeconds" in entry


def test_stage_payload_matches_timeline_payload():
    repo = InvestigationRepository()
    investigation_id = repo.list_investigations()[0]["investigationId"]
    analyze_payload = repo.get_stage_payload(investigation_id, "analyze")
    assert analyze_payload
    timeline = repo.get_timeline(investigation_id)
    analyze_entry = next(entry for entry in timeline if entry["stage"] == "analyze")
    assert analyze_entry["payload"]
