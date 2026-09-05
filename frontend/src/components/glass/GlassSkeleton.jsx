export function GlassSkeleton({ width = '100%', height = 16, radius, style, className = '' }) {
  return (
    <div
      className={`glass-skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}

export function GlassSkeletonCard() {
  return (
    <div className="glass-card">
      <GlassSkeleton width="40%" height={14} style={{ marginBottom: 10 }} />
      <GlassSkeleton width="70%" height={22} style={{ marginBottom: 8 }} />
      <GlassSkeleton width="90%" height={12} />
    </div>
  )
}
