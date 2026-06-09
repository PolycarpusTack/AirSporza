import { api } from '../utils/api'
import type { Team } from '../data/types'

export interface TeamListParams {
  search?: string
  sportId?: number
  managed?: boolean
}

function toQuery(params: TeamListParams = {}): string {
  const q = new URLSearchParams()
  if (params.search) q.set('search', params.search)
  if (params.sportId != null) q.set('sportId', String(params.sportId))
  if (params.managed) q.set('managed', 'true')
  const s = q.toString()
  return s ? `?${s}` : ''
}

export interface TeamInput {
  name: string
  shortName?: string | null
  country?: string | null
  logoUrl?: string | null
  sportId?: number | null
  notes?: string | null
  isManaged?: boolean
  externalRefs?: Record<string, unknown>
}

export const teamsApi = {
  list: (params?: TeamListParams) =>
    api.get<Team[]>(`/teams${toQuery(params)}`),

  get: (id: number) =>
    api.get<Team>(`/teams/${id}`),

  autocomplete: (q: string) =>
    api.get<Pick<Team, 'id' | 'name' | 'shortName' | 'country' | 'logoUrl'>[]>(
      `/teams/autocomplete?q=${encodeURIComponent(q)}`,
    ),

  create: (data: TeamInput) =>
    api.post<Team>('/teams', data),

  update: (id: number, data: Partial<TeamInput>) =>
    api.put<Team>(`/teams/${id}`, data),

  // Remarks-only update — usable by sports planners, protected from import sync.
  saveNotes: (id: number, notes: string | null) =>
    api.patch<Team>(`/teams/${id}/notes`, { notes }),

  delete: (id: number) =>
    api.delete<{ message: string }>(`/teams/${id}`),
}
