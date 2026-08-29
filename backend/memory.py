"""Cross-session semantic memory.

Every finished exchange (question + answer) is embedded with Gemini's
embedding model and stored in a small local SQLite database. On a new
question, we embed it the same way and pull back the most similar past
exchanges — regardless of which session they came from — so the agent can
say "you asked me something like this before" instead of starting from a
blank slate every time.

No vector database dependency: at the scale of a demo/portfolio project a
few hundred stored exchanges is nowhere near where a linear cosine-similarity
scan over an in-memory list of ~768-float vectors becomes a bottleneck, so a
SQLite table plus plain Python is the honest amount of engineering — not an
excuse to skip the idea, not an excuse to reach for infrastructure the
project doesn't need yet.
"""

import json
import math
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass

DB_PATH = os.path.join(os.path.dirname(__file__), "memory.db")
EMBED_MODEL = "gemini-embedding-001"
EMBED_DIM = 768
MAX_ROWS_SCANNED = 500  # cap the linear scan; oldest exchanges age out of recall first
MIN_SIMILARITY = 0.55


@dataclass
class Recalled:
    session_id: str
    question: str
    answer: str
    similarity: float
    created_at: str


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exchanges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                embedding TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.commit()


def _embed(client, text: str, task_type: str) -> list[float]:
    from google.genai import types

    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=EMBED_DIM, task_type=task_type),
    )
    return list(response.embeddings[0].values)


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def recall(client, question: str, top_k: int = 3) -> tuple[list[Recalled], int]:
    """Return the top_k most semantically similar past exchanges (any
    session) above MIN_SIMILARITY, plus how many rows were scanned."""
    query_vec = _embed(client, question, task_type="RETRIEVAL_QUERY")

    with _connect() as conn:
        rows = conn.execute(
            "SELECT session_id, question, answer, embedding, created_at "
            "FROM exchanges ORDER BY id DESC LIMIT ?",
            (MAX_ROWS_SCANNED,),
        ).fetchall()

    scored = []
    for session_id, q, a, embedding_json, created_at in rows:
        sim = _cosine(query_vec, json.loads(embedding_json))
        if sim >= MIN_SIMILARITY:
            scored.append(Recalled(session_id, q, a, sim, created_at))

    scored.sort(key=lambda r: r.similarity, reverse=True)
    return scored[:top_k], len(rows)


def save_exchange(client, session_id: str, question: str, answer: str) -> None:
    doc_vec = _embed(client, question, task_type="RETRIEVAL_DOCUMENT")
    with _connect() as conn:
        conn.execute(
            "INSERT INTO exchanges (session_id, question, answer, embedding) VALUES (?, ?, ?, ?)",
            (session_id, question, answer, json.dumps(doc_vec)),
        )
        conn.commit()


init_db()
