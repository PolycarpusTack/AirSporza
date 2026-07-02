/**
 * Ops derived-status selectors (A-3-T1, remediated per adversarial threshold
 * review) — PURE functions, no React, no fetching, no Date.now().
 * Contract: docs/governance/contracts/ops-selectors.md (ops-selectors v1).
 * Consumed by ScheduleScreen (A-3), EventInspector (A-4), Rundown legend (B-2/B-3).
 *
 * AS-4: the rights thresholds below are PROVISIONAL STANDARD FORMULAS approved by
 * the architect (2026-07-02); a dedicated threshold-formula session revisits them
 * against the pinned permutation rows in selectors.test.ts. The 90-day window is
 * single-sourced HERE — never use contractsApi.expiring(days) for derivation.
 *
 * TD-24: never read @deprecated fields (Event.duration/linearChannel/... ,
 * Contract linearRights/maxRights/radioRights) — platforms[] and *Id/durationMin only.
 *
 * Date handling: API events carry ISO DATETIME strings (Prisma → res.json), local
 * code may hold local-midnight Date objects — all day-keying goes through the
 * canonical getDateKey (utils/dateTime), never hand-rolled (anti-duplication).
 */
import type { Contract, Event, FieldConfig, TechPlan } from '../../data/types'
import type { ConflictMap } from '../../utils/crewConflicts'
import { getDateKey, timeToMinutes } from '../../utils/dateTime'

export type RightsStatus = 'VALID' | 'EXPIRING' | 'NEGOTIATION' | 'MISSING'
export type CrewHealth = 'OK' | 'OPEN' | 'CONFLICT'

export interface DayGroup {
  /** YYYY-MM-DD */
  date: string
  /** time-ordered by startTimeBE; empty array for days without events */
  events: Event[]
}

const DAY_MS = 86_400_000
/** AS-4 provisional: contracts expiring within 90 days (INCLUSIVE) are EXPIRING. */
const EXPIRY_WINDOW_MS = 90 * DAY_MS

/** Date|string|'' → epoch ms, or null for absent/garbage ('' parses to NaN). */
function toEpochMs(value: Date | string | undefined): number | null {
  if (!value) return null
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/**
 * validUntil is day-precision (midnight) but real clocks have a time of day —
 * a contract is held through the END of its expiry day (BLOCKER 3). This is the
 * ONE place that widens it; both the lapse check and the covering check use it.
 * (The +90d EXPIRING window deliberately compares the RAW day value — calendar-
 * stable per the adversarial review; do not widen it.)
 */
function validUntilEndOfDayMs(contract: Contract): number | null {
  const ms = toEpochMs(contract.validUntil)
  return ms === null ? null : ms + DAY_MS - 1
}

/** MAJOR 4 (PROVISIONAL): rights-bearing ('valid'/'expiring') > 'draft' > 'none'. */
function statusClassRank(contract: Contract): number {
  if (contract.status === 'none') return 0
  if (contract.status === 'draft') return 1
  return 2
}

/**
 * Multiple contracts per competition (pinned, PROVISIONAL per AS-4):
 * 1. Prefer contracts COVERING `now` (validFrom absent-or-past AND validUntil
 *    absent-or-end-of-day-future).
 * 2. Among covering: status class ('valid'/'expiring' > 'draft' > 'none'), then
 *    latest validUntil (absent = open-ended = latest), ties keep input order.
 * 3. No covering contract: latest parseable validUntil (absent = earliest),
 *    ties keep input order.
 */
function pickGoverningContract(candidates: Contract[], nowMs: number): Contract {
  const covering = candidates.filter((c) => {
    const fromMs = toEpochMs(c.validFrom)
    const untilEndMs = validUntilEndOfDayMs(c)
    return (fromMs === null || fromMs <= nowMs) && (untilEndMs === null || untilEndMs >= nowMs)
  })

  if (covering.length > 0) {
    return covering.reduce((best, candidate) => {
      const rankDelta = statusClassRank(candidate) - statusClassRank(best)
      if (rankDelta !== 0) return rankDelta > 0 ? candidate : best
      const bestUntil = toEpochMs(best.validUntil) ?? Number.POSITIVE_INFINITY // open-ended outlasts dated
      const candidateUntil = toEpochMs(candidate.validUntil) ?? Number.POSITIVE_INFINITY
      return candidateUntil > bestUntil ? candidate : best
    })
  }

  return candidates.reduce((best, candidate) => {
    const bestUntil = toEpochMs(best.validUntil) ?? Number.NEGATIVE_INFINITY
    const candidateUntil = toEpochMs(candidate.validUntil) ?? Number.NEGATIVE_INFINITY
    return candidateUntil > bestUntil ? candidate : best
  })
}

/**
 * Rights Status per event, derived from its competition's Contract (glossary).
 * Precedence (AS-4 provisional — permutation-pinned):
 *   1. no contract row OR picked status 'none'       → MISSING
 *   2. status 'draft'                                → NEGOTIATION
 *   3. validUntil lapsed (end of its day < now)      → MISSING (rights no longer held)
 *   4. raw validUntil ≤ now+90d (inclusive)          → EXPIRING
 *   5. else                                          → VALID (incl. absent/garbage validUntil)
 * Stored 'valid'/'expiring' status values are IGNORED (stale) — only 'draft'/'none'
 * carry non-derivable meaning.
 */
export function deriveRightsStatus(event: Event, contracts: Contract[], now: Date): RightsStatus {
  const candidates = contracts.filter((c) => c.competitionId === event.competitionId)
  if (candidates.length === 0) return 'MISSING'

  const nowMs = now.getTime()
  const contract = pickGoverningContract(candidates, nowMs)

  if (contract.status === 'none') return 'MISSING'
  if (contract.status === 'draft') return 'NEGOTIATION'

  const untilEndMs = validUntilEndOfDayMs(contract)
  if (untilEndMs === null) return 'VALID'
  if (untilEndMs < nowMs) return 'MISSING'

  const untilRawMs = toEpochMs(contract.validUntil)! // non-null: untilEndMs derived from it
  if (untilRawMs <= nowMs + EXPIRY_WINDOW_MS) return 'EXPIRING'
  return 'VALID'
}

/** Required crew value = non-empty string (matches detectCrewConflicts semantics). */
function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Crew Health per event (glossary). Precedence (pinned):
 *   1. any ConflictMap hit "planId:fieldId" on any of the event's plans → CONFLICT
 *      (severity 'full' AND 'partial' both count)
 *   2. any required+visible crew field blank in any plan, OR ZERO plans → OPEN
 *      (zero-plans→OPEN is a pinned decision: an unplanned event needs crew work)
 *   3. else → OK
 * `conflicts` comes from ONE detectCrewConflicts(allPlans, allEvents) pass per
 * screen; requiredness comes from the crewFields param (AppProvider), never hard-coded.
 */
export function deriveCrewHealth(
  event: Event,
  plans: TechPlan[],
  conflicts: ConflictMap,
  crewFields: FieldConfig[],
): CrewHealth {
  const eventPlans = plans.filter((p) => p.eventId === event.id)
  if (eventPlans.length === 0) return 'OPEN'

  for (const plan of eventPlans) {
    const crew = (plan.crew ?? {}) as Record<string, unknown>
    for (const fieldId of Object.keys(crew)) {
      if (conflicts.has(`${plan.id}:${fieldId}`)) return 'CONFLICT'
    }
  }

  const requiredFieldIds = crewFields
    .filter((field) => field.required && field.visible)
    .map((field) => field.id)

  for (const plan of eventPlans) {
    const crew = (plan.crew ?? {}) as Record<string, unknown>
    for (const fieldId of requiredFieldIds) {
      if (!isFilled(crew[fieldId])) return 'OPEN'
    }
  }

  return 'OK'
}

/**
 * Day key via the canonical getDateKey (BLOCKER 1 / MAJOR 5): ISO-datetime
 * strings split on 'T'; Date objects keyed by LOCAL components (no UTC shift).
 * Invalid Date objects (getTime() NaN) are skipped silently per contract.
 */
function eventDateKey(event: Event): string | null {
  const raw = event.startDateBE
  if (!raw) return null
  if (raw instanceof Date && Number.isNaN(raw.getTime())) return null
  return getDateKey(raw) || null
}

/**
 * Groups the 7-day week starting `week.start` (YYYY-MM-DD, UTC day math — no DST
 * drift) into one DayGroup per day, INCLUDING empty days (Schedule's empty-state
 * AC needs zero-event weekdays). Events outside the week are excluded; within a
 * day, events are ordered by startTimeBE via timeToMinutes ('H:MM' handled);
 * equal times keep input order (stable sort). Unparseable week.start → [].
 */
export function groupEventsByDay(events: Event[], week: { start: string }): DayGroup[] {
  const startMs = Date.parse(`${week.start}T00:00:00Z`)
  if (Number.isNaN(startMs)) return []

  const groups: DayGroup[] = Array.from({ length: 7 }, (_, dayIndex) => ({
    date: new Date(startMs + dayIndex * DAY_MS).toISOString().split('T')[0],
    events: [],
  }))
  const groupsByDate = new Map(groups.map((group) => [group.date, group]))

  for (const event of events) {
    const key = eventDateKey(event)
    if (!key) continue
    groupsByDate.get(key)?.events.push(event)
  }

  for (const group of groups) {
    group.events.sort((a, b) => timeToMinutes(a.startTimeBE) - timeToMinutes(b.startTimeBE))
  }

  return groups
}
