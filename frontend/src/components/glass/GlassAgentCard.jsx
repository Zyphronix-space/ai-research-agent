import { BotIcon } from '../icons'

const STATUS_LABEL = { operational: 'Operational', not_configured: 'Not configured' }

export function GlassAgentCard({ agent }) {
  return (
    <div className="glass-agent-card">
      <div className="glass-agent-card-head">
        <span className="glass-agent-avatar">
          <BotIcon size={18} />
        </span>
        <span className="glass-agent-name">{agent.name}</span>
        <span className={`glass-agent-status ${agent.status}`}>{STATUS_LABEL[agent.status] || agent.status}</span>
      </div>
      <p className="glass-agent-purpose">{agent.purpose}</p>
      {agent.tools?.length > 0 && (
        <div className="glass-agent-tools">
          {agent.tools.map((t) => (
            <span key={t} className="glass-chip">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="glass-agent-recent">
        <span className="glass-field-label" style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          Recent runs
        </span>
        {agent.recent_runs?.length > 0 ? (
          agent.recent_runs.map((r, i) => (
            <div key={i} className="glass-agent-recent-row">
              <span title={r.question}>{r.question}</span>
              <span>{r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : 'n/a'}</span>
            </div>
          ))
        ) : (
          <span className="glass-agent-recent-row">No runs yet</span>
        )}
      </div>
    </div>
  )
}
