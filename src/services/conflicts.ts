import { api } from '../utils/api'
import type { EventStatus } from '../data/types'

export type ConflictWarning = { type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan'; message: string }
export type ConflictError   = { type: 'encoder_locked' | 'rights_violation'; message: string }
export type ConflictResult  = { warnings: ConflictWarning[]; errors: ConflictError[] }

export const conflictsApi = {
  check: (draft: {
    id?: number
    competitionId?: number
    channelId?: number
    radioChannelId?: number
    onDemandChannelId?: number
    linearChannel?: string      // @deprecated — kept for backwards compat
    onDemandChannel?: string    // @deprecated — kept for backwards compat
    radioChannel?: string       // @deprecated — kept for backwards compat
    startDateBE?: string
    startTimeBE?: string
    status?: EventStatus
  }) => api.post<ConflictResult>('/events/conflicts', draft),
}
