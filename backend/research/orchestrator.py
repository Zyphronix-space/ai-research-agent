"""Orchestrator: runs Planner -> Workers (parallel) -> Reviewer -> maybe
another round of Workers -> Synthesizer, yielding one event per step so
the API can stream a live pipeline instead of one opaque wait.

The one genuinely new piece of async plumbing here is fanning several
concurrent workers' events into a single ordered stream: each worker
coroutine pushes its own tool_call/tool_result/worker_done events onto a
shared asyncio.Queue as it goes, and `_run_worker_batch` drains that
queue and yields events as they arrive (not after all workers finish) —
so worker 2 finishing before worker 1 shows up in the stream in that
order, matching what's actually happening.
"""

import asyncio
import time

from research import planner, reviewer, synthesizer, worker
from research.schemas import ReviewResult, SubQuestion, WorkerFinding

MAX_REVIEW_ITERATIONS = 2  # extra research rounds beyond the first pass


async def run_research(question: str):
    """Async generator of pipeline events. See README for the full event
    vocabulary; every event has a "type" and, for agent-scoped ones, a
    "duration_ms" once that agent finishes."""
    run_start = time.perf_counter()
    trace: list[dict] = []
    findings: dict[str, WorkerFinding] = {}
    worker_counter = 0

    try:
        # --- Planner -----------------------------------------------------
        t0 = time.perf_counter()
        yield {"type": "plan_start"}
        try:
            research_plan = await planner.plan(question)
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

        async def run_worker_batch(sub_questions: list[SubQuestion]):
            nonlocal worker_counter
            queue: asyncio.Queue = asyncio.Queue()
            batch: dict[str, tuple[SubQuestion, WorkerFinding, int]] = {}

            async def run_one(sq: SubQuestion, stagger_s: float):
                # All workers are logically concurrent, but starting every one
                # of them the same instant means every one of them hits Gemini
                # in the same instant too — on the free tier that burst blows
                # through the requests-per-minute limit before any single
                # worker's own retry/backoff has a chance to help. A small
                # stagger spreads the *first* call of each worker out by a
                # couple of seconds (they still run concurrently afterwards)
                # without materially slowing the pipeline down.
                if stagger_s:
                    await asyncio.sleep(stagger_s)
                nonlocal worker_counter
                worker_counter += 1
                worker_id = f"worker_{worker_counter:02d}"
                start = time.perf_counter()
                await queue.put({"type": "worker_start", "worker": worker_id, "topic": sq.topic})

                async def emit(event: dict):
                    await queue.put({**event, "worker": worker_id})

                finding = await worker.run_worker(sq, emit)
                dur = round((time.perf_counter() - start) * 1000)
                batch[worker_id] = (sq, finding, dur)
                await queue.put(
                    {
                        "type": "worker_done",
                        "worker": worker_id,
                        "finding": finding.model_dump(),
                        "duration_ms": dur,
                    }
                )

            tasks = [asyncio.create_task(run_one(sq, idx * 2.0)) for idx, sq in enumerate(sub_questions)]
            remaining = len(tasks)
            while remaining > 0:
                event = await queue.get()
                yield event
                if event["type"] == "worker_done":
                    remaining -= 1
            await asyncio.gather(*tasks)  # surface anything that slipped past run_worker's own try/except

            for worker_id, (sq, finding, dur) in batch.items():
                findings[worker_id] = finding
                trace.append(
                    {
                        "name": worker_id,
                        "topic": sq.topic,
                        "duration_ms": dur,
                        "sources_found": len(finding.sources),
                        "failed": finding.failed,
                    }
                )

        # --- Workers (round 1) -------------------------------------------
        async for event in run_worker_batch(research_plan.sub_questions):
            yield event

        # --- Reviewer, with a bounded re-research loop --------------------
        review_result: ReviewResult | None = None
        iteration = 0
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

            if not review_result.additional_research_required or iteration >= MAX_REVIEW_ITERATIONS:
                break

            iteration += 1
            # Cap how many gaps get their own extra worker — the reviewer can
            # list more than is worth another full research round for, and
            # each one is a real Gemini round-trip (or several).
            gaps = (review_result.missing_topics or ["Address the gaps noted in reviewer feedback."])[:3]
            yield {"type": "iteration_start", "iteration": iteration + 1, "topics": gaps}
            extra_sub_questions = [
                SubQuestion(id=f"extra{iteration}_{i}", topic=topic, guidance="Address this gap flagged by review.")
                for i, topic in enumerate(gaps)
            ]
            async for event in run_worker_batch(extra_sub_questions):
                yield event

        # --- Synthesizer ---------------------------------------------------
        t0 = time.perf_counter()
        yield {"type": "synthesis_start"}
        try:
            final_answer = await synthesizer.synthesize(
                question, research_plan, list(findings.values()), review_result
            )
        except Exception as exc:
            yield {"type": "error", "phase": "synthesizer", "message": str(exc)}
            return
        duration_ms = round((time.perf_counter() - t0) * 1000)
        trace.append({"name": "synthesizer", "duration_ms": duration_ms})
        yield {"type": "synthesis_done", "answer": final_answer.model_dump(), "duration_ms": duration_ms}

        yield {
            "type": "trace_summary",
            "agents": trace,
            "total_ms": round((time.perf_counter() - run_start) * 1000),
            "review_iterations": iteration + 1,
        }
    except Exception as exc:  # last-resort guard so a bug never crashes the stream silently
        yield {"type": "error", "phase": "orchestrator", "message": str(exc)}
