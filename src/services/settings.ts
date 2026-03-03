import { api } from '../utils/api'
import type { DashboardWidget, FieldConfig, Role } from '../data/types'

export interface AppSettingsResponse {
  scopeRules: {
    eventFields: 'global'
    crewFields: 'global'
    dashboardWidgets: 'user_role_with_role_fallback'
  }
  eventFields: FieldConfig[] | null
  crewFields: FieldConfig[] | null
  dashboardWidgets: DashboardWidget[] | null
  meta: {
    eventFieldsScope: 'global' | null
    crewFieldsScope: 'global' | null
    dashboardWidgetsScope: 'role' | 'user_role' | null
  }
}

export const settingsApi = {
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
}
