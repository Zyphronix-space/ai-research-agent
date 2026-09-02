"""The app's relational storage: users, login sessions, and (for signed-in
users only) research run history. One SQLite file, stdlib sqlite3 only —
a demo-scale project doesn't need a database server.

Research history is opt-in, same as the chat history this replaced: the
app works fully anonymously with the frontend keeping run results in
localStorage (see App.jsx). Signing in with Google upgrades a user to
server-side, cross-device history — these functions are what that
upgrade path writes to and reads from.
"""

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager

# Defaults to a file next to this module (fine for local dev and any host
# whose filesystem persists across restarts). On platforms where the app's
# own code directory is rebuilt on every deploy/restart — e.g. Azure App
# Service on Linux extracts the app to an ephemeral /tmp path — set
# AI_AGENT_DB_DIR to a persistent, writable directory (Azure App Service
# mounts /home persistently) so the database survives restarts.
_DB_DIR = os.environ.get("AI_AGENT_DB_DIR", os.path.dirname(__file__))
os.makedirs(_DB_DIR, exist_ok=True)
DB_PATH = os.path.join(_DB_DIR, "app.db")


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                name TEXT,
                picture TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS research_runs (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                question TEXT NOT NULL,
                status TEXT NOT NULL,
                saved INTEGER NOT NULL DEFAULT 0,
                final_answer TEXT,
                key_findings TEXT,
                sources TEXT,
                review TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS research_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
                seq INTEGER NOT NULL,
                agent_name TEXT NOT NULL,
                duration_ms INTEGER,
                extra TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_research_runs_user ON research_runs(user_id);
            CREATE INDEX IF NOT EXISTS idx_research_events_run ON research_events(run_id);
            """
        )
        conn.commit()


# --- users / sessions -------------------------------------------------

def upsert_user(google_sub: str, email: str, name: str | None, picture: str | None) -> sqlite3.Row:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO users (google_sub, email, name, picture)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email,
                name = excluded.name, picture = excluded.picture
            """,
            (google_sub, email, name, picture),
        )
        conn.commit()
        return conn.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone()


def create_session(user_id: int) -> str:
    token = uuid.uuid4().hex
    with _connect() as conn:
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
        conn.commit()
    return token


def get_user_by_session(token: str) -> sqlite3.Row | None:
    with _connect() as conn:
        return conn.execute(
            """
            SELECT users.* FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()


def delete_session(token: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


# --- research runs -------------------------------------------------------

def save_research_run(
    user_id: int,
    run_id: str,
    question: str,
    status: str,
    final_answer: str | None,
    key_findings: list[str] | None,
    sources: list[str] | None,
    review: dict | None,
    trace: list[dict],
) -> None:
    """Upserts one research run and (re)writes its trace/event rows.
    Called once, after the run finishes (successfully or with an error) —
    a run isn't visible in history until it's done."""
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO research_runs (id, user_id, question, status, final_answer, key_findings, sources, review)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status = excluded.status, final_answer = excluded.final_answer,
                key_findings = excluded.key_findings, sources = excluded.sources, review = excluded.review,
                updated_at = datetime('now')
            """,
            (
                run_id,
                user_id,
                question,
                status,
                json.dumps(final_answer) if final_answer is not None else None,
                json.dumps(key_findings) if key_findings is not None else None,
                json.dumps(sources) if sources is not None else None,
                json.dumps(review) if review is not None else None,
            ),
        )
        conn.execute("DELETE FROM research_events WHERE run_id = ?", (run_id,))
        for seq, entry in enumerate(trace):
            extra = {k: v for k, v in entry.items() if k not in ("name", "duration_ms")}
            conn.execute(
                "INSERT INTO research_events (run_id, seq, agent_name, duration_ms, extra) VALUES (?, ?, ?, ?, ?)",
                (run_id, seq, entry.get("name", "unknown"), entry.get("duration_ms"), json.dumps(extra)),
            )
        conn.commit()


def list_research_runs(user_id: int) -> list[sqlite3.Row]:
    with _connect() as conn:
        return conn.execute(
            "SELECT id, question, status, saved, created_at, updated_at FROM research_runs "
            "WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()


def get_research_run(user_id: int, run_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM research_runs WHERE id = ? AND user_id = ?", (run_id, user_id)
        ).fetchone()
        if row is None:
            return None
        events = conn.execute(
            "SELECT agent_name, duration_ms, extra FROM research_events WHERE run_id = ? ORDER BY seq ASC",
            (run_id,),
        ).fetchall()
    return {
        "id": row["id"],
        "question": row["question"],
        "status": row["status"],
        "saved": bool(row["saved"]),
        "final_answer": json.loads(row["final_answer"]) if row["final_answer"] else None,
        "key_findings": json.loads(row["key_findings"]) if row["key_findings"] else None,
        "sources": json.loads(row["sources"]) if row["sources"] else None,
        "review": json.loads(row["review"]) if row["review"] else None,
        "trace": [
            {"name": e["agent_name"], "duration_ms": e["duration_ms"], **json.loads(e["extra"] or "{}")}
            for e in events
        ],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def set_research_run_saved(user_id: int, run_id: str, saved: bool) -> bool:
    with _connect() as conn:
        owner = conn.execute("SELECT user_id FROM research_runs WHERE id = ?", (run_id,)).fetchone()
        if owner is None or owner["user_id"] != user_id:
            return False
        conn.execute("UPDATE research_runs SET saved = ? WHERE id = ?", (1 if saved else 0, run_id))
        conn.commit()
        return True


def delete_research_run(user_id: int, run_id: str) -> bool:
    with _connect() as conn:
        owner = conn.execute("SELECT user_id FROM research_runs WHERE id = ?", (run_id,)).fetchone()
        if owner is None or owner["user_id"] != user_id:
            return False
        conn.execute("DELETE FROM research_runs WHERE id = ?", (run_id,))
        conn.commit()
        return True


init_db()
