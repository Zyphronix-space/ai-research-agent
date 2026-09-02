import { Fragment, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const REQUEST_TIMEOUT_MS = 280000 // multi-agent runs with a review round can take a few minutes
const RUNS_KEY = 'ai-research-agent-runs'
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

function BookmarkIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
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
  localRunCount,
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
                Your research history is saved to your account and available on any device you sign
                in on.
              </p>
              <button type="button" className="sign-out-btn" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="settings-hint">
                Sign in with Google to save your research history to your account so it's available
                on any device. Without signing in, history stays only in this browser.
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
            {localRunCount > 0
              ? `${localRunCount} research run${localRunCount > 1 ? 's are' : ' is'} stored in this browser.`
              : 'No research runs stored in this browser yet.'}
            {authUser && ' Signed-in history on the server is not affected by clearing this.'}
          </p>
          <button
            type="button"
            className="sign-out-btn danger"
            disabled={localRunCount === 0}
            onClick={onClearLocalHistory}
          >
            Clear runs stored in this browser
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-label">About this build</div>
          <ul className="about-list">
            <li>
              <strong>Multi-agent pipeline</strong> — a Planner breaks the question into
              sub-questions, Worker agents research them concurrently, a Reviewer checks the
              findings and can send workers back for another round, and a Synthesizer writes the
              final answer.
            </li>
            <li>
              <strong>Real tool use</strong> — Workers call web_search and fetch_url themselves;
              nothing here is scripted or mocked.
            </li>
            <li>
              <strong>Full observability</strong> — every agent's duration, tool calls, and sources
              found are tracked and shown in the Research Process timeline.
            </li>
          </ul>
          <p className="settings-hint">Esc closes this panel.</p>
        </div>
      </div>
    </div>
  )
}

const STATUS_GLYPH = { waiting: '○', running: '●', done: '✓', failed: '✕' }

function PipelineRow({ row }) {
  const [open, setOpen] = useState(false)
  const expandable = row.status !== 'waiting' && (row.finding || row.review || row.answer)
  return (
    <div className={`pipeline-row status-${row.status}`}>
      <button
        className="pipeline-row-head"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!expandable}
      >
        <span className={`pipeline-glyph glyph-${row.status}`}>{STATUS_GLYPH[row.status]}</span>
        <span className="pipeline-label">{row.label}</span>
        {row.topic && <span className="pipeline-topic">{row.topic}</span>}
        <span className="pipeline-detail">{row.detail}</span>
      </button>
      {open && row.finding && (
        <div className="pipeline-expand">
          {row.finding.findings.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
          {row.finding.limitations.length > 0 && (
            <p className="pipeline-limitations">Limitations: {row.finding.limitations.join('; ')}</p>
          )}
        </div>
      )}
      {open && row.review && (
        <div className="pipeline-expand">
          {row.review.feedback.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
          {row.review.missing_topics.length > 0 && (
            <p className="pipeline-limitations">Gaps: {row.review.missing_topics.join('; ')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function PipelineTimeline({ rows }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="pipeline">
      {rows.map((row) => (
        <PipelineRow key={row.id} row={row} />
      ))}
    </div>
  )
}

function sourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function QualityReview({ review }) {
  if (!review) return null
  const checks = [
    { ok: review.unsupported_claims.length === 0, label: 'Sources verified', gap: review.unsupported_claims },
    { ok: review.missing_topics.length === 0, label: 'Research coverage', gap: review.missing_topics },
    { ok: review.contradictions.length === 0, label: 'No major contradictions', gap: review.contradictions },
  ]
  return (
    <div className="quality-review">
      <h3>Quality Review</h3>
      <ul>
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? 'ok' : 'warn'}>
            <span className="quality-glyph">{c.ok ? '✓' : '!'}</span>
            {c.label}
            {!c.ok && <span className="quality-gap"> — {c.gap.join('; ')}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TraceTable({ trace }) {
  const [open, setOpen] = useState(false)
  if (!trace || trace.length === 0) return null
  const total = trace.reduce((sum, e) => sum + (e.duration_ms || 0), 0)
  return (
    <div className="trace-summary">
      <button className="trace-chip" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="trace-icon">◷</span>
        {trace.length} agent step{trace.length > 1 ? 's' : ''} · {(total / 1000).toFixed(1)}s total
      </button>
      {open && (
        <dl className="trace-details">
          {trace.map((e, i) => (
            <Fragment key={i}>
              <dt>{e.name}</dt>
              <dd>{((e.duration_ms || 0) / 1000).toFixed(1)}s</dd>
            </Fragment>
          ))}
          <dt>Total</dt>
          <dd>{(total / 1000).toFixed(1)}s</dd>
        </dl>
      )}
    </div>
  )
}

function collectFallbackSources(pipeline) {
  const seen = new Set()
  for (const row of pipeline || []) {
    for (const url of row.finding?.sources || []) seen.add(url)
  }
  return [...seen]
}

function ResearchReport({ run, onToggleSaved }) {
  const sources = run.citations && run.citations.length > 0 ? run.citations : collectFallbackSources(run.pipeline)
  return (
    <div className="research-report">
      <div className="report-header">
        <h2>Research Summary</h2>
        <button
          type="button"
          className={`bookmark-btn ${run.saved ? 'active' : ''}`}
          onClick={onToggleSaved}
          aria-pressed={run.saved}
          title={run.saved ? 'Remove from Saved Reports' : 'Save this report'}
        >
          <BookmarkIcon filled={run.saved} />
        </button>
      </div>

      <div className="report-answer">
        <ReactMarkdown>{run.answerMarkdown}</ReactMarkdown>
      </div>

      {run.keyFindings && run.keyFindings.length > 0 && (
        <>
          <h3>Key Findings</h3>
          <ul className="key-findings">
            {run.keyFindings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </>
      )}

      {sources.length > 0 && (
        <>
          <h3>Sources</h3>
          <div className="source-cards">
            {sources.map((url, i) => (
              <a key={i} className="source-card" href={url} target="_blank" rel="noreferrer">
                <span className="source-domain">{sourceDomain(url)}</span>
                <span className="source-url">{url}</span>
              </a>
            ))}
          </div>
        </>
      )}

      <QualityReview review={run.review} />
      <TraceTable trace={run.trace} />
    </div>
  )
}

function loadRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function deriveTitle(question) {
  const text = question.trim().replace(/\s+/g, ' ')
  return text.length > 44 ? `${text.slice(0, 44)}…` : text
}

const MS_PER_DAY = 86400000

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Buckets runs into date sections, most recent group first, items within
 * a group most-recent-first — same grouping shape the chat sidebar used. */
function groupRunsByDate(runs) {
  const sorted = [...runs].sort((a, b) => b.updatedAt - a.updatedAt)
  const today = startOfDay(Date.now())

  const buckets = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Previous 30 days', items: [] },
  ]
  const olderByMonth = new Map()

  for (const r of sorted) {
    const dayStart = startOfDay(r.updatedAt)
    const daysAgo = Math.round((today - dayStart) / MS_PER_DAY)

    if (daysAgo <= 0) buckets[0].items.push(r)
    else if (daysAgo === 1) buckets[1].items.push(r)
    else if (daysAgo <= 7) buckets[2].items.push(r)
    else if (daysAgo <= 30) buckets[3].items.push(r)
    else {
      const label = new Date(r.updatedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      if (!olderByMonth.has(label)) olderByMonth.set(label, [])
      olderByMonth.get(label).push(r)
    }
  }

  return [...buckets, ...Array.from(olderByMonth, ([label, items]) => ({ label, items }))].filter(
    (g) => g.items.length > 0
  )
}

/** Folds one pipeline event into the row list the UI renders. Rows are
 * upserted by id so late/duplicate events are safe to replay (e.g. when
 * restoring an in-progress run isn't attempted — but the same reducer
 * also builds history rows from a persisted trace, see runFromServerDetail). */
function reducePipelineEvent(rows, event) {
  const upsert = (id, patch) => {
    const idx = rows.findIndex((r) => r.id === id)
    if (idx === -1) return [...rows, { id, status: 'waiting', detail: 'Waiting', ...patch }]
    const next = [...rows]
    next[idx] = { ...next[idx], ...patch }
    return next
  }
  switch (event.type) {
    case 'plan_start':
      return upsert('planner', { kind: 'planner', label: 'PLANNER', status: 'running', detail: 'Creating research plan…' })
    case 'plan_done': {
      let next = upsert('planner', {
        status: 'done',
        detail: `Research plan created (${event.sub_questions.length} sub-question${event.sub_questions.length === 1 ? '' : 's'})`,
      })
      event.sub_questions.forEach((sq, i) => {
        const id = `worker_${String(i + 1).padStart(2, '0')}`
        if (!next.some((r) => r.id === id)) {
          next = [...next, { id, kind: 'worker', label: `WORKER ${String(i + 1).padStart(2, '0')}`, topic: sq.topic, status: 'waiting', detail: 'Waiting' }]
        }
      })
      if (!next.some((r) => r.id === 'reviewer')) {
        next = [...next, { id: 'reviewer', kind: 'reviewer', label: 'REVIEWER', status: 'waiting', detail: 'Waiting' }]
      }
      if (!next.some((r) => r.id === 'synthesizer')) {
        next = [...next, { id: 'synthesizer', kind: 'synthesizer', label: 'SYNTHESIZER', status: 'waiting', detail: 'Waiting' }]
      }
      return next
    }
    case 'worker_start':
      return upsert(event.worker, {
        kind: 'worker',
        label: `WORKER ${event.worker.replace('worker_', '')}`,
        topic: event.topic,
        status: 'running',
        detail: 'Searching sources…',
      })
    case 'tool_call':
      return upsert(event.worker, { detail: event.tool === 'fetch_url' ? 'Reading a source…' : 'Searching sources…' })
    case 'tool_result': {
      const row = rows.find((r) => r.id === event.worker)
      const count = (row?.toolCallCount || 0) + 1
      return upsert(event.worker, { toolCallCount: count, detail: `${count} tool call${count > 1 ? 's' : ''} made` })
    }
    case 'worker_done':
      return upsert(event.worker, {
        status: event.finding.failed ? 'failed' : 'done',
        detail: event.finding.failed
          ? 'Failed — continuing with partial results'
          : `${event.finding.sources.length} source${event.finding.sources.length === 1 ? '' : 's'} collected`,
        finding: event.finding,
      })
    case 'review_start':
      return upsert('reviewer', { kind: 'reviewer', label: 'REVIEWER', status: 'running', detail: `Reviewing (round ${event.iteration})…` })
    case 'review_done':
      return upsert('reviewer', {
        status: 'done',
        detail: event.review.approved ? 'Approved' : `Requested more research (round ${event.iteration})`,
        review: event.review,
      })
    case 'iteration_start':
      return upsert('reviewer', { status: 'waiting', detail: `Round ${event.iteration} pending…` })
    case 'synthesis_start':
      return upsert('synthesizer', { kind: 'synthesizer', label: 'SYNTHESIZER', status: 'running', detail: 'Writing final answer…' })
    case 'synthesis_done':
      return upsert('synthesizer', { status: 'done', detail: 'Done' })
    default:
      return rows
  }
}

function App() {
  const [runs, setRuns] = useState(loadRuns)
  const [activeId, setActiveId] = useState(() => crypto.randomUUID())
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 880)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyTab, setHistoryTab] = useState('history')
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'system')
  const [authUser, setAuthUser] = useState(null)
  const scrollEndRef = useRef(null)
  const controllerRef = useRef(null)
  const googleButtonRef = useRef(null)
  const tokenRef = useRef(localStorage.getItem(TOKEN_KEY))

  const activeRun = runs.find((r) => r.id === activeId)

  useEffect(() => {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs))
  }, [runs])

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

  useEffect(() => {
    if (!tokenRef.current) return
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((user) => {
        setAuthUser(user)
        return syncRemoteRuns()
      })
      .catch(() => {
        tokenRef.current = null
        localStorage.removeItem(TOKEN_KEY)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncRemoteRuns = async () => {
    if (!tokenRef.current) return
    try {
      const res = await fetch(`${API_URL}/research`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
      if (!res.ok) return
      const remote = await res.json()
      setRuns((prev) => {
        const known = new Set(prev.map((r) => r.id))
        const additions = remote
          .filter((r) => !known.has(r.id))
          .map((r) => ({
            id: r.id,
            question: r.question,
            title: deriveTitle(r.question),
            status: r.status,
            saved: r.saved,
            detailLoaded: false,
            updatedAt: new Date(r.updated_at.replace(' ', 'T') + 'Z').getTime(),
          }))
        return [...prev, ...additions]
      })
    } catch {
      // best-effort sync; local history still works if this fails
    }
  }

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
          await syncRemoteRuns()
        } catch {
          setError('Google sign-in failed. Please try again.')
        }
      },
    })
    window.google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'medium', width: 260 })
  }, [settingsOpen, authUser])

  const signOut = async () => {
    if (tokenRef.current) {
      fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${tokenRef.current}` } }).catch(() => {})
    }
    tokenRef.current = null
    localStorage.removeItem(TOKEN_KEY)
    setAuthUser(null)
  }

  const clearLocalHistory = () => {
    setRuns([])
    setActiveId(crypto.randomUUID())
  }

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeRun?.pipeline, sending])

  const patchRun = (id, patch) => {
    setRuns((prev) => {
      const idx = prev.findIndex((r) => r.id === id)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch, updatedAt: Date.now() }
      return next
    })
  }

  const closeSidebarOnMobile = () => {
    if (window.innerWidth <= 880) setSidebarOpen(false)
  }

  const startNewResearch = () => {
    controllerRef.current?.abort()
    setActiveId(crypto.randomUUID())
    setQuestion('')
    setError(null)
    setSending(false)
    closeSidebarOnMobile()
  }

  const selectRun = async (id) => {
    if (id === activeId) {
      closeSidebarOnMobile()
      return
    }
    controllerRef.current?.abort()

    const target = runs.find((r) => r.id === id)
    if (target && target.detailLoaded === false && tokenRef.current) {
      try {
        const res = await fetch(`${API_URL}/research/${id}`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
        if (res.ok) {
          const detail = await res.json()
          setRuns((prev) =>
            prev.map((r) =>
              r.id === id
                ? {
                    ...r,
                    detailLoaded: true,
                    answerMarkdown: detail.final_answer,
                    keyFindings: detail.key_findings,
                    citations: detail.sources,
                    review: detail.review,
                    trace: detail.trace,
                    pipeline: tracePipelineRows(detail.trace),
                  }
                : r
            )
          )
        }
      } catch {
        // fall through and select anyway
      }
    }

    setActiveId(id)
    setSending(false)
    closeSidebarOnMobile()
  }

  const deleteRun = (id, e) => {
    e.stopPropagation()
    setRuns((prev) => prev.filter((r) => r.id !== id))
    if (id === activeId) setActiveId(crypto.randomUUID())
    if (tokenRef.current) {
      fetch(`${API_URL}/research/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokenRef.current}` } }).catch(() => {})
    }
  }

  const toggleSaved = (id) => {
    const run = runs.find((r) => r.id === id)
    if (!run) return
    const saved = !run.saved
    patchRun(id, { saved })
    if (tokenRef.current) {
      fetch(`${API_URL}/research/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify({ saved }),
      }).catch(() => {})
    }
  }

  const runResearch = async (asked) => {
    if (!asked.trim() || sending) return
    const runId = activeId

    setRuns((prev) => [
      {
        id: runId,
        question: asked,
        title: deriveTitle(asked),
        status: 'running',
        saved: false,
        detailLoaded: true,
        pipeline: [],
        answerMarkdown: null,
        keyFindings: null,
        citations: null,
        review: null,
        trace: null,
        updatedAt: Date.now(),
      },
      ...prev,
    ])
    setQuestion('')
    setError(null)
    setSending(true)

    const controller = new AbortController()
    controllerRef.current = controller
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (tokenRef.current) headers.Authorization = `Bearer ${tokenRef.current}`

      const res = await fetch(`${API_URL}/research/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: asked, run_id: runId }),
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
      let pipeline = []
      let lastError = null

      const applyEvent = (event) => {
        pipeline = reducePipelineEvent(pipeline, event)
        if (event.type === 'synthesis_done') {
          patchRun(runId, {
            answerMarkdown: event.answer.answer_markdown,
            keyFindings: event.answer.key_findings,
            citations: event.answer.citations,
          })
        } else if (event.type === 'trace_summary') {
          patchRun(runId, { trace: event.agents, status: 'done' })
        } else if (event.type === 'error') {
          lastError = event.message
          patchRun(runId, { status: 'error', lastError: event.message })
        }
        patchRun(runId, { pipeline })
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
      }

      if (lastError) setError(lastError)
    } catch (err) {
      clearTimeout(timeout)
      if (err.name === 'AbortError') {
        patchRun(runId, { status: 'error', lastError: 'Stopped.' })
      } else {
        patchRun(runId, { status: 'error', lastError: err.message })
        setError(`Research run failed: ${err.message}`)
      }
    } finally {
      setSending(false)
      controllerRef.current = null
    }
  }

  const stopGenerating = () => controllerRef.current?.abort()

  const handleAsk = (e) => {
    e.preventDefault()
    runResearch(question)
  }

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      runResearch(question)
    }
  }

  const historyList = historyTab === 'saved' ? runs.filter((r) => r.saved) : runs
  const groups = groupRunsByDate(historyList)

  return (
    <div className="app-shell">
      <div className="bg-blobs">
        <div className="bg-blob bg-blob-a" />
        <div className="bg-blob bg-blob-b" />
        <div className="bg-blob bg-blob-c" />
      </div>

      <button type="button" className="sidebar-scrim" aria-label="Close menu" data-open={sidebarOpen} onClick={() => setSidebarOpen(false)} />

      <aside className="sidebar" data-open={sidebarOpen}>
        <div className="topbar-brand">
          <div className="topbar-logo">
            <AssistantIcon />
          </div>
          <div className="topbar-titles">
            <span className="topbar-title">AI Research Crew</span>
            <span className="topbar-subtitle">planner · workers · reviewer</span>
          </div>
        </div>

        <button type="button" className="new-chat-btn" onClick={startNewResearch}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New Research
        </button>

        <div className="history-tabs">
          <button className={historyTab === 'history' ? 'active' : ''} onClick={() => setHistoryTab('history')}>
            Research History
          </button>
          <button className={historyTab === 'saved' ? 'active' : ''} onClick={() => setHistoryTab('saved')}>
            Saved Reports
          </button>
        </div>

        <div className="history-list">
          {groups.length === 0 && <p className="history-empty">{historyTab === 'saved' ? 'No saved reports yet' : 'No research runs yet'}</p>}
          {groups.map((group) => (
            <div key={group.label} className="history-group">
              <div className="sidebar-section-label">{group.label}</div>
              {group.items.map((r) => (
                <div key={r.id} className={`history-item ${r.id === activeId ? 'active' : ''}`}>
                  <button className="history-item-btn" onClick={() => selectRun(r.id)}>
                    <span className={`history-status-dot status-${r.status}`} />
                    <span className="history-title">{r.title}</span>
                  </button>
                  <button className="history-delete-btn" aria-label={`Delete "${r.title}"`} onClick={(e) => deleteRun(r.id, e)}>
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
        localRunCount={runs.length}
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
        </header>

        <div className="chat" aria-live="polite">
          {!activeRun && (
            <div className="empty-state">
              <div className="empty-badge">
                <AssistantIcon />
              </div>
              <h1>What do you want researched?</h1>
              <p>
                Ask a research question. A planner breaks it into sub-questions, workers research
                them in parallel, a reviewer checks the findings, and a synthesizer writes the final
                report — every step shown live.
              </p>
            </div>
          )}

          {activeRun && (
            <div className="research-view">
              <h1 className="research-question">{activeRun.question}</h1>
              <PipelineTimeline rows={activeRun.pipeline} />
              {activeRun.status === 'error' && activeRun.lastError && (
                <p className="error research-error">{activeRun.lastError}</p>
              )}
              {activeRun.answerMarkdown && <ResearchReport run={activeRun} onToggleSaved={() => toggleSaved(activeRun.id)} />}
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {!activeRun && (
          <div className="composer-area">
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleAsk} className="composer">
              <div className="composer-input-row">
                <textarea
                  placeholder="Ask a research question…"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  disabled={sending}
                  rows={2}
                />
                <button type="submit" className="composer-btn send-btn" disabled={!question.trim()} aria-label="Research">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </form>
            <p className="composer-hint">Enter to research · Shift+Enter for a new line</p>
          </div>
        )}

        {activeRun && activeRun.status === 'running' && (
          <div className="composer-area">
            <button type="button" className="stop-research-btn" onClick={stopGenerating}>
              Stop
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

/** Rebuilds pipeline rows from a persisted trace (server history detail) so
 * a past run looks the same as a live one, just fully "done" already. */
function tracePipelineRows(trace) {
  if (!trace) return []
  return trace.map((entry) => {
    const isWorker = entry.name.startsWith('worker_')
    const isReviewer = entry.name.startsWith('reviewer')
    const isSynth = entry.name === 'synthesizer'
    const label = isWorker ? `WORKER ${entry.name.replace('worker_', '')}` : isReviewer ? 'REVIEWER' : isSynth ? 'SYNTHESIZER' : 'PLANNER'
    return {
      id: entry.name,
      kind: isWorker ? 'worker' : isReviewer ? 'reviewer' : isSynth ? 'synthesizer' : 'planner',
      label,
      topic: entry.topic,
      status: entry.failed ? 'failed' : 'done',
      detail: entry.failed
        ? 'Failed — continuing with partial results'
        : isWorker
          ? `${entry.sources_found ?? 0} sources collected`
          : `${((entry.duration_ms || 0) / 1000).toFixed(1)}s`,
    }
  })
}

export default App
