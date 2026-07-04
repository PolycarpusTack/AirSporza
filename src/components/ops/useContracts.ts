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
 */
import { useEffect, useState } from 'react'
import type { Contract } from '../../data/types'
import { contractsApi } from '../../services'

export interface UseContractsReturn {
  /** [] until the first resolution; then the API list */
  contracts: Contract[]
}

export function useContracts(): UseContractsReturn {
  const [contracts, setContracts] = useState<Contract[]>([])

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
    return () => {
      isActive = false
    }
  }, [])

  return {
    contracts,
  }
}
