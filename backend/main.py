"""AI Research Crew API.

One endpoint, /research, runs the multi-agent pipeline (see
research/orchestrator.py: Planner -> parallel Workers -> Reviewer,
looping back to Workers if the Reviewer flags real gaps -> Synthesizer)
and streams every step as a newline-delimited JSON event so the frontend
can render a live pipeline instead of a single opaque wait.

Sign-in is optional and additive: /research works the same with or
without an Authorization header. Anonymous use keeps history in the
browser (App.jsx, localStorage). A signed-in request also gets the
finished run persisted server-side (db.py) so history survives across
devices/browsers — see auth.py for how a Google ID token becomes our own
session token.

Run with:
    uvicorn main:app --reload
"""

import json

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import auth
import db
import llm
from research.orchestrator import run_research

load_dotenv()

app = FastAPI(title="AI Research Crew API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://delightful-desert-0af6ccc00.7.azurestaticapps.net",
    ],
    allow_origin_regex=r"https://frontend.*\.vercel\.app|https://.*\.azurestaticapps\.net",
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    question: str
    run_id: str


class GoogleAuthRequest(BaseModel):
    credential: str


def _user_dict(user) -> dict:
    return {"email": user["email"], "name": user["name"], "picture": user["picture"]}


@app.get("/health")
def health():
    return {"status": "ok"}


# --- auth ---------------------------------------------------------------


@app.post("/auth/google")
def google_sign_in(req: GoogleAuthRequest):
    try:
        claims = auth.verify_google_credential(req.credential)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Google credential: {exc}")

    user = db.upsert_user(
        google_sub=claims["sub"],
        email=claims["email"],
        name=claims.get("name"),
        picture=claims.get("picture"),
    )
    token = db.create_session(user["id"])
    return {"session_token": token, "user": _user_dict(user)}


@app.post("/auth/logout")
def sign_out(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        db.delete_session(authorization.removeprefix("Bearer ").strip())
    return {"ok": True}


@app.get("/me")
def me(user=Depends(auth.require_user)):
    return _user_dict(user)


# --- research history (signed-in users only) ------------------------------


@app.get("/research")
def list_research(user=Depends(auth.require_user)):
    rows = db.list_research_runs(user["id"])
    return [
        {
            "id": r["id"],
            "question": r["question"],
            "status": r["status"],
            "saved": bool(r["saved"]),
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]


@app.get("/research/{run_id}")
def research_detail(run_id: str, user=Depends(auth.require_user)):
    run = db.get_research_run(user["id"], run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Research run not found")
    return run


@app.patch("/research/{run_id}")
def update_research(run_id: str, saved: bool = Body(embed=True), user=Depends(auth.require_user)):
    if not db.set_research_run_saved(user["id"], run_id, saved):
        raise HTTPException(status_code=404, detail="Research run not found")
    return {"ok": True}


@app.delete("/research/{run_id}")
def delete_research(run_id: str, user=Depends(auth.require_user)):
    if not db.delete_research_run(user["id"], run_id):
        raise HTTPException(status_code=404, detail="Research run not found")
    return {"ok": True}


# --- research pipeline -----------------------------------------------------


@app.post("/research/run")
async def research(req: ResearchRequest, authorization: str | None = Header(default=None)):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if llm.client is None:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")

    user = auth.get_current_user(authorization)

    async def event_stream():
        final_answer, key_findings, sources, review, trace, status = None, None, None, None, [], "running"

        async for event in run_research(req.question):
            etype = event["type"]
            if etype == "synthesis_done":
                final_answer = event["answer"].get("answer_markdown")
                key_findings = event["answer"].get("key_findings")
                sources = event["answer"].get("citations")
            elif etype == "review_done":
                review = event["review"]
            elif etype == "trace_summary":
                trace = event["agents"]
                status = "done"
            elif etype == "error":
                status = "error"

            yield json.dumps(event) + "\n"

        if user is not None:
            db.save_research_run(
                user["id"], req.run_id, req.question, status, final_answer, key_findings, sources, review, trace
            )

    return StreamingResponse(event_stream(), media_type="text/plain")
