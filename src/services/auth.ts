import { api } from '../utils/api'

export interface User {
  id: string
  email: string
  name: string
  role: string
  avatar?: string
}

export const authApi = {
  me: () =>
    api.get<{ user: User }>('/auth/me'),

  logout: () =>
    api.post('/auth/logout'),

  devLogin: (email: string, role?: string) =>
    api.post<{ token: string; user: User }>('/auth/dev-login', { email, role }),

  getLoginUrl: () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    return `${apiUrl}/auth/login`
  }
}
