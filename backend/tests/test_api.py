"""API-level tests: the /research streaming endpoint (LLM mocked out) and
the history CRUD endpoints, including auth gating and DB persistence."""

import json

import pytest
from fastapi.testclient import TestClient

import db
import main


@pytest.fixture()
def client():
    return TestClient(main.app)


def _fake_events():
    async def gen(question):
        yield {"type": "plan_start"}
        yield {"type": "plan_done", "sub_questions": [{"id": "sq1", "topic": "t", "guidance": "g"}], "duration_ms": 1}
        yield {"type": "worker_start", "worker": "worker_01", "topic": "t"}
        yield {
            "type": "worker_done",
            "worker": "worker_01",
            "finding": {"task": "t", "findings": ["fact"], "sources": ["https://x.test"], "confidence": "high", "limitations": [], "failed": False},
            "duration_ms": 1,
        }
        yield {"type": "review_start", "iteration": 1}
        yield {"type": "review_done", "iteration": 1, "review": {"approved": True, "missing_topics": [], "contradictions": [], "unsupported_claims": [], "additional_research_required": False, "feedback": []}, "duration_ms": 1}
        yield {"type": "synthesis_start"}
        yield {
            "type": "synthesis_done",
            "answer": {"answer_markdown": "# Answer\nDone.", "key_findings": ["k1"], "citations": ["https://x.test"]},
            "duration_ms": 1,
        }
        yield {"type": "trace_summary", "agents": [{"name": "planner", "duration_ms": 1}], "total_ms": 5, "review_iterations": 1}

    return gen


def test_research_run_rejects_empty_question(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", object())
    resp = client.post("/research/run", json={"question": "   ", "run_id": "r1"})
    assert resp.status_code == 400


def test_research_run_requires_configured_llm(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", None)
    resp = client.post("/research/run", json={"question": "hi", "run_id": "r1"})
    assert resp.status_code == 500


def test_research_run_streams_expected_event_sequence(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", object())
    monkeypatch.setattr(main, "run_research", _fake_events())

    resp = client.post("/research/run", json={"question": "What is pgvector?", "run_id": "r1"})
    assert resp.status_code == 200
    lines = [line for line in resp.text.strip().split("\n") if line]
    events = [json.loads(line) for line in lines]
    types = [e["type"] for e in events]
    assert types == [
        "plan_start",
        "plan_done",
        "worker_start",
        "worker_done",
        "review_start",
        "review_done",
        "synthesis_start",
        "synthesis_done",
        "trace_summary",
    ]


def test_research_run_persists_for_signed_in_user(client, monkeypatch, temp_db, user_and_token):
    monkeypatch.setattr(main.llm, "client", object())
    monkeypatch.setattr(main, "run_research", _fake_events())
    _, token = user_and_token

    resp = client.post(
        "/research/run",
        json={"question": "What is pgvector?", "run_id": "run-1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    stored = temp_db.get_research_run(user_and_token[0]["id"], "run-1")
    assert stored is not None
    assert stored["status"] == "done"
    assert "Answer" in stored["final_answer"]
    assert stored["key_findings"] == ["k1"]


def test_research_run_anonymous_not_persisted(client, monkeypatch, temp_db):
    monkeypatch.setattr(main.llm, "client", object())
    monkeypatch.setattr(main, "run_research", _fake_events())

    resp = client.post("/research/run", json={"question": "anon question", "run_id": "run-anon"})
    assert resp.status_code == 200
    # no user_id to look this run up under — anonymous history lives client-side only
    with temp_db._connect() as conn:
        row = conn.execute("SELECT * FROM research_runs WHERE id = ?", ("run-anon",)).fetchone()
    assert row is None


def test_list_research_requires_auth(client):
    resp = client.get("/research")
    assert resp.status_code == 401


def test_list_and_get_and_delete_research_run(client, temp_db, user_and_token):
    user, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}
    temp_db.save_research_run(
        user["id"], "run-x", "question?", "done", "# ans", ["k"], ["https://x.test"], {"approved": True}, []
    )

    listed = client.get("/research", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == "run-x"

    detail = client.get("/research/run-x", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["final_answer"] == "# ans"

    saved = client.patch("/research/run-x", json={"saved": True}, headers=headers)
    assert saved.status_code == 200

    deleted = client.delete("/research/run-x", headers=headers)
    assert deleted.status_code == 200
    assert client.get("/research/run-x", headers=headers).status_code == 404


def test_get_missing_research_run_404s(client, temp_db, user_and_token):
    _, token = user_and_token
    resp = client.get("/research/does-not-exist", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
