"""The agent loop: Gemini decides which tool(s) to call, we execute them
locally with plain Python, feed the results back, and repeat until it gives
a final answer (or hits the step cap). This is the actual "agent" part —
everything else is plumbing around it.

Three things happen around that core loop that are worth reading before the
code:

1. Multiple tool calls requested in the same turn run *concurrently*
   (asyncio.gather over a thread pool, since the tool functions themselves
   are synchronous/blocking I/O) instead of one after another.
2. Every step is timed and every Gemini call's token usage is accumulated,
   so the frontend can render a real execution trace (latency + tokens per
   step, not just the final text).
3. Before the first Gemini call, we search a small cross-session memory
   store (memory.py) for semantically similar past exchanges and, if any
   are found, hand them to the model as prior context — so a question asked
   in an earlier session can inform this one.
"""

import asyncio
import os
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

import memory
from tools import TOOL_FUNCTIONS

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
MAX_STEPS = 6

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

SYSTEM_PROMPT = (
    "You are a research assistant with three tools: web_search (current "
    "information or anything you're unsure about), calculator (exact "
    "arithmetic — never compute math yourself), and get_current_datetime. "
    "Use a tool whenever the question needs it; answer directly for things "
    "you already know or plain conversation. Don't use LaTeX — plain text "
    "or markdown only. Match the user's tone: casual messages get a "
    "relaxed, brief reply, not a formal one. If you're given context from "
    "earlier conversations under 'Relevant past exchanges', use it only if "
    "it's actually relevant to the current question — don't force a "
    "connection that isn't there."
)

TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="web_search",
                description="Search the web for current information, facts, or anything you're unsure about.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"query": types.Schema(type="STRING", description="the search query")},
                    required=["query"],
                ),
            ),
            types.FunctionDeclaration(
                name="calculator",
                description="Evaluate an arithmetic expression exactly (+ - * / // % ** and parentheses).",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"expression": types.Schema(type="STRING", description="e.g. (356 * 42) - 17")},
                    required=["expression"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_current_datetime",
                description="Get the current date and time in UTC.",
                parameters=types.Schema(type="OBJECT", properties={}),
            ),
        ]
    )
]


def _format_memory_context(recalled: list[memory.Recalled]) -> str:
    lines = ["Relevant past exchanges (from earlier sessions):"]
    for r in recalled:
        lines.append(f'- Q: "{r.question}" -> A: "{r.answer}" (similarity {r.similarity:.2f})')
    return "\n".join(lines)


async def _run_tool_call(fc) -> tuple[str, dict, str, float]:
    """Execute one tool call in a thread (tools are sync/blocking) and time it."""
    args = dict(fc.args) if fc.args else {}
    fn = TOOL_FUNCTIONS.get(fc.name)
    start = time.perf_counter()
    if fn is None:
        result = f"Unknown tool: {fc.name}"
    else:
        result = await asyncio.to_thread(fn, **args)
    latency_ms = (time.perf_counter() - start) * 1000
    return fc.name, args, result, latency_ms


async def run_agent(question: str, think_longer: bool = False, session_id: str = "anonymous"):
    """Async generator yielding dict events: memory_recall, tool_call,
    tool_result, answer, trace_summary, error."""
    run_start = time.perf_counter()
    thinking_budget = 8192 if think_longer else 256
    max_tokens = 4096 if think_longer else 1024

    usage_totals = {"prompt_tokens": 0, "completion_tokens": 0, "thoughts_tokens": 0, "total_tokens": 0}
    tool_calls_made = 0

    memory_context = ""
    if client is not None:
        try:
            recalled, scanned = await asyncio.to_thread(memory.recall, client, question)
        except Exception:
            recalled, scanned = [], 0
        if recalled:
            yield {
                "type": "memory_recall",
                "count": len(recalled),
                "scanned": scanned,
                "items": [
                    {"question": r.question, "answer": r.answer, "similarity": round(r.similarity, 3)}
                    for r in recalled
                ],
            }
            memory_context = _format_memory_context(recalled)

    first_user_text = f"{memory_context}\n\nCurrent question: {question}" if memory_context else question
    contents = [types.Content(role="user", parts=[types.Part(text=first_user_text)])]

    for step_idx in range(MAX_STEPS):
        try:
            llm_start = time.perf_counter()
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    tools=TOOLS,
                    max_output_tokens=max_tokens,
                    thinking_config=types.ThinkingConfig(thinking_budget=thinking_budget),
                ),
            )
            llm_latency_ms = (time.perf_counter() - llm_start) * 1000
        except APIError as exc:
            if exc.code == 429:
                yield {"type": "error", "message": "Hit the free-tier rate limit — wait a few seconds and try again."}
            else:
                yield {"type": "error", "message": f"Gemini API error: {exc}"}
            return

        usage = response.usage_metadata
        if usage is not None:
            usage_totals["prompt_tokens"] += usage.prompt_token_count or 0
            usage_totals["completion_tokens"] += usage.candidates_token_count or 0
            usage_totals["thoughts_tokens"] += usage.thoughts_token_count or 0
            usage_totals["total_tokens"] += usage.total_token_count or 0

        candidate = response.candidates[0]
        contents.append(candidate.content)

        function_calls = [p.function_call for p in candidate.content.parts if p.function_call]
        if not function_calls:
            text = "".join(p.text for p in candidate.content.parts if p.text)
            answer_text = text or "I don't have an answer for that."
            yield {"type": "answer", "text": answer_text}

            if client is not None:
                try:
                    await asyncio.to_thread(memory.save_exchange, client, session_id, question, answer_text)
                except Exception:
                    pass  # memory is a nice-to-have, never fail the response over it

            yield {
                "type": "trace_summary",
                "steps": tool_calls_made,
                "llm_calls": step_idx + 1,
                "total_latency_ms": round((time.perf_counter() - run_start) * 1000),
                "last_llm_latency_ms": round(llm_latency_ms),
                "tokens": usage_totals,
            }
            return

        # Multiple tool calls in the same turn run concurrently, not one at a time.
        for fc in function_calls:
            args = dict(fc.args) if fc.args else {}
            yield {"type": "tool_call", "tool": fc.name, "args": args}

        tool_calls_made += len(function_calls)
        results = await asyncio.gather(*(_run_tool_call(fc) for fc in function_calls))

        response_parts = []
        for fc, (name, args, result, latency_ms) in zip(function_calls, results):
            yield {"type": "tool_result", "tool": name, "result": result, "latency_ms": round(latency_ms)}
            response_parts.append(
                types.Part(
                    function_response=types.FunctionResponse(id=fc.id, name=fc.name, response={"result": result})
                )
            )
        contents.append(types.Content(role="user", parts=response_parts))

    yield {
        "type": "answer",
        "text": "I ran out of steps trying to answer that — try breaking the question into smaller parts.",
    }
    yield {
        "type": "trace_summary",
        "steps": tool_calls_made,
        "llm_calls": MAX_STEPS,
        "total_latency_ms": round((time.perf_counter() - run_start) * 1000),
        "tokens": usage_totals,
    }
