import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const REQUEST_TIMEOUT_MS = 45000
const THINK_LONGER_TIMEOUT_MS = 75000
const CONVERSATIONS_KEY = 'ai-research-agent-conversations'

const SUGGESTIONS = [
  'What is (4821 * 37) - 156?',
  'Search for the latest Claude model from Anthropic',
  'hi',
]

function AssistantIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5Z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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

function loadConversations() {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'New chat'
  const text = firstUser.content.trim().replace(/\s+/g, ' ')
  return text.length > 44 ? `${text.slice(0, 44)}…` : text
}

function formatWhen(ts) {
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

function App() {
  const [conversations, setConversations] = useState(loadConversations)
  const [activeId, setActiveId] = useState(() => crypto.randomUUID())
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkLonger, setThinkLonger] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const chatEndRef = useRef(null)
  const controllerRef = useRef(null)
  const textareaRef = useRef(null)

  const activeConversation = conversations.find((c) => c.id === activeId)
  const messages = activeConversation ? activeConversation.messages : []

  useEffect(() => {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [question])

  const applyMessages = (updater) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === activeId)
      if (idx === -1) {
        const newMessages = updater([])
        return [
          { id: activeId, title: deriveTitle(newMessages), messages: newMessages, updatedAt: Date.now() },
          ...prev,
        ]
      }
      const next = [...prev]
      const updatedMessages = updater(next[idx].messages)
      next[idx] = {
        ...next[idx],
        messages: updatedMessages,
        updatedAt: Date.now(),
        title: next[idx].title === 'New chat' || !next[idx].title ? deriveTitle(updatedMessages) : next[idx].title,
      }
      return next
    })
  }

  const stopGenerating = () => {
    controllerRef.current?.abort()
  }

  const startNewChat = () => {
    controllerRef.current?.abort()
    setActiveId(crypto.randomUUID())
    setQuestion('')
    setError(null)
    setSending(false)
    setSidebarOpen(false)
  }

  const selectConversation = (id) => {
    if (id === activeId) {
      setSidebarOpen(false)
      return
    }
    controllerRef.current?.abort()
    setActiveId(id)
    setQuestion('')
    setError(null)
    setSending(false)
    setSidebarOpen(false)
  }

  const deleteConversation = (id, e) => {
    e.stopPropagation()
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (id === activeId) {
      setActiveId(crypto.randomUUID())
    }
  }

  const ask = async (asked) => {
    if (!asked.trim() || sending) return

    const conversationId = activeId
    applyMessages((prev) => [...prev, { role: 'user', content: asked }])
    setQuestion('')
    setError(null)
    setSending(true)

    const assistantIndex = messages.length + 1
    applyMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', steps: [], memoryRecall: null, trace: null, streaming: true },
    ])

    const controller = new AbortController()
    controllerRef.current = controller
    const timeoutMs = thinkLonger ? THINK_LONGER_TIMEOUT_MS : REQUEST_TIMEOUT_MS
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const patchAssistant = (patch) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId)
        if (idx === -1) return prev
        const msgs = [...prev[idx].messages]
        if (!msgs[assistantIndex]) return prev
        msgs[assistantIndex] = { ...msgs[assistantIndex], ...patch }
        const next = [...prev]
        next[idx] = { ...next[idx], messages: msgs, updatedAt: Date.now() }
        return next
      })
    }

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: asked, think_longer: thinkLonger, session_id: conversationId }),
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

        patchAssistant({ content, steps: [...steps], memoryRecall, trace, streaming: true, isError })
      }

      patchAssistant({ streaming: false })
    } catch (err) {
      clearTimeout(timeout)
      if (err.name === 'AbortError') {
        patchAssistant({ streaming: false })
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId)
          if (idx === -1) return prev
          const msgs = [...prev[idx].messages]
          const current = msgs[assistantIndex]
          if (current && !current.content) {
            msgs[assistantIndex] = { ...current, content: '_Stopped._' }
            const next = [...prev]
            next[idx] = { ...next[idx], messages: msgs }
            return next
          }
          return prev
        })
      } else {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId)
          if (idx === -1) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], messages: next[idx].messages.slice(0, assistantIndex) }
          return next
        })
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

  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

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

        <div className="sidebar-section-label">Chats</div>
        <div className="history-list">
          {sortedConversations.length === 0 && <p className="history-empty">No chats yet</p>}
          {sortedConversations.map((c) => (
            <div key={c.id} className={`history-item ${c.id === activeId ? 'active' : ''}`}>
              <button className="history-item-btn" onClick={() => selectConversation(c.id)}>
                <span className="history-title">{c.title}</span>
                <span className="history-when">{formatWhen(c.updatedAt)}</span>
              </button>
              <button
                className="history-delete-btn"
                aria-label={`Delete "${c.title}"`}
                onClick={(e) => deleteConversation(c.id, e)}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
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
          <div className="topbar-titles">
            <span className="topbar-title">AI Research Agent</span>
            <span className="topbar-subtitle">Gemini · tools · memory</span>
          </div>
        </header>

        <div className="chat" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-badge">
                <AssistantIcon />
              </div>
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
                <div className={`avatar ${m.role}`}>{m.role === 'user' ? <UserIcon /> : <AssistantIcon />}</div>
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
