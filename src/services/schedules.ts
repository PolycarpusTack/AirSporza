import { api } from '../utils/api'
import type { ScheduleDraft, ScheduleVersion, BroadcastSlot } from '../data/types'

export const schedulesApi = {
  // Broadcast Slots
  listSlots: (params?: { channelId?: number; date?: string }) => {
    const qs = new URLSearchParams()
    if (params?.channelId) qs.set('channelId', String(params.channelId))
    if (params?.date) {
      qs.set('dateStart', params.date)
      // End of day: next day at midnight
      const next = new Date(params.date + 'T00:00:00Z')
      next.setUTCDate(next.getUTCDate() + 1)
      qs.set('dateEnd', next.toISOString().slice(0, 10))
    }
    const q = qs.toString()
    return api.get<BroadcastSlot[]>(`/broadcast-slots${q ? `?${q}` : ''}`)
  },

  // Drafts
  listDrafts: (params?: { channelId?: number }) => {
    const qs = params?.channelId ? `?channelId=${params.channelId}` : ''
    return api.get<ScheduleDraft[]>(`/schedule-drafts${qs}`)
  },
  getDraft: (id: string) =>
    api.get<ScheduleDraft>(`/schedule-drafts/${id}`),
  createDraft: (data: { channelId: number; dateRangeStart: string; dateRangeEnd: string }) =>
    api.post<ScheduleDraft>('/schedule-drafts', data),
  appendOps: (id: string, version: number, operations: unknown[]) =>
    api.patch<ScheduleDraft>(`/schedule-drafts/${id}`, { version, operations }),
  validateDraft: (id: string) =>
    api.post<{ results: any[] }>(`/schedule-drafts/${id}/validate`, {}),
  publishDraft: (id: string, acknowledgeWarnings?: boolean) =>
    api.post<{ version: ScheduleVersion }>(`/schedule-drafts/${id}/publish`, { acknowledgeWarnings }),

  // Versions
  listVersions: (params?: { channelId?: number }) => {
    const qs = params?.channelId ? `?channelId=${params.channelId}` : ''
    return api.get<ScheduleVersion[]>(`/schedule-versions${qs}`)
  },
}
