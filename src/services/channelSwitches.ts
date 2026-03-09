import { api } from '../utils/api'

export interface ChannelSwitch {
  id: string
  tenantId: string
  fromSlotId: string
  toChannelId: number
  toSlotId?: string
  triggerType: string
  switchAtUtc?: string
  reasonCode: string
  reasonText?: string
  confirmedBy?: string
  confirmedAt?: string
  executionStatus: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED'
  autoConfirmed: boolean
  createdAt: string
}

export const channelSwitchesApi = {
  list: (params?: { fromSlotId?: string; executionStatus?: string }) => {
    const qs = new URLSearchParams()
    if (params?.fromSlotId) qs.set('fromSlotId', params.fromSlotId)
    if (params?.executionStatus) qs.set('executionStatus', params.executionStatus)
    const q = qs.toString()
    return api.get<ChannelSwitch[]>(`/channel-switches${q ? `?${q}` : ''}`)
  },
  create: (data: {
    fromSlotId: string
    toChannelId: number
    triggerType: string
    reasonCode: string
    reasonText?: string
    switchAtUtc?: string
  }) => api.post<ChannelSwitch>('/channel-switches', data),
  confirm: (id: string) =>
    api.post<ChannelSwitch>(`/channel-switches/${id}/confirm`, {}),
}
