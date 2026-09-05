"""End-to-end pipeline behavior with the LLM layer fully mocked: happy
path, the iterative review loop, the max-iteration cap, a partial
researcher failure not taking down the whole run, and the reviewer/writer
agent toggles."""

from unittest.mock import AsyncMock

import pytest

import research.orchestrator as orch
from research.schemas import FinalAnswer, ResearchPlan, ReviewResult, SourceItem, SubQuestion, WorkerFinding


def _plan(n=2):
    return ResearchPlan(
        sub_questions=[SubQuestion(id=f"sq{i}", topic=f"topic {i}", guidance="g") for i in range(n)]
    )


def _finding(topic="topic", failed=False):
    return WorkerFinding(task=topic, findings=["fact"], sources=[SourceItem(title="X", url="https://x.test")], failed=failed)


def _final_answer():
    return FinalAnswer(answer_markdown="# done", key_findings=["k"], citations=["https://x.test"])


async def _collect(question, **kw):
    return [e async for e in orch.run_research(question, **kw)]


async def test_happy_path_single_review_round(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(2)))
    monkeypatch.setattr(orch.researcher, "run_researcher", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(orch.reviewer, "review", AsyncMock(return_value=ReviewResult(approved=True)))
    monkeypatch.setattr(orch.writer, "write", AsyncMock(return_value=_final_answer()))

    events = await _collect("What are the tradeoffs of vector databases?")
    types = [e["type"] for e in events]

    assert types[0] == "plan_start"
    assert "plan_done" in types
    assert types.count("researcher_start") == 2
    assert types.count("researcher_done") == 2
    assert "iteration_start" not in types  # approved first time, no extra round
    assert types[-1] == "trace_summary"
    assert events[-1]["review_iterations"] == 1
    assert types[-2] == "writing_done"
    orch.reviewer.review.assert_awaited_once()


async def test_reviewer_requests_more_research_then_approves(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(1)))
    monkeypatch.setattr(orch.researcher, "run_researcher", AsyncMock(return_value=_finding()))
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
    monkeypatch.setattr(orch.writer, "write", AsyncMock(return_value=_final_answer()))

    events = await _collect("question")
    types = [e["type"] for e in events]

    assert types.count("review_start") == 2
    assert "iteration_start" in types
    assert orch.reviewer.review.await_count == 2
    # 1 researcher in the plan + 1 extra researcher for the missing topic
    assert types.count("researcher_start") == 2
    assert events[-1]["review_iterations"] == 2


async def test_max_iteration_cap_still_writes_report(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(1)))
    monkeypatch.setattr(orch.researcher, "run_researcher", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(
        orch.reviewer,
        "review",
        AsyncMock(return_value=ReviewResult(approved=False, additional_research_required=True, missing_topics=["x"])),
    )
    monkeypatch.setattr(orch.writer, "write", AsyncMock(return_value=_final_answer()))

    events = await _collect("question")
    types = [e["type"] for e in events]

    # reviewer keeps asking for more forever; MAX_REVIEW_ITERATIONS=2 (standard depth) caps it at 3 calls total
    assert orch.reviewer.review.await_count == orch.MAX_REVIEW_ITERATIONS + 1
    assert "writing_done" in types  # still produces a best-effort report, doesn't loop forever
    orch.writer.write.assert_awaited_once()


async def test_partial_researcher_failure_does_not_crash_run(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(2)))
    monkeypatch.setattr(
        orch.researcher, "run_researcher", AsyncMock(side_effect=[_finding(), _finding(failed=True)])
    )
    monkeypatch.setattr(orch.reviewer, "review", AsyncMock(return_value=ReviewResult(approved=True)))
    monkeypatch.setattr(orch.writer, "write", AsyncMock(return_value=_final_answer()))

    events = await _collect("question")
    types = [e["type"] for e in events]

    assert types.count("researcher_done") == 2
    failed_events = [e for e in events if e["type"] == "researcher_done" and e["finding"]["failed"]]
    assert len(failed_events) == 1
    assert "writing_done" in types  # run still completes despite one failed researcher


async def test_planner_failure_emits_error_and_stops(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(side_effect=RuntimeError("gemini down")))

    events = await _collect("question")
    assert events[-1]["type"] == "error"
    assert events[-1]["phase"] == "planner"


async def test_quick_depth_skips_review_loop(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(1)))
    monkeypatch.setattr(orch.researcher, "run_researcher", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(orch.reviewer, "review", AsyncMock(return_value=ReviewResult(approved=True)))
    monkeypatch.setattr(orch.writer, "write", AsyncMock(return_value=_final_answer()))

    events = await _collect("question", depth="quick")
    types = [e["type"] for e in events]
    assert types.count("review_start") == 1  # one pass, no extra rounds allowed at quick depth


async def test_reviewer_disabled_via_agent_config(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(1)))
    monkeypatch.setattr(orch.researcher, "run_researcher", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(orch.writer, "write", AsyncMock(return_value=_final_answer()))
    review_spy = AsyncMock(return_value=ReviewResult(approved=True))
    monkeypatch.setattr(orch.reviewer, "review", review_spy)

    events = await _collect("question", agent_config={"reviewer": False})
    types = [e["type"] for e in events]
    review_spy.assert_not_awaited()
    assert types.count("review_done") == 1
    assert events[[e["type"] for e in events].index("review_done")].get("skipped") is True


async def test_writer_disabled_produces_raw_compiled_answer(monkeypatch):
    monkeypatch.setattr(orch.planner, "plan", AsyncMock(return_value=_plan(1)))
    monkeypatch.setattr(orch.researcher, "run_researcher", AsyncMock(return_value=_finding()))
    monkeypatch.setattr(orch.reviewer, "review", AsyncMock(return_value=ReviewResult(approved=True)))
    write_spy = AsyncMock(return_value=_final_answer())
    monkeypatch.setattr(orch.writer, "write", write_spy)

    events = await _collect("question", agent_config={"writer": False})
    write_spy.assert_not_awaited()
    writing_done = next(e for e in events if e["type"] == "writing_done")
    assert writing_done.get("skipped") is True
    assert "topic" in writing_done["answer"]["answer_markdown"]
