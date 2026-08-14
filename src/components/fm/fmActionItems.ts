/**
 * FM Home action-item derivation (Story FM1-3, FM1-3-T1). PURE function, no
 * React, no fetching, no Date.now() — same anti-smart-ui convention as
 * ops/selectors.ts. Contract: `fmActionItems v1` (see Contract Snapshot in the
 * FM1-3-T1 hand-off).
 *
 * Composes FOUR existing ops-selectors v3 predicates (CONFLICT via
 * deriveCrewHealth, RIGHTS via deriveRightsStatus — the AS-4 90-day formula
 * reused VERBATIM, never re-derived — and CREW via deriveCrewRoles) plus ONE
 * genuinely new predicate (UNPLACED). FEED items are a straight map over
 * already-fetched, already-filtered ripple proposals — read-only in FM-1, no
 * accept/reject (that's EPIC FM-2's Cascade banner).
 *
 * PULL GATE — signature drift found and resolved (flag this in review):
 * the backlog's literal signature is
 *   deriveActionItems(events, contracts, techPlans, conflicts, rippleProposals, now)
 * but ops-selectors v3's deriveCrewHealth/deriveCrewRoles both REQUIRE a
 * `crewFields: FieldConfig[]` argument (AppProvider-sourced, never hard-coded —
 * see selectors.ts), and the UNPLACED predicate needs BroadcastSlot data that
 * no frontend Event field carries (Event has no embedded `slots[]`). Neither
 * was in the literal 6-arg list. Resolved pragmatically by APPENDING two extra
 * params (`crewFields`, `broadcastSlots`) rather than inventing a channelId
 * substitute or reimplementing the crew-required-role logic locally — the
 * six backlog params keep their literal order and meaning; nothing here
 * re-derives what ops-selectors already owns.
 * (`Event.channelId` itself needed NO substitute: it's a real, non-deprecated
 * frontend field — confirmed against both src/data/types.ts and the Prisma
 * `Event.channelId Int?` column — so the UNPLACED predicate's "no channelId"
 * half is exactly as literal as the backlog described.)
 *
 * TD-24 compliance: only channelId / durationMin / *Id fields are read here —
 * never Event.linearChannel or the other @deprecated aliases.
 *
 * Item order: for each event (input order) — CONFLICT, RIGHTS (first
 * occurrence per competitionId), UNPLACED, then CREW rows in deriveCrewRoles
 * order; FEED items are appended last, in rippleProposals input order. This
 * ordering is deterministic but not itself part of the AC — Home (FM1-4) is
 * free to re-sort/group by kind.
 */
import type { BroadcastSlot, Contract, Event, FieldConfig, TechPlan } from '../../data/types'
import type { ConflictMap } from '../../utils/crewConflicts'
import { deriveCrewHealth, deriveCrewRoles, deriveRightsStatus, type CrewRoleRow } from '../ops/selectors'
import { makeRecordId } from '../ops/registrySelectors'

export type ActionItemKind = 'CONFLICT' | 'RIGHTS' | 'UNPLACED' | 'CREW' | 'FEED'

export interface ActionItem {
  kind: ActionItemKind
  key: string
  title: string
  sub: string
  targetRoute: string
  targetParams: Record<string, string>
}

/**
 * Frontend mirror of the `GET /api/ripple-proposals?status=PENDING` row shape
 * (ripple v1, SV-2 — Prisma `RippleProposal`). The caller fetches and filters
 * (e.g. `?status=PENDING`) BEFORE calling this module; `beforeSlots`/`preview`
 * are untyped JSON here because no selector in this module reads them.
 */
export interface RippleProposal {
  id: string
  tenantId: string
  eventId: number
  source: string
  sourceChangeId: string
  status: string
  beforeSlots: unknown
  preview: unknown
  confidence: number | null
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  rationale: string | null
}

/** Display name for a ConflictMap hit — mirrors groupConflictsByPerson's own first-letter capitalization (crewConflicts.ts). */
function displayPersonName(rawName: string): string {
  return rawName.charAt(0).toUpperCase() + rawName.slice(1)
}

/** Unique display names of everyone this event's crew clashes with (both severities), in first-seen order. */
function conflictingPersons(event: Event, techPlans: TechPlan[], conflicts: ConflictMap): string[] {
  const names = new Set<string>()
  for (const plan of techPlans.filter((p) => p.eventId === event.id)) {
    const crew = (plan.crew ?? {}) as Record<string, unknown>
    for (const fieldId of Object.keys(crew)) {
      for (const hit of conflicts.get(`${plan.id}:${fieldId}`) ?? []) {
        names.add(displayPersonName(hit.personName))
      }
    }
  }
  return [...names]
}

function conflictItem(event: Event, techPlans: TechPlan[], conflicts: ConflictMap): ActionItem {
  const persons = conflictingPersons(event, techPlans, conflicts)
  return {
    kind: 'CONFLICT',
    key: `CONFLICT:event:${event.id}`,
    title: `Crew conflict — ${event.participants}`,
    sub: persons.length > 0 ? `${persons.join(', ')} double-booked this week` : 'Crew conflict detected',
    targetRoute: '/ops/schedule',
    targetParams: { event: String(event.id) },
  }
}

function rightsItem(event: Event, status: 'EXPIRING' | 'MISSING', events: Event[]): ActionItem {
  const competitionId = event.competitionId
  const competitionName = event.competition?.name ?? `COMPETITION #${competitionId}`
  const affected = events.filter((e) => e.competitionId === competitionId).length
  return {
    kind: 'RIGHTS',
    key: `RIGHTS:competition:${competitionId}`,
    title: `Rights ${status === 'EXPIRING' ? 'expiring' : 'missing'}: ${competitionName}`,
    sub: `${affected} event${affected === 1 ? '' : 's'} this week`,
    // KNOWN GAP for FM1-4/FM1-5 (orchestrator note, 2026-08-14): `/ops/rights`
    // is a real OPS_TABS id (lands on a real screen, never a 404 — satisfies
    // FM1-2's placeholder/never-crash AC), but RightsScreen.tsx does not
    // currently read `?record=` at all (only RegistryScreen consumes
    // useOpsRecord) — so this CTA will NOT visually preselect the competition
    // yet, unlike CONFLICT/CREW/UNPLACED's `?event=` (consumed by both
    // Schedule and Planner via the shared useOpsSelection). Wiring
    // RightsScreen to read+scroll-to `?record` is FEATURE work belonging to
    // whichever task builds the actual CTA (FM1-4/FM1-5), not this pure
    // selector — tracked here rather than silently assumed to work.
    targetRoute: '/ops/rights',
    targetParams: { record: makeRecordId('competition', competitionId) },
  }
}

/**
 * The one new predicate (FM1-3 AC): narrower than "no slot" alone — a
 * channelId-only event with no slot is the DIFFERENT, less-urgent case the
 * Ops Rundown screen's UNASSIGNED lane already surfaces (not conflated here).
 */
function isUnplaced(event: Event, broadcastSlots: BroadcastSlot[]): boolean {
  const hasChannel = event.channelId != null
  const hasSlot = broadcastSlots.some((slot) => slot.eventId === event.id)
  return !hasChannel && !hasSlot
}

function unplacedItem(event: Event): ActionItem {
  return {
    kind: 'UNPLACED',
    key: `UNPLACED:event:${event.id}`,
    title: `Unplaced: ${event.participants}`,
    sub: 'No channel or broadcast slot assigned',
    // OPS_TABS (OpsShell.tsx) has no "rundown" id — the day-timeline screen's
    // real tab id is "planner" (glossary name "Rundown", component RundownScreen;
    // ADR-014's public URL contract keeps the "planner" id). `?event=` is the
    // shared Schedule/Rundown selection param (opsUrlState.ts).
    targetRoute: '/ops/planner',
    targetParams: { event: String(event.id) },
  }
}

function crewItem(event: Event, row: CrewRoleRow): ActionItem {
  return {
    kind: 'CREW',
    key: `CREW:event:${event.id}:role:${row.fieldId}`,
    title: `Open role: ${row.label}`,
    sub: event.participants,
    targetRoute: '/ops/schedule',
    targetParams: { event: String(event.id) },
  }
}

function feedItem(event: Event, proposal: RippleProposal): ActionItem {
  return {
    kind: 'FEED',
    key: `FEED:proposal:${proposal.id}`,
    title: 'Feed change proposed',
    sub: event.participants,
    targetRoute: '/ops/schedule',
    targetParams: { event: String(event.id) },
  }
}

/**
 * Derives every open-risk action item across `events` (assumed already
 * scoped to the visible week by the caller — this module does no fetching
 * and no week-filtering of its own, matching ops/selectors.ts's convention).
 * See the module header for the `crewFields`/`broadcastSlots` Pull Gate note.
 */
export function deriveActionItems(
  events: Event[],
  contracts: Contract[],
  techPlans: TechPlan[],
  conflicts: ConflictMap,
  rippleProposals: RippleProposal[] | undefined,
  now: Date,
  crewFields: FieldConfig[],
  broadcastSlots: BroadcastSlot[],
): ActionItem[] {
  const items: ActionItem[] = []
  const seenCompetitions = new Set<number>()

  for (const event of events) {
    if (deriveCrewHealth(event, techPlans, conflicts, crewFields) === 'CONFLICT') {
      items.push(conflictItem(event, techPlans, conflicts))
    }

    if (!seenCompetitions.has(event.competitionId)) {
      seenCompetitions.add(event.competitionId)
      const status = deriveRightsStatus(event, contracts, now)
      if (status === 'EXPIRING' || status === 'MISSING') {
        items.push(rightsItem(event, status, events))
      }
    }

    if (isUnplaced(event, broadcastSlots)) {
      items.push(unplacedItem(event))
    }

    for (const row of deriveCrewRoles(event, techPlans, conflicts, crewFields)) {
      if (row.state === 'OPEN') items.push(crewItem(event, row))
    }
  }

  for (const proposal of rippleProposals ?? []) {
    const event = events.find((e) => e.id === proposal.eventId)
    if (event) items.push(feedItem(event, proposal))
  }

  return items
}
