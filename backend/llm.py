"""One shared Gemini client, reused by every agent in research/.

Two entry points cover everything the pipeline needs:

- `generate_structured` — a single call constrained to a Pydantic schema
  (Gemini's `response_schema`), used by the Planner, Reviewer, and
  Synthesizer, and by a Worker's final "write up your finding" step.
- `generate_with_tools` — the tool-calling mini-loop (model decides which
  tool(s) to call, we execute them locally, feed results back, repeat),
  used by a Worker to gather evidence. Same shape as the single-agent loop
  this project used to have, just extracted so more than one caller can
  use it, and driven by an `emit` callback instead of being a generator
  itself — a Worker running concurrently with others pushes its events
  onto a shared queue rather than yielding from its own generator, which
  is what actually lets several workers stream progress at once (see
  research/orchestrator.py).

Both wrap the same 429/backoff handling, since a rate limit can hit any
call, not just the top-level chat loop this pattern was written for
originally.
"""

import asyncio
import os
import time
from typing import Callable, TypeVar

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
MAX_RETRIES = 6

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# A multi-agent run fires several calls in quick succession (concurrent
# workers, each doing 2+ calls, plus the reviewer/synthesizer) — enough to
# blow through the free tier's requests-per-minute limit even though the
# *total* volume is modest. Capping how many calls are in flight at once
# smooths that burst out without serializing the pipeline (workers still
# start and progress concurrently; only the underlying network calls are
# throttled), which in practice matters more than raw retry count.
_CONCURRENT_CALL_LIMIT = asyncio.Semaphore(2)

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class LLMError(Exception):
    """Raised when a Gemini call fails after retries, or the client isn't configured."""


def _require_client():
    if client is None:
        raise LLMError("GEMINI_API_KEY is not configured on the server")
    return client


async def _call_with_retry(fn: Callable[[], "types.GenerateContentResponse"]):
    """Runs a blocking Gemini call in a thread, retrying on 429 with
    exponential backoff. Any other API error is raised immediately —
    only rate limits are worth waiting out."""
    for attempt in range(MAX_RETRIES):
        try:
            async with _CONCURRENT_CALL_LIMIT:
                return await asyncio.to_thread(fn)
        except APIError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES - 1:
                await asyncio.sleep(min(2**attempt, 30))
                continue
            if exc.code == 429:
                raise LLMError("Hit the Gemini free-tier rate limit - try again shortly.") from exc
            raise LLMError(f"Gemini API error: {exc}") from exc


async def generate_structured(
    prompt: str,
    schema: type[SchemaT],
    *,
    system_instruction: str | None = None,
    max_output_tokens: int = 2048,
) -> SchemaT:
    """One Gemini call constrained to return JSON matching `schema`."""
    c = _require_client()

    def call():
        return c.models.generate_content(
            model=GEMINI_MODEL,
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=schema,
                max_output_tokens=max_output_tokens,
            ),
        )

    response = await _call_with_retry(call)
    if response.parsed is not None:
        return response.parsed
    # Fall back to manual validation if the SDK couldn't auto-parse (e.g.
    # the model's JSON was well-formed but didn't hit .parsed for some
    # SDK-version reason) — never silently hand back an unvalidated dict.
    return schema.model_validate_json(response.text)


async def generate_with_tools(
    question: str,
    *,
    system_instruction: str,
    tool_declarations: list["types.Tool"],
    tool_functions: dict[str, Callable[..., str]],
    emit: Callable[[dict], "asyncio.Future | None"],
    max_steps: int = 5,
    max_output_tokens: int = 1024,
) -> tuple[str, dict]:
    """Tool-calling loop: Gemini decides which tool(s) to call, we run them
    (concurrently within a turn), feed results back, repeat until it
    answers in plain text or `max_steps` is hit. `emit(event)` is awaited
    for every tool_call/tool_result so a caller running several of these
    concurrently can fan them into one shared stream. Returns the final
    text and accumulated token usage.
    """
    c = _require_client()
    usage_totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    contents = [types.Content(role="user", parts=[types.Part(text=question)])]

    for _ in range(max_steps):

        def call():
            return c.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=tool_declarations,
                    max_output_tokens=max_output_tokens,
                ),
            )

        response = await _call_with_retry(call)

        usage = response.usage_metadata
        if usage is not None:
            usage_totals["prompt_tokens"] += usage.prompt_token_count or 0
            usage_totals["completion_tokens"] += usage.candidates_token_count or 0
            usage_totals["total_tokens"] += usage.total_token_count or 0

        candidate = response.candidates[0]
        contents.append(candidate.content)

        function_calls = [p.function_call for p in candidate.content.parts if p.function_call]
        if not function_calls:
            text = "".join(p.text for p in candidate.content.parts if p.text)
            return text, usage_totals

        for fc in function_calls:
            args = dict(fc.args) if fc.args else {}
            await emit({"type": "tool_call", "id": fc.id, "tool": fc.name, "args": args})

        async def run_one(fc):
            args = dict(fc.args) if fc.args else {}
            fn = tool_functions.get(fc.name)
            start = time.perf_counter()
            result = f"Unknown tool: {fc.name}" if fn is None else await asyncio.to_thread(fn, **args)
            latency_ms = (time.perf_counter() - start) * 1000
            return fc, result, latency_ms

        results = await asyncio.gather(*(run_one(fc) for fc in function_calls))

        response_parts = []
        for fc, result, latency_ms in results:
            await emit({"type": "tool_result", "id": fc.id, "tool": fc.name, "result": result, "latency_ms": round(latency_ms)})
            response_parts.append(
                types.Part(function_response=types.FunctionResponse(id=fc.id, name=fc.name, response={"result": result}))
            )
        contents.append(types.Content(role="user", parts=response_parts))

    return "Ran out of steps before reaching a final answer.", usage_totals
