import { useEffect, useState, useRef } from 'react'
import { rightsApi, type RightsValidationResult } from '../services/rights'

export interface RightsStatus {
  ok: boolean
  /** Highest severity across results. Drives the badge colour. */
  severity: 'ok' | 'info' | 'warning' | 'error'
  results: RightsValidationResult[]
}

function deriveSeverity(results: RightsValidationResult[]): RightsStatus['severity'] {
  if (results.some(r => r.severity === 'ERROR')) return 'error'
  if (results.some(r => r.severity === 'WARNING')) return 'warning'
  if (results.some(r => r.severity === 'INFO')) return 'info'
  return 'ok'
}

/**
 * Batched rights-check hook for a list of events. Debounces fetches so
 * rapid list churn (filter toggles, date navigation) doesn't spam the
 * API, and remembers statuses across re-renders so already-checked
 * events don't flicker back to "unknown" during a refetch.
 *
 * Returns `Record<eventId, RightsStatus>` — widgets and event cards
 * read by id without knowing anything about the network call.
 */
export function useRightsCheck(eventIds: number[], options?: {
  territory?: string
  /** Debounce window in ms; defaults to 250. */
  debounceMs?: number
  /** If false, the hook does nothing. Lets callers gate on a feature flag. */
  enabled?: boolean
}): Record<number, RightsStatus> {
  const enabled = options?.enabled !== false
  const territory = options?.territory
  const debounceMs = options?.debounceMs ?? 250
  const [statusById, setStatusById] = useState<Record<number, RightsStatus>>({})
  const lastRequestedRef = useRef<string>('')

  // Stable key so the effect doesn't refire when the array identity changes
  // but the contents don't (a common React foot-gun).
  const key = enabled ? eventIds.slice().sort((a, b) => a - b).join(',') : ''

  useEffect(() => {
    if (!enabled || key === '') return
    if (key === lastRequestedRef.current) return

    const timer = setTimeout(() => {
      lastRequestedRef.current = key
      const ids = key.split(',').map(Number).filter(n => Number.isFinite(n))
      if (ids.length === 0) return
      let cancelled = false
      rightsApi.checkBatch(ids, territory)
        .then(byId => {
          if (cancelled) return
          const next: Record<number, RightsStatus> = {}
          for (const idStr of Object.keys(byId)) {
            const id = Number(idStr)
            const r = byId[id]
            next[id] = {
              ok: r.ok,
              severity: deriveSeverity(r.results),
              results: r.results,
            }
          }
          // Merge rather than replace so events that were removed from the
          // current list don't disappear from the cache (they'll come back
          // on the next render if the caller still needs them).
          setStatusById(prev => ({ ...prev, ...next }))
        })
        .catch(() => {
          // Swallow — rights check is advisory UI, not load-blocking.
          // The event card simply won't show a status until the next
          // refetch succeeds.
        })
      return () => { cancelled = true }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [key, territory, debounceMs, enabled])

  return statusById
}
