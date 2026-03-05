import { api, API_URL, getStoredToken } from '../utils/api'
import type { Event, EventStatus } from '../data/types'

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

  batchCreate(events: Partial<Event>[], seriesId?: string): Promise<Event[]> {
    return api.post('/events/batch', { events, seriesId })
  },

  update: (id: number, data: Partial<Event>) =>
    api.put<Event>(`/events/${id}`, data),

  delete: (id: number) =>
    api.delete(`/events/${id}`),

  checkBulkConflicts: (ids: number[]): Promise<Record<number, ConflictWarning[]>> =>
    api.post<Record<number, ConflictWarning[]>>('/events/conflicts/bulk', { eventIds: ids }),

  bulkDelete: async (ids: number[]): Promise<{ deleted: number }> => {
    // api.delete doesn't accept a body, so use fetch directly
    const res = await fetch(`${API_URL}/events/bulk`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}` },
      body: JSON.stringify({ ids }),
    })
    return res.json()
  },

  bulkStatus: (ids: number[], status: EventStatus): Promise<{ updated: number }> =>
    api.patch<{ updated: number }>('/events/bulk/status', { ids, status }),

  bulkReschedule: (ids: number[], shiftDays: number): Promise<{ updated: number }> =>
    api.patch<{ updated: number }>('/events/bulk/reschedule', { ids, shiftDays }),

  bulkAssign: (
    ids: number[],
    field: 'linearChannel' | 'sportId' | 'competitionId',
    value: string | number
  ): Promise<{ updated: number }> =>
    api.patch<{ updated: number }>('/events/bulk/assign', { ids, field, value }),
}
