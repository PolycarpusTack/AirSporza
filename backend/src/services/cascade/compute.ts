/**
 * Pure cascade computation primitives.
 *
 * The engine (persisted recompute) and the schedule preview endpoint
 * (read-only what-if) both need the same cascade constants and small
 * helpers. Keep them in one module so the two code paths can't drift.
 */

export const CHANGEOVER_MIN = 15
export const CONFIDENCE_DECAY = 0.85

export function addMinutes(date: Date, min: number): Date {
  return new Date(date.getTime() + min * 60 * 1000)
}

export function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b
}

/**
 * Canonical shape used by the cascade chain algorithm. Adapters from
 * Event rows (engine) or SlotState (preview) convert to this before
 * calling {@link computeCascadeChain}.
 */
export interface CascadeItem {
  /** Stable identifier for the item (event id or slot id). */
  id: number | string
  /** Planned start in UTC ms (or best available anchor for the first item). */
  startMs: number
  /** 'completed' / 'live' events use actual times; others are estimated. */
  status: 'completed' | 'live' | 'scheduled' | 'draft' | 'other'
  /** Optional earliest allowed start (rights / production window). */
  notBeforeMs: number | null
  /** Actual start if the match has begun, else null. */
  actualStartMs: number | null
  /** Actual end if the match has finished, else null. */
  actualEndMs: number | null
  /** Short-duration estimate in minutes. */
  shortMin: number
  /** Long-duration estimate in minutes. */
  longMin: number
}

export interface CascadeChainResult<TId = number | string> {
  id: TId
  estimatedStartMs: number
  earliestStartMs: number
  latestStartMs: number
  estDurationShortMin: number
  estDurationLongMin: number
  confidenceScore: number
}

/**
 * Apply the cascade chain algorithm to a sorted list of items.
 *
 * Walks items in order. Completed/live items anchor subsequent items
 * using their actual end time (or an estimated end if actualEnd is
 * absent). Confidence decays by {@link CONFIDENCE_DECAY} at each step
 * past the first uncertain item.
 */
export function computeCascadeChain<TId extends number | string>(
  items: (CascadeItem & { id: TId })[]
): CascadeChainResult<TId>[] {
  const changeoverMs = CHANGEOVER_MIN * 60 * 1000
  const results: CascadeChainResult<TId>[] = []
  let prevEnd: { earliest: number | null; estimated: number | null; latest: number | null } = {
    earliest: null,
    estimated: null,
    latest: null,
  }
  let prevConfidence = 1.0

  for (const item of items) {
    if (item.status === 'completed' || item.status === 'live') {
      const startMs = item.actualStartMs ?? item.startMs
      const endedCompletely = item.status === 'completed' && item.actualEndMs != null

      results.push({
        id: item.id,
        estimatedStartMs: startMs,
        earliestStartMs: startMs,
        latestStartMs: startMs,
        estDurationShortMin: endedCompletely ? 0 : item.shortMin,
        estDurationLongMin: endedCompletely ? 0 : item.longMin,
        confidenceScore: 1.0,
      })

      const endMs = endedCompletely
        ? item.actualEndMs!
        : startMs + item.shortMin * 60 * 1000
      prevEnd = { earliest: endMs, estimated: endMs, latest: endMs }
      prevConfidence = 1.0
      continue
    }

    const midMin = (item.shortMin + item.longMin) / 2
    const confidence = prevConfidence * CONFIDENCE_DECAY

    let earliestMs: number
    let estimatedMs: number
    let latestMs: number

    if (prevEnd.earliest == null) {
      const anchor = item.notBeforeMs != null
        ? Math.max(item.startMs, item.notBeforeMs)
        : item.startMs
      earliestMs = anchor
      estimatedMs = anchor
      latestMs = anchor
    } else {
      const lowerBound = item.notBeforeMs ?? 0
      earliestMs = Math.max(prevEnd.earliest + changeoverMs, lowerBound)
      estimatedMs = Math.max(prevEnd.estimated! + changeoverMs, lowerBound)
      latestMs = Math.max(prevEnd.latest! + changeoverMs, lowerBound)
    }

    results.push({
      id: item.id,
      estimatedStartMs: estimatedMs,
      earliestStartMs: earliestMs,
      latestStartMs: latestMs,
      estDurationShortMin: item.shortMin,
      estDurationLongMin: item.longMin,
      confidenceScore: Math.round(confidence * 100) / 100,
    })

    prevEnd = {
      earliest: earliestMs + item.shortMin * 60 * 1000,
      estimated: estimatedMs + midMin * 60 * 1000,
      latest: latestMs + item.longMin * 60 * 1000,
    }
    prevConfidence = confidence
  }

  return results
}
