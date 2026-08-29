"""
AI Research Agent API.

A single /chat endpoint where Gemini decides which tools to call — web
search, a calculator, current date/time — we execute them locally, and
the model uses the results to answer. A real agent loop (see agent.py),
not a single LLM call with no way to look anything up.

Sign-in is optional and additive: /chat works the same with or without an
Authorization header. Anonymous use keeps its history in the browser
(App.jsx, localStorage). A signed-in request also gets its exchange
persisted server-side (db.py) so history survives across devices/browsers
— see auth.py for how a Google ID token becomes our own session token.

Run with:
    uvicorn main:app --reload
"""

import json

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import agent
import auth
import db

load_dotenv()

app = FastAPI(title="AI Research Agent API")

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


class ChatRequest(BaseModel):
    question: str
    think_longer: bool = False
    session_id: str = "anonymous"


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


# --- server-persisted history (signed-in users only) ---------------------


@app.get("/conversations")
def conversations(user=Depends(auth.require_user)):
    rows = db.list_conversations(user["id"])
    return [{"id": r["id"], "title": r["title"], "updated_at": r["updated_at"]} for r in rows]


@app.get("/conversations/{conversation_id}")
def conversation_detail(conversation_id: str, user=Depends(auth.require_user)):
    messages = db.get_conversation_messages(user["id"], conversation_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"id": conversation_id, "messages": messages}


@app.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, user=Depends(auth.require_user)):
    if not db.delete_conversation(user["id"], conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"ok": True}


# --- chat -----------------------------------------------------------------


@app.post("/chat")
async def chat(req: ChatRequest, authorization: str | None = Header(default=None)):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if agent.client is None:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")

    user = auth.get_current_user(authorization)

    async def event_stream():
        steps, content, memory_recall, trace, is_error = [], "", None, None, False

        async for event in agent.run_agent(
            req.question, think_longer=req.think_longer, session_id=req.session_id
        ):
            if event["type"] == "tool_call":
                steps.append(
                    {"id": event.get("id"), "tool": event["tool"], "args": event["args"], "result": None, "latencyMs": None}
                )
            elif event["type"] == "tool_result":
                # Match by call id when available — falls back to name+order only
                # for an id-less call, since the same tool can appear more than
                # once in a turn and matching by name alone would pick the wrong one.
                if event.get("id") is not None:
                    step = next((s for s in steps if s["id"] == event["id"]), None)
                else:
                    step = next((s for s in steps if s["tool"] == event["tool"] and s["result"] is None), None)
                if step:
                    step["result"] = event["result"]
                    step["latencyMs"] = event.get("latency_ms")
            elif event["type"] == "memory_recall":
                memory_recall = {"count": event["count"], "items": event["items"]}
            elif event["type"] == "answer":
                content = event["text"]
            elif event["type"] == "trace_summary":
                trace = event
            elif event["type"] == "error":
                content, is_error = event["message"], True

            yield json.dumps(event) + "\n"

        if user is not None and content:
            title = req.question.strip().replace("\n", " ")
            title = title[:44] + "…" if len(title) > 44 else title
            db.save_message(user["id"], req.session_id, title, "user", req.question)
            db.save_message(
                user["id"],
                req.session_id,
                title,
                "assistant",
                content,
                extra={"steps": steps, "memoryRecall": memory_recall, "trace": trace, "isError": is_error},
            )

    return StreamingResponse(event_stream(), media_type="text/plain")
