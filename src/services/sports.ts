import { api } from '../utils/api'
import type { Sport, Competition } from '../data/types'

export const sportsApi = {
  list: () =>
    api.get<(Sport & { _count?: { competitions: number; events: number } })[]>('/sports'),

  get: (id: number) =>
    api.get<Sport & { competitions: Competition[] }>(`/sports/${id}`),

  create: (data: { name: string; icon: string; federation: string }) =>
    api.post<Sport>('/sports', data),

  update: (id: number, data: Partial<{ name: string; icon: string; federation: string }>) =>
    api.put<Sport>(`/sports/${id}`, data),

  delete: (id: number) =>
    api.delete<{ message: string }>(`/sports/${id}`),
}

export const competitionsApi = {
  list: (sportId?: number) => {
    const params = sportId ? `?sportId=${sportId}` : ''
    return api.get<(Competition & { sport: Sport; _count?: { events: number } })[]>(`/competitions${params}`)
  },

  get: (id: number) =>
    api.get<Competition & { sport: Sport; contract?: unknown; events?: { id: number; startDateBE: string }[] }>(`/competitions/${id}`),

  create: (data: { sportId: number; name: string; season: string; matches?: number }) =>
    api.post<Competition>('/competitions', data),
}
