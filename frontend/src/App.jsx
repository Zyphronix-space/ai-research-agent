import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const REQUEST_TIMEOUT_MS = 45000
const THINK_LONGER_TIMEOUT_MS = 75000

const SUGGESTIONS = [
  'What is (4821 * 37) - 156?',
  'Search for the latest Claude model from Anthropic',
  'hi',
]

function Step({ step }) {
  const [open, setOpen] = useState(false)
  const argsText = Object.values(step.args || {}).join(', ')
  const ready = step.result != null
  return (
    <div className="step">
      <button
        className="step-chip"
        onClick={() => ready && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!ready}
      >
        <span className={`step-dot ${ready ? 'done' : 'pending'}`} />
        <span className="step-tool">{step.tool}</span>
        {argsText && <span className="step-args">{argsText}</span>}
        {step.latencyMs != null && <span className="step-latency">{step.latencyMs}ms</span>}
      </button>
      {open && ready && <pre className="step-result">{step.result}</pre>}
    </div>
  )
}

function MemoryRecall({ recall }) {
  const [open, setOpen] = useState(false)
  if (!recall || recall.count === 0) return null
  return (
    <div className="memory-recall">
      <button className="memory-chip" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="memory-icon">⟲</span>
        Recalled {recall.count} related exchange{recall.count > 1 ? 's' : ''} from earlier sessions
      </button>
      {open && (
        <div className="memory-items">
          {recall.items.map((item, i) => (
            <div key={i} className="memory-item">
              <span className="memory-sim">{Math.round(item.similarity * 100)}% match</span>
              <p className="memory-q">"{item.question}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TraceSummary({ trace }) {
  const [open, setOpen] = useState(false)
  if (!trace) return null
  return (
    <div className="trace-summary">
      <button className="trace-chip" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="trace-icon">◷</span>
        {trace.llm_calls} LLM call{trace.llm_calls > 1 ? 's' : ''} · {trace.total_latency_ms}ms ·{' '}
        {trace.tokens.total_tokens} tokens
      </button>
      {open && (
        <dl className="trace-details">
          <dt>Tool calls</dt>
          <dd>{trace.steps}</dd>
          <dt>LLM round-trips</dt>
          <dd>{trace.llm_calls}</dd>
          <dt>Total latency</dt>
          <dd>{trace.total_latency_ms}ms</dd>
          <dt>Prompt tokens</dt>
          <dd>{trace.tokens.prompt_tokens}</dd>
          <dt>Completion tokens</dt>
          <dd>{trace.tokens.completion_tokens}</dd>
          <dt>Total tokens</dt>
          <dd>{trace.tokens.total_tokens}</dd>
        </dl>
      )}
    </div>
  )
}

const SESSION_KEY = 'ai-research-agent-session-id'

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

function newSessionId() {
  const id = crypto.randomUUID()
  localStorage.setItem(SESSION_KEY, id)
  return id
}

function App() {
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkLonger, setThinkLonger] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const chatEndRef = useRef(null)
  const controllerRef = useRef(null)
  const textareaRef = useRef(null)
  const sessionIdRef = useRef(getSessionId())

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [question])

  const stopGenerating = () => {
    controllerRef.current?.abort()
  }

  const startNewChat = () => {
    controllerRef.current?.abort()
    sessionIdRef.current = newSessionId()
    setMessages([])
    setQuestion('')
    setError(null)
    setSending(false)
    setSidebarOpen(false)
  }

  const ask = async (asked) => {
    if (!asked.trim() || sending) return

    setMessages((prev) => [...prev, { role: 'user', content: asked }])
    setQuestion('')
    setError(null)
    setSending(true)

    const assistantIndex = messages.length + 1
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', steps: [], memoryRecall: null, trace: null, streaming: true },
    ])

    const controller = new AbortController()
    controllerRef.current = controller
    const timeoutMs = thinkLonger ? THINK_LONGER_TIMEOUT_MS : REQUEST_TIMEOUT_MS
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: asked,
          think_longer: thinkLonger,
          session_id: sessionIdRef.current,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Server responded with ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const steps = []
      let content = ''
      let isError = false
      let memoryRecall = null
      let trace = null

      const applyEvent = (event) => {
        if (event.type === 'memory_recall') {
          memoryRecall = { count: event.count, items: event.items }
        } else if (event.type === 'tool_call') {
          steps.push({ tool: event.tool, args: event.args, result: null, latencyMs: null })
        } else if (event.type === 'tool_result') {
          const step = [...steps].reverse().find((s) => s.tool === event.tool && s.result == null)
          if (step) {
            step.result = event.result
            step.latencyMs = event.latency_ms ?? null
          }
        } else if (event.type === 'answer') {
          content = event.text
        } else if (event.type === 'trace_summary') {
          trace = event
        } else if (event.type === 'error') {
          content = event.message
          isError = true
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineAt
        while ((newlineAt = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineAt)
          buffer = buffer.slice(newlineAt + 1)
          if (!line.trim()) continue
          try {
            applyEvent(JSON.parse(line))
          } catch {
            // ignore malformed line
          }
        }

        setMessages((prev) => {
          const next = [...prev]
          next[assistantIndex] = {
            role: 'assistant',
            content,
            steps: [...steps],
            memoryRecall,
            trace,
            streaming: true,
            isError,
          }
          return next
        })
      }

      setMessages((prev) => {
        const next = [...prev]
        next[assistantIndex] = { ...next[assistantIndex], streaming: false }
        return next
      })
    } catch (err) {
      clearTimeout(timeout)
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const next = [...prev]
          if (next[assistantIndex]) {
            next[assistantIndex] = {
              ...next[assistantIndex],
              content: next[assistantIndex].content || '_Stopped._',
              streaming: false,
            }
          }
          return next
        })
      } else {
        setMessages((prev) => prev.slice(0, assistantIndex))
        setError(`Could not get an answer: ${err.message}`)
      }
    } finally {
      setSending(false)
      controllerRef.current = null
    }
  }

  const handleAsk = (e) => {
    e.preventDefault()
    ask(question)
  }

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask(question)
    }
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className="sidebar-scrim"
        aria-label="Close menu"
        data-open={sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="sidebar" data-open={sidebarOpen}>
        <button type="button" className="new-chat-btn" onClick={startNewChat}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New chat
        </button>
        <div className="sidebar-section-label">Try asking</div>
        <div className="sidebar-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="sidebar-suggestion"
              onClick={() => {
                ask(s)
                setSidebarOpen(false)
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <p>Concurrent tool calls · execution trace · cross-session memory</p>
        </div>
      </aside>

      <main className="chat-column">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            aria-label="Toggle menu"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <span className="topbar-title">AI Research Agent</span>
        </header>

        <div className="chat" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-badge">AI</div>
              <h1>What do you want to know?</h1>
              <p>
                Ask anything — it decides on its own whether to search the web,
                run a calculation, or just answer, and shows every step live.
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion-chip" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg-row ${m.role}`}>
              <div className="msg-inner">
                <div className={`avatar ${m.role}`}>{m.role === 'user' ? 'Y' : 'AI'}</div>
                <div className={`msg-body ${m.isError ? 'is-error' : ''}`}>
                  {m.role === 'assistant' && <MemoryRecall recall={m.memoryRecall} />}
                  {m.steps && m.steps.length > 0 && (
                    <div className="steps">
                      {m.steps.map((s, idx) => (
                        <Step key={idx} step={s} />
                      ))}
                    </div>
                  )}
                  {m.content ? (
                    m.role === 'assistant' ? (
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    ) : (
                      <p>{m.content}</p>
                    )
                  ) : (
                    (!m.steps || m.steps.length === 0) && (
                      <span className="typing">
                        <span />
                        <span />
                        <span />
                      </span>
                    )
                  )}
                  {m.role === 'assistant' && !m.streaming && <TraceSummary trace={m.trace} />}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="composer-area">
          {error && <p className="error">{error}</p>}
          <form onSubmit={handleAsk} className="composer">
            <div className="composer-toolbar">
              <button
                type="button"
                className={`think-toggle ${thinkLonger ? 'active' : ''}`}
                onClick={() => setThinkLonger((v) => !v)}
                aria-pressed={thinkLonger}
                title="Spend more reasoning effort for a more thorough answer"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2Z" />
                  <path d="M9 21h6" strokeLinecap="round" />
                </svg>
                Think longer
              </button>
            </div>
            <div className="composer-input-row">
              <textarea
                ref={textareaRef}
                placeholder="Ask anything…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={sending}
                rows={1}
              />
              {sending ? (
                <button type="button" className="composer-btn stop-btn" onClick={stopGenerating} aria-label="Stop">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  className="composer-btn send-btn"
                  disabled={!question.trim()}
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </form>
          <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
        </div>
      </main>
    </div>
  )
}

export default App
