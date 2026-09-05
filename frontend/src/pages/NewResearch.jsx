import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { GlassButton, GlassCard, GlassField, GlassSelect, GlassTextarea } from '../components/glass'

const DEPTHS = [
  { value: 'quick', label: 'Quick', hint: '1-2 sub-questions, single research pass' },
  { value: 'standard', label: 'Standard', hint: '2-5 sub-questions, one review round' },
  { value: 'deep', label: 'Deep', hint: '4-7 sub-questions, up to 3 review rounds' },
]

const AGENTS = [
  { key: 'planner', label: 'Planner', required: true },
  { key: 'researcher', label: 'Researcher', required: true },
  { key: 'reviewer', label: 'Reviewer', required: false },
  { key: 'writer', label: 'Writer', required: false },
]

export function NewResearch() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [question, setQuestion] = useState('')
  const [depth, setDepth] = useState('standard')
  const [agentConfig, setAgentConfig] = useState({ planner: true, researcher: true, reviewer: true, writer: true })
  const [projectId, setProjectId] = useState(params.get('project_id') || '')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => setProjects([]))
  }, [])

  const toggleAgent = (key) => setAgentConfig((prev) => ({ ...prev, [key]: !prev[key] }))

  const start = (e) => {
    e.preventDefault()
    if (!question.trim()) return
    const runId = crypto.randomUUID()
    navigate(`/research/${runId}`, {
      state: { start: { question: question.trim(), depth, project_id: projectId || null, agent_config: agentConfig } },
    })
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1>What would you like to investigate?</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 22 }}>
        A Planner breaks your question into sub-questions, Researchers investigate them in parallel using real tools, a
        Reviewer checks the findings, and a Writer produces the final report — every step shown live.
      </p>

      <GlassCard>
        <form onSubmit={start} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <GlassField label="Research question">
            <GlassTextarea
              autoFocus
              rows={3}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What are the main tradeoffs between pgvector and Pinecone for a small RAG app?"
            />
          </GlassField>

          <GlassField label="Project (optional)">
            <GlassSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </GlassSelect>
          </GlassField>

          <div>
            <div className="glass-field-label" style={{ marginBottom: 8 }}>
              Research depth
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {DEPTHS.map((d) => (
                <label
                  key={d.value}
                  className="glass-card"
                  style={{
                    padding: 12,
                    cursor: 'pointer',
                    borderColor: depth === d.value ? 'var(--accent)' : undefined,
                    background: depth === d.value ? 'var(--accent-bg)' : undefined,
                  }}
                >
                  <input type="radio" name="depth" value={d.value} checked={depth === d.value} onChange={() => setDepth(d.value)} style={{ marginRight: 8 }} />
                  <strong>{d.label}</strong>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: 4 }}>{d.hint}</div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="glass-field-label" style={{ marginBottom: 8 }}>
              Agent configuration
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {AGENTS.map((a) => (
                <label key={a.key} className="glass-chip" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: a.required ? 'not-allowed' : 'pointer', opacity: a.required ? 0.85 : 1 }}>
                  <input type="checkbox" checked={agentConfig[a.key]} disabled={a.required} onChange={() => toggleAgent(a.key)} />
                  {a.label}
                  {a.required && ' (required)'}
                </label>
              ))}
            </div>
          </div>

          <GlassButton type="submit" variant="primary" disabled={!question.trim()}>
            Start Research
          </GlassButton>
        </form>
      </GlassCard>
    </div>
  )
}
