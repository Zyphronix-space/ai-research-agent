"""Planner agent: depth changes the sub-question count range it asks
Gemini for."""

from unittest.mock import AsyncMock

import research.planner as planner
from research.schemas import ResearchPlan, SubQuestion


async def test_plan_calls_generate_structured_with_research_plan_schema(monkeypatch):
    captured = {}

    async def fake_generate_structured(prompt, schema, *, system_instruction=None, **_kw):
        captured["prompt"] = prompt
        captured["schema"] = schema
        captured["system_instruction"] = system_instruction
        return ResearchPlan(sub_questions=[SubQuestion(id="sq1", topic="t", guidance="g")])

    monkeypatch.setattr(planner, "generate_structured", fake_generate_structured)

    result = await planner.plan("What is pgvector?")
    assert result.sub_questions[0].topic == "t"
    assert captured["schema"] is ResearchPlan
    assert "pgvector" in captured["prompt"]


async def test_depth_changes_requested_sub_question_range(monkeypatch):
    prompts = {}

    async def fake_generate_structured(prompt, schema, *, system_instruction=None, **_kw):
        prompts[system_instruction] = True
        return ResearchPlan(sub_questions=[])

    monkeypatch.setattr(planner, "generate_structured", fake_generate_structured)

    await planner.plan("q", depth="quick")
    await planner.plan("q", depth="deep")

    quick_prompt = next(p for p in prompts if "1-2" in p)
    deep_prompt = next(p for p in prompts if "4-7" in p)
    assert quick_prompt != deep_prompt
