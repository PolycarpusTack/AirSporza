import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getApi, getStoredToken, setToken, clearToken, ApiError } from '../utils/api'
import { useToast } from '../components/Toast'
import type { User, Role } from '../data/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (token: string) => Promise<void>
  logout: () => void
  devLogin: (email: string, role?: Role) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

let authCheckInProgress = false

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      fetchUser(true)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchUser = async (isInitialCheck = false) => {
    if (authCheckInProgress) return
    authCheckInProgress = true
    
    try {
      const api = getApi()
      const response = await api.get<{ user: User }>('/auth/me')
      setUser(response.user)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearToken()
        setUser(null)
        if (!isInitialCheck) {
          toast.warning('Session expired. Please log in again.')
        }
      } else {
        console.error('Failed to fetch user:', error)
      }
    } finally {
      authCheckInProgress = false
      setLoading(false)
    }
  }

  const login = async (token: string) => {
    setToken(token)
    await fetchUser()
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  const devLogin = async (email: string, role?: Role) => {
    if (import.meta.env.PROD) {
      throw new Error('Dev login not available in production')
    }
    
    const api = getApi()
    const response = await api.post<{ token: string; user: User }>('/auth/dev-login', {
      email,
      role
    })
    
    setToken(response.token)
    setUser(response.user)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, devLogin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
