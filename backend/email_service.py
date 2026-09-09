"""Password-reset email delivery via Resend's HTTP API - a plain POST, no
SDK dependency (this project already depends on `requests`). Deliberately
fails loudly (EmailError) instead of silently no-op'ing when RESEND_API_KEY
isn't set, per this project's "never silently fail" error-handling rule.
"""

import os

import requests

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "ResearchOS <onboarding@resend.dev>")
RESEND_ENDPOINT = "https://api.resend.com/emails"
REQUEST_TIMEOUT_S = 8


class EmailError(Exception):
    """Raised when RESEND_API_KEY isn't configured, or Resend's API rejects
    the send. Caught in main.py and surfaced as a clear 500."""


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    if not RESEND_API_KEY:
        raise EmailError("RESEND_API_KEY is not configured on the server")

    html = (
        f"<p>Someone requested a password reset for your ResearchOS account.</p>"
        f'<p><a href="{reset_url}">Reset your password</a></p>'
        f"<p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>"
    )
    try:
        resp = requests.post(
            RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": "Reset your ResearchOS password",
                "html": html,
            },
            timeout=REQUEST_TIMEOUT_S,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise EmailError(f"Failed to send password-reset email: {exc}") from exc
