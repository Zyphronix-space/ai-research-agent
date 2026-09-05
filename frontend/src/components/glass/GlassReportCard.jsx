import { Link } from 'react-router-dom'
import { BookmarkIcon } from '../icons'

export function GlassReportCard({ run, onToggleSaved }) {
  return (
    <div className="glass-report-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <Link to={`/research/${run.id}`} className="glass-report-title" style={{ textDecoration: 'none' }}>
          {run.title || run.question}
        </Link>
        {onToggleSaved && (
          <button
            type="button"
            className="glass-btn sm icon-only ghost"
            aria-pressed={run.saved}
            onClick={() => onToggleSaved(run)}
            title={run.saved ? 'Remove from saved' : 'Save report'}
          >
            <BookmarkIcon size={15} filled={run.saved} />
          </button>
        )}
      </div>
      <div className="glass-report-meta">
        <span>
          <span className={`glass-status-dot ${run.status}`} /> {run.status}
        </span>
        <span>{run.depth}</span>
        <span>{new Date(run.updated_at.replace(' ', 'T') + 'Z').toLocaleString()}</span>
      </div>
    </div>
  )
}
