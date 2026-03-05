import { api } from '../utils/api'

export interface PlannerFilterState {
  channelFilter?: string
  calendarMode?: 'calendar' | 'list'
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
