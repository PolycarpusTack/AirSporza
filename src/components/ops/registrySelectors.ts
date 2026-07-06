/**
 * Registry record-projection selectors (C-1-T1) — PURE functions, no React, no
 * fetching, no Date.now()/Math.random(). Sibling module to selectors.ts, which
 * stays byte-stable (ops-selectors v3, sibling-module rule / TD-25).
 * Contract: docs/governance/contracts/registry-selectors.md (registry-selectors v1).
 * Consumed by RegistryScreen (C-2), counters/facets (C-2), the inspector (C-3).
 *
 * Scope (amended HYBRID re-gate 2026-07-05): ONE linear index pass projects the
 * four collections into RegistryRecords whose LINKED summaries derive from the
 * C-1-T0 list-payload embeds (Competition._count, Team._count, Player.teamLinks)
 * and the client-derivable sport→competitions adjacency. buildRegistryIndex is
 * O(n) and memoized by the CALLER (useMemo per data change — C-2). The per-entity
 * linked-record LISTS are LAZY (C-3): this module only PINS their fetch plan
 * (linkedRecordListPlan) — it never fetches.
 *
 * TD-25: the linked graph derives from repo relations / list embeds ONLY, never
 * Event.participants (free text). Search/facet stay O(rows) over the index.
 */
import type { Competition, Player, Sport, Team } from '../../data/types'

export type RegistryKind = 'sport' | 'competition' | 'team' | 'player'
export type RegistryFacet = 'all' | RegistryKind

/**
 * Semantic status color token — the COMPONENT maps it to a CSS var (anti-smart-ui;
 * mirrors selectors.ts deriveValidityBand's raw-color-word token contract, never a
 * hex literal). 'neutral' = the design's `decoEnt` grey fallback.
 */
export type RegistryStatusColor = 'green' | 'amber' | 'neutral'

export interface RegistryStatus {
  /** uppercase display word: ACTIVE | INJURED | LOANED | RETIRED */
  word: string
  color: RegistryStatusColor
}

export interface RegistryRecord {
  /** composite `<kind>:<dbId>` (pin 1) — opaque, doubles as the `?record` value */
  id: string
  kind: RegistryKind
  /** the table-native numeric id (ids collide across tables — always pair with kind) */
  dbId: number
  /** display name */
  name: string
  /** sport context label ('' when none resolvable) — searchable */
  sportLabel: string
  /** search detail line (pin 4): player `position #jersey`, team country, comp season, sport federation */
  detail: string
  /** LINKED summary: sport `N competitions`, competition `N teams`, team
   *  `N linked records`, player current-team name or '—' */
  linkedSummary: string
  /** SOURCE code (pin 3): MANUAL | TSDB | API-FB | FB-DATA | <RAW UPPERCASE> */
  source: string
  /** STATUS word + semantic color token */
  status: RegistryStatus
}

/**
 * A projected record that survived the current query/facet filter. Rows ARE
 * records (pin: the filter only selects which records surface as table rows) —
 * kept as a distinct exported name so the C-2/C-3 contract can evolve the row
 * view independently of the stored record if it ever needs to.
 */
export type RegistryRow = RegistryRecord

export interface RegistryIndex {
  /** every record by composite id — the `?record` resolver (unknown id → undefined) */
  byId: Map<string, RegistryRecord>
  /** records grouped by kind, input order preserved within each kind */
  byKind: Record<RegistryKind, RegistryRecord[]>
  /** all records in projection order: sports, competitions, teams, players */
  orderedRecords: RegistryRecord[]
  /** sportId → its competition dbIds — the ONLY adjacency kept (team/player
   *  adjacency DROPPED; those lists are lazy in C-3 per the HYBRID decision) */
  competitionIdsBySportId: Map<number, number[]>
}

export interface RegistryFacetCounts {
  all: number
  sport: number
  competition: number
  team: number
  player: number
}

export interface RegistryToolbarCounts {
  sports: number
  competitions: number
  teams: number
  /** pin 5: the people segment reads `N PLAYERS` — the design's `12 PEOPLE`
   *  assumed person Kinds and is dishonest under AS-5 (no performer/staff kinds). */
  players: number
}

/**
 * externalRefs primary key → display SOURCE code (pin 3). Verified against the
 * import adapters (backend/src/import/adapters/*, import/types.ts): the keys are
 * adapter `sourceCode` constants with UNDERSCORES. The backlog AC's
 * `api-football` / `football-data.org` were MARKETING names, not the real keys —
 * discrepancy recorded in the C-1-T1 hand-off.
 */
const SOURCE_CODE_MAP: Record<string, string> = {
  the_sports_db: 'TSDB',
  api_football: 'API-FB',
  football_data: 'FB-DATA',
}

const MANUAL_SOURCE = 'MANUAL'

/** LINKED placeholder for a player with no resolvable current team. */
const UNATTACHED = '—'

/**
 * STATUS map (verified against backend/src/schemas/players.ts — LOWERCASE enum
 * ['active','injured','loaned','retired']). loaned/retired render their uppercase
 * word in neutral grey (design `decoEnt` fallback).
 */
const STATUS_MAP: Record<string, RegistryStatus> = {
  active: { word: 'ACTIVE', color: 'green' },
  injured: { word: 'INJURED', color: 'amber' },
  loaned: { word: 'LOANED', color: 'neutral' },
  retired: { word: 'RETIRED', color: 'neutral' },
}

/** non-player kinds + unknown/absent player status → active-equivalent (AC; never crash). */
const DEFAULT_STATUS: RegistryStatus = { word: 'ACTIVE', color: 'green' }

/** Composite record id (pin 1) — kind-scoped because numeric ids collide across tables. */
export function makeRecordId(kind: RegistryKind, dbId: number): string {
  return `${kind}:${dbId}`
}

/**
 * SOURCE code from an externalRefs map (pin 3): no keys (null / undefined / {}) →
 * MANUAL; else the FIRST key mapped, unknown key → uppercased raw (never dropped
 * silently). Sports/competitions carry no externalRefs field → always MANUAL
 * (locally seeded — they have no import lineage on their type).
 */
function deriveSource(externalRefs: Record<string, unknown> | undefined): string {
  if (!externalRefs) return MANUAL_SOURCE
  const keys = Object.keys(externalRefs)
  if (keys.length === 0) return MANUAL_SOURCE
  const primary = keys[0]
  return SOURCE_CODE_MAP[primary] ?? primary.toUpperCase()
}

/**
 * STATUS for a player: map the lowercase enum; unknown/absent → active-equivalent
 * (never crashes on an out-of-enum value). Non-player records assign DEFAULT_STATUS
 * inline (they have no status field), so this is only ever called for players.
 */
function derivePlayerStatus(status: string | undefined): RegistryStatus {
  if (!status) return DEFAULT_STATUS
  return STATUS_MAP[status] ?? DEFAULT_STATUS
}

/** Player search detail (pin 4): `position #jersey`, whichever parts are present. */
function playerDetail(player: Player): string {
  const parts: string[] = []
  if (player.position) parts.push(player.position)
  if (player.jerseyNumber != null) parts.push(`#${player.jerseyNumber}`)
  return parts.join(' ')
}

/**
 * Player LINKED summary: the current team's name, or '—' when there is no
 * isCurrent link OR the first link's team is null (unattached athlete /
 * competition startlist). teamLinks is server-filtered to isCurrent (T0).
 */
function currentTeamName(player: Player): string {
  return player.teamLinks?.[0]?.team?.name ?? UNATTACHED
}

/**
 * ONE linear pass over the four collections → the projected RegistryIndex.
 * The sport→competitions adjacency is built FIRST so each sport's LINKED
 * summary reads it; every other summary reads its own T0 embed.
 */
export function buildRegistryIndex(
  sports: Sport[],
  competitions: Competition[],
  teams: Team[],
  players: Player[],
): RegistryIndex {
  const sportNameById = new Map<number, string>()
  for (const sport of sports) sportNameById.set(sport.id, sport.name)

  const competitionIdsBySportId = new Map<number, number[]>()
  for (const competition of competitions) {
    const bucket = competitionIdsBySportId.get(competition.sportId)
    if (bucket) bucket.push(competition.id)
    else competitionIdsBySportId.set(competition.sportId, [competition.id])
  }

  const resolveSportLabel = (
    embed: { name: string } | null | undefined,
    sportId: number | null | undefined,
  ): string => embed?.name ?? (sportId != null ? sportNameById.get(sportId) ?? '' : '')

  const sportRecords: RegistryRecord[] = sports.map((sport) => ({
    id: makeRecordId('sport', sport.id),
    kind: 'sport',
    dbId: sport.id,
    name: sport.name,
    sportLabel: sport.name,
    detail: sport.federation ?? '',
    linkedSummary: `${competitionIdsBySportId.get(sport.id)?.length ?? 0} competitions`,
    source: MANUAL_SOURCE,
    status: DEFAULT_STATUS,
  }))

  const competitionRecords: RegistryRecord[] = competitions.map((competition) => ({
    id: makeRecordId('competition', competition.id),
    kind: 'competition',
    dbId: competition.id,
    name: competition.name,
    sportLabel: sportNameById.get(competition.sportId) ?? '',
    detail: competition.season ?? '',
    linkedSummary: `${competition._count?.teamLinks ?? 0} teams`,
    source: MANUAL_SOURCE,
    status: DEFAULT_STATUS,
  }))

  const teamRecords: RegistryRecord[] = teams.map((team) => ({
    id: makeRecordId('team', team.id),
    kind: 'team',
    dbId: team.id,
    name: team.name,
    sportLabel: resolveSportLabel(team.sport, team.sportId),
    detail: team.country ?? '',
    linkedSummary: `${(team._count?.competitionLinks ?? 0) + (team._count?.playerLinks ?? 0)} linked records`,
    source: deriveSource(team.externalRefs),
    status: DEFAULT_STATUS,
  }))

  const playerRecords: RegistryRecord[] = players.map((player) => ({
    id: makeRecordId('player', player.id),
    kind: 'player',
    dbId: player.id,
    name: player.fullName,
    sportLabel: resolveSportLabel(player.sport, player.sportId),
    detail: playerDetail(player),
    linkedSummary: currentTeamName(player),
    source: deriveSource(player.externalRefs),
    status: derivePlayerStatus(player.status),
  }))

  const orderedRecords = [...sportRecords, ...competitionRecords, ...teamRecords, ...playerRecords]
  const byId = new Map(orderedRecords.map((record) => [record.id, record]))
  const byKind: Record<RegistryKind, RegistryRecord[]> = {
    sport: sportRecords,
    competition: competitionRecords,
    team: teamRecords,
    player: playerRecords,
  }

  return { byId, byKind, orderedRecords, competitionIdsBySportId }
}

/** case-insensitive substring over name + sport label + detail (pin 4). */
function matchesQuery(record: RegistryRecord, lowerQuery: string): boolean {
  return `${record.name}\n${record.sportLabel}\n${record.detail}`.toLowerCase().includes(lowerQuery)
}

/**
 * Projects the index into table rows. Filtering composes AND: the facet narrows
 * to a kind (or the whole universe for 'all'), the query is a case-insensitive
 * substring over name / sport label / detail. O(rows). An empty/whitespace query
 * returns the facet base by reference (no allocation on the common no-search path).
 */
export function projectRegistryRows(
  index: RegistryIndex,
  filters: { query?: string; facet?: RegistryFacet } = {},
): RegistryRow[] {
  const facet = filters.facet ?? 'all'
  const base = facet === 'all' ? index.orderedRecords : index.byKind[facet]
  const query = filters.query?.trim().toLowerCase()
  if (!query) return base
  return base.filter((record) => matchesQuery(record, query))
}

/**
 * The record's LINKED summary (SYNC, from the T0 embeds). Unknown/malformed id →
 * empty string (quiet no-selection, ops-selection rule 5).
 */
export function linkedSummaryOf(index: RegistryIndex, recordId: string): string {
  return index.byId.get(recordId)?.linkedSummary ?? ''
}

/** Per-facet counts — ALWAYS the unfiltered universe (A-3 precedent). */
export function registryFacetCounts(index: RegistryIndex): RegistryFacetCounts {
  return {
    all: index.orderedRecords.length,
    sport: index.byKind.sport.length,
    competition: index.byKind.competition.length,
    team: index.byKind.team.length,
    player: index.byKind.player.length,
  }
}

/** Toolbar counters — real counts; the people segment is `N PLAYERS` (pin 5). */
export function registryToolbarCounts(index: RegistryIndex): RegistryToolbarCounts {
  return {
    sports: index.byKind.sport.length,
    competitions: index.byKind.competition.length,
    teams: index.byKind.team.length,
    players: index.byKind.player.length,
  }
}

/** A pinned lazy linked-record LIST fetch plan (C-3 consumes; NOT fetched here). */
export interface LinkedRecordFetchPlan {
  /** relation label for the inspector's linked-records section */
  relation: 'teams' | 'competitions' | 'players'
  /** API path relative to the ops api base (never fetched here) */
  path: string
}

/**
 * The LAZY per-selection linked-record LIST plan (HYBRID pin). ONE call per
 * relation on selection — C-3's `linkedRecordsOf` async surface consumes this;
 * this module pins the endpoints and never fetches:
 *   competition → its teams          GET /teams?competitionId=<id>
 *   team        → its competitions   GET /teams/<id>/competitions
 *   team        → its players        GET /players?teamId=<id>
 *   player      → its teams          GET /players/<id>/teams
 * sport → competitions is CLIENT-DERIVABLE from index.competitionIdsBySportId
 * (pin 7) → returns [] (no fetch).
 */
export function linkedRecordListPlan(kind: RegistryKind, dbId: number): LinkedRecordFetchPlan[] {
  switch (kind) {
    case 'sport':
      return []
    case 'competition':
      return [{ relation: 'teams', path: `/teams?competitionId=${dbId}` }]
    case 'team':
      return [
        { relation: 'competitions', path: `/teams/${dbId}/competitions` },
        { relation: 'players', path: `/players?teamId=${dbId}` },
      ]
    case 'player':
      return [{ relation: 'teams', path: `/players/${dbId}/teams` }]
  }
}
