import { api } from '../utils/api'
import type { Event } from '../data/types'

export interface ConflictWarning {
  type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan' | 'resource_conflict'
  message: string
}

export interface EventFilters {
  sportId?: number
  competitionId?: number
  channel?: string
  from?: string
  to?: string
  search?: string
}

export const eventsApi = {
  list: (filters?: EventFilters) => {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, String(value))
        }
      })
    }
    const query = params.toString()
    return api.get<Event[]>(`/events${query ? `?${query}` : ''}`)
  },

  get: (id: number) => 
    api.get<Event>(`/events/${id}`),

  create: (data: Partial<Event>) =>
    api.post<Event>('/events', data),

  update: (id: number, data: Partial<Event>) =>
    api.put<Event>(`/events/${id}`, data),

  delete: (id: number) =>
    api.delete(`/events/${id}`),

  checkBulkConflicts: (ids: number[]): Promise<Record<number, ConflictWarning[]>> =>
    api.post<Record<number, ConflictWarning[]>>('/events/conflicts/bulk', { eventIds: ids }),
}
