"""A researcher must never raise — a bad Gemini call should degrade to a
failed finding, not take the whole research run down with it."""

from unittest.mock import AsyncMock

import research.researcher as researcher
from research.schemas import SourceItem, SubQuestion, WorkerFinding


async def test_run_researcher_happy_path(monkeypatch):
    monkeypatch.setattr(researcher, "generate_with_tools", AsyncMock(return_value=("some notes", {})))
    monkeypatch.setattr(
        researcher,
        "generate_structured",
        AsyncMock(
            return_value=WorkerFinding(
                task="placeholder", findings=["fact"], sources=[SourceItem(title="Example", url="https://x.test")]
            )
        ),
    )
    sq = SubQuestion(id="sq1", topic="pgvector architecture", guidance="look into indexing")

    events = []
    finding = await researcher.run_researcher(sq, emit=_collecting_emit(events))

    assert finding.failed is False
    assert finding.task == "pgvector architecture"  # overwritten to match the sub-question
    assert finding.findings == ["fact"]
    assert finding.sources[0].url == "https://x.test"


async def test_run_researcher_catches_gather_phase_failure():
    async def boom(*_a, **_kw):
        raise RuntimeError("network down")

    import research.researcher as r

    original = r.generate_with_tools
    r.generate_with_tools = boom
    try:
        sq = SubQuestion(id="sq1", topic="topic", guidance="guidance")
        finding = await r.run_researcher(sq, emit=_collecting_emit([]))
    finally:
        r.generate_with_tools = original

    assert finding.failed is True
    assert finding.task == "topic"
    assert any("network down" in l for l in finding.limitations)


async def test_run_researcher_catches_writeup_phase_failure(monkeypatch):
    monkeypatch.setattr(researcher, "generate_with_tools", AsyncMock(return_value=("notes", {})))

    async def boom(*_a, **_kw):
        raise ValueError("bad schema")

    monkeypatch.setattr(researcher, "generate_structured", boom)

    sq = SubQuestion(id="sq1", topic="topic", guidance="guidance")
    finding = await researcher.run_researcher(sq, emit=_collecting_emit([]))
    assert finding.failed is True
    assert finding.confidence == "none"


async def test_run_researcher_passes_max_steps_through(monkeypatch):
    captured = {}

    async def fake_generate_with_tools(*_a, max_steps, **_kw):
        captured["max_steps"] = max_steps
        return "notes", {}

    monkeypatch.setattr(researcher, "generate_with_tools", fake_generate_with_tools)
    monkeypatch.setattr(researcher, "generate_structured", AsyncMock(return_value=WorkerFinding(task="t")))

    sq = SubQuestion(id="sq1", topic="topic", guidance="guidance")
    await researcher.run_researcher(sq, emit=_collecting_emit([]), max_steps=5)
    assert captured["max_steps"] == 5


def _collecting_emit(events: list):
    async def emit(event: dict):
        events.append(event)

    return emit
