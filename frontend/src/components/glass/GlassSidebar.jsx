import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  ClockIcon,
  DashboardIcon,
  FolderIcon,
  GearIcon,
  LinkIcon,
  LogoIcon,
  PlusIcon,
  BotIcon,
} from '../icons'

const LINKS = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/research/new', label: 'New Research', icon: PlusIcon },
  { to: '/projects', label: 'Projects', icon: FolderIcon },
  { to: '/sources', label: 'Sources', icon: LinkIcon },
  { to: '/history', label: 'History', icon: ClockIcon },
  { to: '/agents', label: 'Agents', icon: BotIcon },
]

export function GlassSidebar({ open, onNavigate }) {
  const { user } = useAuth()
  return (
    <aside className="glass-sidebar" data-open={open}>
      <div className="glass-sidebar-brand">
        <span className="glass-sidebar-logo">
          <LogoIcon size={18} />
        </span>
        <div>
          <div className="glass-sidebar-title">ResearchOS</div>
          <div className="glass-sidebar-subtitle">multi-agent research workspace</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={onNavigate}
            className={({ isActive }) => `glass-nav-link ${isActive ? 'active' : ''}`}
          >
            <l.icon size={17} />
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="glass-sidebar-footer">
        <NavLink to="/settings/profile" onClick={onNavigate} className={({ isActive }) => `glass-nav-link ${isActive ? 'active' : ''}`}>
          <GearIcon size={17} />
          Settings
        </NavLink>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {user.picture ? (
              <img src={user.picture} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
            ) : (
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--accent-gradient)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                {(user.name || user.email)[0].toUpperCase()}
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</span>
          </div>
        )}
      </div>
    </aside>
  )
}
