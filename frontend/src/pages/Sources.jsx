import { useEffect, useState } from 'react'
import { sourcesApi } from '../lib/api'
import { GlassCard, GlassSelect, GlassSkeletonCard, GlassSourceCard, useToast } from '../components/glass'

export function Sources() {
  const { pushToast } = useToast()
  const [sources, setSources] = useState(null)
  const [error, setError] = useState(null)
  const [relevance, setRelevance] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)

  const load = () => {
    setError(null)
    sourcesApi
      .list({ relevance: relevance || undefined, saved: savedOnly || undefined })
      .then(setSources)
      .catch((err) => setError(err.message))
  }

  useEffect(load, [relevance, savedOnly])

  const updateSource = async (source, patch) => {
    setSources((prev) => (patch.removed ? prev.filter((s) => s.id !== source.id) : prev.map((s) => (s.id === source.id ? { ...s, ...patch } : s))))
    try {
      await sourcesApi.update(source.id, patch)
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't update source: ${err.message}` })
      load()
    }
  }

  return (
    <div>
      <h1>Sources</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 18 }}>Every source your researchers actually collected - real title, domain, and relevance, never invented.</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <GlassSelect value={relevance} onChange={(e) => setRelevance(e.target.value)} style={{ width: 160 }}>
          <option value="">All relevance</option>
          <option value="high">High relevance</option>
          <option value="medium">Medium relevance</option>
          <option value="low">Low relevance</option>
        </GlassSelect>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
          Saved only
        </label>
      </div>

      {error && (
        <GlassCard>
          <p>Couldn't load sources. {error}</p>
        </GlassCard>
      )}

      {!sources && !error && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassSkeletonCard key={i} />
          ))}
        </div>
      )}

      {sources && sources.length === 0 && (
        <GlassCard>
          <p style={{ color: 'var(--text-dim)' }}>No sources match these filters yet.</p>
        </GlassCard>
      )}

      {sources && sources.length > 0 && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {sources.map((s) => (
            <GlassSourceCard
              key={s.id}
              source={s}
              onOpen={(src) => window.open(src.url, '_blank', 'noreferrer')}
              onSave={(src) => updateSource(src, { saved: !src.saved })}
              onRemove={(src) => updateSource(src, { removed: true })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
