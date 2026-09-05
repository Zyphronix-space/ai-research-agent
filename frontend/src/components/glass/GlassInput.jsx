export function GlassField({ label, hint, error, children }) {
  return (
    <label className="glass-field">
      {label && <span className="glass-field-label">{label}</span>}
      {children}
      {error && <span className="glass-field-error">{error}</span>}
      {!error && hint && <span className="glass-field-hint">{hint}</span>}
    </label>
  )
}

export function GlassInput(props) {
  return <input className="glass-input" {...props} />
}

export function GlassTextarea(props) {
  return <textarea className="glass-textarea" {...props} />
}

export function GlassSelect({ children, ...props }) {
  return (
    <select className="glass-select" {...props}>
      {children}
    </select>
  )
}
