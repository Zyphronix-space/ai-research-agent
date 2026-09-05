import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { GlassButton, GlassCard, GlassField, GlassInput, GlassReportCard, GlassSkeleton, GlassTextarea, useToast } from '../components/glass'
import { PlusIcon } from '../components/icons'

export function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [project, setProject] = useState(null)
  const [runs, setRuns] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const load = () => {
    setError(null)
    Promise.all([projectsApi.get(id), projectsApi.runs(id)])
      .then(([p, r]) => {
        setProject(p)
        setRuns(r)
        setName(p.name)
        setDescription(p.description || '')
      })
      .catch((err) => setError(err.message))
  }

  useEffect(load, [id])

  const save = async (e) => {
    e.preventDefault()
    try {
      const updated = await projectsApi.update(id, { name: name.trim(), description: description.trim() || null })
      setProject(updated)
      setEditing(false)
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't save changes: ${err.message}` })
    }
  }

  const deleteProject = async () => {
    try {
      await projectsApi.remove(id)
      navigate('/projects')
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't delete project: ${err.message}` })
    }
  }

  if (error) {
    return (
      <GlassCard>
        <p>Couldn't load this project. {error}</p>
        <GlassButton onClick={load} style={{ marginTop: 10 }}>
          Retry
        </GlassButton>
      </GlassCard>
    )
  }

  if (!project) {
    return <GlassSkeleton height={140} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        {editing ? (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <GlassField label="Name">
              <GlassInput value={name} onChange={(e) => setName(e.target.value)} required />
            </GlassField>
            <GlassField label="Description">
              <GlassTextarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </GlassField>
            <div style={{ display: 'flex', gap: 8 }}>
              <GlassButton type="submit" variant="primary">
                Save
              </GlassButton>
              <GlassButton type="button" onClick={() => setEditing(false)}>
                Cancel
              </GlassButton>
            </div>
          </form>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h1 style={{ marginBottom: 4 }}>{project.name}</h1>
                {project.description && <p style={{ color: 'var(--text-dim)' }}>{project.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <GlassButton size="sm" onClick={() => setEditing(true)}>
                  Rename
                </GlassButton>
                <GlassButton size="sm" variant="danger" onClick={deleteProject}>
                  Delete
                </GlassButton>
              </div>
            </div>
            {project.status === 'archived' && <span className="glass-chip">Archived</span>}
          </>
        )}
      </GlassCard>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Sessions</h2>
        <GlassButton variant="primary" size="sm" onClick={() => navigate(`/research/new?project_id=${id}`)}>
          <PlusIcon size={14} /> New Research
        </GlassButton>
      </div>

      {!runs ? (
        <GlassSkeleton height={100} />
      ) : runs.length === 0 ? (
        <GlassCard>
          <p style={{ color: 'var(--text-dim)' }}>No research sessions in this project yet.</p>
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
