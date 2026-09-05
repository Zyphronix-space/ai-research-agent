import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { authApi, getToken } from '../../lib/api'
import { GlassButton, GlassCard, GlassCardHeader, GlassField, GlassInput, useToast } from '../../components/glass'

export function Security() {
  const { user } = useAuth()
  const { pushToast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [sessions, setSessions] = useState(null)
  const currentToken = getToken()

  const loadSessions = () => authApi.sessions().then(setSessions).catch(() => setSessions([]))

  useEffect(() => {
    loadSessions()
  }, [])

  const changePassword = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      pushToast({ type: 'success', message: 'Password updated.' })
    } catch (err) {
      pushToast({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (token) => {
    try {
      await authApi.revokeSession(token)
      loadSessions()
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't revoke session: ${err.message}` })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        <GlassCardHeader title={user?.has_password ? 'Change password' : 'Set a password'} subtitle={user?.has_password ? undefined : 'Your account currently signs in with Google only.'} />
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {user?.has_password && (
            <GlassField label="Current password">
              <GlassInput type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </GlassField>
          )}
          <GlassField label="New password" hint="At least 8 characters">
            <GlassInput type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </GlassField>
          <GlassButton type="submit" variant="primary" loading={saving} disabled={newPassword.length < 8}>
            Update password
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard>
        <GlassCardHeader title="Active sessions" subtitle="Devices currently signed in to your account." />
        {!sessions ? (
          <p style={{ color: 'var(--text-dim)' }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map((s) => (
              <div key={s.token} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: '0.85rem' }}>
                <div>
                  <div style={{ color: 'var(--text-h)' }}>{s.token === currentToken ? 'This device' : s.user_agent || 'Unknown device'}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>Signed in {s.created_at}</div>
                </div>
                {s.token !== currentToken && (
                  <GlassButton size="sm" variant="danger" onClick={() => revoke(s.token)}>
                    Revoke
                  </GlassButton>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
