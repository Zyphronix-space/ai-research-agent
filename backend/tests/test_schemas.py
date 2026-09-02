"""Validation edge cases for the structured contracts every agent returns."""

import pytest
from pydantic import ValidationError

from research.schemas import FinalAnswer, ResearchPlan, ReviewResult, SubQuestion, WorkerFinding


def test_research_plan_requires_sub_questions_list():
    plan = ResearchPlan(sub_questions=[SubQuestion(id="sq1", topic="t", guidance="g")])
    assert len(plan.sub_questions) == 1


def test_research_plan_rejects_missing_field():
    with pytest.raises(ValidationError):
        ResearchPlan(sub_questions=[{"id": "sq1", "topic": "t"}])  # missing guidance


def test_worker_finding_defaults_are_empty_not_missing():
    finding = WorkerFinding(task="t")
    assert finding.findings == []
    assert finding.sources == []
    assert finding.limitations == []
    assert finding.confidence == "medium"
    assert finding.failed is False


def test_worker_finding_failed_flag():
    finding = WorkerFinding(task="t", confidence="none", failed=True, limitations=["Worker failed: boom"])
    assert finding.failed is True


def test_review_result_defaults():
    review = ReviewResult(approved=True)
    assert review.additional_research_required is False
    assert review.missing_topics == []


def test_review_result_requires_approved():
    with pytest.raises(ValidationError):
        ReviewResult()


def test_final_answer_requires_markdown():
    with pytest.raises(ValidationError):
        FinalAnswer(key_findings=["x"])


def test_final_answer_round_trip():
    answer = FinalAnswer(answer_markdown="# Answer", key_findings=["a"], citations=["https://x.test"])
    dumped = answer.model_dump()
    assert FinalAnswer(**dumped) == answer
