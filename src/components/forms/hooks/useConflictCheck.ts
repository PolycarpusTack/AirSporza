import { useState, useCallback } from 'react'
import { conflictsApi, type ConflictResult } from '../../../services/conflicts'
import type { EventStatus } from '../../../data/types'

export interface ConflictCheckParams {
  id?: number
  competitionId: number
  channelId?: number
  radioChannelId?: number
  onDemandChannelId?: number
  startDateBE: string
  startTimeBE: string
  status?: EventStatus
}

type CheckOutcome = 'pass' | 'blocked'

export function useConflictCheck() {
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null)

  const reset = useCallback(() => {
    setConflicts(null)
  }, [])

  /**
   * Run a conflict preflight check.
   *
   * - Hard errors always block.
   * - Warnings block on first sight (`alreadySeen=false`), pass on second (`alreadySeen=true`).
   * - API failure (network error) returns 'pass' so we don't block the user.
   */
  const checkOrConfirm = useCallback(
    async (params: ConflictCheckParams, alreadySeen: boolean): Promise<CheckOutcome> => {
      const result = await conflictsApi
        .check({
          id: params.id,
          competitionId: params.competitionId,
          channelId: params.channelId,
          radioChannelId: params.radioChannelId,
          onDemandChannelId: params.onDemandChannelId,
          // Legacy fields — always clear
          linearChannel: undefined,
          onDemandChannel: undefined,
          radioChannel: undefined,
          startDateBE: params.startDateBE,
          startTimeBE: params.startTimeBE,
          status: params.status,
        })
        .catch(() => null)

      setConflicts(result)

      // Network error — don't block
      if (!result) return 'pass'

      // Hard errors always block
      if (result.errors.length > 0) return 'blocked'

      // Warnings block on first sight, pass when user has already seen them
      if (result.warnings.length > 0 && !alreadySeen) return 'blocked'

      return 'pass'
    },
    [],
  )

  return { conflicts, reset, checkOrConfirm } as const
}
