export function GlassMetric({ label, value, icon }) {
  return (
    <div className="glass-metric">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="glass-metric-label">{label}</span>
        {icon && <span className="glass-metric-icon">{icon}</span>}
      </div>
      <span className="glass-metric-value">{value}</span>
    </div>
  )
}
