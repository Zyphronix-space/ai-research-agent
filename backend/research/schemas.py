"""Typed contracts shared by every agent, the orchestrator, the API
response, and storage. These are also handed to Gemini directly as
`response_schema` for structured output — one definition, three uses
(prompting, validation, persistence), so the plan/finding/review shapes
in the README examples are literally the shapes the model returns, not
free text we hope to parse.
"""

from pydantic import BaseModel, Field


class SubQuestion(BaseModel):
    id: str = Field(description="short id, e.g. 'sq1'")
    topic: str = Field(description="what this sub-question investigates")
    guidance: str = Field(description="what a researcher investigating this should look for")


class ResearchPlan(BaseModel):
    sub_questions: list[SubQuestion]


class SourceItem(BaseModel):
    """A source as actually seen in a tool result — title and url come
    verbatim from web_search/fetch_url output, never invented. No
    published-date field: tool output doesn't reliably carry one, and
    fabricating it would violate "never fabricate source metadata"."""

    title: str
    url: str


class WorkerFinding(BaseModel):
    task: str
    findings: list[str] = Field(default_factory=list)
    sources: list[SourceItem] = Field(default_factory=list)
    confidence: str = Field(default="medium", description="'high', 'medium', or 'low'")
    limitations: list[str] = Field(default_factory=list)
    failed: bool = False


class ReviewResult(BaseModel):
    approved: bool
    missing_topics: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    additional_research_required: bool = False
    feedback: list[str] = Field(default_factory=list)


class FinalAnswer(BaseModel):
    answer_markdown: str
    key_findings: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
