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

function getSessionId() {
  const KEY = 'ai-research-agent-session-id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

function App() {
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkLonger, setThinkLonger] = useState(false)
  const [error, setError] = useState(null)
  const chatEndRef = useRef(null)
  const controllerRef = useRef(null)
  const sessionIdRef = useRef(getSessionId())

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const stopGenerating = () => {
    controllerRef.current?.abort()
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

  return (
    <main className="page">
      <header className="hero">
        <h1>AI Research Agent</h1>
        <p className="subtitle">
          Ask it anything — it decides on its own whether to search the
          web, run a calculation, or just answer. Every tool call it makes
          shows up live below the answer, so you can see exactly how it
          got there.
        </p>
      </header>

      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Try a question that needs a tool, or just say hi.</p>
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
          <div key={i} className={`bubble-row ${m.role}`}>
            <div className={`avatar ${m.role}`}>{m.role === 'user' ? 'Y' : 'AI'}</div>
            <div className={`bubble ${m.role} ${m.isError ? 'is-error' : ''}`}>
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
        ))}
        <div ref={chatEndRef} />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="composer-controls">
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

      <form onSubmit={handleAsk} className="ask-form">
        <input
          type="text"
          placeholder="Ask anything…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={sending}
        />
        {sending ? (
          <button type="button" className="stop-btn" onClick={stopGenerating}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!question.trim()}>
            Ask
          </button>
        )}
      </form>
    </main>
  )
}

export default App
