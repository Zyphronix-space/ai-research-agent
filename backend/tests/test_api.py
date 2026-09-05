"""API-level tests: the /research streaming endpoint (LLM mocked out), the
research history CRUD endpoints, filters, restart/regenerate, and
cross-user permission checks."""

import json

import pytest
from fastapi.testclient import TestClient

import db
import main

pytestmark = pytest.mark.usefixtures("temp_db")


@pytest.fixture()
def client():
    return TestClient(main.app)


def _fake_events():
    async def gen(question, agent_config=None, depth="standard"):
        yield {"type": "plan_start"}
        yield {"type": "plan_done", "sub_questions": [{"id": "sq1", "topic": "t", "guidance": "g"}], "duration_ms": 1}
        yield {"type": "researcher_start", "researcher": "researcher_01", "topic": "t"}
        yield {
            "type": "researcher_done",
            "researcher": "researcher_01",
            "finding": {
                "task": "t",
                "findings": ["fact"],
                "sources": [{"title": "Example", "url": "https://x.test"}],
                "confidence": "high",
                "limitations": [],
                "failed": False,
            },
            "duration_ms": 1,
        }
        yield {"type": "review_start", "iteration": 1}
        yield {"type": "review_done", "iteration": 1, "review": {"approved": True, "missing_topics": [], "contradictions": [], "unsupported_claims": [], "additional_research_required": False, "feedback": []}, "duration_ms": 1}
        yield {"type": "writing_start"}
        yield {
            "type": "writing_done",
            "answer": {"answer_markdown": "# Answer\nDone.", "key_findings": ["k1"], "citations": ["https://x.test"]},
            "duration_ms": 1,
        }
        yield {
            "type": "trace_summary",
            "agents": [
                {"name": "planner", "duration_ms": 1},
                {
                    "name": "researcher_01",
                    "duration_ms": 1,
                    "topic": "t",
                    "sources_found": 1,
                    "failed": False,
                    "finding": {
                        "task": "t",
                        "findings": ["fact"],
                        "sources": [{"title": "Example", "url": "https://x.test"}],
                        "confidence": "high",
                        "limitations": [],
                        "failed": False,
                    },
                },
            ],
            "total_ms": 5,
            "review_iterations": 1,
        }

    return gen


def test_research_run_rejects_empty_question(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", object())
    resp = client.post("/research/run", json={"question": "   ", "run_id": "r1"})
    assert resp.status_code == 400


def test_research_run_requires_configured_llm(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", None)
    resp = client.post("/research/run", json={"question": "hi", "run_id": "r1"})
    assert resp.status_code == 500


def test_research_run_rejects_invalid_depth(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", object())
    resp = client.post("/research/run", json={"question": "hi", "run_id": "r1", "depth": "extreme"})
    assert resp.status_code == 422


def test_research_run_rejects_disabling_required_agent(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", object())
    resp = client.post("/research/run", json={"question": "hi", "run_id": "r1", "agent_config": {"researcher": False}})
    assert resp.status_code == 422


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
        "researcher_start",
        "researcher_done",
        "review_start",
        "review_done",
        "writing_start",
        "writing_done",
        "trace_summary",
    ]


def test_research_run_persists_for_signed_in_user(client, monkeypatch, user_and_token):
    monkeypatch.setattr(main.llm, "client", object())
    monkeypatch.setattr(main, "run_research", _fake_events())
    _, token = user_and_token

    resp = client.post(
        "/research/run",
        json={"question": "What is pgvector?", "run_id": "run-1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    stored = db.get_research_run(user_and_token[0]["id"], "run-1")
    assert stored is not None
    assert stored["status"] == "done"
    assert "Answer" in stored["final_answer"]
    assert stored["key_findings"] == ["k1"]
    # sources extracted from the persisted trace's finding data
    sources = db.list_sources(user_and_token[0]["id"], run_id="run-1")
    assert len(sources) == 1
    assert sources[0]["domain"] == "x.test"


def test_research_run_marked_running_before_stream_completes(client, monkeypatch, user_and_token):
    """start_research_run writes a 'running' row immediately, so a run
    that never finishes still shows up (as 'running', not vanished)."""
    monkeypatch.setattr(main.llm, "client", object())

    async def hangs_forever(question, agent_config=None, depth="standard"):
        yield {"type": "plan_start"}

    monkeypatch.setattr(main, "run_research", hangs_forever)
    user, token = user_and_token

    with client.stream(
        "POST", "/research/run", json={"question": "slow one", "run_id": "run-slow"}, headers={"Authorization": f"Bearer {token}"}
    ) as resp:
        next(resp.iter_lines())  # read the first event, then abandon the stream

    stored = db.get_research_run(user["id"], "run-slow")
    assert stored is not None
    assert stored["status"] == "running"


def test_research_run_anonymous_not_persisted(client, monkeypatch):
    monkeypatch.setattr(main.llm, "client", object())
    monkeypatch.setattr(main, "run_research", _fake_events())

    resp = client.post("/research/run", json={"question": "anon question", "run_id": "run-anon"})
    assert resp.status_code == 200
    with db._connect() as conn:
        row = conn.execute("SELECT * FROM research_runs WHERE id = ?", ("run-anon",)).fetchone()
    assert row is None


def test_list_research_requires_auth(client):
    resp = client.get("/research")
    assert resp.status_code == 401


def test_list_and_get_and_delete_research_run(client, user_and_token):
    user, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}
    db.save_research_run(user["id"], "run-x", "question?", "done", "# ans", ["k"], ["https://x.test"], {"approved": True}, [])

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


def test_get_missing_research_run_404s(client, user_and_token):
    _, token = user_and_token
    resp = client.get("/research/does-not-exist", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


def test_list_research_filters_by_status_and_query(client, user_and_token):
    user, token = user_and_token
    headers = {"Authorization": f"Bearer {token}"}
    db.save_research_run(user["id"], "r-done", "vector databases", "done", "a", [], [], {}, [])
    db.save_research_run(user["id"], "r-err", "cooking pasta", "error", None, None, None, None, [])

    only_done = client.get("/research", params={"status": "done"}, headers=headers).json()
    assert [r["id"] for r in only_done] == ["r-done"]

    only_vector = client.get("/research", params={"q": "vector"}, headers=headers).json()
    assert [r["id"] for r in only_vector] == ["r-done"]


def test_cannot_access_another_users_research_run(client, user_and_token, other_user_and_token):
    user, _ = user_and_token
    _, other_token = other_user_and_token
    db.save_research_run(user["id"], "private-run", "q", "done", "a", [], [], {}, [])

    resp = client.get("/research/private-run", headers={"Authorization": f"Bearer {other_token}"})
    assert resp.status_code == 404
    resp = client.delete("/research/private-run", headers={"Authorization": f"Bearer {other_token}"})
    assert resp.status_code == 404


def test_regenerate_report_reruns_writer_from_persisted_findings(client, monkeypatch, user_and_token):
    from unittest.mock import AsyncMock

    from research.schemas import FinalAnswer

    user, token = user_and_token
    trace = [
        {
            "name": "researcher_01",
            "duration_ms": 1,
            "finding": {"task": "t", "findings": ["fact"], "sources": [{"title": "Ex", "url": "https://x.test"}], "confidence": "high", "limitations": [], "failed": False},
        }
    ]
    db.save_research_run(user["id"], "run-regen", "question?", "done", "old answer", ["old"], ["https://x.test"], {"approved": True}, trace)
    monkeypatch.setattr(main.llm, "client", object())
    monkeypatch.setattr(main.writer, "write", AsyncMock(return_value=FinalAnswer(answer_markdown="# New", key_findings=["new"], citations=["https://x.test"])))

    resp = client.post("/research/run-regen/regenerate-report", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["final_answer"] == "# New"
    assert resp.json()["key_findings"] == ["new"]


def test_regenerate_report_404s_for_missing_run(client, user_and_token):
    _, token = user_and_token
    resp = client.post("/research/nope/regenerate-report", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


def test_restart_reruns_pipeline_with_new_run_id(client, monkeypatch, user_and_token):
    user, token = user_and_token
    db.save_research_run(user["id"], "run-orig", "question?", "done", "a", [], [], {}, [])
    monkeypatch.setattr(main.llm, "client", object())
    monkeypatch.setattr(main, "run_research", _fake_events())

    resp = client.post("/research/run-orig/restart", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    lines = [json.loads(line) for line in resp.text.strip().split("\n") if line]
    assert lines[0]["type"] == "plan_start"

    all_runs = db.list_research_runs(user["id"])
    assert len(all_runs) == 2  # original + the new restarted run


def test_agents_status_returns_all_five_agents(client, user_and_token):
    _, token = user_and_token
    resp = client.get("/agents", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()]
    assert ids == ["planner", "researcher", "tool_agent", "reviewer", "writer"]


def test_dashboard_returns_real_counts(client, user_and_token):
    user, token = user_and_token
    db.save_research_run(user["id"], "run-1", "q", "done", "a", [], [], {}, [])
    db.create_project(user["id"], "My Project", None)

    resp = client.get("/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["metrics"]["sessions"] == 1
    assert body["metrics"]["reports"] == 1
    assert body["metrics"]["projects"] == 1
