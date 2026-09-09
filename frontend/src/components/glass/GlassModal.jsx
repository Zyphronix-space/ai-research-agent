import { useEffect, useRef } from 'react'
import { CloseIcon } from '../icons'

export function GlassModal({ open, onClose, title, children, maxWidth }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="glass-modal-overlay" onClick={onClose}>
      <div
        className="glass-modal"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="glass-modal-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="glass-modal-header">
          <h3 id="glass-modal-title" style={{ margin: 0 }}>
            {title}
          </h3>
          <button type="button" className="glass-modal-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
