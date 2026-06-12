import { api } from '../utils/api'
import type { Player } from '../data/types'

export interface PlayerListParams {
  search?: string
  sportId?: number
  teamId?: number
  managed?: boolean
}

function toQuery(params: PlayerListParams = {}): string {
  const q = new URLSearchParams()
  if (params.search) q.set('search', params.search)
  if (params.sportId != null) q.set('sportId', String(params.sportId))
  if (params.teamId != null) q.set('teamId', String(params.teamId))
  if (params.managed) q.set('managed', 'true')
  const s = q.toString()
  return s ? `?${s}` : ''
}

export interface PlayerTeamLink {
  id: number
  playerId: number
  teamId: number | null
  competitionId: number | null
  seasonId: number | null
  fromDate?: string | null
  toDate?: string | null
  isCurrent: boolean
  source: string
  team?: { id: number; name: string; shortName?: string | null; logoUrl?: string | null } | null
  competition?: { id: number; name: string; season: string } | null
  season?: { id: number; name: string } | null
}

export interface PlayerInput {
  fullName: string
  sportId: number
  shortName?: string | null
  countryCode?: string | null
  position?: string | null
  jerseyNumber?: number | null
  birthDate?: string | null
  photoUrl?: string | null
  status?: string
  notes?: string | null
  isManaged?: boolean
  externalRefs?: Record<string, unknown>
}

export interface PlayerMembershipInput {
  teamId?: number | null
  competitionId?: number | null
  seasonId?: number | null
  fromDate?: string | null
  toDate?: string | null
  isCurrent?: boolean
}

export const playersApi = {
  list: (params?: PlayerListParams) =>
    api.get<Player[]>(`/players${toQuery(params)}`),

  get: (id: number) =>
    api.get<Player>(`/players/${id}`),

  autocomplete: (q: string) =>
    api.get<Pick<Player, 'id' | 'fullName' | 'shortName' | 'countryCode' | 'position' | 'photoUrl'>[]>(
      `/players/autocomplete?q=${encodeURIComponent(q)}`,
    ),

  create: (data: PlayerInput) =>
    api.post<Player>('/players', data),

  update: (id: number, data: Partial<PlayerInput>) =>
    api.put<Player>(`/players/${id}`, data),

  // Remarks-only update — usable by sports planners, protected from import sync.
  saveNotes: (id: number, notes: string | null) =>
    api.patch<Player>(`/players/${id}/notes`, { notes }),

  delete: (id: number) =>
    api.delete<{ message: string }>(`/players/${id}`),

  // Team/roster memberships
  listTeams: (playerId: number) =>
    api.get<PlayerTeamLink[]>(`/players/${playerId}/teams`),

  addTeam: (playerId: number, membership: PlayerMembershipInput) =>
    api.post<PlayerTeamLink>(`/players/${playerId}/teams`, membership),

  removeTeam: (playerId: number, linkId: number) =>
    api.delete<{ message: string }>(`/players/${playerId}/teams/${linkId}`),
}
