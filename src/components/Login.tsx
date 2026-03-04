import { useState } from 'react'
import { Btn } from '../components/ui'
import { authApi } from '../services/auth'
import { useAuth } from '../hooks'
import type { Role } from '../data/types'

export function DevLogin() {
  const [email, setEmail] = useState('admin@sporza.vrt.be')
  const [role, setRole] = useState<Role>('admin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { devLogin } = useAuth()

  if (import.meta.env.PROD) {
    return null
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await devLogin(email, role)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl border border-border shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-md"
            style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}
          >
            <span className="text-black text-2xl font-bold">S</span>
          </div>
          <h1 className="text-xl font-bold text-text font-head tracking-tight">SporzaPlanner</h1>
          <p className="text-text-3 mt-1 text-sm">Development Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-2 mb-1 uppercase tracking-wider font-mono">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-colors"
              placeholder="Enter email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-2 mb-1 uppercase tracking-wider font-mono">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-colors"
            >
              <option value="admin">Admin</option>
              <option value="planner">Network Planner</option>
              <option value="sports">Sports Department</option>
              <option value="contracts">Contracts Team</option>
            </select>
          </div>

          {error && (
            <div className="p-3 bg-danger-bg border border-danger-dim rounded-md text-sm text-danger">
              {error}
            </div>
          )}

          <Btn variant="primary" size="md" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Login (Dev Mode)'}
          </Btn>
        </form>

        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs text-text-3 text-center">
            This login is only available in development mode.
            <br />
            In production, configure OAuth/SSO authentication.
          </p>
        </div>
      </div>
    </div>
  )
}

export function OAuthLogin() {
  const handleOAuthLogin = () => {
    window.location.href = authApi.getLoginUrl()
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl border border-border shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-md"
            style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}
          >
            <span className="text-black text-2xl font-bold">S</span>
          </div>
          <h1 className="text-xl font-bold text-text font-head tracking-tight">SporzaPlanner</h1>
          <p className="text-text-3 mt-1 text-sm">VRT Sports Planning Tool</p>
        </div>

        <Btn variant="primary" size="md" className="w-full" onClick={handleOAuthLogin}>
          Sign in with SSO
        </Btn>
      </div>
    </div>
  )
}
