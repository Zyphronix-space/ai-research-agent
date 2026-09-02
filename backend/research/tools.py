"""Tools available to Worker agents: the existing web_search/get_current_datetime
(reused unchanged from the top-level tools.py — calculator is dropped, it
has no role in research), plus fetch_url, a genuine second tool so a
worker can read a full source instead of a search-result snippet.
"""

import requests
from bs4 import BeautifulSoup
from google.genai import types

from tools import get_current_datetime, web_search

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
        ]
    )
]
