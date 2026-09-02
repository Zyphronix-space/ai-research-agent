"""429/backoff retry behavior — this is what stands between the app and a
single rate-limit blip surfacing as a hard user-facing error."""

from unittest.mock import MagicMock

import pytest
from google.genai.errors import APIError

import llm


def _api_error(code):
    return APIError(code, {"error": {"message": "rate limited" if code == 429 else "boom"}})


async def test_retries_on_429_then_succeeds(monkeypatch):
    monkeypatch.setattr(llm, "MAX_RETRIES", 3)
    monkeypatch.setattr(llm.asyncio, "sleep", lambda *_: _instant())

    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise _api_error(429)
        return "ok"

    result = await llm._call_with_retry(flaky)
    assert result == "ok"
    assert calls["n"] == 3


async def test_gives_up_after_max_retries_with_clear_error(monkeypatch):
    monkeypatch.setattr(llm, "MAX_RETRIES", 2)
    monkeypatch.setattr(llm.asyncio, "sleep", lambda *_: _instant())

    def always_429():
        raise _api_error(429)

    with pytest.raises(llm.LLMError, match="rate limit"):
        await llm._call_with_retry(always_429)


async def test_non_429_error_raises_immediately_no_retry(monkeypatch):
    monkeypatch.setattr(llm.asyncio, "sleep", lambda *_: _instant())
    calls = {"n": 0}

    def broken():
        calls["n"] += 1
        raise _api_error(500)

    with pytest.raises(llm.LLMError, match="Gemini API error"):
        await llm._call_with_retry(broken)
    assert calls["n"] == 1


async def test_generate_structured_requires_configured_client(monkeypatch):
    monkeypatch.setattr(llm, "client", None)
    with pytest.raises(llm.LLMError, match="GEMINI_API_KEY"):
        await llm.generate_structured("prompt", MagicMock())


async def _instant(*_a, **_kw):
    return None
