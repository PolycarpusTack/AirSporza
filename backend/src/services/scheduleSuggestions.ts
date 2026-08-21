/**
 * Schedule Suggestions (Story FM2-1, FM2-1-T1). PURE scoring function, no
 * Express, no Prisma calls, no `Date.now()` (the route passes `now`
 * explicitly — same anti-smart-ui convention as `src/components/ops/
 * selectors.ts` and `src/components/fm/fmActionItems.ts`). Contract Snapshot:
 * `scheduleSuggestions v1` (see FM2-1-T1 hand-off).
 *
 * GET /api/schedule/suggestions?week=<ISO-week-start> → for each UNPLACED
 * event in the requested week, rank candidate channels by ascending load,
 * after two EVENT-level gates (bad rights → zero candidates; crew conflict →
 * zero candidates) — never per-channel filters. See the story's "Resolved
 * ambiguity" note: a candidate's slot time is fixed to the event's OWN
 * already-known startDateBE/startTimeBE, so rights/crew (both channel-
 * independent) cannot themselves vary by candidate channel; only the
 * ascending-load tie-break is per-channel.
 *
 * ── PULL GATE — signature drift found and resolved (flag this in review) ──
 *
 * 1) UNPLACED predicate: mirrors `src/components/fm/fmActionItems.ts`'s
 *    PRIVATE `isUnplaced(event, broadcastSlots)` predicate LITERALLY
 *    (`channelId == null` AND no BroadcastSlot row with that eventId) — see
 *    `isUnplacedEvent` below, cross-referenced by comment (C6). Not exported
 *    by that module, so it cannot be imported directly; deliberately
 *    duplicated, not reimplemented from scratch. Rule of Three not met at 2
 *    occurrences (Abstraction Check) — no shared-package extraction across
 *    the frontend/backend boundary. A fixture-parity test
 *    (scheduleSuggestions.parity.test.ts) proves both sides agree on the
 *    same fixture week's unplaced event-id set by running the REAL frontend
 *    `deriveActionItems` code path (not a re-copy) against this module's
 *    `isUnplacedEvent`.
 *
 * 2) RIGHTS gate ("OWN deriveRightsStatus is MISSING or NEGOTIATION"):
 *    `src/components/ops/selectors.ts`'s `deriveRightsStatus`/
 *    `deriveCompetitionRightsInfo` are FRONTEND-ONLY. Two backend candidates
 *    were evaluated and REJECTED for this exact boolean gate:
 *      - `rightsChecker.ts`'s `checkRights`/`checkRightsForEvent` return a
 *        `ValidationResult[]` with its own code vocabulary, not a
 *        MISSING/NEGOTIATION/EXPIRING/VALID status. Its `NO_VALID_CONTRACT`
 *        ERROR does correctly fire for "no applicable valid/expiring
 *        contract row" (covering both MISSING-via-status-'none'/no-row and
 *        NEGOTIATION-via-status-'draft', collapsed into one code — fine,
 *        since this gate only needs the boolean OR of the two). BUT (a) the
 *        overall `ok` flag also goes false for TERRITORY_BLOCKED /
 *        MAX_RUNS_EXCEEDED / BLACKOUT_PERIOD / HOLDBACK_VIOLATION — failure
 *        modes the frontend's `RightsStatus` vocabulary has no concept of at
 *        all, so gating on `!ok` would OVER-exclude events the AC's own
 *        MISSING/NEGOTIATION test would pass; and (b) `checkRights` never
 *        checks whether an otherwise status='valid' contract's `validUntil`
 *        has LAPSED (date-based) — `deriveCompetitionRightsInfo` treats a
 *        lapsed validUntil as MISSING regardless of stored status, so gating
 *        on `NO_VALID_CONTRACT` alone would UNDER-exclude that case.
 *      - `conflictService.ts`'s `detectConflicts`/`detectConflictsBulk`
 *        return `{warnings, errors}` bundling rights + channel-overlap +
 *        missing-tech-plan + resource-conflict signals together; there is no
 *        isolated rights-only verdict to extract without re-deriving one
 *        from its internals anyway.
 *    Neither backend function cleanly produces the AC's exact boolean gate.
 *    Resolved by replicating `deriveCompetitionRightsInfo`'s MISSING/
 *    NEGOTIATION precedence rules verbatim (`pickGoverningContract`,
 *    `statusClassRank`, `validUntilEndOfDayMs`) as `isEventRightsBad` below
 *    — same mirror-with-comment pattern as `isUnplacedEvent` — trimmed to
 *    only the 3 branches that produce MISSING/NEGOTIATION (the EXPIRING vs
 *    VALID split is irrelevant to this boolean: both pass the gate).
 *
 * 3) CREW gate ("OWN deriveCrewHealth is CONFLICT"): `deriveCrewHealth` needs
 *    a `ConflictMap` from `src/utils/crewConflicts.ts`'s `detectCrewConflicts`
 *    (free-text crew-field name collisions + time-window overlap — a
 *    different concept from `conflictService.ts`'s `resource_conflict`,
 *    which keys on structured `ResourceAssignment.resourceId`, not crew
 *    field text values) PLUS `crewFields: FieldConfig[]` for its OPEN branch.
 *    This gate only needs the CONFLICT branch (OPEN does not exclude — see
 *    the AC), so `crewFields` is not needed here at all. No backend
 *    equivalent of `detectCrewConflicts` exists. Resolved by replicating its
 *    pairwise same-person/overlapping-window detection as
 *    `computeCrewConflictEventIds` below — same mirror-with-comment pattern
 *    — simplified to an event-id boolean Set (a plan belongs to exactly one
 *    eventId, so "this event's own plan/field pair hit the ConflictMap" is
 *    equivalent to "this event's id was added to the pairwise-conflict set")
 *    and to `event.durationMin` only (no legacy `duration` string fallback —
 *    TD-24 already forbids reading that deprecated field). Per
 *    `useFmActionItems.ts`'s own WEEK SCOPING note, `detectCrewConflicts` is
 *    always called with week-scoped events in production — `techPlans`/
 *    `events` here are expected to be pre-scoped to the requested week by
 *    the route, same convention.
 *
 * CHANNEL LOAD: count of existing BroadcastSlot rows on that channel within
 * the requested week — computed by the route (see broadcastSlots.ts's
 * dateStart/dateEnd half-open `[gte, lt)` convention on `plannedStartUtc`,
 * reused rather than reinvented) and passed in as `channelLoad`.
 */
import { beClockToUtc } from '../utils/beClock.js'

// ─────────────────────────────────────────────────────────────────────────
// Public types — Contract Snapshot `scheduleSuggestions v1`
// ─────────────────────────────────────────────────────────────────────────

export interface SuggestionEventInput {
  id: number
  channelId: number | null
  competitionId: number
  startDateBE: Date | string
  startTimeBE: string
  durationMin: number | null
}

export interface SuggestionSlotInput {
  eventId: number | null
}

export interface SuggestionTechPlanInput {
  id: number
  eventId: number
  crew: unknown
}

export interface SuggestionContractInput {
  id: number
  competitionId: number
  /** Prisma `ContractStatus` enum value ('valid'|'expiring'|'draft'|'none'), read as a plain string. */
  status: string
  validFrom: Date | string | null
  validUntil: Date | string | null
}

export interface SuggestionChannelInput {
  id: number
  name: string
}

export interface SuggestionCandidate {
  channelId: number
  channelName: string
  channelLoad: number
}

export interface SuggestionUnplacedEvent {
  eventId: number
  candidates: SuggestionCandidate[]
}

export interface ScheduleSuggestionsResponse {
  week: string
  unplaced: SuggestionUnplacedEvent[]
}

export interface ComputeScheduleSuggestionsInput {
  /** ISO week-start key echoed back verbatim in the response. */
  week: string
  /** Explicit clock — never read internally (anti-smart-ui convention). */
  now: Date
  /** Events already scoped to the requested week by the caller (route) — this module does no week-filtering of its own, matching ops/selectors.ts's and fmActionItems.ts's convention. */
  events: SuggestionEventInput[]
  /** BroadcastSlot rows whose eventId is among `events` — used only for the UNPLACED predicate. */
  slotsForEvents: SuggestionSlotInput[]
  /** TechPlan rows whose eventId is among `events` — used only for the CREW conflict gate. */
  techPlans: SuggestionTechPlanInput[]
  /** Contract rows for the competitionIds referenced by `events` — used only for the RIGHTS gate. */
  contracts: SuggestionContractInput[]
  /** The candidate channel universe (tenant's channels). */
  channels: SuggestionChannelInput[]
  /** channelId → BroadcastSlot count on that channel within the requested week. */
  channelLoad: Map<number, number> | Record<number, number>
}

// ─────────────────────────────────────────────────────────────────────────
// 1) UNPLACED predicate — mirror of fmActionItems.ts's isUnplaced
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mirrors `src/components/fm/fmActionItems.ts`'s PRIVATE
 * `isUnplaced(event, broadcastSlots)` predicate LITERALLY (FM2-1 AC / C6):
 * `channelId == null` AND no BroadcastSlot row with that eventId. See the
 * module header's Pull Gate note 1 — deliberate duplication, not
 * reimplementation.
 */
export function isUnplacedEvent(
  event: Pick<SuggestionEventInput, 'id' | 'channelId'>,
  slots: SuggestionSlotInput[],
): boolean {
  const hasChannel = event.channelId != null
  const hasSlot = slots.some((slot) => slot.eventId === event.id)
  return !hasChannel && !hasSlot
}

// ─────────────────────────────────────────────────────────────────────────
// 2) RIGHTS gate — mirror of ops/selectors.ts's deriveCompetitionRightsInfo
//    (MISSING/NEGOTIATION branches only — see Pull Gate note 2)
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

/** Date|string|'' → epoch ms, or null for absent/garbage (mirrors ops/selectors.ts's toEpochMs). */
function toEpochMs(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** validUntil held through the END of its day (mirrors ops/selectors.ts's validUntilEndOfDayMs). */
function validUntilEndOfDayMs(contract: SuggestionContractInput): number | null {
  const ms = toEpochMs(contract.validUntil)
  return ms === null ? null : ms + DAY_MS - 1
}

/** rights-bearing ('valid'/'expiring') > 'draft' > 'none' (mirrors ops/selectors.ts's statusClassRank). */
function statusClassRank(contract: SuggestionContractInput): number {
  if (contract.status === 'none') return 0
  if (contract.status === 'draft') return 1
  return 2
}

/** Mirrors ops/selectors.ts's pickGoverningContract precedence verbatim. */
function pickGoverningContract(candidates: SuggestionContractInput[], nowMs: number): SuggestionContractInput {
  const covering = candidates.filter((c) => {
    const fromMs = toEpochMs(c.validFrom)
    const untilEndMs = validUntilEndOfDayMs(c)
    return (fromMs === null || fromMs <= nowMs) && (untilEndMs === null || untilEndMs >= nowMs)
  })

  if (covering.length > 0) {
    return covering.reduce((best, candidate) => {
      const rankDelta = statusClassRank(candidate) - statusClassRank(best)
      if (rankDelta !== 0) return rankDelta > 0 ? candidate : best
      const bestUntil = toEpochMs(best.validUntil) ?? Number.POSITIVE_INFINITY
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
 * True when this event's OWN rights status (per the ops/selectors.ts
 * precedence, replicated here — see Pull Gate note 2) is MISSING or
 * NEGOTIATION. The EXPIRING/VALID split is deliberately not computed — both
 * pass this gate.
 */
export function isEventRightsBad(competitionId: number, contracts: SuggestionContractInput[], now: Date): boolean {
  const candidates = contracts.filter((c) => c.competitionId === competitionId)
  if (candidates.length === 0) return true // MISSING: no contract row for this competition

  const nowMs = now.getTime()
  const contract = pickGoverningContract(candidates, nowMs)

  if (contract.status === 'none') return true // MISSING
  if (contract.status === 'draft') return true // NEGOTIATION

  const untilEndMs = validUntilEndOfDayMs(contract)
  if (untilEndMs !== null && untilEndMs < nowMs) return true // MISSING: lapsed

  return false // EXPIRING or VALID — gate passes
}

// ─────────────────────────────────────────────────────────────────────────
// 3) CREW gate — mirror of utils/crewConflicts.ts's detectCrewConflicts
//    (event-id boolean set only — see Pull Gate note 3)
// ─────────────────────────────────────────────────────────────────────────

interface EventWindow {
  start: number
  end: number
}

/** Mirrors crewConflicts.ts's parseEventWindow, using durationMin only (TD-24 — no legacy `duration` string fallback). */
function eventWindowMs(event: SuggestionEventInput): EventWindow | null {
  if (!event.startDateBE || !event.startTimeBE) return null
  const start = beClockToUtc(event.startDateBE, event.startTimeBE).getTime()
  if (Number.isNaN(start)) return null

  // Mirrors effectiveDurationMin's fallback-to-90 (absent/negative) PLUS
  // crewConflicts.ts's own 90-min floor for an explicit zero (a zero-width
  // window can never overlap anything, so placeholder durations must not
  // silently disable conflict detection).
  const raw = event.durationMin
  const durationMin = typeof raw === 'number' && raw >= 0 ? raw : 90
  const durationMs = (durationMin === 0 ? 90 : durationMin) * 60_000

  return { start, end: start + durationMs }
}

/** Mirrors crewConflicts.ts's windowsOverlap. */
function windowsOverlap(a: EventWindow, b: EventWindow): boolean {
  if (a.start === b.start) return true // full
  return a.start < b.end && b.start < a.end // partial
}

/**
 * Event ids that have at least one crew-field name collision (same trimmed,
 * case-insensitive value across two DIFFERENT events' TechPlans) with an
 * overlapping or identical time window — mirrors crewConflicts.ts's
 * detectCrewConflicts pairwise detection (see Pull Gate note 3), collapsed
 * to an event-id boolean set since this gate only needs "does this event's
 * OWN deriveCrewHealth equal CONFLICT", not the full per-field ConflictMap.
 */
export function computeCrewConflictEventIds(
  plans: SuggestionTechPlanInput[],
  events: SuggestionEventInput[],
): Set<number> {
  const eventsById = new Map(events.map((e) => [e.id, e]))
  const byPerson = new Map<string, Array<{ eventId: number; window: EventWindow }>>()

  for (const plan of plans) {
    const crew = plan.crew
    if (!crew || typeof crew !== 'object') continue
    const event = eventsById.get(plan.eventId)
    if (!event) continue
    const window = eventWindowMs(event)
    if (!window) continue

    for (const value of Object.values(crew as Record<string, unknown>)) {
      if (typeof value !== 'string' || !value.trim()) continue
      const name = value.trim().toLowerCase()
      const list = byPerson.get(name) ?? []
      list.push({ eventId: plan.eventId, window })
      byPerson.set(name, list)
    }
  }

  const conflictEventIds = new Set<number>()
  for (const assignments of byPerson.values()) {
    if (assignments.length < 2) continue
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i]
        const b = assignments[j]
        if (a.eventId === b.eventId) continue // same event is not a conflict
        if (!windowsOverlap(a.window, b.window)) continue
        conflictEventIds.add(a.eventId)
        conflictEventIds.add(b.eventId)
      }
    }
  }

  return conflictEventIds
}

// ─────────────────────────────────────────────────────────────────────────
// 4) Ranking — channel load ascending, channelId ascending tie-break
// ─────────────────────────────────────────────────────────────────────────

/**
 * Ranks the full channel universe by ascending load, ties broken by
 * channelId ascending (AC — explicit architect override of a weighted-score
 * default: "No weighted score — simple exclusion + single tie-break only").
 * Event-independent: a candidate's slot time is fixed to the event's OWN
 * start, so the ranking is identical for every event that clears both gates.
 */
export function rankCandidates(
  channels: SuggestionChannelInput[],
  channelLoad: Map<number, number>,
): SuggestionCandidate[] {
  return channels
    .map((c) => ({ channelId: c.id, channelName: c.name, channelLoad: channelLoad.get(c.id) ?? 0 }))
    .sort((a, b) => a.channelLoad - b.channelLoad || a.channelId - b.channelId)
}

// ─────────────────────────────────────────────────────────────────────────
// 5) Orchestration
// ─────────────────────────────────────────────────────────────────────────

export function computeScheduleSuggestions(input: ComputeScheduleSuggestionsInput): ScheduleSuggestionsResponse {
  const { week, now, events, slotsForEvents, techPlans, contracts, channels, channelLoad } = input

  const loadMap = channelLoad instanceof Map
    ? channelLoad
    : new Map(Object.entries(channelLoad).map(([k, v]) => [Number(k), v]))

  const ranked = rankCandidates(channels, loadMap)
  const crewConflictEventIds = computeCrewConflictEventIds(techPlans, events)

  const unplaced: SuggestionUnplacedEvent[] = events
    .filter((event) => isUnplacedEvent(event, slotsForEvents))
    .map((event) => {
      const rightsBad = isEventRightsBad(event.competitionId, contracts, now)
      const crewConflict = crewConflictEventIds.has(event.id)
      // Fresh copies per event — `ranked` is shared across every clean event
      // (see rankCandidates' doc), never aliased into the response.
      const candidates = rightsBad || crewConflict ? [] : ranked.map((c) => ({ ...c }))
      return { eventId: event.id, candidates }
    })

  return { week, unplaced }
}
