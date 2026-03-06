import { api } from '../utils/api'
import type { DashboardWidget, FieldConfig, OrgConfig, Role } from '../data/types'

export interface AppSettingsResponse {
  scopeRules: {
    eventFields: 'global'
    crewFields: 'global'
    dashboardWidgets: 'user_role_with_role_fallback'
    orgConfig: 'global'
  }
  eventFields: FieldConfig[] | null
  crewFields: FieldConfig[] | null
  dashboardWidgets: DashboardWidget[] | null
  orgConfig: OrgConfig | null
  meta: {
    eventFieldsScope: 'global' | null
    crewFieldsScope: 'global' | null
    dashboardWidgetsScope: 'role' | 'user_role' | null
    orgConfigScope: 'global' | null
  }
}

export interface AdminStats {
  users: number
  events: number
  techPlans: number
  crewMembers: number
  unreadNotifications: number
}

export const settingsApi = {
  getStats: (): Promise<AdminStats> => api.get('/settings/stats'),

  getApp: (role: Role) =>
    api.get<AppSettingsResponse>(`/settings/app?role=${role}`),

  updateEventFields: (fields: FieldConfig[]) =>
    api.put<{ fields: FieldConfig[] }>('/settings/app/fields/event', { fields }),

  updateCrewFields: (fields: FieldConfig[]) =>
    api.put<{ fields: FieldConfig[] }>('/settings/app/fields/crew', { fields }),

  updateDashboard: (role: Role, widgets: DashboardWidget[], scope: 'user_role' | 'role' = 'user_role') =>
    api.put<{ widgets: DashboardWidget[]; scope: 'user_role' | 'role'; role: Role }>(
      `/settings/app/dashboard/${role}?scope=${scope === 'role' ? 'role' : 'user_role'}`,
      { widgets }
    ),

  updateOrgConfig: (config: OrgConfig) =>
    api.put<{ config: OrgConfig }>('/settings/app/org', config),
}
