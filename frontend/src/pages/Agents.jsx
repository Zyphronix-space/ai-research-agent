import { useEffect, useState } from 'react'
import { agentsApi } from '../lib/api'
import { GlassAgentCard, GlassCard, GlassSkeletonCard } from '../components/glass'

export function Agents() {
  const [agents, setAgents] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    agentsApi.list().then(setAgents).catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h1>Agents</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 18 }}>
        The five agents behind every research run - what each one does, whether the pipeline is configured, and its
        most recent activity from your own research history.
      </p>

      {error && (
        <GlassCard>
          <p>Couldn't load agent status. {error}</p>
        </GlassCard>
      )}

      {!agents && !error && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <GlassSkeletonCard key={i} />
          ))}
        </div>
      )}

      {agents && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {agents.map((a) => (
            <GlassAgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  )
}
