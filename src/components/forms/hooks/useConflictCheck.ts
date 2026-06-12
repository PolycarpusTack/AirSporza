import { useState, useCallback, useRef } from 'react'
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

/** Stable identity for a warning set — confirmation is only valid for the
 *  exact warnings the user was shown (quality-pass fix on TD-18). */
function warningSignature(warnings: Array<{ type: string; message: string }>): string {
  return warnings.map(w => `${w.type}:${w.message}`).sort().join('|')
}

const UNAVAILABLE_WARNING = {
  type: 'preflight_unavailable' as const,
  message: 'Conflict check unavailable — conflicts could not be verified.',
}

export function useConflictCheck() {
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null)
  // Signature of the warning set the user has been SHOWN (and may confirm by
  // saving again). Null = nothing pending confirmation.
  const shownSignatureRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    setConflicts(null)
    shownSignatureRef.current = null
  }, [])

  /**
   * Run a conflict preflight check.
   *
   * - Hard errors always block.
   * - Warnings block on first sight; an explicit re-save passes only if the
   *   warning set is IDENTICAL to the one the user saw — new or different
   *   warnings block again (a clean prior check or a stale confirmation never
   *   auto-passes fresh warnings).
   * - API failure (network error) is fail-VISIBLE (TD-18 fix): a synthetic
   *   'preflight_unavailable' warning is surfaced and 'unavailable' is
   *   returned; confirming it covers only the unavailable state itself.
   */
  const checkOrConfirm = useCallback(
    async (params: ConflictCheckParams): Promise<CheckOutcome> => {
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
        const signature = warningSignature([UNAVAILABLE_WARNING])
        setConflicts({ warnings: [UNAVAILABLE_WARNING], errors: [] })
        if (shownSignatureRef.current === signature) return 'pass'
        shownSignatureRef.current = signature
        return 'unavailable'
      }

      setConflicts(result)

      // Hard errors always block and invalidate any pending confirmation
      if (result.errors.length > 0) {
        shownSignatureRef.current = null
        return 'blocked'
      }

      if (result.warnings.length > 0) {
        const signature = warningSignature(result.warnings)
        if (shownSignatureRef.current === signature) return 'pass'
        shownSignatureRef.current = signature
        return 'blocked'
      }

      shownSignatureRef.current = null
      return 'pass'
    },
    [],
  )

  return { conflicts, reset, checkOrConfirm } as const
}
