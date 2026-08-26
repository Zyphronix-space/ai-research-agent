"""The agent loop: Gemini decides which tool(s) to call, we execute them
locally with plain Python, feed the results back, and repeat until it gives
a final answer (or hits the step cap). This is the actual "agent" part —
everything else is plumbing around it."""

import os

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

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
    "relaxed, brief reply, not a formal one."
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


def run_agent(question: str, think_longer: bool = False):
    """Generator yielding dict events: tool_call, tool_result, answer, error."""
    thinking_budget = 8192 if think_longer else 256
    max_tokens = 4096 if think_longer else 1024
    contents = [types.Content(role="user", parts=[types.Part(text=question)])]

    for _ in range(MAX_STEPS):
        try:
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
        except APIError as exc:
            if exc.code == 429:
                yield {"type": "error", "message": "Hit the free-tier rate limit — wait a few seconds and try again."}
            else:
                yield {"type": "error", "message": f"Gemini API error: {exc}"}
            return

        candidate = response.candidates[0]
        contents.append(candidate.content)

        function_calls = [p.function_call for p in candidate.content.parts if p.function_call]
        if not function_calls:
            text = "".join(p.text for p in candidate.content.parts if p.text)
            yield {"type": "answer", "text": text or "I don't have an answer for that."}
            return

        response_parts = []
        for fc in function_calls:
            args = dict(fc.args) if fc.args else {}
            yield {"type": "tool_call", "tool": fc.name, "args": args}
            fn = TOOL_FUNCTIONS.get(fc.name)
            result = fn(**args) if fn else f"Unknown tool: {fc.name}"
            yield {"type": "tool_result", "tool": fc.name, "result": result}
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
