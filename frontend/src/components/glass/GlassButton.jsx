export function GlassButton({ variant = 'default', size, loading, disabled, children, className = '', ...props }) {
  const classes = ['glass-btn', variant !== 'default' ? variant : '', size ? size : '', className].filter(Boolean).join(' ')
  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}
