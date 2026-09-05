import { useState } from 'react'

const GLYPH = { waiting: '○', running: '●', done: '✓', failed: '✕' }

function TimelineRow({ row }) {
  const [open, setOpen] = useState(false)
  const expandable = row.status !== 'waiting' && (row.finding || row.review)
  return (
    <div className={`glass-timeline-row status-${row.status}`}>
      <span className={`glass-timeline-glyph status-${row.status}`}>{GLYPH[row.status]}</span>
      <button
        type="button"
        className="glass-timeline-main"
        style={{ background: 'none', border: 'none', cursor: expandable ? 'pointer' : 'default', padding: 0 }}
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!expandable}
      >
        <div>
          <span className="glass-timeline-label">{row.label}</span>
          {row.topic && <span className="glass-timeline-topic">{row.topic}</span>}
        </div>
        <div className="glass-timeline-detail">{row.detail}</div>
      </button>
      {open && row.finding && (
        <div className="glass-timeline-expand" style={{ flexBasis: '100%' }}>
          {row.finding.findings.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
          {row.finding.limitations?.length > 0 && <p style={{ color: 'var(--warn)' }}>Limitations: {row.finding.limitations.join('; ')}</p>}
        </div>
      )}
      {open && row.review && (
        <div className="glass-timeline-expand" style={{ flexBasis: '100%' }}>
          {row.review.feedback.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
          {row.review.missing_topics?.length > 0 && <p style={{ color: 'var(--warn)' }}>Gaps: {row.review.missing_topics.join('; ')}</p>}
        </div>
      )}
    </div>
  )
}

export function GlassTimeline({ rows }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="glass-timeline">
      {rows.map((row) => (
        <TimelineRow key={row.id} row={row} />
      ))}
    </div>
  )
}

export function GlassActivityLog({ entries }) {
  if (!entries || entries.length === 0) return null
  return (
    <div className="glass-activity-log" aria-live="polite">
      {entries.map((e, i) => (
        <div key={i} className={`glass-activity-row ${e.error ? 'error' : ''}`}>
          <span className="glass-activity-time">{e.time}</span>
          <span className="glass-activity-agent">{e.agent}</span>
          <span>{e.text}</span>
        </div>
      ))}
    </div>
  )
}
