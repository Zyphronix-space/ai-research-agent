# AI Research Agent

Ask it anything. It decides on its own whether to search the web, run a
calculation, or just answer — and the app shows every tool call live as
it happens, not just the final answer. This is agentic tool-calling, not
a single "call the LLM once" wrapper.

Three things separate this from a basic tool-calling demo:

1. **Concurrent tool execution** — when the model asks for more than one
   tool in the same turn, they run at the same time (`asyncio.gather` over
   a thread pool), not one after another.
2. **A real execution trace** — every step is timed and every Gemini call's
   token usage is accumulated, so the UI can show per-tool latency and a
   per-turn token/latency summary instead of just the final text.
3. **Cross-session semantic memory** — finished exchanges are embedded
   (Gemini's `gemini-embedding-001`) and stored in SQLite. A new question,
   in any session, is embedded the same way and matched against that store
   by cosine similarity, so the agent can recall a related exchange from a
   completely different browser session.

## Architecture

The frontend keeps a `session_id` (a UUID in `localStorage`) and sends it
with every request. Each `POST /chat` then runs `agent.run_agent()`:

1. Embed the question and search `memory.db` for similar past exchanges
   from *any* session → emit `memory_recall` if anything scored above the
   similarity threshold.
2. Call Gemini with the tool declarations, accumulating token usage from
   `response.usage_metadata` on every call.
3. If the model requested more than one tool call this turn, dispatch all
   of them at once with `asyncio.gather` (each wrapped in `asyncio.to_thread`
   since the tool functions themselves are blocking I/O), timing each one.
4. Repeat 2-3 until Gemini returns a final answer instead of another tool
   call (capped at 6 steps).
5. Embed and store this exchange in `memory.db` for future recall.
6. Emit `trace_summary` — total steps, LLM round-trips, latency, tokens.

- **`backend/`** — FastAPI service.
  - `tools.py` — three plain Python functions the agent can call:
    `web_search` (DuckDuckGo via `ddgs`, no API key needed), `calculator`
    (arithmetic evaluated safely via Python's `ast` module — no `eval()`),
    and `get_current_datetime`.
  - `agent.py` — the agent loop: send the conversation to Gemini with the
    tools declared, execute whatever function call(s) it asks for
    *concurrently*, feed the results back, repeat (capped at 6 steps)
    until it returns a final answer instead of another tool call. Also
    handles memory recall/save and trace accounting around that loop.
  - `memory.py` — the cross-session memory store: a SQLite table of
    `(session_id, question, answer, embedding)`, a cosine-similarity scan
    over the most recent rows (capped at 500 — an honest amount of
    engineering for a demo's data volume, not an excuse to skip a real
    vector index at a scale where one would actually matter), and the two
    entry points `recall()` / `save_exchange()` that `agent.py` calls.
  - `/chat` streams each step as a JSON event (`memory_recall`,
    `tool_call`, `tool_result`, `answer`, `trace_summary`) as it happens,
    so the frontend can show the trace live instead of a single opaque
    wait.
  - A "Think longer" flag raises Gemini's thinking budget for harder
    questions, same as the RAG project.
- **`frontend/`** — React (Vite) chat UI. Each assistant message shows: a
  "Recalled N related exchanges" chip when memory found something relevant
  (expand to see which), its tool calls as small chips with a per-call
  latency badge (click one to expand the raw result), and an execution
  trace chip (LLM round-trips, total latency, tokens — expand for the
  full breakdown). Markdown-rendered answers, streaming, a stop button,
  suggested starter prompts.

## Running it

**Backend:**
```
cd backend
pip install -r requirements.txt
cp .env.example .env   # add your GEMINI_API_KEY (free at aistudio.google.com/apikey)
uvicorn main:app --reload --port 8001
```

**Frontend:**
```
cd frontend
npm install
npm run dev
```

`memory.db` is created automatically on first run (SQLite, gitignored —
it's runtime state, not source).

## Example request

```
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is (482*17)-9, and what time is it?", "session_id": "demo-1"}'
```

Streams newline-delimited JSON events:
```
{"type": "tool_call", "tool": "calculator", "args": {"expression": "(482*17)-9"}}
{"type": "tool_call", "tool": "get_current_datetime", "args": {}}
{"type": "tool_result", "tool": "calculator", "result": "8185", "latency_ms": 1}
{"type": "tool_result", "tool": "get_current_datetime", "result": "2026-08-29 06:47 UTC", "latency_ms": 1}
{"type": "answer", "text": "(482 * 17) - 9 is 8,185, and the current UTC time is 2026-08-29 06:47 UTC."}
{"type": "trace_summary", "steps": 2, "llm_calls": 2, "total_latency_ms": 4015, "tokens": {"prompt_tokens": 732, "completion_tokens": 82, "total_tokens": 814}}
```

Asking a related question from a *different* `session_id` afterward
produces a `memory_recall` event before the answer — verified live: a
follow-up "what did I ask you to multiply earlier?" from a fresh session
recalled the exchange above at 0.68 cosine similarity and answered
correctly from it, with zero tool calls.

## What this demonstrates
- A real agentic loop: the model decides *whether* and *which* tool to
  call, not a hardcoded "always search first" pipeline — verified live
  with a two-tool question (calculator + web search) answered correctly
  in one pass, with both tools dispatched concurrently.
- Tool execution stays local and typed (three Python functions with a
  narrow contract), not arbitrary code execution — a deliberately safer
  scope than "let the model run shell commands."
- Streaming a real execution trace, not just the answer — per-tool
  latency and per-turn token accounting, measured from the actual API
  responses (`usage_metadata`), not estimated.
- Retrieval-based memory applied to agent state instead of documents —
  the same embed-then-cosine-similarity idea as the RAG project, reused
  here to recall *conversations* rather than document chunks.

## Interview prep

**Why manual function-calling instead of the SDK's automatic mode?**
`google-genai` can auto-execute plain Python functions passed as tools,
but that hides the intermediate steps. Declaring tools explicitly and
running the loop by hand means the app can stream `tool_call`/`tool_result`
events to the UI as they happen — the visible trace is the point of an
"agent" demo, not an implementation detail to abstract away.

**Why DuckDuckGo instead of a paid/keyed search API (Tavily, SerpAPI)?**
Zero signup friction and no per-query cost, which matters for a project
meant to be demoed repeatedly. The tradeoff is reliability — DuckDuckGo's
unofficial API can degrade — worth naming as a known limitation and a
clear upgrade path (Tavily is purpose-built for AI agents and has a
generous free tier) rather than a permanent design choice.

**Why a hand-rolled calculator instead of `eval()`?** `eval()` on
arbitrary model-generated strings is a code-injection risk (the model's
output isn't trusted input). Parsing with `ast.parse` and only walking a
fixed whitelist of numeric operators makes it impossible to execute
anything except arithmetic, regardless of what string the model sends.

**What stops an infinite tool-calling loop?** A hard cap of 6 steps in
`agent.py` — if the model keeps requesting tools without converging on
an answer, the loop gives up and says so rather than looping forever or
running up API costs.

**How does memory recall differ from normal chat history?** It's semantic
retrieval, not a transcript. A follow-up in the *same* conversation like
"and multiply that by 2" still won't resolve "that" — `contents` is
rebuilt fresh per request, there's no running transcript. What memory adds
is: any *finished* exchange, from any past session, gets embedded and
becomes searchable, so a semantically similar question later — even in a
brand new session — retrieves it. Chat history and semantic memory solve
different problems; this project deliberately has the second, not the
first, since the interesting engineering question (embed → store →
retrieve by similarity) is the same shape as the RAG project's, just
applied to conversations instead of documents.

**Why SQLite + a Python loop instead of a real vector database?** Scale.
At a few hundred stored exchanges, a linear cosine-similarity scan over
~768-float vectors runs in single-digit milliseconds — a dedicated vector
index (Chroma, pgvector, Pinecone) is solving a problem this project
doesn't have yet. The `recall()`/`save_exchange()` interface in `memory.py`
is small on purpose, so swapping the storage/search backend later doesn't
touch `agent.py` at all.

**What stops a bad memory recall from corrupting the answer?** Two guards:
a minimum-similarity threshold (0.55) so unrelated past exchanges never
get injected, and the system prompt explicitly tells the model to use
recalled context "only if it's actually relevant... don't force a
connection that isn't there" — the retrieval can be wrong, so the model
is told to treat it as a hint, not ground truth.
