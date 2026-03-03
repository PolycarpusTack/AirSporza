import { api } from '../utils/api'
import type { Sport, Competition } from '../data/types'

export const sportsApi = {
  list: () => 
    api.get<(Sport & { _count?: { competitions: number; events: number } })[]>('/sports'),
  
  get: (id: number) =>
    api.get<Sport & { competitions: Competition[] }>(`/sports/${id}`)
}

export const competitionsApi = {
  list: (sportId?: number) => {
    const params = sportId ? `?sportId=${sportId}` : ''
    return api.get<(Competition & { sport: Sport; _count?: { events: number } })[]>(`/competitions${params}`)
  },

  get: (id: number) =>
    api.get<Competition & { sport: Sport; contract?: unknown; events?: Event[] }>(`/competitions/${id}`)
}

interface Event {
  id: number
  startDateBE: string
}
