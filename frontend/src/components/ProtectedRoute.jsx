import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GlassSkeleton } from './glass'

export function ProtectedRoute({ children }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div style={{ padding: 40 }}>
        <GlassSkeleton width={200} height={20} />
      </div>
    )
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}
