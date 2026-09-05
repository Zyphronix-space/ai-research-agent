"""Writer agent: turns approved findings into the final report the user
reads — organized, cited, honest about uncertainty. Also exposes
regenerate(), used to rewrite a report from a run's already-persisted
findings without rerunning the whole pipeline (the "Regenerate report"
control)."""

import json

from llm import generate_structured
from research.schemas import FinalAnswer, ResearchPlan, ReviewResult, WorkerFinding

SYSTEM_PROMPT = (
    "Write the final research report from the findings below. Directly "
    "answer the original question, organize the information clearly "
    "(markdown headings/lists are fine), and cite sources inline where "
    "you state a fact from them. Distinguish established facts from "
    "interpretation/synthesis. Note real uncertainty rather than papering "
    "over gaps the review flagged. Never invent a source that isn't in "
    "the findings. Avoid repeating the same point in multiple sections. "
    "Also return a short list of key findings (one sentence each) and the "
    "full list of citation URLs used."
)


async def write(
    question: str, plan: ResearchPlan, findings: list[WorkerFinding], review: ReviewResult
) -> FinalAnswer:
    prompt = (
        f"Original question: {question}\n\n"
        f"Findings:\n{json.dumps([f.model_dump() for f in findings], indent=2)}\n\n"
        f"Review notes (address these where possible): {json.dumps(review.model_dump(), indent=2)}"
    )
    return await generate_structured(prompt, FinalAnswer, system_instruction=SYSTEM_PROMPT)
