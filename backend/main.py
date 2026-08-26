"""
AI Research Agent API.

A single /chat endpoint where Gemini decides which tools to call — web
search, a calculator, current date/time — we execute them locally, and
the model uses the results to answer. A real agent loop (see agent.py),
not a single LLM call with no way to look anything up.

Run with:
    uvicorn main:app --reload
"""

import json

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import agent

load_dotenv()

app = FastAPI(title="AI Research Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    think_longer: bool = False


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if agent.client is None:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")

    def event_stream():
        for event in agent.run_agent(req.question, think_longer=req.think_longer):
            yield json.dumps(event) + "\n"

    return StreamingResponse(event_stream(), media_type="text/plain")
