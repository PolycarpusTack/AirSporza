import { api } from '../utils/api'
import type { Channel } from '../data/types'

export const channelsApi = {
  list: () => api.get<Channel[]>('/channels'),
  create: (data: Omit<Channel, 'id' | 'tenantId'>) => api.post<Channel>('/channels', data),
  update: (id: number, data: Partial<Channel>) => api.put<Channel>(`/channels/${id}`, data),
  delete: (id: number) => api.delete(`/channels/${id}`),
}
