"""Reviewer agent: checks worker findings against the original plan
before anything gets synthesized into a final answer — the pipeline's
reflection step."""

import json

from llm import generate_structured
from research.schemas import ReviewResult, ResearchPlan, WorkerFinding

SYSTEM_PROMPT = (
    "You are reviewing a research team's output before it's turned into a "
    "final answer. Check: was every planned sub-question addressed? Are "
    "claims backed by sources? Do any findings contradict each other? Is "
    "anything important missing? Are there unsupported claims (stated as "
    "fact with no source)? Set additional_research_required=true only if "
    "the gaps are significant enough to be worth another research round — "
    "minor stylistic gaps don't count. List concrete, specific feedback."
)


async def review(question: str, plan: ResearchPlan, findings: list[WorkerFinding]) -> ReviewResult:
    findings_text = json.dumps([f.model_dump() for f in findings], indent=2)
    prompt = (
        f"Original question: {question}\n\n"
        f"Planned sub-questions: {json.dumps([sq.model_dump() for sq in plan.sub_questions], indent=2)}\n\n"
        f"Worker findings:\n{findings_text}"
    )
    return await generate_structured(prompt, ReviewResult, system_instruction=SYSTEM_PROMPT)
