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
import type { ConflictMap, PersonConflictGroup } from '../../utils/crewConflicts'
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
  // Single-sourced through deriveRightsInfo (v2) — A-3's permutation rows keep
  // pinning the status rules through this delegation.
  return deriveRightsInfo(event, contracts, now).status
}

export interface RightsInfo {
  status: RightsStatus
  /**
   * Governing contract's validUntil as 'YYYY-MM-DD' (via getDateKey — API
   * ISO-datetime strings and Date objects normalize); null when there is no
   * contract row, or validUntil is absent/''/unparseable. EXPOSED even for
   * lapsed contracts (informative "until <past date>" in the inspector).
   */
  validUntil: string | null
  /** pickGoverningContract result; null when no contract row for event.competitionId. */
  contract: Contract | null
}

/**
 * COMPETITION-scoped rights core (ops-selectors v3, B-3 pin 3): the Rights
 * matrix keys on competitions, not events, so the v2 event-scoped body moved
 * here VERBATIM. deriveRightsInfo delegates — A-3/A-4's permutation suites
 * remain the byte-unchanged behavior pin for BOTH entry points.
 */
export function deriveCompetitionRightsInfo(competitionId: number, contracts: Contract[], now: Date): RightsInfo {
  const candidates = contracts.filter((c) => c.competitionId === competitionId)
  if (candidates.length === 0) return { status: 'MISSING', validUntil: null, contract: null }

  const nowMs = now.getTime()
  const contract = pickGoverningContract(candidates, nowMs)

  const untilEndMs = validUntilEndOfDayMs(contract)
  const validUntil = untilEndMs === null ? null : getDateKey(contract.validUntil!)

  let status: RightsStatus
  if (contract.status === 'none') {
    status = 'MISSING'
  } else if (contract.status === 'draft') {
    status = 'NEGOTIATION'
  } else if (untilEndMs === null) {
    status = 'VALID'
  } else if (untilEndMs < nowMs) {
    status = 'MISSING'
  } else if (toEpochMs(contract.validUntil)! <= nowMs + EXPIRY_WINDOW_MS) {
    status = 'EXPIRING'
  } else {
    status = 'VALID'
  }

  return { status, validUntil, contract }
}

/** Rights Status + governing-contract details for the inspector (ops-selectors v2; delegates since v3). */
export function deriveRightsInfo(event: Event, contracts: Contract[], now: Date): RightsInfo {
  return deriveCompetitionRightsInfo(event.competitionId, contracts, now)
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

export interface CrewRoleRow {
  fieldId: string
  label: string
  /** first filled (trimmed) assignment across the event's plans; null when blank */
  name: string | null
  /** same scale as deriveCrewHealth — dot casing is the component's rendering concern */
  state: CrewHealth
}

/**
 * Per-role crew rows for the inspector CREW section (ops-selectors v2).
 * Rows = crewFields where `visible && type !== 'checkbox'`, in FieldConfig.order.
 * Per-field precedence mirrors deriveCrewHealth: CONFLICT > OPEN > OK, where
 * - CONFLICT: `${plan.id}:${fieldId}` in ConflictMap for ANY of the event's plans
 *   (both severities);
 * - OPEN: field is required && blank in ANY plan, or the event has ZERO plans;
 * - blank OPTIONAL role → OK with name null (pinned — deriveCrewHealth only
 *   counts required blanks; the component renders these as —).
 * Multi-plan: worst state wins; first filled name wins.
 * CONSISTENCY INVARIANT (pinned): deriveCrewHealth equals the worst VISIBLE-row
 * state — EXCEPT conflicts keyed on hidden/checkbox fields, which raise the
 * event-level word above the rows (correct UX: the word is broader; pinned).
 */
export function deriveCrewRoles(
  event: Event,
  plans: TechPlan[],
  conflicts: ConflictMap,
  crewFields: FieldConfig[],
): CrewRoleRow[] {
  const eventPlans = plans.filter((p) => p.eventId === event.id)

  return crewFields
    .filter((field) => field.visible && field.type !== 'checkbox')
    .sort((a, b) => a.order - b.order)
    .map((field) => {
      let hasConflict = false
      let hasOpen = eventPlans.length === 0 && field.required
      let name: string | null = null

      for (const plan of eventPlans) {
        const crew = (plan.crew ?? {}) as Record<string, unknown>
        if (conflicts.has(`${plan.id}:${field.id}`)) hasConflict = true
        const value = crew[field.id]
        if (isFilled(value)) {
          if (name === null) name = (value as string).trim()
        } else if (field.required) {
          hasOpen = true
        }
      }

      const state: CrewHealth = hasConflict ? 'CONFLICT' : hasOpen ? 'OPEN' : 'OK'
      return { fieldId: field.id, label: field.label, name, state }
    })
}

/**
 * Event-scoped view of groupConflictsByPerson output (ops-selectors v2): keeps
 * groups whose conflicts touch the event, with the conflict arrays themselves
 * filtered to those rows; groups emptied by the filter are dropped. (Named
 * `filter…`, not `derive…` — it narrows existing data, it derives nothing.)
 * NOTE: `role` fields are RAW crew fieldIds — mapping to labels is the
 * component's job (via crewFields); this selector does not rename data.
 */
export function filterConflictsToEvent(event: Event, groups: PersonConflictGroup[]): PersonConflictGroup[] {
  return groups
    .map((group) => ({
      ...group,
      conflicts: group.conflicts.filter(
        (conflict) => conflict.eventA.id === event.id || conflict.eventB.id === event.id,
      ),
    }))
    .filter((group) => group.conflicts.length > 0)
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
