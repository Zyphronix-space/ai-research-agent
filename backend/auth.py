"""Two ways in, one session model. Google Sign-In verifies Google's ID
token and upserts a user; email/password verifies a bcrypt hash. Either
path ends the same way: an opaque session token (a random string in the
`sessions` table) that the frontend sends back as `Authorization: Bearer
<token>` — the frontend never holds a Google JWT or a password hash.
"""

import os
import re
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

import db

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
RESET_TOKEN_TTL = timedelta(hours=1)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    """Raised for any auth failure meant to become a 4xx — message is
    always safe to show the user."""


def verify_google_credential(credential: str) -> dict:
    """Verifies a Google ID token's signature, issuer, audience, and
    expiry. Raises ValueError if the token is invalid for any reason —
    never trust the payload without this check, since it's attacker-
    controlled input until verified."""
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured on the server")
    return id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def validate_signup(email: str, password: str) -> None:
    if not EMAIL_RE.match(email or ""):
        raise AuthError("Enter a valid email address.")
    if not password or len(password) < 8:
        raise AuthError("Password must be at least 8 characters.")


def signup(email: str, password: str, name: str | None) -> "db.sqlite3.Row":
    email = email.strip().lower()
    validate_signup(email, password)
    if db.get_user_by_email(email) is not None:
        raise AuthError("An account with that email already exists.")
    return db.create_password_user(email, name, hash_password(password))


def login(email: str, password: str) -> "db.sqlite3.Row":
    user = db.get_user_by_email((email or "").strip().lower())
    if user is None or not user["password_hash"] or not verify_password(password, user["password_hash"]):
        raise AuthError("Incorrect email or password.")
    return user


def request_password_reset(email: str) -> tuple["db.sqlite3.Row | None", str | None]:
    """Always does the same amount of work regardless of whether the
    account exists, so a caller can't distinguish 'no such account' from
    'reset sent' by timing or response shape. Returns (user, token) — both
    None if there's no account with this email."""
    user = db.get_user_by_email((email or "").strip().lower())
    if user is None:
        return None, None
    expires_at = (datetime.now(timezone.utc) + RESET_TOKEN_TTL).isoformat()
    token = db.create_password_reset(user["id"], expires_at)
    return user, token


def reset_password(token: str, new_password: str) -> None:
    if not new_password or len(new_password) < 8:
        raise AuthError("Password must be at least 8 characters.")
    reset = db.get_password_reset(token)
    if reset is None or reset["used"]:
        raise AuthError("This reset link is invalid or has already been used.")
    expires_at = datetime.fromisoformat(reset["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise AuthError("This reset link has expired. Request a new one.")
    db.update_user_password(reset["user_id"], hash_password(new_password))
    db.mark_password_reset_used(token)


def change_password(user_id: int, current_password: str, new_password: str) -> None:
    user = db.get_user_by_id(user_id)
    if user["password_hash"] and not verify_password(current_password, user["password_hash"]):
        raise AuthError("Current password is incorrect.")
    if not new_password or len(new_password) < 8:
        raise AuthError("New password must be at least 8 characters.")
    db.update_user_password(user_id, hash_password(new_password))


def get_current_user(authorization: str | None = Header(default=None)):
    """Optional auth: returns the user row for a valid session token, or
    None if there's no token / it's invalid. Only gates the
    server-persisted endpoints (research history, projects, sources)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None
    return db.get_user_by_session(token)


def require_user(authorization: str | None = Header(default=None)):
    user = get_current_user(authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user
