"""Tools available to Researcher agents (executed on their behalf by the
Tool Agent step of the pipeline): web_search/calculator/get_current_datetime
reused unchanged from the top-level tools.py, plus fetch_url, a genuine
second research tool so a researcher can read a full source instead of a
search-result snippet.
"""

import requests
from bs4 import BeautifulSoup
from google.genai import types

from tools import calculator, get_current_datetime, web_search

FETCH_URL_TIMEOUT_S = 8
FETCH_URL_MAX_CHARS = 4000


def fetch_url(url: str) -> str:
    """Fetch a URL and return its main text content, stripped of markup —
    lets a worker read a source in full after finding it via web_search."""
    try:
        resp = requests.get(url, timeout=FETCH_URL_TIMEOUT_S, headers={"User-Agent": "research-agent/1.0"})
        resp.raise_for_status()
    except requests.RequestException as exc:
        return f"Could not fetch '{url}': {exc}"

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = " ".join(soup.get_text(separator=" ").split())
    if not text:
        return f"Fetched '{url}' but found no readable text."
    return text[:FETCH_URL_MAX_CHARS]


TOOL_FUNCTIONS = {
    "web_search": web_search,
    "fetch_url": fetch_url,
    "get_current_datetime": get_current_datetime,
    "calculator": calculator,
}

TOOL_DECLARATIONS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="web_search",
                description="Search the web for sources on a topic. Returns titles, snippets, and URLs.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"query": types.Schema(type="STRING", description="the search query")},
                    required=["query"],
                ),
            ),
            types.FunctionDeclaration(
                name="fetch_url",
                description="Fetch a specific URL (e.g. one found via web_search) and read its full text content.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"url": types.Schema(type="STRING", description="the URL to fetch")},
                    required=["url"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_current_datetime",
                description="Get the current date and time in UTC.",
                parameters=types.Schema(type="OBJECT", properties={}),
            ),
            types.FunctionDeclaration(
                name="calculator",
                description="Evaluate an arithmetic expression — use for any numeric comparison or "
                "calculation a sub-question needs (e.g. cost differences, growth rates).",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"expression": types.Schema(type="STRING", description="e.g. '(120-99)/99*100'")},
                    required=["expression"],
                ),
            ),
        ]
    )
]
