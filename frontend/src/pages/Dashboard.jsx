import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { dashboardApi } from '../lib/api'
import { GlassButton, GlassCard, GlassCardHeader, GlassMetric, GlassReportCard, GlassSkeletonCard, useToast } from '../components/glass'
import { ClockIcon, DashboardIcon, FolderIcon, LinkIcon, PlusIcon } from '../components/icons'

export function Dashboard() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    setError(null)
    dashboardApi
      .get()
      .then(setData)
      .catch((err) => {
        setError(err.message)
        pushToast({ type: 'error', message: `Couldn't load dashboard: ${err.message}`, action: { label: 'Retry', onClick: load } })
      })
  }

  useEffect(load, [])

  if (error && !data) {
    return (
      <GlassCard>
        <p>Couldn't load your dashboard. {error}</p>
        <GlassButton onClick={load} style={{ marginTop: 10 }}>
          Retry
        </GlassButton>
      </GlassCard>
    )
  }

  if (!data) {
    return (
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassSkeletonCard key={i} />
        ))}
      </div>
    )
  }

  const { metrics, recent_research, active_research } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Research Overview</h1>
          <p style={{ color: 'var(--text-dim)' }}>Your multi-agent research workspace at a glance.</p>
        </div>
        <GlassButton variant="primary" onClick={() => navigate('/research/new')}>
          <PlusIcon size={16} /> Start Research
        </GlassButton>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <GlassMetric label="Projects" value={metrics.projects} icon={<FolderIcon size={16} />} />
        <GlassMetric label="Research Sessions" value={metrics.sessions} icon={<DashboardIcon size={16} />} />
        <GlassMetric label="Reports" value={metrics.reports} icon={<ClockIcon size={16} />} />
        <GlassMetric label="Sources Collected" value={metrics.sources} icon={<LinkIcon size={16} />} />
      </div>

      {active_research.length > 0 && (
        <div>
          <h2>Active Research</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {active_research.map((r) => (
              <GlassReportCard key={r.id} run={r} />
            ))}
          </div>
        </div>
      )}

      <div>
        <GlassCardHeader title="Recent Research" action={<Link to="/history" style={{ fontSize: '0.82rem' }}>View all</Link>} />
        {recent_research.length === 0 ? (
          <GlassCard>
            <p style={{ color: 'var(--text-dim)' }}>No research yet. Start your first investigation to see it here.</p>
          </GlassCard>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {recent_research.map((r) => (
              <GlassReportCard key={r.id} run={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
