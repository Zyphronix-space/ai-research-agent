"""Source extraction (from a saved run's trace) and the Save/Remove
actions, including cross-user permission checks."""

import pytest
from fastapi.testclient import TestClient

import db
import main

pytestmark = pytest.mark.usefixtures("temp_db")


@pytest.fixture()
def client():
    return TestClient(main.app)


def _trace_with_sources(*urls):
    return [
        {
            "name": "researcher_01",
            "duration_ms": 1,
            "finding": {
                "task": "t",
                "findings": ["fact"],
                "sources": [{"title": f"Title {i}", "url": u} for i, u in enumerate(urls)],
                "confidence": "high",
                "limitations": [],
                "failed": False,
            },
        }
    ]


def test_sources_extracted_from_saved_run_with_real_metadata(user_and_token):
    user, _ = user_and_token
    db.save_research_run(
        user["id"], "run-1", "q", "done", "a", [], [], {}, _trace_with_sources("https://example.com/article", "https://www.other.test/page")
    )
    sources = db.list_sources(user["id"])
    domains = sorted(s["domain"] for s in sources)
    assert domains == ["example.com", "other.test"]
    # relevance derived from confidence, never fabricated
    assert all(s["relevance"] == "high" for s in sources)
    # no published_at synthesized when the tool result didn't carry one
    assert all(s["published_at"] is None for s in sources)


def test_sources_deduplicated_by_url_across_researchers(user_and_token):
    user, _ = user_and_token
    trace = _trace_with_sources("https://dup.test/a") + _trace_with_sources("https://dup.test/a")
    db.save_research_run(user["id"], "run-2", "q", "done", "a", [], [], {}, trace)
    sources = db.list_sources(user["id"])
    assert len(sources) == 1


def test_list_sources_endpoint_and_save_remove(client, user_and_token):
    user, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}
    db.save_research_run(user["id"], "run-3", "q", "done", "a", [], [], {}, _trace_with_sources("https://x.test/1"))

    listed = client.get("/sources", headers=headers).json()
    assert len(listed) == 1
    source_id = listed[0]["id"]

    saved = client.patch(f"/sources/{source_id}", json={"saved": True}, headers=headers)
    assert saved.status_code == 200
    only_saved = client.get("/sources", params={"saved": True}, headers=headers).json()
    assert len(only_saved) == 1

    removed = client.patch(f"/sources/{source_id}", json={"removed": True}, headers=headers)
    assert removed.status_code == 200
    after_removal = client.get("/sources", headers=headers).json()
    assert after_removal == []  # removed sources are hidden, not surfaced


def test_cannot_update_another_users_source(client, user_and_token, other_user_and_token):
    user, _ = user_and_token
    _, other_token = other_user_and_token
    db.save_research_run(user["id"], "run-4", "q", "done", "a", [], [], {}, _trace_with_sources("https://x.test/2"))
    source_id = db.list_sources(user["id"])[0]["id"]

    resp = client.patch(f"/sources/{source_id}", json={"saved": True}, headers={"Authorization": f"Bearer {other_token}"})
    assert resp.status_code == 404
