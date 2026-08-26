# AI Research Agent

Ask it anything. It decides on its own whether to search the web, run a
calculation, or just answer — and the app shows every tool call live as
it happens, not just the final answer. This is agentic tool-calling, not
a single "call the LLM once" wrapper.

- **`backend/`** — FastAPI service.
  - `tools.py` — three plain Python functions the agent can call:
    `web_search` (DuckDuckGo via `ddgs`, no API key needed), `calculator`
    (arithmetic evaluated safely via Python's `ast` module — no `eval()`),
    and `get_current_datetime`.
  - `agent.py` — the actual agent loop: send the conversation to Gemini
    with the tools declared, execute whatever function call(s) it asks
    for, feed the results back, repeat (capped at 6 steps) until it
    returns a final answer instead of another tool call.
  - `/chat` streams each step as a JSON event (`tool_call`, `tool_result`,
    `answer`) as it happens, so the frontend can show the trace live
    instead of a single opaque wait.
  - A "Think longer" flag raises Gemini's thinking budget for harder
    questions, same as the RAG project.
- **`frontend/`** — React (Vite) chat UI. Each assistant message shows its
  tool calls as small chips above the answer — click one to expand the
  raw result it got back. Markdown-rendered answers, streaming, a stop
  button, suggested starter prompts.

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

## What this demonstrates
- A real agentic loop: the model decides *whether* and *which* tool to
  call, not a hardcoded "always search first" pipeline — verified live
  with a two-tool question (calculator + web search) answered correctly
  in one pass.
- Tool execution stays local and typed (three Python functions with a
  narrow contract), not arbitrary code execution — a deliberately safer
  scope than "let the model run shell commands."
- Streaming the trace, not just the answer — the UI shows what the agent
  is doing while it's doing it.

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

**Known limitation:** no conversation memory between questions — each
`/chat` call starts a fresh tool-calling loop with no history from
previous turns. A follow-up like "and multiply that by 2" won't know what
"that" refers to. Fixable by carrying the running `contents` list across
turns instead of rebuilding it from just the latest question.
