import { Link } from 'react-router-dom'
import { LogoIcon } from '../components/icons'

export function LegalLayout({ title, updated, children }) {
  return (
    <div style={{ minHeight: '100dvh', position: 'relative', padding: '40px 20px' }}>
      <div className="bg-blobs">
        <div className="bg-blob bg-blob-a" />
        <div className="bg-blob bg-blob-b" />
        <div className="bg-blob bg-blob-c" />
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <Link
          to="/login"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24, color: 'var(--text-h)', textDecoration: 'none' }}
        >
          <span className="glass-sidebar-logo">
            <LogoIcon size={18} />
          </span>
          <span style={{ fontWeight: 700 }}>ResearchOS</span>
        </Link>

        <div className="glass-card" style={{ padding: '28px 30px' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>{title}</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginBottom: 24 }}>Last updated: {updated}</p>
          <div className="legal-body">{children}</div>
        </div>

        <p style={{ marginTop: 18, fontSize: '0.82rem', textAlign: 'center' }}>
          <Link to="/privacy">Privacy Policy</Link>
          <span style={{ color: 'var(--text-dim)', margin: '0 10px' }}>·</span>
          <Link to="/terms">Terms and Conditions</Link>
          <span style={{ color: 'var(--text-dim)', margin: '0 10px' }}>·</span>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
