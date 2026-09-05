"""The app's relational storage: users, sessions (Google + email/password),
password reset tokens, projects, research runs (sessions), their structured
sources, and per-agent trace events. One SQLite file, stdlib sqlite3 only —
a demo-scale project doesn't need a database server.

Migrations are additive and idempotent (`ALTER TABLE ... ADD COLUMN` guarded
by a `PRAGMA table_info` check) so redeploying never drops or resets
existing rows — see `_ensure_column`.
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
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def _ensure_column(conn, table: str, column: str, ddl_type: str) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub TEXT UNIQUE,
                email TEXT NOT NULL UNIQUE,
                name TEXT,
                picture TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS password_resets (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                domain TEXT NOT NULL,
                relevance TEXT NOT NULL DEFAULT 'medium',
                published_at TEXT,
                saved INTEGER NOT NULL DEFAULT 0,
                removed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_research_runs_user ON research_runs(user_id);
            CREATE INDEX IF NOT EXISTS idx_research_events_run ON research_events(run_id);
            CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
            CREATE INDEX IF NOT EXISTS idx_sources_run ON sources(run_id);
            CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);
            """
        )

        # Additive migrations for columns added after the first release of
        # each table above — never destructive, safe to run on every boot.
        _ensure_column(conn, "users", "password_hash", "TEXT")
        _ensure_column(conn, "sessions", "user_agent", "TEXT")
        _ensure_column(conn, "research_runs", "project_id", "TEXT REFERENCES projects(id) ON DELETE SET NULL")
        _ensure_column(conn, "research_runs", "depth", "TEXT NOT NULL DEFAULT 'standard'")
        _ensure_column(conn, "research_runs", "agent_config", "TEXT")
        _ensure_column(conn, "research_runs", "title", "TEXT")
        conn.commit()


# --- users / sessions -------------------------------------------------

def upsert_google_user(google_sub: str, email: str, name: str | None, picture: str | None) -> sqlite3.Row:
    with _connect() as conn:
        existing = conn.execute("SELECT * FROM users WHERE google_sub = ? OR email = ?", (google_sub, email)).fetchone()
        if existing is None:
            conn.execute(
                "INSERT INTO users (google_sub, email, name, picture) VALUES (?, ?, ?, ?)",
                (google_sub, email, name, picture),
            )
        else:
            conn.execute(
                "UPDATE users SET google_sub = ?, name = ?, picture = ? WHERE id = ?",
                (google_sub, name or existing["name"], picture or existing["picture"], existing["id"]),
            )
        conn.commit()
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def get_user_by_email(email: str) -> sqlite3.Row | None:
    with _connect() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    with _connect() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def create_password_user(email: str, name: str | None, password_hash: str) -> sqlite3.Row:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
            (email, name, password_hash),
        )
        conn.commit()
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def update_user_password(user_id: int, password_hash: str) -> None:
    with _connect() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        conn.commit()


def update_user_profile(user_id: int, name: str) -> None:
    with _connect() as conn:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
        conn.commit()


def create_session(user_id: int, user_agent: str | None = None) -> str:
    token = uuid.uuid4().hex
    with _connect() as conn:
        conn.execute("INSERT INTO sessions (token, user_id, user_agent) VALUES (?, ?, ?)", (token, user_id, user_agent))
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


def list_sessions(user_id: int) -> list[sqlite3.Row]:
    with _connect() as conn:
        return conn.execute(
            "SELECT token, user_agent, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()


def delete_session_for_user(user_id: int, token: str) -> bool:
    with _connect() as conn:
        owner = conn.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
        if owner is None or owner["user_id"] != user_id:
            return False
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        return True


# --- password resets ----------------------------------------------------

def create_password_reset(user_id: int, expires_at: str) -> str:
    token = uuid.uuid4().hex
    with _connect() as conn:
        conn.execute(
            "INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires_at),
        )
        conn.commit()
    return token


def get_password_reset(token: str) -> sqlite3.Row | None:
    with _connect() as conn:
        return conn.execute("SELECT * FROM password_resets WHERE token = ?", (token,)).fetchone()


def mark_password_reset_used(token: str) -> None:
    with _connect() as conn:
        conn.execute("UPDATE password_resets SET used = 1 WHERE token = ?", (token,))
        conn.commit()


# --- projects -------------------------------------------------------------

def create_project(user_id: int, name: str, description: str | None) -> str:
    project_id = uuid.uuid4().hex
    with _connect() as conn:
        conn.execute(
            "INSERT INTO projects (id, user_id, name, description) VALUES (?, ?, ?, ?)",
            (project_id, user_id, name, description),
        )
        conn.commit()
    return project_id


def list_projects(user_id: int) -> list[sqlite3.Row]:
    with _connect() as conn:
        return conn.execute(
            """
            SELECT p.*,
                (SELECT COUNT(*) FROM research_runs r WHERE r.project_id = p.id) AS session_count
            FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC
            """,
            (user_id,),
        ).fetchall()


def get_project(user_id: int, project_id: str) -> sqlite3.Row | None:
    with _connect() as conn:
        return conn.execute("SELECT * FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id)).fetchone()


def update_project(user_id: int, project_id: str, *, name: str | None = None, description: str | None = None, status: str | None = None) -> bool:
    project = get_project(user_id, project_id)
    if project is None:
        return False
    with _connect() as conn:
        conn.execute(
            "UPDATE projects SET name = ?, description = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
            (
                name if name is not None else project["name"],
                description if description is not None else project["description"],
                status if status is not None else project["status"],
                project_id,
            ),
        )
        conn.commit()
    return True


def delete_project(user_id: int, project_id: str) -> bool:
    if get_project(user_id, project_id) is None:
        return False
    with _connect() as conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
    return True


# --- research runs -------------------------------------------------------

def start_research_run(
    user_id: int, run_id: str, question: str, title: str, project_id: str | None, depth: str, agent_config: dict
) -> None:
    """Written once, immediately when a run starts streaming (status
    'running') — makes dashboard/history 'active research' real instead of
    guessed, and gives a run that never finishes (closed tab, server
    restart) a visible row instead of vanishing silently."""
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO research_runs (id, user_id, question, title, status, project_id, depth, agent_config)
            VALUES (?, ?, ?, ?, 'running', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status = 'running', updated_at = datetime('now')
            """,
            (run_id, user_id, question, title, project_id, depth, json.dumps(agent_config)),
        )
        conn.commit()


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
    """Upserts one research run and (re)writes its trace/event rows, called
    once the run finishes (successfully or with an error)."""
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

        # Extract structured sources from any researcher findings in this
        # trace — real data straight from what the researcher/tools actually
        # saw, never invented. Re-derived from scratch on every save so a
        # regenerated report's trace stays in sync.
        conn.execute("DELETE FROM sources WHERE run_id = ?", (run_id,))
        seen: set[str] = set()
        for entry in trace:
            finding = entry.get("finding")
            if not finding:
                continue
            relevance = {"high": "high", "medium": "medium", "low": "low"}.get(finding.get("confidence"), "medium")
            for s in finding.get("sources", []):
                url = s.get("url") if isinstance(s, dict) else s
                if not url or url in seen:
                    continue
                seen.add(url)
                title = s.get("title") if isinstance(s, dict) else url
                conn.execute(
                    "INSERT INTO sources (run_id, user_id, title, url, domain, relevance) VALUES (?, ?, ?, ?, ?, ?)",
                    (run_id, user_id, title or url, url, _domain_of(url), relevance),
                )
        conn.commit()


def _domain_of(url: str) -> str:
    from urllib.parse import urlparse

    try:
        return urlparse(url).hostname.removeprefix("www.") if urlparse(url).hostname else url
    except Exception:
        return url


def list_research_runs(
    user_id: int, *, status: str | None = None, project_id: str | None = None, saved: bool | None = None, q: str | None = None
) -> list[sqlite3.Row]:
    clauses = ["user_id = ?"]
    params: list = [user_id]
    if status:
        clauses.append("status = ?")
        params.append(status)
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    if saved is not None:
        clauses.append("saved = ?")
        params.append(1 if saved else 0)
    if q:
        clauses.append("question LIKE ?")
        params.append(f"%{q}%")
    with _connect() as conn:
        return conn.execute(
            f"SELECT id, question, title, status, saved, project_id, depth, created_at, updated_at FROM research_runs "
            f"WHERE {' AND '.join(clauses)} ORDER BY updated_at DESC",
            params,
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
        "title": row["title"],
        "status": row["status"],
        "saved": bool(row["saved"]),
        "project_id": row["project_id"],
        "depth": row["depth"],
        "agent_config": json.loads(row["agent_config"]) if row["agent_config"] else None,
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


def set_research_run_project(user_id: int, run_id: str, project_id: str | None) -> bool:
    with _connect() as conn:
        owner = conn.execute("SELECT user_id FROM research_runs WHERE id = ?", (run_id,)).fetchone()
        if owner is None or owner["user_id"] != user_id:
            return False
        conn.execute("UPDATE research_runs SET project_id = ?, updated_at = datetime('now') WHERE id = ?", (project_id, run_id))
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


def count_dashboard_metrics(user_id: int) -> dict:
    with _connect() as conn:
        projects = conn.execute("SELECT COUNT(*) c FROM projects WHERE user_id = ?", (user_id,)).fetchone()["c"]
        sessions = conn.execute("SELECT COUNT(*) c FROM research_runs WHERE user_id = ?", (user_id,)).fetchone()["c"]
        reports = conn.execute(
            "SELECT COUNT(*) c FROM research_runs WHERE user_id = ? AND status = 'done'", (user_id,)
        ).fetchone()["c"]
        sources = conn.execute(
            "SELECT COUNT(*) c FROM sources WHERE user_id = ? AND removed = 0", (user_id,)
        ).fetchone()["c"]
        return {"projects": projects, "sessions": sessions, "reports": reports, "sources": sources}


# --- sources --------------------------------------------------------------

def list_sources(
    user_id: int, *, run_id: str | None = None, project_id: str | None = None, relevance: str | None = None, saved: bool | None = None
) -> list[sqlite3.Row]:
    clauses = ["s.user_id = ?", "s.removed = 0"]
    params: list = [user_id]
    joins = ""
    if run_id:
        clauses.append("s.run_id = ?")
        params.append(run_id)
    if project_id:
        joins = "JOIN research_runs r ON r.id = s.run_id"
        clauses.append("r.project_id = ?")
        params.append(project_id)
    if relevance:
        clauses.append("s.relevance = ?")
        params.append(relevance)
    if saved is not None:
        clauses.append("s.saved = ?")
        params.append(1 if saved else 0)
    with _connect() as conn:
        return conn.execute(
            f"SELECT s.* FROM sources s {joins} WHERE {' AND '.join(clauses)} ORDER BY s.created_at DESC",
            params,
        ).fetchall()


def update_source(user_id: int, source_id: int, *, saved: bool | None = None, removed: bool | None = None) -> bool:
    with _connect() as conn:
        row = conn.execute("SELECT user_id FROM sources WHERE id = ?", (source_id,)).fetchone()
        if row is None or row["user_id"] != user_id:
            return False
        if saved is not None:
            conn.execute("UPDATE sources SET saved = ? WHERE id = ?", (1 if saved else 0, source_id))
        if removed is not None:
            conn.execute("UPDATE sources SET removed = ? WHERE id = ?", (1 if removed else 0, source_id))
        conn.commit()
        return True


# --- agent status ----------------------------------------------------------

def recent_agent_events(user_id: int, agent_prefix: str, limit: int = 10) -> list[sqlite3.Row]:
    with _connect() as conn:
        return conn.execute(
            """
            SELECT e.agent_name, e.duration_ms, e.extra, r.question, r.updated_at
            FROM research_events e
            JOIN research_runs r ON r.id = e.run_id
            WHERE r.user_id = ? AND e.agent_name LIKE ?
            ORDER BY r.updated_at DESC LIMIT ?
            """,
            (user_id, f"{agent_prefix}%", limit),
        ).fetchall()


init_db()
