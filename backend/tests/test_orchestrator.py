"""End-to-end pipeline behavior with the LLM layer fully mocked: happy
path, the iterative review loop, the max-iteration cap, and a partial
worker failure not taking down the whole run."""

from unittest.mock import AsyncMock

import pytest

import research.orchestrator as orch
from research.schemas import FinalAnswer, ResearchPlan, ReviewResult, SubQuestion, WorkerFinding


def _plan(n=2):
    return ResearchPlan(
        sub_questions=[SubQuestion(id=f"sq{i}", topic=f"topic {i}", guidance="g") for i in range(n)]
    )


def _finding(topic="topic", failed=False):
    return WorkerFinding(task=topic, findings=["fact"], sources=["https://x.test"], failed=failed)


def _final_answer():
    return FinalAnswer(answer_markdown="# done", key_findings=["k"], citations=["https://x.test"])


async def _collect(question):
    return [e async for e in orch.run_research(question)]


async def test_happy_path_single_review_round(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(2)))
    monkeypatch.setattr(orch.worker, "run_worker", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(orch.reviewer, "review", AsyncMock(return_value=ReviewResult(approved=True)))
    monkeypatch.setattr(orch.synthesizer, "synthesize", AsyncMock(return_value=_final_answer()))

    events = await _collect("What are the tradeoffs of vector databases?")
    types = [e["type"] for e in events]

    assert types[0] == "plan_start"
    assert "plan_done" in types
    assert types.count("worker_start") == 2
    assert types.count("worker_done") == 2
    assert "iteration_start" not in types  # approved first time, no extra round
    assert types[-1] == "trace_summary"
    assert events[-1]["review_iterations"] == 1
    assert types[-2] == "synthesis_done"
    orch.reviewer.review.assert_awaited_once()


async def test_reviewer_requests_more_research_then_approves(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(1)))
    monkeypatch.setattr(orch.worker, "run_worker", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(
        orch.reviewer,
        "review",
        AsyncMock(
            side_effect=[
                ReviewResult(approved=False, additional_research_required=True, missing_topics=["cost analysis"]),
                ReviewResult(approved=True),
            ]
        ),
    )
    monkeypatch.setattr(orch.synthesizer, "synthesize", AsyncMock(return_value=_final_answer()))

    events = await _collect("question")
    types = [e["type"] for e in events]

    assert types.count("review_start") == 2
    assert "iteration_start" in types
    assert orch.reviewer.review.await_count == 2
    # 1 worker in the plan + 1 extra worker for the missing topic
    assert types.count("worker_start") == 2
    assert events[-1]["review_iterations"] == 2


async def test_max_iteration_cap_still_synthesizes(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(1)))
    monkeypatch.setattr(orch.worker, "run_worker", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(
        orch.reviewer,
        "review",
        AsyncMock(return_value=ReviewResult(approved=False, additional_research_required=True, missing_topics=["x"])),
    )
    monkeypatch.setattr(orch.synthesizer, "synthesize", AsyncMock(return_value=_final_answer()))

    events = await _collect("question")
    types = [e["type"] for e in events]

    # reviewer keeps asking for more forever; MAX_REVIEW_ITERATIONS=2 caps it at 3 calls total
    assert orch.reviewer.review.await_count == orch.MAX_REVIEW_ITERATIONS + 1
    assert "synthesis_done" in types  # still produces a best-effort answer, doesn't loop forever
    orch.synthesizer.synthesize.assert_awaited_once()


async def test_partial_worker_failure_does_not_crash_run(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(2)))
    monkeypatch.setattr(
        orch.worker, "run_worker", AsyncMock(side_effect=[_finding(), _finding(failed=True)])
    )
    monkeypatch.setattr(orch.reviewer, "review", AsyncMock(return_value=ReviewResult(approved=True)))
    monkeypatch.setattr(orch.synthesizer, "synthesize", AsyncMock(return_value=_final_answer()))

    events = await _collect("question")
    types = [e["type"] for e in events]

    assert types.count("worker_done") == 2
    failed_events = [e for e in events if e["type"] == "worker_done" and e["finding"]["failed"]]
    assert len(failed_events) == 1
    assert "synthesis_done" in types  # run still completes despite one failed worker


async def test_planner_failure_emits_error_and_stops(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(side_effect=RuntimeError("gemini down")))

    events = await _collect("question")
    assert events[-1]["type"] == "error"
    assert events[-1]["phase"] == "planner"
