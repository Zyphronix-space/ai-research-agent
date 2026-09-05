"""Orchestrator: runs Planner -> Researchers (parallel, via the Tool Agent's
tool-calling loop) -> Reviewer -> maybe another round of Researchers ->
Writer, yielding one event per step so the API can stream a live pipeline
instead of one opaque wait.

The one genuinely new piece of async plumbing here is fanning several
concurrent researchers' events into a single ordered stream: each researcher
coroutine pushes its own tool_call/tool_result/researcher_done events onto a
shared asyncio.Queue as it goes, and `_run_researcher_batch` drains that
queue and yields events as they arrive (not after all researchers finish) —
so researcher 2 finishing before researcher 1 shows up in the stream in
that order, matching what's actually happening.

Agent toggles (`agent_config`): planner and researcher can't be turned off
(there's no research pipeline without them — the API layer rejects that
before this module is ever called). Reviewer and writer can be — skipping
the reviewer just means no reflection round; skipping the writer means the
pipeline stops after the (single) research round and returns raw findings
instead of a synthesized report, both real behavior changes, not stubs.
"""

import asyncio
import time

from research import planner, researcher, reviewer, writer
from research.schemas import FinalAnswer, ReviewResult, SubQuestion, WorkerFinding

MAX_REVIEW_ITERATIONS = 2  # extra research rounds beyond the first pass, at "standard" depth

DEFAULT_AGENT_CONFIG = {"planner": True, "researcher": True, "reviewer": True, "writer": True}

# depth changes real pipeline behavior, not just a label: how many tool-use
# steps each researcher gets, and how many extra review rounds are allowed.
DEPTH_SETTINGS = {
    "quick": {"researcher_max_steps": 2, "max_review_iterations": 0},
    "standard": {"researcher_max_steps": 3, "max_review_iterations": MAX_REVIEW_ITERATIONS},
    "deep": {"researcher_max_steps": 5, "max_review_iterations": 3},
}


def _raw_answer(findings: list[WorkerFinding]) -> FinalAnswer:
    """Used when the writer is disabled: compiles findings directly instead
    of asking the model to synthesize them, so "writer off" is an honestly
    different (rawer) report, not a fake shortcut."""
    lines = []
    citations: list[str] = []
    for f in findings:
        lines.append(f"### {f.task}")
        for fact in f.findings:
            lines.append(f"- {fact}")
        for s in f.sources:
            if s.url not in citations:
                citations.append(s.url)
    return FinalAnswer(
        answer_markdown="\n".join(lines) or "No findings were collected.",
        key_findings=[f.task for f in findings if not f.failed],
        citations=citations,
    )


async def run_research(question: str, agent_config: dict | None = None, depth: str = "standard"):
    """Async generator of pipeline events. See README for the full event
    vocabulary; every event has a "type" and, for agent-scoped ones, a
    "duration_ms" once that agent finishes."""
    config = {**DEFAULT_AGENT_CONFIG, **(agent_config or {})}
    depth_settings = DEPTH_SETTINGS.get(depth, DEPTH_SETTINGS["standard"])
    run_start = time.perf_counter()
    trace: list[dict] = []
    findings: dict[str, WorkerFinding] = {}
    researcher_counter = 0

    try:
        # --- Planner -----------------------------------------------------
        t0 = time.perf_counter()
        yield {"type": "plan_start"}
        try:
            research_plan = await planner.plan(question, depth)
        except Exception as exc:
            yield {"type": "error", "phase": "planner", "message": str(exc)}
            return
        duration_ms = round((time.perf_counter() - t0) * 1000)
        trace.append({"name": "planner", "duration_ms": duration_ms})
        yield {
            "type": "plan_done",
            "sub_questions": [sq.model_dump() for sq in research_plan.sub_questions],
            "duration_ms": duration_ms,
        }

        async def run_researcher_batch(sub_questions: list[SubQuestion]):
            nonlocal researcher_counter
            queue: asyncio.Queue = asyncio.Queue()
            batch: dict[str, tuple[SubQuestion, WorkerFinding, int]] = {}

            async def run_one(sq: SubQuestion, stagger_s: float):
                # All researchers are logically concurrent, but starting every
                # one of them the same instant means every one of them hits
                # Gemini in the same instant too — on the free tier that burst
                # blows through the requests-per-minute limit before any
                # single researcher's own retry/backoff has a chance to help.
                # A small stagger spreads the *first* call of each researcher
                # out by a couple of seconds (they still run concurrently
                # afterwards) without materially slowing the pipeline down.
                if stagger_s:
                    await asyncio.sleep(stagger_s)
                nonlocal researcher_counter
                researcher_counter += 1
                researcher_id = f"researcher_{researcher_counter:02d}"
                start = time.perf_counter()
                await queue.put({"type": "researcher_start", "researcher": researcher_id, "topic": sq.topic})

                async def emit(event: dict):
                    await queue.put({**event, "researcher": researcher_id})

                finding = await researcher.run_researcher(sq, emit, max_steps=depth_settings["researcher_max_steps"])
                dur = round((time.perf_counter() - start) * 1000)
                batch[researcher_id] = (sq, finding, dur)
                await queue.put(
                    {
                        "type": "researcher_done",
                        "researcher": researcher_id,
                        "finding": finding.model_dump(),
                        "duration_ms": dur,
                    }
                )

            tasks = [asyncio.create_task(run_one(sq, idx * 2.0)) for idx, sq in enumerate(sub_questions)]
            remaining = len(tasks)
            while remaining > 0:
                event = await queue.get()
                yield event
                if event["type"] == "researcher_done":
                    remaining -= 1
            await asyncio.gather(*tasks)  # surface anything that slipped past run_researcher's own try/except

            for researcher_id, (sq, finding, dur) in batch.items():
                findings[researcher_id] = finding
                trace.append(
                    {
                        "name": researcher_id,
                        "topic": sq.topic,
                        "duration_ms": dur,
                        "sources_found": len(finding.sources),
                        "failed": finding.failed,
                        "finding": finding.model_dump(),
                    }
                )

        # --- Researchers (round 1) ----------------------------------------
        async for event in run_researcher_batch(research_plan.sub_questions):
            yield event

        # --- Reviewer, with a bounded re-research loop --------------------
        review_result: ReviewResult
        iteration = 0
        if config["reviewer"]:
            while True:
                t0 = time.perf_counter()
                yield {"type": "review_start", "iteration": iteration + 1}
                try:
                    review_result = await reviewer.review(question, research_plan, list(findings.values()))
                except Exception as exc:
                    yield {"type": "error", "phase": "reviewer", "message": str(exc)}
                    review_result = ReviewResult(
                        approved=True,
                        additional_research_required=False,
                        feedback=[f"Automated review failed ({exc}); proceeding with unreviewed findings."],
                    )
                    break
                duration_ms = round((time.perf_counter() - t0) * 1000)
                trace.append({"name": f"reviewer_round_{iteration + 1}", "duration_ms": duration_ms})
                yield {
                    "type": "review_done",
                    "iteration": iteration + 1,
                    "review": review_result.model_dump(),
                    "duration_ms": duration_ms,
                }

                if not review_result.additional_research_required or iteration >= depth_settings["max_review_iterations"]:
                    break

                iteration += 1
                # Cap how many gaps get their own extra researcher — the
                # reviewer can list more than is worth another full research
                # round for, and each one is a real Gemini round-trip (or several).
                gaps = (review_result.missing_topics or ["Address the gaps noted in reviewer feedback."])[:3]
                yield {"type": "iteration_start", "iteration": iteration + 1, "topics": gaps}
                extra_sub_questions = [
                    SubQuestion(id=f"extra{iteration}_{i}", topic=topic, guidance="Address this gap flagged by review.")
                    for i, topic in enumerate(gaps)
                ]
                async for event in run_researcher_batch(extra_sub_questions):
                    yield event
        else:
            review_result = ReviewResult(approved=True, additional_research_required=False, feedback=["Reviewer disabled for this run."])
            yield {"type": "review_done", "iteration": 0, "review": review_result.model_dump(), "duration_ms": 0, "skipped": True}

        # --- Writer ---------------------------------------------------------
        t0 = time.perf_counter()
        if config["writer"]:
            yield {"type": "writing_start"}
            try:
                final_answer = await writer.write(question, research_plan, list(findings.values()), review_result)
            except Exception as exc:
                yield {"type": "error", "phase": "writer", "message": str(exc)}
                return
            duration_ms = round((time.perf_counter() - t0) * 1000)
            trace.append({"name": "writer", "duration_ms": duration_ms})
            yield {"type": "writing_done", "answer": final_answer.model_dump(), "duration_ms": duration_ms}
        else:
            final_answer = _raw_answer(list(findings.values()))
            yield {"type": "writing_done", "answer": final_answer.model_dump(), "duration_ms": 0, "skipped": True}

        yield {
            "type": "trace_summary",
            "agents": trace,
            "total_ms": round((time.perf_counter() - run_start) * 1000),
            "review_iterations": iteration + 1,
        }
    except Exception as exc:  # last-resort guard so a bug never crashes the stream silently
        yield {"type": "error", "phase": "orchestrator", "message": str(exc)}
