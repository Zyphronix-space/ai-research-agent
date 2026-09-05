import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { GlassButton, GlassCard, GlassField, GlassInput, GlassModal, GlassSkeletonCard, GlassTextarea, useToast } from '../components/glass'
import { FolderIcon, PlusIcon } from '../components/icons'

export function Projects() {
  const { pushToast } = useToast()
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const load = () => {
    setError(null)
    projectsApi
      .list()
      .then(setProjects)
      .catch((err) => {
        setError(err.message)
        pushToast({ type: 'error', message: `Couldn't load projects: ${err.message}`, action: { label: 'Retry', onClick: load } })
      })
  }

  useEffect(load, [])

  const createProject = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await projectsApi.create(name.trim(), description.trim() || null)
      setModalOpen(false)
      setName('')
      setDescription('')
      load()
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't create project: ${err.message}` })
    } finally {
      setCreating(false)
    }
  }

  const archiveProject = async (project) => {
    try {
      await projectsApi.update(project.id, { status: project.status === 'archived' ? 'active' : 'archived' })
      load()
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't update project: ${err.message}` })
    }
  }

  const deleteProject = async (project) => {
    try {
      await projectsApi.remove(project.id)
      load()
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't delete project: ${err.message}` })
    }
  }

  if (error && !projects) {
    return (
      <GlassCard>
        <p>Couldn't load projects. {error}</p>
        <GlassButton onClick={load} style={{ marginTop: 10 }}>
          Retry
        </GlassButton>
      </GlassCard>
    )
  }

  const visible = (projects || []).filter((p) => (showArchived ? true : p.status !== 'archived'))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1>Projects</h1>
          <p style={{ color: 'var(--text-dim)' }}>Group related research sessions, reports, and sources together.</p>
        </div>
        <GlassButton variant="primary" onClick={() => setModalOpen(true)}>
          <PlusIcon size={16} /> New Project
        </GlassButton>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived
      </label>

      {!projects ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <GlassSkeletonCard key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <GlassCard>
          <p style={{ color: 'var(--text-dim)' }}>No projects yet. Create one to organize your research.</p>
        </GlassCard>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {visible.map((p) => (
            <GlassCard key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <FolderIcon size={16} />
                  <span className="glass-card-title">{p.name}</span>
                </Link>
                {p.status === 'archived' && <span className="glass-chip">Archived</span>}
              </div>
              {p.description && <p className="glass-card-body" style={{ marginTop: 8 }}>{p.description}</p>}
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 10 }}>
                {p.session_count} session{p.session_count === 1 ? '' : 's'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <GlassButton size="sm" onClick={() => archiveProject(p)}>
                  {p.status === 'archived' ? 'Unarchive' : 'Archive'}
                </GlassButton>
                <GlassButton size="sm" variant="danger" onClick={() => deleteProject(p)}>
                  Delete
                </GlassButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <GlassModal open={modalOpen} onClose={() => setModalOpen(false)} title="New Project">
        <form onSubmit={createProject} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GlassField label="Name">
            <GlassInput required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Competitive analysis" />
          </GlassField>
          <GlassField label="Description (optional)">
            <GlassTextarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </GlassField>
          <GlassButton type="submit" variant="primary" loading={creating} disabled={!name.trim()}>
            Create project
          </GlassButton>
        </form>
      </GlassModal>
    </div>
  )
}
