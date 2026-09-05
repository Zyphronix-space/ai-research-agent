import pytest

import db


@pytest.fixture(autouse=True)
def _no_real_sleeps(monkeypatch):
    """Every test runs with asyncio.sleep stubbed out — retry backoff and
    the orchestrator's researcher-start stagger are real `await asyncio.sleep`
    calls, and tests exercising that logic shouldn't actually wait."""
    import asyncio

    async def instant(*_a, **_kw):
        return None

    monkeypatch.setattr(asyncio, "sleep", instant)


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    """Points db.py at a throwaway SQLite file for the duration of a test,
    so tests never touch the real (gitignored, dev-machine) app.db."""
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    db.init_db()
    return db


@pytest.fixture()
def user_and_token(temp_db):
    user = temp_db.upsert_google_user(google_sub="sub-123", email="test@example.com", name="Test User", picture=None)
    token = temp_db.create_session(user["id"])
    return user, token


@pytest.fixture()
def other_user_and_token(temp_db):
    user = temp_db.upsert_google_user(google_sub="sub-456", email="other@example.com", name="Other User", picture=None)
    token = temp_db.create_session(user["id"])
    return user, token
