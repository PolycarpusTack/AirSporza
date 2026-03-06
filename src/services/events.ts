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

// Strip fields the backend Joi schema doesn't accept and normalize dates
function stripEventPayload(data: Partial<Event>): Record<string, unknown> {
  const { id, sport, competition, techPlans, createdAt, updatedAt, createdById, ...rest } = data as Record<string, unknown>
  // Normalize Date objects to ISO date strings (YYYY-MM-DD)
  for (const key of ['startDateBE', 'startDateOrigin', 'livestreamDate'] as const) {
    const val = rest[key]
    if (val instanceof Date) {
      rest[key] = val.toISOString().split('T')[0]
    } else if (typeof val === 'string' && val.includes('T')) {
      rest[key] = val.split('T')[0]
    }
  }
  return rest
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
    api.post<Event>('/events', stripEventPayload(data)),

  batchCreate(events: Partial<Event>[], seriesId?: string): Promise<Event[]> {
    return api.post('/events/batch', { events: events.map(stripEventPayload), seriesId })
  },

  update: (id: number, data: Partial<Event>) =>
    api.put<Event>(`/events/${id}`, stripEventPayload(data)),

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
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Bulk delete failed (${res.status})`)
    }
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

  fixturesByCompetition(competitionId: number): Promise<{ matchday: number; date: string; label: string; sample: string }[]> {
    return api.get(`/events/fixtures/${competitionId}`)
  },
}
