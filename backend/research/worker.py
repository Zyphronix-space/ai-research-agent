"""Worker agent: given one sub-question, gathers evidence with tools
(web_search, fetch_url, get_current_datetime) via the shared tool-calling
loop, then makes one more call to write up a structured finding from
whatever it gathered. Two phases, not one call, because Gemini doesn't
reliably do free tool use and constrained JSON output in the same
request — separating "go gather evidence" from "now report what you
found" keeps both phases reliable.
"""

from llm import generate_structured, generate_with_tools
from research.schemas import SubQuestion, WorkerFinding
from research.tools import TOOL_DECLARATIONS, TOOL_FUNCTIONS

GATHER_SYSTEM_PROMPT = (
    "You are a research worker investigating one specific sub-question as "
    "part of a larger research project. Use web_search to find sources, "
    "and fetch_url to read a promising result in full when a snippet "
    "isn't enough. Gather concrete facts and note which source each came "
    "from. Once you have enough to answer the sub-question, summarize "
    "what you found and the URLs you used in plain text."
)

WRITEUP_SYSTEM_PROMPT = (
    "Given the research notes below (gathered by yourself in a prior "
    "step), produce a structured finding: the concrete facts found, the "
    "source URLs that back them, an honest confidence level ('high' if "
    "well-sourced and consistent, 'low' if sources were thin or "
    "conflicting), and any real limitations (e.g. sources were outdated, "
    "conflicting, or the sub-question could only be partly answered)."
)


async def run_worker(sub_question: SubQuestion, emit, max_steps: int = 3) -> WorkerFinding:
    """`emit(event)` is awaited for every tool_call/tool_result so the
    orchestrator can fan several workers' events into one live stream."""
    task_text = f"Sub-question: {sub_question.topic}\nGuidance: {sub_question.guidance}"

    try:
        notes, _usage = await generate_with_tools(
            task_text,
            system_instruction=GATHER_SYSTEM_PROMPT,
            tool_declarations=TOOL_DECLARATIONS,
            tool_functions=TOOL_FUNCTIONS,
            emit=emit,
            max_steps=max_steps,
        )
        finding = await generate_structured(
            f"Sub-question: {sub_question.topic}\n\nResearch notes:\n{notes}",
            WorkerFinding,
            system_instruction=WRITEUP_SYSTEM_PROMPT,
        )
        finding.task = sub_question.topic
        return finding
    except Exception as exc:
        return WorkerFinding(
            task=sub_question.topic,
            findings=[],
            sources=[],
            confidence="none",
            limitations=[f"Worker failed: {exc}"],
            failed=True,
        )
