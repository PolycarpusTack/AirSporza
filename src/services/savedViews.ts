import { api } from '../utils/api'

export interface PlannerFilterState {
  channelFilter?: number | string  // number (channelId) or legacy string name
  calendarMode?: 'calendar' | 'list'
  sportFilter?: number
  competitionFilter?: number
  statusFilter?: string
  searchText?: string
  weekOffset?: number
}

export interface SavedView {
  id: string
  name: string
  context: string
  filterState: PlannerFilterState & Record<string, unknown>
}

export const savedViewsApi = {
  list: (context: string) => api.get<SavedView[]>(`/saved-views?context=${context}`),
  create: (name: string, context: string, filterState: Record<string, unknown>) =>
    api.post<SavedView>('/saved-views', { name, context, filterState }),
  delete: (id: string) => api.delete<{ ok: boolean }>(`/saved-views/${id}`),
}
