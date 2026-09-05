export function GlassCard({ interactive, className = '', children, ...props }) {
  return (
    <div className={`glass-card ${interactive ? 'interactive' : ''} ${className}`} {...props}>
      {children}
    </div>
  )
}

export function GlassCardHeader({ title, subtitle, action }) {
  return (
    <div className="glass-card-header">
      <div>
        <div className="glass-card-title">{title}</div>
        {subtitle && <div className="glass-card-subtitle">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}
