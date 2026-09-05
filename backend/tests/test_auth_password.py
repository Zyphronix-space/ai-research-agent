"""Email/password auth: signup, login, forgot/reset password (Resend
mocked out — never hits the network), change password, and session
management. All exercised through the real HTTP endpoints in main.py."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import db
import email_service
import main

pytestmark = pytest.mark.usefixtures("temp_db")


@pytest.fixture()
def client():
    return TestClient(main.app)


def test_signup_creates_user_and_session(client):
    resp = client.post("/auth/signup", json={"email": "new@example.com", "password": "hunter2pass", "name": "New User"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["email"] == "new@example.com"
    assert body["user"]["has_password"] is True
    assert body["session_token"]


def test_signup_rejects_duplicate_email(client):
    client.post("/auth/signup", json={"email": "dup@example.com", "password": "hunter2pass"})
    resp = client.post("/auth/signup", json={"email": "dup@example.com", "password": "another1234"})
    assert resp.status_code == 400


def test_signup_rejects_short_password(client):
    resp = client.post("/auth/signup", json={"email": "short@example.com", "password": "abc"})
    assert resp.status_code == 400


def test_signup_rejects_invalid_email(client):
    resp = client.post("/auth/signup", json={"email": "not-an-email", "password": "hunter2pass"})
    assert resp.status_code == 400


def test_login_succeeds_with_correct_password(client):
    client.post("/auth/signup", json={"email": "login@example.com", "password": "correcthorse"})
    resp = client.post("/auth/login", json={"email": "login@example.com", "password": "correcthorse"})
    assert resp.status_code == 200
    assert resp.json()["session_token"]


def test_login_rejects_wrong_password(client):
    client.post("/auth/signup", json={"email": "login2@example.com", "password": "correcthorse"})
    resp = client.post("/auth/login", json={"email": "login2@example.com", "password": "wrongpassword"})
    assert resp.status_code == 401


def test_login_rejects_unknown_email(client):
    resp = client.post("/auth/login", json={"email": "ghost@example.com", "password": "whatever123"})
    assert resp.status_code == 401


def test_google_only_account_cannot_password_login(client, user_and_token):
    """A Google-signed-up user has no password_hash — password login must
    fail cleanly, not crash on a None hash."""
    user, _ = user_and_token
    resp = client.post("/auth/login", json={"email": user["email"], "password": "anything123"})
    assert resp.status_code == 401


def test_forgot_password_without_resend_key_configured_returns_500(client, monkeypatch):
    monkeypatch.setattr(email_service, "RESEND_API_KEY", None)
    client.post("/auth/signup", json={"email": "reset@example.com", "password": "hunter2pass"})
    resp = client.post("/auth/forgot-password", json={"email": "reset@example.com"})
    assert resp.status_code == 500


def test_forgot_password_same_response_for_unknown_email(client, monkeypatch):
    """Never leaks whether an account exists: same status/shape either way."""
    monkeypatch.setattr(email_service, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(email_service, "send_password_reset_email", MagicMock())
    client.post("/auth/signup", json={"email": "known@example.com", "password": "hunter2pass"})

    known = client.post("/auth/forgot-password", json={"email": "known@example.com"})
    unknown = client.post("/auth/forgot-password", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    email_service.send_password_reset_email.assert_called_once()  # only for the real account


def test_forgot_password_then_reset_password_then_login_with_new_password(client, monkeypatch):
    monkeypatch.setattr(email_service, "RESEND_API_KEY", "test-key")
    sent = {}

    def fake_send(to, reset_url):
        sent["to"] = to
        sent["url"] = reset_url

    monkeypatch.setattr(email_service, "send_password_reset_email", fake_send)
    client.post("/auth/signup", json={"email": "flow@example.com", "password": "oldpassword1"})

    client.post("/auth/forgot-password", json={"email": "flow@example.com"})
    token = sent["url"].split("token=")[1]

    resp = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword1"})
    assert resp.status_code == 200

    old_login = client.post("/auth/login", json={"email": "flow@example.com", "password": "oldpassword1"})
    assert old_login.status_code == 401
    new_login = client.post("/auth/login", json={"email": "flow@example.com", "password": "newpassword1"})
    assert new_login.status_code == 200


def test_reset_token_cannot_be_reused(client, monkeypatch):
    monkeypatch.setattr(email_service, "RESEND_API_KEY", "test-key")
    sent = {}
    monkeypatch.setattr(email_service, "send_password_reset_email", lambda to, url: sent.update(url=url))
    client.post("/auth/signup", json={"email": "reuse@example.com", "password": "oldpassword1"})
    client.post("/auth/forgot-password", json={"email": "reuse@example.com"})
    token = sent["url"].split("token=")[1]

    first = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword1"})
    assert first.status_code == 200
    second = client.post("/auth/reset-password", json={"token": token, "new_password": "anotherpass"})
    assert second.status_code == 400


def test_reset_password_rejects_invalid_token(client):
    resp = client.post("/auth/reset-password", json={"token": "not-a-real-token", "new_password": "newpassword1"})
    assert resp.status_code == 400


def test_change_password_requires_current_password(client):
    signup = client.post("/auth/signup", json={"email": "change@example.com", "password": "originalpw1"})
    token = signup.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    wrong = client.post("/me/password", json={"current_password": "nope", "new_password": "newpassword1"}, headers=headers)
    assert wrong.status_code == 400

    right = client.post("/me/password", json={"current_password": "originalpw1", "new_password": "newpassword1"}, headers=headers)
    assert right.status_code == 200

    login = client.post("/auth/login", json={"email": "change@example.com", "password": "newpassword1"})
    assert login.status_code == 200


def test_update_profile_changes_name(client):
    signup = client.post("/auth/signup", json={"email": "profile@example.com", "password": "originalpw1", "name": "Old Name"})
    token = signup.json()["session_token"]
    resp = client.patch("/me", json={"name": "New Name"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_sessions_list_and_revoke(client):
    signup = client.post("/auth/signup", json={"email": "sessions@example.com", "password": "originalpw1"})
    token = signup.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    login2 = client.post("/auth/login", json={"email": "sessions@example.com", "password": "originalpw1"})
    token2 = login2.json()["session_token"]

    listed = client.get("/me/sessions", headers=headers).json()
    assert len(listed) == 2

    revoke = client.delete(f"/me/sessions/{token2}", headers=headers)
    assert revoke.status_code == 200
    still_valid = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert still_valid.status_code == 200
    now_invalid = client.get("/me", headers={"Authorization": f"Bearer {token2}"})
    assert now_invalid.status_code == 401


def test_cannot_revoke_another_users_session(client, user_and_token, other_user_and_token):
    _, token = user_and_token
    other_user, other_token = other_user_and_token
    resp = client.delete(f"/me/sessions/{other_token}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
