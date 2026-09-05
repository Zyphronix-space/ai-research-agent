import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { projectsApi, researchApi } from '../lib/api'
import { GlassCard, GlassInput, GlassReportCard, GlassSelect, GlassSkeletonCard } from '../components/glass'

const TABS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'reports', label: 'Reports' },
  { key: 'projects', label: 'Projects' },
]

export function History() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('type') === 'reports' ? 'reports' : params.get('type') === 'projects' ? 'projects' : 'sessions')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState([])
  const [runs, setRuns] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => setProjects([]))
  }, [])

  const load = () => {
    setError(null)
    const filters = { q: q || undefined, status: status || undefined, project_id: projectId || undefined }
    if (tab === 'reports') filters.status = 'done'
    researchApi
      .list(filters)
      .then(setRuns)
      .catch((err) => setError(err.message))
  }

  useEffect(load, [tab, q, status, projectId])

  const switchTab = (key) => {
    setTab(key)
    setParams({ type: key })
  }

  return (
    <div>
      <h1>Research History</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 18 }}>Search and filter across every research session, report, and project.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="glass-btn sm"
            style={tab === t.key ? { background: 'var(--accent-gradient)', color: '#fff', borderColor: 'transparent' } : undefined}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'projects' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <GlassInput placeholder="Search questions…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
          {tab === 'sessions' && (
            <GlassSelect value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 160 }}>
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="done">Done</option>
              <option value="error">Error</option>
            </GlassSelect>
          )}
          <GlassSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: 180 }}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </GlassSelect>
        </div>
      )}

      {tab === 'projects' ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {projects
            .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
            .map((p) => (
              <GlassCard key={p.id} interactive onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="glass-card-title">{p.name}</div>
                <p className="glass-card-body">{p.session_count} sessions</p>
              </GlassCard>
            ))}
          {q && projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).length === 0 && (
            <GlassCard>
              <p style={{ color: 'var(--text-dim)' }}>No projects match "{q}".</p>
            </GlassCard>
          )}
        </div>
      ) : error ? (
        <GlassCard>
          <p>Couldn't load results. {error}</p>
        </GlassCard>
      ) : !runs ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassSkeletonCard key={i} />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <GlassCard>
          <p style={{ color: 'var(--text-dim)' }}>No results match these filters.</p>
        </GlassCard>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {runs.map((r) => (
            <GlassReportCard key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  )
}
