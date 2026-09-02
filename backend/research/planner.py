"""Planner agent: turns one research question into a small set of
concrete sub-questions, each assigned to its own Worker."""

from llm import generate_structured
from research.schemas import ResearchPlan

SYSTEM_PROMPT = (
    "You are a research planner. Given a research question, break it into "
    "2-5 focused sub-questions that, answered together, fully cover the "
    "original question. Each sub-question should be independently "
    "researchable (a worker assigned to it shouldn't need the answer to "
    "another sub-question first). Give each one a short id (sq1, sq2, ...), "
    "a topic, and guidance on what evidence to look for."
)


async def plan(question: str) -> ResearchPlan:
    return await generate_structured(
        f"Research question: {question}",
        ResearchPlan,
        system_instruction=SYSTEM_PROMPT,
    )
