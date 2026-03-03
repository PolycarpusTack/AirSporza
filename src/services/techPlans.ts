import { api } from '../utils/api'
import type { TechPlan } from '../data/types'

export const techPlansApi = {
  list: (eventId?: number) => {
    const params = eventId ? `?eventId=${eventId}` : ''
    return api.get<TechPlan[]>(`/tech-plans${params}`)
  },

  get: (id: number) =>
    api.get<TechPlan>(`/tech-plans/${id}`),

  create: (data: Partial<TechPlan>) =>
    api.post<TechPlan>('/tech-plans', data),

  update: (id: number, data: Partial<TechPlan>) =>
    api.put<TechPlan>(`/tech-plans/${id}`, data),

  swapEncoder: (id: number, encoder: string) =>
    api.patch<TechPlan>(`/tech-plans/${id}/encoder`, { encoder }),

  delete: (id: number) =>
    api.delete(`/tech-plans/${id}`)
}
