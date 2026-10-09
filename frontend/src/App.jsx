import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import './App.css'
import Login from './Login'
import Signup from './Signup'
import { ForgotPassword, ResetPassword } from './PasswordRecovery'
import UserPanel from './UserPanel'
import AdminPanel from './AdminPanel'
import SuperAdminPanel from './SuperAdminPanel'
import VoicePage from './VoicePage'
import DocumentsPage from './DocumentsPage'
import { authFetch } from './api'

function ProtectedRoute({ children, loginPath = '/login', allowedRoles = null }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true
    const checkAuth = async () => {
      try {
        const response = await authFetch('/auth/me', {
          method: 'GET',
        })
        if (!response.ok) {
          if (isMounted) {
            setIsAuthenticated(false)
            navigate(loginPath, { replace: true })
          }
          return
        }

        const data = await response.json()
        const userKind = data.user?.kind

        if (allowedRoles && allowedRoles.length > 0) {
          if (!allowedRoles.includes(userKind)) {
            if (isMounted) {
              setIsAuthenticated(false)
              navigate(loginPath, { replace: true })
            }
            return
          }
        }

        if (isMounted) {
          setIsAuthenticated(true)
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false)
          navigate(loginPath, { replace: true })
        }
      }
    }

    checkAuth()
    return () => {
      isMounted = false
    }
  }, [navigate, loginPath, allowedRoles])

  if (isAuthenticated === null) return <div className="loading">Loading...</div>
  if (!isAuthenticated) return null
  return children
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/super-admin" element={<Navigate to="/super-admin/login" replace />} />
        <Route path="/login" element={<Login role="user" />} />
        <Route path="/admin/login" element={<Login role="admin" />} />
        <Route path="/super-admin/login" element={<Login role="super_admin" />} />
        <Route path="/forgot-password/:role" element={<ForgotPassword />} />
        <Route path="/reset-password/:role" element={<ResetPassword />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/voice"
          element={
            <ProtectedRoute allowedRoles={['user', 'organization_admin', 'super_admin']} loginPath="/login">
              <VoicePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute allowedRoles={['user', 'organization_admin', 'super_admin']} loginPath="/login">
              <DocumentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-panel"
          element={
            <ProtectedRoute allowedRoles={['user']} loginPath="/login">
              <UserPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin-panel"
          element={
            <ProtectedRoute allowedRoles={['organization_admin', 'super_admin']} loginPath="/admin/login">
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin-panel"
          element={
            <ProtectedRoute allowedRoles={['super_admin']} loginPath="/super-admin/login">
              <SuperAdminPanel />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Login role="user" />} />
      </Routes>
    </Router>
  )
}

export default App
