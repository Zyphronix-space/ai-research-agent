import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../lib/api'
import { GlassButton, GlassField, GlassInput } from '../components/glass'
import { AuthLayout } from '../layouts/AuthLayout'

export function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 1800)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link">
        <p className="glass-field-error">This link is missing its reset token.</p>
        <p style={{ marginTop: 18, fontSize: '0.85rem', textAlign: 'center' }}>
          <Link to="/forgot-password">Request a new one</Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password">
      {done ? (
        <p className="glass-field-hint">Password updated - redirecting to sign in...</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GlassField label="New password" hint="At least 8 characters">
            <GlassInput type="password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </GlassField>
          {error && <p className="glass-field-error">{error}</p>}
          <GlassButton type="submit" variant="primary" loading={loading} disabled={password.length < 8}>
            Reset password
          </GlassButton>
        </form>
      )}
    </AuthLayout>
  )
}
