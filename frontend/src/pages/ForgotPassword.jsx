import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../lib/api'
import { GlassButton, GlassField, GlassInput } from '../components/glass'
import { AuthLayout } from '../layouts/AuthLayout'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {sent ? (
        <p className="glass-field-hint">If an account exists for that email, a reset link has been sent. Check your inbox.</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GlassField label="Email">
            <GlassInput type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </GlassField>
          {error && <p className="glass-field-error">{error}</p>}
          <GlassButton type="submit" variant="primary" loading={loading} disabled={!email}>
            Send reset link
          </GlassButton>
        </form>
      )}
      <p style={{ marginTop: 18, fontSize: '0.85rem', textAlign: 'center' }}>
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
