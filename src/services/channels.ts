import { api } from '../utils/api'
import type { Channel, ChannelType } from '../data/types'

export const channelsApi = {
  list: (type?: ChannelType) =>
    api.get<Channel[]>(type ? `/channels?type=${type}` : '/channels'),
  listTree: (type?: ChannelType) =>
    api.get<Channel[]>(type ? `/channels/tree?type=${type}` : '/channels/tree'),
  get: (id: number) => api.get<Channel>(`/channels/${id}`),
  create: (data: Partial<Channel>) => api.post<Channel>('/channels', data),
  update: (id: number, data: Partial<Channel>) => api.put<Channel>(`/channels/${id}`, data),
  delete: (id: number) => api.delete(`/channels/${id}`),
}
