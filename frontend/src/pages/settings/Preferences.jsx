import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { THEMES, useTheme } from '../../context/ThemeContext'
import { GlassButton, GlassCard, GlassCardHeader } from '../../components/glass'

export function Preferences() {
  const { theme, setTheme } = useTheme()
  const { logout } = useAuth()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        <GlassCardHeader title="Appearance" subtitle="'System' follows your OS setting; Light/Dark overrides it for this browser." />
        <div style={{ display: 'flex', gap: 8 }}>
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              className="glass-btn sm"
              style={theme === t.value ? { background: 'var(--accent-gradient)', color: '#fff', borderColor: 'transparent' } : undefined}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <GlassCardHeader title="Session" />
        <GlassButton variant="danger" onClick={signOut}>
          Sign out
        </GlassButton>
      </GlassCard>
    </div>
  )
}
