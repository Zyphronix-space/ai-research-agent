import { createContext, useCallback, useContext, useState } from 'react'
import { AlertIcon, CheckIcon, CloseIcon } from '../icons'

const ToastContext = createContext(null)
let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    ({ type = 'info', message, action, duration = 5000 }) => {
      const id = nextId++
      setToasts((prev) => [...prev, { id, type, message, action }])
      if (duration && !action) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ pushToast, dismiss }}>
      {children}
      <div className="glass-toast-host">
        {toasts.map((t) => (
          <div key={t.id} className={`glass-toast ${t.type}`}>
            <span className="glass-toast-icon">{t.type === 'error' ? <AlertIcon size={16} /> : t.type === 'success' ? <CheckIcon size={16} /> : null}</span>
            <div className="glass-toast-body">
              {t.message}
              {t.action && (
                <div className="glass-toast-actions">
                  <button
                    type="button"
                    className="glass-btn sm"
                    onClick={() => {
                      t.action.onClick()
                      dismiss(t.id)
                    }}
                  >
                    {t.action.label}
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="glass-toast-dismiss" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
