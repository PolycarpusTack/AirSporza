/**
 * useContracts — the shared quiet contracts fetch (B-3-T2 PREP).
 * Rule of Three: ScheduleScreen (A-3-T2) and RundownScreen (B-1-T2) carried
 * verbatim copies of this block; RightsScreen is the THIRD consumer — the
 * extraction B-1 pin 4 pre-authorized.
 *
 * Contracts live OUTSIDE AppProvider. Behavior mirrors the original screen
 * blocks exactly: ONE fetch on mount, QUIET failure (rights derive MISSING
 * until data arrives — pinned ops design), isActive cleanup against
 * post-unmount writes.
 *
 * `isSettled` (B-3-T2 FEATURE-unit extension) flips on the FIRST resolution —
 * success OR failure (a failed fetch must not leave pin-7 skeletons hanging
 * forever; promise-spec "settled", matching the test folder's settle-gate
 * vocabulary). Schedule/Rundown ignore it (their quiet pre-fetch fallback is
 * pinned behavior); RightsScreen consumes it (B-3 pin 7).
 */
import { useEffect, useState } from 'react'
import type { Contract } from '../../data/types'
import { contractsApi } from '../../services'

export interface UseContractsReturn {
  /** [] until the first resolution; then the API list */
  contracts: Contract[]
  /** true after the FIRST contractsApi.list() resolution — success OR failure (B-3 pin 7) */
  isSettled: boolean
}

export function useContracts(): UseContractsReturn {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [isSettled, setIsSettled] = useState(false)

  useEffect(() => {
    let isActive = true
    contractsApi
      .list()
      .then((list: Contract[]) => {
        if (isActive) setContracts(list)
      })
      .catch(() => {
        /* quiet per ops design — consumers derive MISSING/empty until data arrives */
      })
      .finally(() => {
        if (isActive) setIsSettled(true)
      })
    return () => {
      isActive = false
    }
  }, [])

  return {
    contracts,
    isSettled,
  }
}
