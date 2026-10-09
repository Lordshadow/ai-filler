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
import { apiUrl } from './api'

function ProtectedRoute({ children, loginPath = '/login' }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(apiUrl('/auth/me'), {
          method: 'GET',
          credentials: 'include',
        })
        setIsAuthenticated(response.ok)
        if (!response.ok) {
          navigate(loginPath)
        }
      } catch {
        setIsAuthenticated(false)
        navigate(loginPath)
      }
    }

    checkAuth()
  }, [navigate, loginPath])

  if (isAuthenticated === null) return <div className="loading">Loading...</div>
  if (!isAuthenticated) return null
  return children
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login role="user" />} />
        <Route path="/admin/login" element={<Login role="admin" />} />
        <Route path="/super-admin/login" element={<Login role="super_admin" />} />
        <Route path="/forgot-password/:role" element={<ForgotPassword />} />
        <Route path="/reset-password/:role" element={<ResetPassword />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/voice"
          element={
            <ProtectedRoute>
              <VoicePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <DocumentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-panel"
          element={
            <ProtectedRoute>
              <UserPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin-panel"
          element={
            <ProtectedRoute loginPath="/admin/login">
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin-panel"
          element={
            <ProtectedRoute loginPath="/super-admin/login">
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
