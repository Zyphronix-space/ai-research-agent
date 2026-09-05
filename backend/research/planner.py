"""Planner agent: turns one research question into a small set of
concrete sub-questions, each assigned to its own Researcher. The count
range scales with the requested research depth — this is the one place
"Quick/Standard/Deep" actually changes plan shape, not just a label."""

from llm import generate_structured
from research.schemas import ResearchPlan

DEPTH_RANGES = {
    "quick": "1-2",
    "standard": "2-5",
    "deep": "4-7",
}


def _system_prompt(depth: str) -> str:
    span = DEPTH_RANGES.get(depth, DEPTH_RANGES["standard"])
    return (
        f"You are a research planner. Given a research question, break it into "
        f"{span} focused sub-questions that, answered together, fully cover the "
        "original question. Each sub-question should be independently "
        "researchable (a researcher assigned to it shouldn't need the answer to "
        "another sub-question first). Give each one a short id (sq1, sq2, ...), "
        "a topic, and guidance on what evidence to look for."
    )


async def plan(question: str, depth: str = "standard") -> ResearchPlan:
    return await generate_structured(
        f"Research question: {question}",
        ResearchPlan,
        system_instruction=_system_prompt(depth),
    )
