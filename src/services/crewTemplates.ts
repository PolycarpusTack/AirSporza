import { api } from '../utils/api'
import type { CrewTemplate } from '../data/types'

export const crewTemplatesApi = {
  list: () =>
    api.get<CrewTemplate[]>('/crew-templates'),

  forPlanType: (planType: string) =>
    api.get<CrewTemplate | null>(`/crew-templates/for-plan-type/${encodeURIComponent(planType)}`),

  create: (data: { name: string; planType?: string | null; crewData: Record<string, unknown>; isShared?: boolean }) =>
    api.post<CrewTemplate>('/crew-templates', data),

  update: (id: number, data: Partial<Pick<CrewTemplate, 'name' | 'crewData' | 'isShared'>>) =>
    api.put<CrewTemplate>(`/crew-templates/${id}`, data),

  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/crew-templates/${id}`),
}
