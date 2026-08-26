"""Tools the agent can call. Each is a plain Python function with a small,
explicit surface — the agent loop in agent.py decides when to call these,
not the functions themselves."""

import ast
import operator
from datetime import datetime, timezone

from ddgs import DDGS

_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval_node(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
        return _OPERATORS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPERATORS:
        return _OPERATORS[type(node.op)](_eval_node(node.operand))
    raise ValueError(f"unsupported expression: {ast.dump(node)}")


def calculator(expression: str) -> str:
    """Evaluate an arithmetic expression safely (no eval()) — supports
    + - * / // % ** and parentheses."""
    try:
        tree = ast.parse(expression, mode="eval")
        return str(_eval_node(tree.body))
    except Exception as exc:
        return f"Could not evaluate '{expression}': {exc}"


def web_search(query: str) -> str:
    """Search the web (DuckDuckGo) and return the top results as text."""
    try:
        results = DDGS().text(query, max_results=5)
    except Exception as exc:
        return f"Search failed: {exc}"
    if not results:
        return "No results found."
    return "\n".join(f"- {r['title']}: {r['body']} ({r['href']})" for r in results)


def get_current_datetime() -> str:
    """Return the current date and time in UTC."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


TOOL_FUNCTIONS = {
    "calculator": calculator,
    "web_search": web_search,
    "get_current_datetime": get_current_datetime,
}
