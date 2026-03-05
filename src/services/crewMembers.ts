import { api } from '../utils/api'
import type { CrewMember } from '../data/types'

function buildQuery(params: Record<string, string | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export const crewMembersApi = {
  list: (params?: { search?: string; role?: string; active?: boolean }) =>
    api.get<CrewMember[]>(`/crew-members${buildQuery(params ?? {})}`),

  autocomplete: (q: string, role?: string) =>
    api.get<Pick<CrewMember, 'id' | 'name' | 'roles'>[]>(`/crew-members/autocomplete${buildQuery({ q, role })}`),

  create: (data: { name: string; roles?: string[]; email?: string; phone?: string }) =>
    api.post<CrewMember>('/crew-members', data),

  update: (id: number, data: Partial<Pick<CrewMember, 'name' | 'roles' | 'email' | 'phone' | 'isActive'>>) =>
    api.put<CrewMember>(`/crew-members/${id}`, data),

  extract: () =>
    api.post<{ created: number; updated: number; total: number }>('/crew-members/extract', {}),

  merge: (sourceId: number, targetId: number) =>
    api.post<{ merged: boolean; targetId: number; planUpdates: number }>('/crew-members/merge', { sourceId, targetId }),

  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/crew-members/${id}`),
}
