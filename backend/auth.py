"""Google Sign-In: verify the ID token Google's client-side library hands
back to the frontend, then issue our own opaque session token (a random
string in the `sessions` table) rather than trusting the client to keep
re-sending Google's JWT. The frontend only ever sees our session token
after the initial sign-in exchange.
"""

import os

from fastapi import Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

import db

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")


def verify_google_credential(credential: str) -> dict:
    """Verifies a Google ID token's signature, issuer, audience, and
    expiry. Raises ValueError if the token is invalid for any reason —
    never trust the payload without this check, since it's attacker-
    controlled input until verified."""
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured on the server")
    return id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID)


def get_current_user(authorization: str | None = Header(default=None)):
    """Optional auth: returns the user row for a valid session token, or
    None if there's no token / it's invalid. Chat works either way —
    this only gates the server-persisted history endpoints."""
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
