import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { GlassButton, GlassCard, GlassField, GlassInput, useToast } from '../../components/glass'

export function Profile() {
  const { user, refreshProfile } = useAuth()
  const { pushToast } = useToast()
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await refreshProfile(name.trim())
      pushToast({ type: 'success', message: 'Profile updated.' })
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't update profile: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        {user?.picture ? (
          <img src={user.picture} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
        ) : (
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--accent-gradient)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.2rem',
            }}
          >
            {(user?.name || user?.email || '?')[0].toUpperCase()}
          </span>
        )}
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-h)' }}>{user?.name || 'Unnamed'}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{user?.email}</div>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassField label="Display name">
          <GlassInput value={name} onChange={(e) => setName(e.target.value)} required />
        </GlassField>
        <GlassField label="Email" hint="Email cannot be changed here.">
          <GlassInput value={user?.email || ''} disabled />
        </GlassField>
        <GlassButton type="submit" variant="primary" loading={saving} disabled={!name.trim()}>
          Save changes
        </GlassButton>
      </form>
    </GlassCard>
  )
}
