import { useState, useCallback } from 'react'
import { useAuthStore } from '../store/auth-store'

export function AuthPanel() {
  const { currentUser, isAuthenticated, login, logout, updateConfig } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAuthRequired, setIsAuthRequired] = useState(false)
  const [trustLocal, setTrustLocal] = useState(true)

  const handleLogin = useCallback(async () => {
    const success = await login(username, password)
    if (success) {
      setUsername('')
      setPassword('')
    }
  }, [login, username, password])

  const handleLogout = useCallback(() => {
    logout()
  }, [logout])

  const handleSaveConfig = useCallback(() => {
    updateConfig({
      isAuthRequired,
      trustLocal,
    })
  }, [updateConfig, isAuthRequired, trustLocal])

  return (
    <div>
      <h3>Authentication</h3>

      <div className="auth-status">
        <p>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
        {currentUser && (
          <div className="user-info">
            <p>User: {currentUser.displayName || currentUser.username}</p>
            <p>Email: {currentUser.email}</p>
          </div>
        )}
      </div>

      {!isAuthenticated ? (
        <div className="login-form">
          <h4>Login</h4>
          <div className="form-row">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </div>
          <div className="form-row">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleLogin()
                }
              }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleLogin} disabled={!username || !password}>
            Login
          </button>
        </div>
      ) : (
        <div className="logout-form">
          <button className="btn btn-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}

      <div className="panel-card">
        <h4>Authentication Configuration</h4>
        <div className="form-row">
          <label htmlFor="auth-required">Require Authentication</label>
          <input
            id="auth-required"
            type="checkbox"
            checked={isAuthRequired}
            onChange={(e) => setIsAuthRequired(e.target.checked)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="trust-local">Trust Localhost</label>
          <input
            id="trust-local"
            type="checkbox"
            checked={trustLocal}
            onChange={(e) => setTrustLocal(e.target.checked)}
          />
        </div>
        <button className="btn btn-primary" onClick={handleSaveConfig}>
          Save Configuration
        </button>
      </div>
    </div>
  )
}
