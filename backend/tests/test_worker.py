"""A worker must never raise — a bad Gemini call should degrade to a
failed finding, not take the whole research run down with it."""

from unittest.mock import AsyncMock

import research.worker as worker
from research.schemas import SubQuestion, WorkerFinding


async def test_run_worker_happy_path(monkeypatch):
    monkeypatch.setattr(worker, "generate_with_tools", AsyncMock(return_value=("some notes", {})))
    monkeypatch.setattr(
        worker,
        "generate_structured",
        AsyncMock(return_value=WorkerFinding(task="placeholder", findings=["fact"], sources=["https://x.test"])),
    )
    sq = SubQuestion(id="sq1", topic="pgvector architecture", guidance="look into indexing")

    events = []
    finding = await worker.run_worker(sq, emit=_collecting_emit(events))

    assert finding.failed is False
    assert finding.task == "pgvector architecture"  # overwritten to match the sub-question
    assert finding.findings == ["fact"]


async def test_run_worker_catches_gather_phase_failure():
    async def boom(*_a, **_kw):
        raise RuntimeError("network down")

    import research.worker as w

    original = w.generate_with_tools
    w.generate_with_tools = boom
    try:
        sq = SubQuestion(id="sq1", topic="topic", guidance="guidance")
        finding = await w.run_worker(sq, emit=_collecting_emit([]))
    finally:
        w.generate_with_tools = original

    assert finding.failed is True
    assert finding.task == "topic"
    assert any("network down" in l for l in finding.limitations)


async def test_run_worker_catches_writeup_phase_failure(monkeypatch):
    monkeypatch.setattr(worker, "generate_with_tools", AsyncMock(return_value=("notes", {})))

    async def boom(*_a, **_kw):
        raise ValueError("bad schema")

    monkeypatch.setattr(worker, "generate_structured", boom)

    sq = SubQuestion(id="sq1", topic="topic", guidance="guidance")
    finding = await worker.run_worker(sq, emit=_collecting_emit([]))
    assert finding.failed is True
    assert finding.confidence == "none"


def _collecting_emit(events: list):
    async def emit(event: dict):
        events.append(event)

    return emit
