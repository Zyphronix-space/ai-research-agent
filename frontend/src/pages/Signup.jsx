import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GlassButton, GlassField, GlassInput } from '../components/glass'
import { AuthLayout } from '../layouts/AuthLayout'

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signup(email, password, name)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Create your workspace" subtitle="No verification email required - you're in right away.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassField label="Name">
          <GlassInput required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
        </GlassField>
        <GlassField label="Email">
          <GlassInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </GlassField>
        <GlassField label="Password" hint="At least 8 characters">
          <GlassInput type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </GlassField>
        {error && <p className="glass-field-error">{error}</p>}
        <GlassButton type="submit" variant="primary" loading={loading} disabled={!email || password.length < 8 || !name}>
          Create account
        </GlassButton>
      </form>
      <p style={{ marginTop: 18, fontSize: '0.85rem', textAlign: 'center', color: 'var(--text-dim)' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
      <p style={{ marginTop: 10, fontSize: '0.76rem', textAlign: 'center', color: 'var(--text-dim)' }}>
        By creating an account you agree to the <Link to="/terms">Terms and Conditions</Link> and{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </AuthLayout>
  )
}
