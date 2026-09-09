/** Folds one pipeline event into the live pipeline state the UI renders:
 * a `rows` list for GlassTimeline (Planner / Researcher N / Tool Agent /
 * Reviewer / Writer, ○/●/✓/✕) and an `activity` list for GlassActivityLog
 * (timestamped, safe-only lines - agent, task, status, tool, query, result
 * summary, timestamp, error - never the model's raw reasoning, which this
 * app never receives from the backend in the first place).
 *
 * The Tool Agent row is synthetic: the backend's researchers call tools
 * directly (see backend/research/researcher.py), but the pipeline's own
 * diagram shows Tools as their own stage between Researchers and Reviewer,
 * so this reducer aggregates every researcher's tool_call/tool_result
 * events into one row rather than the orchestration itself being
 * restructured.
 */

const TOOL_LABEL = { web_search: 'search', fetch_url: 'fetch', calculator: 'calc', get_current_datetime: 'datetime' }

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function summarizeArgs(tool, args) {
  if (!args) return ''
  if (args.query) return `"${args.query}"`
  if (args.url) return args.url
  if (args.expression) return args.expression
  return ''
}

export function initialPipelineState() {
  return { rows: [], activity: [], toolCounts: {}, activeResearchers: 0, toolCallTotal: 0 }
}

function upsertRow(rows, id, patch) {
  const idx = rows.findIndex((r) => r.id === id)
  if (idx === -1) return [...rows, { id, status: 'waiting', detail: 'Waiting', ...patch }]
  const next = [...rows]
  next[idx] = { ...next[idx], ...patch }
  return next
}

function log(state, agent, text, error = false) {
  return { ...state, activity: [...state.activity, { time: timeNow(), agent, text, error }] }
}

function toolAgentDetail(state) {
  const parts = Object.entries(state.toolCounts)
    .filter(([, n]) => n > 0)
    .map(([tool, n]) => `${n} ${TOOL_LABEL[tool] || tool}`)
  return parts.length > 0 ? parts.join(', ') : 'Waiting'
}

export function applyPipelineEvent(state, event) {
  let rows = state.rows
  let next = state

  switch (event.type) {
    case 'plan_start':
      rows = upsertRow(rows, 'planner', { kind: 'planner', label: 'PLANNER', status: 'running', detail: 'Creating research plan…' })
      next = log({ ...next, rows }, 'Planner', 'Creating research plan…')
      break

    case 'plan_done': {
      rows = upsertRow(rows, 'planner', {
        status: 'done',
        detail: `Plan created - ${event.sub_questions.length} sub-question${event.sub_questions.length === 1 ? '' : 's'}`,
      })
      event.sub_questions.forEach((sq, i) => {
        const id = `researcher_${String(i + 1).padStart(2, '0')}`
        if (!rows.some((r) => r.id === id)) {
          rows = [...rows, { id, kind: 'researcher', label: `RESEARCHER ${String(i + 1).padStart(2, '0')}`, topic: sq.topic, status: 'waiting', detail: 'Waiting' }]
        }
      })
      if (!rows.some((r) => r.id === 'tool_agent')) {
        rows = [...rows, { id: 'tool_agent', kind: 'tool_agent', label: 'TOOL AGENT', status: 'waiting', detail: 'Waiting' }]
      }
      if (!rows.some((r) => r.id === 'reviewer')) {
        rows = [...rows, { id: 'reviewer', kind: 'reviewer', label: 'REVIEWER', status: 'waiting', detail: 'Waiting' }]
      }
      if (!rows.some((r) => r.id === 'writer')) {
        rows = [...rows, { id: 'writer', kind: 'writer', label: 'WRITER', status: 'waiting', detail: 'Waiting' }]
      }
      next = log({ ...next, rows }, 'Planner', `Plan created - ${event.sub_questions.length} sub-question(s)`)
      break
    }

    case 'researcher_start':
      rows = upsertRow(rows, event.researcher, {
        kind: 'researcher',
        label: `RESEARCHER ${event.researcher.replace('researcher_', '')}`,
        topic: event.topic,
        status: 'running',
        detail: 'Researching…',
      })
      next = log(
        { ...next, rows, activeResearchers: next.activeResearchers + 1 },
        `Researcher ${event.researcher.replace('researcher_', '')}`,
        `Started: ${event.topic}`
      )
      break

    case 'tool_call': {
      const toolCounts = { ...next.toolCounts, [event.tool]: (next.toolCounts[event.tool] || 0) + 1 }
      const withCounts = { ...next, toolCounts, toolCallTotal: next.toolCallTotal + 1 }
      rows = upsertRow(rows, 'tool_agent', { kind: 'tool_agent', label: 'TOOL AGENT', status: 'running', detail: toolAgentDetail(withCounts) })
      rows = upsertRow(rows, event.researcher, { detail: event.tool === 'fetch_url' ? 'Reading a source…' : 'Using a tool…' })
      next = log({ ...withCounts, rows }, 'Tool Agent', `${event.tool} ${summarizeArgs(event.tool, event.args)}`.trim())
      break
    }

    case 'tool_result': {
      const row = rows.find((r) => r.id === event.researcher)
      const count = (row?.toolCallCount || 0) + 1
      rows = upsertRow(rows, event.researcher, { toolCallCount: count, detail: `${count} tool call${count > 1 ? 's' : ''} made` })
      next = log({ ...next, rows }, 'Tool Agent', `${event.tool} completed (${event.latency_ms ?? '?'}ms)`)
      break
    }

    case 'researcher_done': {
      const activeResearchers = Math.max(0, next.activeResearchers - 1)
      rows = upsertRow(rows, event.researcher, {
        status: event.finding.failed ? 'failed' : 'done',
        detail: event.finding.failed ? 'Failed - continuing with partial results' : `${event.finding.sources.length} source${event.finding.sources.length === 1 ? '' : 's'} collected`,
        finding: event.finding,
      })
      const withActive = { ...next, activeResearchers, rows }
      rows = upsertRow(rows, 'tool_agent', {
        status: activeResearchers > 0 ? 'running' : 'done',
        detail: toolAgentDetail(withActive),
      })
      next = log(
        { ...withActive, rows },
        `Researcher ${event.researcher.replace('researcher_', '')}`,
        event.finding.failed ? 'Failed - continuing with partial results' : `${event.finding.sources.length} source(s) collected`,
        event.finding.failed
      )
      break
    }

    case 'review_start':
      rows = upsertRow(rows, 'reviewer', { kind: 'reviewer', label: 'REVIEWER', status: 'running', detail: `Reviewing (round ${event.iteration})…` })
      next = log({ ...next, rows }, 'Reviewer', `Reviewing findings (round ${event.iteration})…`)
      break

    case 'review_done':
      rows = upsertRow(rows, 'reviewer', {
        status: 'done',
        detail: event.skipped ? 'Skipped (disabled for this run)' : event.review.approved ? 'Approved' : `Requested more research (round ${event.iteration})`,
        review: event.review,
      })
      next = log({ ...next, rows }, 'Reviewer', event.skipped ? 'Reviewer disabled for this run' : event.review.approved ? 'Findings approved' : 'Requested another research round')
      break

    case 'iteration_start':
      rows = upsertRow(rows, 'reviewer', { status: 'waiting', detail: `Round ${event.iteration} pending…` })
      next = log({ ...next, rows }, 'Reviewer', `Round ${event.iteration} - researching: ${event.topics.join(', ')}`)
      break

    case 'writing_start':
      rows = upsertRow(rows, 'writer', { kind: 'writer', label: 'WRITER', status: 'running', detail: 'Writing final report…' })
      next = log({ ...next, rows }, 'Writer', 'Writing final report…')
      break

    case 'writing_done':
      rows = upsertRow(rows, 'writer', { status: 'done', detail: event.skipped ? 'Skipped - compiled raw findings' : 'Report complete' })
      next = log({ ...next, rows }, 'Writer', event.skipped ? 'Writer disabled - compiled raw findings instead' : 'Final report complete')
      break

    case 'error':
      next = log({ ...next, rows }, event.phase ? `${event.phase[0].toUpperCase()}${event.phase.slice(1)}` : 'Pipeline', event.message, true)
      break

    default:
      break
  }

  return next
}

/** Rebuilds pipeline rows from a persisted trace (server history detail)
 * so a past run looks the same as a live one, just fully "done" already. */
export function pipelineRowsFromTrace(trace) {
  if (!trace) return []
  const rows = []
  for (const entry of trace) {
    if (entry.name === 'planner') {
      rows.push({ id: 'planner', kind: 'planner', label: 'PLANNER', status: 'done', detail: `${((entry.duration_ms || 0) / 1000).toFixed(1)}s` })
    } else if (entry.name.startsWith('researcher_')) {
      const finding = entry.finding
      rows.push({
        id: entry.name,
        kind: 'researcher',
        label: `RESEARCHER ${entry.name.replace('researcher_', '')}`,
        topic: entry.topic,
        status: entry.failed ? 'failed' : 'done',
        detail: entry.failed ? 'Failed - continuing with partial results' : `${entry.sources_found ?? 0} sources collected`,
        finding,
      })
    } else if (entry.name.startsWith('reviewer')) {
      rows.push({ id: 'reviewer', kind: 'reviewer', label: 'REVIEWER', status: 'done', detail: `${((entry.duration_ms || 0) / 1000).toFixed(1)}s` })
    } else if (entry.name === 'writer') {
      rows.push({ id: 'writer', kind: 'writer', label: 'WRITER', status: 'done', detail: `${((entry.duration_ms || 0) / 1000).toFixed(1)}s` })
    }
  }
  const toolAgentIdx = rows.findIndex((r) => r.kind === 'reviewer')
  const toolAgentRow = { id: 'tool_agent', kind: 'tool_agent', label: 'TOOL AGENT', status: 'done', detail: 'Completed' }
  if (toolAgentIdx === -1) rows.push(toolAgentRow)
  else rows.splice(toolAgentIdx, 0, toolAgentRow)
  return rows
}
