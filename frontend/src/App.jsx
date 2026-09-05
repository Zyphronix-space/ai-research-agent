import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/glass'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './layouts/AppShell'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { Dashboard } from './pages/Dashboard'
import { NewResearch } from './pages/NewResearch'
import { LiveResearch } from './pages/LiveResearch'
import { Projects } from './pages/Projects'
import { ProjectDetail } from './pages/ProjectDetail'
import { Sources } from './pages/Sources'
import { History } from './pages/History'
import { Agents } from './pages/Agents'
import { SettingsLayout } from './pages/settings/SettingsLayout'
import { Profile } from './pages/settings/Profile'
import { Security } from './pages/settings/Security'
import { Preferences } from './pages/settings/Preferences'

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/research/new" element={<NewResearch />} />
                <Route path="/research/:id" element={<LiveResearch />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="/history" element={<History />} />
                <Route path="/agents" element={<Agents />} />
                <Route element={<SettingsLayout />}>
                  <Route path="/settings/profile" element={<Profile />} />
                  <Route path="/settings/security" element={<Security />} />
                  <Route path="/settings/preferences" element={<Preferences />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
