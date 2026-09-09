import { Link } from 'react-router-dom'
import { LogoIcon } from '../components/icons'

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative' }}>
      <div className="bg-blobs">
        <div className="bg-blob bg-blob-a" />
        <div className="bg-blob bg-blob-b" />
        <div className="bg-blob bg-blob-c" />
      </div>
      <div className="glass-card" style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span className="glass-sidebar-logo">
            <LogoIcon size={18} />
          </span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-h)' }}>ResearchOS</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>multi-agent research workspace</div>
          </div>
        </div>
        <h1 style={{ fontSize: '1.35rem' }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 18 }}>{subtitle}</p>}
        {children}
      </div>
      <p style={{ marginTop: 16, fontSize: '0.76rem', textAlign: 'center', color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>
        <Link to="/privacy">Privacy Policy</Link>
        <span style={{ margin: '0 8px' }}>·</span>
        <Link to="/terms">Terms and Conditions</Link>
      </p>
    </div>
  )
}
