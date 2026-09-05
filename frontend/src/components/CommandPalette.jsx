import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { researchApi } from '../lib/api'
import {
  BotIcon,
  ClockIcon,
  DashboardIcon,
  FolderIcon,
  GearIcon,
  LinkIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from './icons'

export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { cycleTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [resumable, setResumable] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    inputRef.current?.focus()
    researchApi
      .list({ status: 'running' })
      .then((runs) => setResumable(runs.slice(0, 5)))
      .catch(() => setResumable([]))
  }, [open])

  const staticActions = useMemo(
    () => [
      { id: 'new', label: 'New Research', icon: PlusIcon, run: () => navigate('/research/new') },
      { id: 'dashboard', label: 'Go to Dashboard', icon: DashboardIcon, run: () => navigate('/') },
      { id: 'projects', label: 'Search Projects', icon: FolderIcon, run: () => navigate('/projects') },
      { id: 'reports', label: 'Open Reports', icon: ClockIcon, run: () => navigate('/history?type=reports') },
      { id: 'sources', label: 'Search Sources', icon: LinkIcon, run: () => navigate('/sources') },
      { id: 'agents', label: 'Agent Status', icon: BotIcon, run: () => navigate('/agents') },
      { id: 'settings', label: 'Settings', icon: GearIcon, run: () => navigate('/settings/profile') },
      { id: 'theme', label: 'Toggle Theme', icon: SunIcon, run: () => cycleTheme() },
    ],
    [navigate, cycleTheme]
  )

  const resumeActions = resumable.map((r) => ({
    id: `resume-${r.id}`,
    label: `Resume: ${r.title || r.question}`,
    icon: MoonIcon,
    run: () => navigate(`/research/${r.id}`),
  }))

  const actions = [...staticActions, ...resumeActions].filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))

  const runAction = (action) => {
    action.run()
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, actions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && actions[activeIdx]) {
      runAction(actions[activeIdx])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null
  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command or search…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIdx(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="command-palette-list">
          {actions.length === 0 && <div className="command-palette-empty">No matching commands</div>}
          {actions.map((a, i) => (
            <button key={a.id} type="button" className={`command-palette-item ${i === activeIdx ? 'active' : ''}`} onClick={() => runAction(a)} onMouseEnter={() => setActiveIdx(i)}>
              <a.icon size={16} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
