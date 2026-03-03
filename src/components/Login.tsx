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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">S</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SporzaPlanner</h1>
          <p className="text-gray-500 mt-1">Development Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="Enter email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
            >
              <option value="admin">Admin</option>
              <option value="planner">Network Planner</option>
              <option value="sports">Sports Department</option>
              <option value="contracts">Contracts Team</option>
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <Btn variant="primary" size="md" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Login (Dev Mode)'}
          </Btn>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">S</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SporzaPlanner</h1>
          <p className="text-gray-500 mt-1">VRT Sports Planning Tool</p>
        </div>

        <Btn variant="primary" size="md" className="w-full" onClick={handleOAuthLogin}>
          Sign in with SSO
        </Btn>
      </div>
    </div>
  )
}
