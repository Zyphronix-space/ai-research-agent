"""ResearchOS API.

The core pipeline endpoint, POST /research/run, runs the multi-agent
pipeline (see research/orchestrator.py: Planner -> parallel Researchers,
their tool calls executed by the Tool Agent -> Reviewer, looping back to
Researchers if the Reviewer flags real gaps -> Writer) and streams every
step as a newline-delimited JSON event so the frontend can render a live
pipeline instead of a single opaque wait.

Everything else - projects, sources, dashboard metrics, agent status,
profile/security - is ordinary per-user CRUD in front of db.py. Sign-in
(Google or email/password) is required for all of it: research data is
scoped strictly to the requesting user, and every lookup below re-checks
ownership rather than trusting a client-supplied id.

Run with:
    uvicorn main:app --reload
"""

import json
import uuid

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import auth
import db
import email_service
import llm
from research import writer
from research.orchestrator import run_research
from research.schemas import ResearchPlan, ReviewResult, WorkerFinding

load_dotenv()

app = FastAPI(title="ResearchOS API")

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
    expose_headers=["X-Run-Id"],
)

VALID_DEPTHS = {"quick", "standard", "deep"}
REQUIRED_AGENTS = {"planner", "researcher"}


class ResearchRequest(BaseModel):
    question: str
    run_id: str
    project_id: str | None = None
    depth: str = "standard"
    agent_config: dict[str, bool] = Field(default_factory=dict)


class GoogleAuthRequest(BaseModel):
    credential: str


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str
    reset_url_base: str = "http://localhost:5173/reset-password"


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdateRequest(BaseModel):
    name: str


class ProjectRequest(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None


def _user_dict(user) -> dict:
    return {"id": user["id"], "email": user["email"], "name": user["name"], "picture": user["picture"], "has_password": bool(user["password_hash"])}


def _derive_title(question: str) -> str:
    text = " ".join(question.split())
    return text if len(text) <= 60 else f"{text[:60]}…"


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

    user = db.upsert_google_user(
        google_sub=claims["sub"],
        email=claims["email"],
        name=claims.get("name"),
        picture=claims.get("picture"),
    )
    token = db.create_session(user["id"])
    return {"session_token": token, "user": _user_dict(user)}


@app.post("/auth/signup")
def signup(req: SignupRequest, request: Request):
    try:
        user = auth.signup(req.email, req.password, req.name)
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    token = db.create_session(user["id"], user_agent=request.headers.get("user-agent"))
    return {"session_token": token, "user": _user_dict(user)}


@app.post("/auth/login")
def login(req: LoginRequest, request: Request):
    try:
        user = auth.login(req.email, req.password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    token = db.create_session(user["id"], user_agent=request.headers.get("user-agent"))
    return {"session_token": token, "user": _user_dict(user)}


@app.post("/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    # Config check happens before the user lookup and the response is
    # identical either way, so this never leaks whether an account exists.
    if not email_service.RESEND_API_KEY:
        raise HTTPException(status_code=500, detail="Password-reset email is not configured on this server (RESEND_API_KEY missing).")

    user, token = auth.request_password_reset(req.email)
    if user is not None:
        reset_url = f"{req.reset_url_base}?token={token}"
        try:
            email_service.send_password_reset_email(user["email"], reset_url)
        except email_service.EmailError as exc:
            raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True, "message": "If an account exists for that email, a reset link has been sent."}


@app.post("/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    try:
        auth.reset_password(req.token, req.new_password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@app.post("/auth/logout")
def sign_out(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        db.delete_session(authorization.removeprefix("Bearer ").strip())
    return {"ok": True}


@app.get("/me")
def me(user=Depends(auth.require_user)):
    return _user_dict(user)


@app.patch("/me")
def update_profile(req: ProfileUpdateRequest, user=Depends(auth.require_user)):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    db.update_user_profile(user["id"], req.name.strip())
    return _user_dict(db.get_user_by_id(user["id"]))


@app.post("/me/password")
def change_password(req: ChangePasswordRequest, user=Depends(auth.require_user)):
    try:
        auth.change_password(user["id"], req.current_password, req.new_password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@app.get("/me/sessions")
def list_sessions(user=Depends(auth.require_user)):
    return [{"token": s["token"], "user_agent": s["user_agent"], "created_at": s["created_at"]} for s in db.list_sessions(user["id"])]


@app.delete("/me/sessions/{token}")
def revoke_session(token: str, user=Depends(auth.require_user)):
    if not db.delete_session_for_user(user["id"], token):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


# --- projects --------------------------------------------------------------


@app.get("/projects")
def list_projects(user=Depends(auth.require_user)):
    return [dict(p) for p in db.list_projects(user["id"])]


@app.post("/projects")
def create_project(req: ProjectRequest, user=Depends(auth.require_user)):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Project name cannot be empty")
    project_id = db.create_project(user["id"], req.name.strip(), req.description)
    return dict(db.get_project(user["id"], project_id))


@app.get("/projects/{project_id}")
def get_project(project_id: str, user=Depends(auth.require_user)):
    project = db.get_project(user["id"], project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return dict(project)


@app.patch("/projects/{project_id}")
def update_project(project_id: str, req: ProjectUpdateRequest, user=Depends(auth.require_user)):
    if req.status and req.status not in ("active", "archived"):
        raise HTTPException(status_code=400, detail="status must be 'active' or 'archived'")
    if not db.update_project(user["id"], project_id, name=req.name, description=req.description, status=req.status):
        raise HTTPException(status_code=404, detail="Project not found")
    return dict(db.get_project(user["id"], project_id))


@app.delete("/projects/{project_id}")
def delete_project(project_id: str, user=Depends(auth.require_user)):
    if not db.delete_project(user["id"], project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@app.get("/projects/{project_id}/runs")
def project_runs(project_id: str, user=Depends(auth.require_user)):
    if db.get_project(user["id"], project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return [dict(r) for r in db.list_research_runs(user["id"], project_id=project_id)]


# --- research history (signed-in users only) ------------------------------


@app.get("/research")
def list_research(
    status: str | None = None,
    project_id: str | None = None,
    saved: bool | None = None,
    q: str | None = None,
    user=Depends(auth.require_user),
):
    rows = db.list_research_runs(user["id"], status=status, project_id=project_id, saved=saved, q=q)
    return [dict(r) for r in rows]


@app.get("/research/{run_id}")
def research_detail(run_id: str, user=Depends(auth.require_user)):
    run = db.get_research_run(user["id"], run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Research run not found")
    return run


@app.patch("/research/{run_id}")
def update_research(
    run_id: str,
    saved: bool | None = Body(default=None),
    project_id: str | None = Body(default=None),
    user=Depends(auth.require_user),
):
    found = False
    if saved is not None:
        found = db.set_research_run_saved(user["id"], run_id, saved) or found
    if project_id is not None:
        found = db.set_research_run_project(user["id"], run_id, project_id or None) or found
    if saved is None and project_id is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if not found:
        raise HTTPException(status_code=404, detail="Research run not found")
    return {"ok": True}


@app.delete("/research/{run_id}")
def delete_research(run_id: str, user=Depends(auth.require_user)):
    if not db.delete_research_run(user["id"], run_id):
        raise HTTPException(status_code=404, detail="Research run not found")
    return {"ok": True}


@app.post("/research/{run_id}/regenerate-report")
async def regenerate_report(run_id: str, user=Depends(auth.require_user)):
    """Reruns only the Writer against this run's already-persisted
    findings — a real "Regenerate report" control, not a fake one."""
    run = db.get_research_run(user["id"], run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Research run not found")
    if llm.client is None:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")

    findings = [WorkerFinding(**e["finding"]) for e in run["trace"] if e.get("finding")]
    if not findings:
        raise HTTPException(status_code=400, detail="This run has no persisted findings to regenerate a report from")
    review = ReviewResult(**run["review"]) if run["review"] else ReviewResult(approved=True)

    try:
        answer = await writer.write(run["question"], ResearchPlan(sub_questions=[]), findings, review)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Report regeneration failed: {exc}")

    db.save_research_run(
        user["id"],
        run_id,
        run["question"],
        "done",
        answer.answer_markdown,
        answer.key_findings,
        answer.citations,
        run["review"],
        run["trace"],
    )
    return db.get_research_run(user["id"], run_id)


# --- sources ----------------------------------------------------------------


@app.get("/sources")
def list_sources(
    run_id: str | None = None,
    project_id: str | None = None,
    relevance: str | None = None,
    saved: bool | None = None,
    user=Depends(auth.require_user),
):
    return [dict(s) for s in db.list_sources(user["id"], run_id=run_id, project_id=project_id, relevance=relevance, saved=saved)]


@app.patch("/sources/{source_id}")
def update_source(source_id: int, saved: bool | None = Body(default=None), removed: bool | None = Body(default=None), user=Depends(auth.require_user)):
    if not db.update_source(user["id"], source_id, saved=saved, removed=removed):
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


# --- dashboard / agents ------------------------------------------------------


@app.get("/dashboard")
def dashboard(user=Depends(auth.require_user)):
    metrics = db.count_dashboard_metrics(user["id"])
    recent = db.list_research_runs(user["id"])[:5]
    active = [r for r in recent if r["status"] == "running"]
    return {
        "metrics": metrics,
        "recent_research": [dict(r) for r in recent],
        "active_research": [dict(r) for r in active],
    }


AGENT_CATALOG = [
    {"id": "planner", "name": "Planner", "purpose": "Breaks a research question into 2-7 independently researchable sub-questions.", "tools": []},
    {"id": "researcher", "name": "Researcher", "purpose": "Investigates one sub-question, gathering evidence via the Tool Agent.", "tools": ["web_search", "fetch_url"]},
    {"id": "tool_agent", "name": "Tool Agent", "purpose": "Executes tool calls on behalf of Researchers.", "tools": ["web_search", "fetch_url", "calculator", "get_current_datetime"]},
    {"id": "reviewer", "name": "Reviewer", "purpose": "Checks findings for unsupported claims, contradictions, weak sources, and gaps.", "tools": []},
    {"id": "writer", "name": "Writer", "purpose": "Synthesizes reviewed findings into the final cited report.", "tools": []},
]


@app.get("/agents")
def agents_status(user=Depends(auth.require_user)):
    out = []
    for agent in AGENT_CATALOG:
        prefix = "researcher" if agent["id"] == "tool_agent" else agent["id"]
        events = db.recent_agent_events(user["id"], prefix, limit=5)
        out.append(
            {
                **agent,
                "status": "operational" if llm.client is not None else "not_configured",
                "recent_runs": [
                    {"question": e["question"], "duration_ms": e["duration_ms"], "at": e["updated_at"]} for e in events
                ],
            }
        )
    return out


# --- research pipeline -----------------------------------------------------


@app.post("/research/run")
async def research(req: ResearchRequest, request: Request, authorization: str | None = Header(default=None)):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if llm.client is None:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")
    if req.depth not in VALID_DEPTHS:
        raise HTTPException(status_code=422, detail=f"depth must be one of {sorted(VALID_DEPTHS)}")

    agent_config = {"planner": True, "researcher": True, "reviewer": True, "writer": True, **req.agent_config}
    for required in REQUIRED_AGENTS:
        if not agent_config.get(required, True):
            raise HTTPException(status_code=422, detail=f"'{required}' cannot be disabled - there is no research pipeline without it.")

    user = auth.get_current_user(authorization)
    if user is not None:
        if req.project_id and db.get_project(user["id"], req.project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        db.start_research_run(user["id"], req.run_id, req.question, _derive_title(req.question), req.project_id, req.depth, agent_config)

    async def event_stream():
        final_answer, key_findings, sources, review, trace, status = None, None, None, None, [], "running"

        async for event in run_research(req.question, agent_config, req.depth):
            if await request.is_disconnected():
                break
            etype = event["type"]
            if etype == "writing_done":
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


@app.post("/research/{run_id}/restart")
async def restart_research(run_id: str, request: Request, authorization: str | None = Header(default=None)):
    """Reruns the full pipeline for a run's original question/config under
    a brand-new run id - a real "Restart research" control."""
    user = auth.get_current_user(authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    original = db.get_research_run(user["id"], run_id)
    if original is None:
        raise HTTPException(status_code=404, detail="Research run not found")

    new_run_id = uuid.uuid4().hex
    req = ResearchRequest(
        question=original["question"],
        run_id=new_run_id,
        project_id=original["project_id"],
        depth=original["depth"],
        agent_config=original["agent_config"] or {},
    )
    response = await research(req, request, authorization)
    # The frontend needs the new run's id to navigate there once streaming
    # starts - it can't infer it from the (id-agnostic) event stream itself.
    response.headers["X-Run-Id"] = new_run_id
    return response
