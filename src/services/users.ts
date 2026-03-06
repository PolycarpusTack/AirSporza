import { api } from '../utils/api'

export interface UserRecord {
  id: string
  email: string
  name: string | null
  avatar: string | null
  role: 'planner' | 'sports' | 'contracts' | 'admin'
  createdAt: string
  updatedAt: string
  _count: { events: number; techPlans: number }
}

export const usersApi = {
  list: (): Promise<UserRecord[]> => api.get('/users'),
  updateRole: (id: string, role: string): Promise<UserRecord> =>
    api.put(`/users/${id}/role`, { role }),
  delete: (id: string): Promise<{ ok: boolean }> =>
    api.delete(`/users/${id}`),
}
