import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/settings/profile', label: 'Profile' },
  { to: '/settings/security', label: 'Security' },
  { to: '/settings/preferences', label: 'Preferences' },
]

export function SettingsLayout() {
  return (
    <div>
      <h1>Settings</h1>
      <div style={{ display: 'flex', gap: 6, margin: '16px 0 22px' }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className="glass-btn sm"
            style={({ isActive }) => (isActive ? { background: 'var(--accent-gradient)', color: '#fff', borderColor: 'transparent' } : undefined)}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div style={{ maxWidth: 520 }}>
        <Outlet />
      </div>
    </div>
  )
}
