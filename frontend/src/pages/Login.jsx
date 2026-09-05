import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GlassButton, GlassField, GlassInput } from '../components/glass'
import { AuthLayout } from '../layouts/AuthLayout'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export function Login() {
  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const googleBtnRef = useRef(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname || '/'

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current || !window.google?.accounts?.id) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          await loginWithGoogle(response.credential)
          navigate(from, { replace: true })
        } catch {
          setError('Google sign-in failed. Please try again.')
        }
      },
    })
    window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: 320 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your research workspace">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassField label="Email">
          <GlassInput type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </GlassField>
        <GlassField label="Password">
          <GlassInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </GlassField>
        {error && <p className="glass-field-error">{error}</p>}
        <GlassButton type="submit" variant="primary" loading={loading} disabled={!email || !password}>
          Sign in
        </GlassButton>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        or
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {GOOGLE_CLIENT_ID ? (
        <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center' }} />
      ) : (
        <p className="glass-field-hint">Google sign-in isn't configured on this deployment.</p>
      )}

      <p style={{ marginTop: 18, fontSize: '0.85rem', textAlign: 'center' }}>
        <Link to="/forgot-password">Forgot your password?</Link>
      </p>
      <p style={{ marginTop: 8, fontSize: '0.85rem', textAlign: 'center', color: 'var(--text-dim)' }}>
        No account? <Link to="/signup">Sign up</Link>
      </p>
    </AuthLayout>
  )
}
