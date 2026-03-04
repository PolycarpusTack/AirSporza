import { api } from '../utils/api'

export type ResourceType = 'ob_van' | 'camera_unit' | 'commentary_team' | 'production_staff' | 'other'

export interface Resource {
  id: number
  name: string
  type: ResourceType
  capacity: number
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ResourceAssignment {
  id: number
  resourceId: number
  techPlanId: number
  quantity: number
  notes: string | null
  createdAt: string
  techPlan?: {
    id: number
    planType: string
    eventId: number
    event?: {
      id: number
      participants: string
      startDateBE: string
    }
  }
}

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  ob_van: 'OB Van',
  camera_unit: 'Camera Unit',
  commentary_team: 'Commentary Team',
  production_staff: 'Production Staff',
  other: 'Other',
}

export const resourcesApi = {
  list: () =>
    api.get<Resource[]>('/resources'),

  create: (data: { name: string; type: ResourceType; capacity?: number; isActive?: boolean; notes?: string }) =>
    api.post<Resource>('/resources', data),

  update: (id: number, data: { name: string; type: ResourceType; capacity?: number; isActive?: boolean; notes?: string }) =>
    api.put<Resource>(`/resources/${id}`, data),

  getAssignments: (resourceId: number) =>
    api.get<ResourceAssignment[]>(`/resources/${resourceId}/assignments`),

  assign: (resourceId: number, data: { techPlanId: number; quantity?: number; notes?: string }) =>
    api.post<ResourceAssignment>(`/resources/${resourceId}/assign`, data),

  unassign: (resourceId: number, techPlanId: number) =>
    api.delete<{ ok: boolean }>(`/resources/${resourceId}/assign/${techPlanId}`),
}
