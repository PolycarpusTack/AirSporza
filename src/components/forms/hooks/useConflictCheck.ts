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

// TD-18 fix: 'unavailable' is a distinct outcome for preflight API failure —
// callers must treat it like a warning (block until explicitly confirmed),
// never as a silent 'pass'.
export type CheckOutcome = 'pass' | 'blocked' | 'unavailable'

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
   * - API failure (network error) is fail-VISIBLE (TD-18 fix): a synthetic
   *   'preflight_unavailable' warning is surfaced and 'unavailable' is
   *   returned; like real warnings, an explicit second confirm passes.
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

      // TD-18 fix: the check itself failed — fail visible, not open. Surface a
      // synthetic warning through the normal conflict UI and require the same
      // explicit "save again to proceed" confirm as a real warning.
      if (!result) {
        setConflicts({
          warnings: [{
            type: 'preflight_unavailable',
            message: 'Conflict check unavailable — conflicts could not be verified.',
          }],
          errors: [],
        })
        return alreadySeen ? 'pass' : 'unavailable'
      }

      setConflicts(result)

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
