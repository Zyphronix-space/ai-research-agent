import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const REQUEST_TIMEOUT_MS = 45000
const THINK_LONGER_TIMEOUT_MS = 75000
const CONVERSATIONS_KEY = 'ai-research-agent-conversations'
const THEME_KEY = 'ai-research-agent-theme'
const TOKEN_KEY = 'ai-research-agent-session-token'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
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

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  )
}

function SettingsPanel({
  open,
  onClose,
  theme,
  onThemeChange,
  authUser,
  onSignOut,
  googleButtonRef,
  onClearLocalHistory,
  localChatCount,
}) {
  if (!open) return null
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button type="button" className="settings-close" aria-label="Close settings" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Appearance</div>
          <div className="theme-switch">
            {THEMES.map((t) => (
              <button
                key={t.value}
                className={`theme-option ${theme === t.value ? 'active' : ''}`}
                onClick={() => onThemeChange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="settings-hint">
            "System" follows your OS/browser setting. "Light" or "Dark" overrides it just for this
            browser (saved locally, applies next time you open the app here).
          </p>
        </div>

        <div className="settings-section">
          <div className="settings-label">Account</div>
          {authUser ? (
            <>
              <div className="account-row">
                {authUser.picture ? (
                  <img className="account-avatar" src={authUser.picture} alt="" />
                ) : (
                  <div className="account-avatar account-avatar-fallback">{authUser.email[0].toUpperCase()}</div>
                )}
                <div className="account-info">
                  <span className="account-name">{authUser.name || authUser.email}</span>
                  <span className="account-email">{authUser.email}</span>
                </div>
              </div>
              <p className="settings-hint">
                Your chat history is saved to your account and available on any device you sign in on.
              </p>
              <button type="button" className="sign-out-btn" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="settings-hint">
                Sign in with Google to save your chat history to your account so it's available on any
                device. Without signing in, history stays only in this browser.
              </p>
              {GOOGLE_CLIENT_ID ? (
                <div ref={googleButtonRef} className="google-btn-slot" />
              ) : (
                <p className="settings-hint settings-warn">
                  Google sign-in isn't configured on this deployment (missing VITE_GOOGLE_CLIENT_ID).
                </p>
              )}
            </>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-label">Data</div>
          <p className="settings-hint">
            {localChatCount > 0
              ? `${localChatCount} chat${localChatCount > 1 ? 's are' : ' is'} stored in this browser.`
              : 'No chats stored in this browser yet.'}
            {authUser && ' Signed-in history on the server is not affected by clearing this.'}
          </p>
          <button
            type="button"
            className="sign-out-btn danger"
            disabled={localChatCount === 0}
            onClick={onClearLocalHistory}
          >
            Clear chats stored in this browser
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-label">About this build</div>
          <ul className="about-list">
            <li>
              <strong>Concurrent tools</strong> — multiple tool calls in one turn run at the same time
              (asyncio.gather), not one after another.
            </li>
            <li>
              <strong>Execution trace</strong> — every step is timed and Gemini's token usage is
              accumulated, shown per-tool and per-turn.
            </li>
            <li>
              <strong>Cross-session memory</strong> — finished exchanges are embedded and stored, so a
              related question later — even in a new session — can recall them.
            </li>
          </ul>
          <p className="settings-hint">
            Enter sends · Shift+Enter for a new line · Esc closes this panel.
          </p>
        </div>
      </div>
    </div>
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

const MS_PER_DAY = 86400000

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Buckets conversations into ChatGPT/Gemini-style date sections, most
 * recent group first, items within a group most-recent-first. */
function groupConversationsByDate(conversations) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  const today = startOfDay(Date.now())

  const buckets = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Previous 30 days', items: [] },
  ]
  const olderByMonth = new Map()

  for (const c of sorted) {
    const dayStart = startOfDay(c.updatedAt)
    const daysAgo = Math.round((today - dayStart) / MS_PER_DAY)

    if (daysAgo <= 0) buckets[0].items.push(c)
    else if (daysAgo === 1) buckets[1].items.push(c)
    else if (daysAgo <= 7) buckets[2].items.push(c)
    else if (daysAgo <= 30) buckets[3].items.push(c)
    else {
      const label = new Date(c.updatedAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
      if (!olderByMonth.has(label)) olderByMonth.set(label, [])
      olderByMonth.get(label).push(c)
    }
  }

  return [...buckets, ...Array.from(olderByMonth, ([label, items]) => ({ label, items }))].filter(
    (g) => g.items.length > 0
  )
}

function App() {
  const [conversations, setConversations] = useState(loadConversations)
  const [activeId, setActiveId] = useState(() => crypto.randomUUID())
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [thinkLonger, setThinkLonger] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 880)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'system')
  const [authUser, setAuthUser] = useState(null)
  const chatEndRef = useRef(null)
  const controllerRef = useRef(null)
  const textareaRef = useRef(null)
  const googleButtonRef = useRef(null)
  const tokenRef = useRef(localStorage.getItem(TOKEN_KEY))

  const activeConversation = conversations.find((c) => c.id === activeId)
  const messages = activeConversation ? activeConversation.messages || [] : []

  useEffect(() => {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    if (!settingsOpen) return
    const onKeyDown = (e) => e.key === 'Escape' && setSettingsOpen(false)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Validate a stored session token on load, so a reload keeps you signed in.
  useEffect(() => {
    if (!tokenRef.current) return
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((user) => {
        setAuthUser(user)
        return syncRemoteConversations()
      })
      .catch(() => {
        tokenRef.current = null
        localStorage.removeItem(TOKEN_KEY)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncRemoteConversations = async () => {
    if (!tokenRef.current) return
    try {
      const res = await fetch(`${API_URL}/conversations`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      })
      if (!res.ok) return
      const remote = await res.json()
      setConversations((prev) => {
        const knownIds = new Set(prev.map((c) => c.id))
        const additions = remote
          .filter((r) => !knownIds.has(r.id))
          .map((r) => ({
            id: r.id,
            title: r.title,
            messages: null, // fetched lazily when opened, see selectConversation
            updatedAt: new Date(r.updated_at.replace(' ', 'T') + 'Z').getTime(),
          }))
        return [...prev, ...additions]
      })
    } catch {
      // best-effort sync; local history still works if this fails
    }
  }

  // Render Google's own Sign-In button once its script is loaded and the
  // settings panel is showing the slot for it.
  useEffect(() => {
    if (!settingsOpen || authUser || !GOOGLE_CLIENT_ID || !googleButtonRef.current) return
    if (!window.google?.accounts?.id) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          })
          if (!res.ok) throw new Error('Sign-in failed')
          const { session_token, user } = await res.json()
          tokenRef.current = session_token
          localStorage.setItem(TOKEN_KEY, session_token)
          setAuthUser(user)
          await syncRemoteConversations()
        } catch {
          setError('Google sign-in failed. Please try again.')
        }
      },
    })
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'medium',
      width: 260,
    })
  }, [settingsOpen, authUser])

  const signOut = async () => {
    if (tokenRef.current) {
      fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      }).catch(() => {})
    }
    tokenRef.current = null
    localStorage.removeItem(TOKEN_KEY)
    setAuthUser(null)
  }

  const clearLocalHistory = () => {
    setConversations([])
    setActiveId(crypto.randomUUID())
  }

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

  const selectConversation = async (id) => {
    if (id === activeId) {
      setSidebarOpen(false)
      return
    }
    controllerRef.current?.abort()

    const target = conversations.find((c) => c.id === id)
    if (target && target.messages === null && tokenRef.current) {
      try {
        const res = await fetch(`${API_URL}/conversations/${id}`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        })
        if (res.ok) {
          const { messages: remoteMessages } = await res.json()
          setConversations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, messages: remoteMessages } : c))
          )
        }
      } catch {
        // fall through and select anyway; the panel will just show nothing to load
      }
    }

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
    if (tokenRef.current) {
      fetch(`${API_URL}/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      }).catch(() => {})
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
      const headers = { 'Content-Type': 'application/json' }
      if (tokenRef.current) headers.Authorization = `Bearer ${tokenRef.current}`

      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers,
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

  const conversationGroups = groupConversationsByDate(conversations)

  return (
    <div className="app-shell">
      <div className="bg-blobs">
        <div className="bg-blob bg-blob-a" />
        <div className="bg-blob bg-blob-b" />
        <div className="bg-blob bg-blob-c" />
      </div>

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

        <div className="history-list">
          {conversationGroups.length === 0 && <p className="history-empty">No chats yet</p>}
          {conversationGroups.map((group) => (
            <div key={group.label} className="history-group">
              <div className="sidebar-section-label">{group.label}</div>
              {group.items.map((c) => (
                <div key={c.id} className={`history-item ${c.id === activeId ? 'active' : ''}`}>
                  <button className="history-item-btn" onClick={() => selectConversation(c.id)}>
                    <span className="history-title">{c.title}</span>
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
          ))}
        </div>

        <button type="button" className="settings-btn" onClick={() => setSettingsOpen(true)}>
          <GearIcon />
          Settings
          {authUser && <span className="account-chip">{(authUser.name || authUser.email)[0].toUpperCase()}</span>}
        </button>
      </aside>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        authUser={authUser}
        onSignOut={signOut}
        googleButtonRef={googleButtonRef}
        onClearLocalHistory={clearLocalHistory}
        localChatCount={conversations.length}
      />

      <main className="chat-column">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-pressed={sidebarOpen}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <div className="topbar-brand">
            <div className="topbar-logo">
              <AssistantIcon />
            </div>
            <div className="topbar-titles">
              <span className="topbar-title">AI Research Agent</span>
              <span className="topbar-subtitle">Gemini · tools · memory</span>
            </div>
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
