"""The app's relational storage: users, login sessions, conversations, and
their messages. One SQLite file, stdlib sqlite3 only — same reasoning as
memory.py: this is a demo-scale project, and a real database server would
be solving a scale problem this project doesn't have.

Conversation persistence is opt-in: the app works fully anonymously with
the frontend keeping history in localStorage (see App.jsx). Signing in
with Google upgrades a user to server-side, cross-device history — these
functions are what that upgrade path writes to and reads from.
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

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                payload TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
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


# --- conversations / messages ------------------------------------------

def list_conversations(user_id: int) -> list[sqlite3.Row]:
    with _connect() as conn:
        return conn.execute(
            "SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()


def get_conversation_messages(user_id: int, conversation_id: str) -> list[dict] | None:
    """Returns None if the conversation doesn't exist or isn't owned by user_id."""
    with _connect() as conn:
        owner = conn.execute(
            "SELECT user_id FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if owner is None or owner["user_id"] != user_id:
            return None
        rows = conn.execute(
            "SELECT role, content, payload FROM messages WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,),
        ).fetchall()
    messages = []
    for row in rows:
        msg = {"role": row["role"], "content": row["content"]}
        if row["payload"]:
            msg.update(json.loads(row["payload"]))
        messages.append(msg)
    return messages


def save_message(user_id: int, conversation_id: str, title: str, role: str, content: str, extra: dict | None = None) -> None:
    """Upserts the parent conversation (creating it on the first message,
    touching updated_at + title otherwise) and appends one message row."""
    with _connect() as conn:
        exists = conn.execute("SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        if exists:
            conn.execute(
                "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", (conversation_id,)
            )
        else:
            conn.execute(
                "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)",
                (conversation_id, user_id, title),
            )
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, payload) VALUES (?, ?, ?, ?)",
            (conversation_id, role, content, json.dumps(extra) if extra else None),
        )
        conn.commit()


def delete_conversation(user_id: int, conversation_id: str) -> bool:
    with _connect() as conn:
        owner = conn.execute(
            "SELECT user_id FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if owner is None or owner["user_id"] != user_id:
            return False
        conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        conn.commit()
        return True


init_db()
