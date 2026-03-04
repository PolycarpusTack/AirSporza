import { api } from '../utils/api'

export interface AppNotification {
  id: string
  type: string
  title: string
  body?: string
  entityType?: string
  entityId?: string
  isRead: boolean
  createdAt: string
}

export const notificationsApi = {
  list: () => api.get<AppNotification[]>('/notifications'),
  markRead: (id: string) => api.patch<{ ok: boolean }>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.patch<{ count: number }>('/notifications/read-all', {}),
}
