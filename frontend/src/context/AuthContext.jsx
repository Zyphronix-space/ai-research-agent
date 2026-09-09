import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ApiError, authApi, getToken, setToken } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'signed-in' | 'signed-out'

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setStatus('signed-out')
      return
    }
    try {
      const me = await authApi.me()
      setUser(me)
      setStatus('signed-in')
    } catch {
      setToken(null)
      setUser(null)
      setStatus('signed-out')
    }
  }, [])

  useEffect(() => {
    loadMe()
  }, [loadMe])

  const applySession = ({ session_token, user }) => {
    setToken(session_token)
    setUser(user)
    setStatus('signed-in')
  }

  const signup = async (email, password, name) => applySession(await authApi.signup(email, password, name))
  const login = async (email, password) => applySession(await authApi.login(email, password))
  const loginWithGoogle = async (credential) => applySession(await authApi.google(credential))

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // best-effort - the token is being discarded client-side regardless
    }
    setToken(null)
    setUser(null)
    setStatus('signed-out')
  }

  const refreshProfile = async (name) => {
    const updated = await authApi.updateProfile(name)
    setUser(updated)
    return updated
  }

  return (
    <AuthContext.Provider value={{ user, status, signup, login, loginWithGoogle, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

export { ApiError }
