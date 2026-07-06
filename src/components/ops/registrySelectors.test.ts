/**
 * Permutation tests for the Registry record-projection selectors (C-1-T1).
 * Contract: docs/governance/contracts/registry-selectors.md (registry-selectors v1).
 *
 * These rows PIN the amended-HYBRID C-1 pins written to be testable:
 *   pin 1 composite ids · pin 3 SOURCE predicate (UNDERSCORE adapter keys, verified
 *   against backend/src/import/adapters) · pin 4 search detail · STATUS color map
 *   (backend/src/schemas/players.ts enum) · pin 5 counters · pin 7 index-once +
 *   perf probe · the T0 list-payload embeds (Competition._count, Team._count,
 *   Player.teamLinks) that stand in for the API here.
 *
 * No Date.now()/Math.random() (repo rule); the perf probe uses performance.now()
 * (wall clock, not a data seam) and index-derived synthetic data.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { Competition, Player, Sport, Team } from '../../data/types'
import {
  FIXTURE_COMPETITIONS,
  FIXTURE_PLAYERS,
  FIXTURE_SPORTS,
  FIXTURE_TEAMS,
  makeCompetition,
  makePlayer,
  makeTeam,
} from './__fixtures__/opsFixtureWeek'
import type { PlayerTeamLink, TeamCompetitionLink } from '../../services'
import {
  buildRegistryIndex,
  linkedRecordListPlan,
  linkedRecordsOf,
  linkedSummaryOf,
  makeRecordId,
  projectRegistryRows,
  registryFacetCounts,
  registryToolbarCounts,
  type LinkedRecordSection,
  type RegistryKind,
  type RegistryRecord,
} from './registrySelectors'

/** Full fixture index — the shared record universe for the structural suites. */
const fullIndex = () =>
  buildRegistryIndex(FIXTURE_SPORTS, FIXTURE_COMPETITIONS, FIXTURE_TEAMS, FIXTURE_PLAYERS)

/** Single-record projections for the SOURCE/STATUS/LINKED/detail permutation tables. */
const teamRecord = (overrides: Partial<Team>): RegistryRecord =>
  buildRegistryIndex([], [], [makeTeam({ id: 1, ...overrides })], []).orderedRecords[0]
const playerRecord = (overrides: Partial<Player>): RegistryRecord =>
  buildRegistryIndex([], [], [], [makePlayer({ id: 1, ...overrides })]).orderedRecords[0]
const competitionRecord = (overrides: Partial<Competition>): RegistryRecord =>
  buildRegistryIndex([], [makeCompetition({ id: 1, ...overrides })], [], []).orderedRecords[0]

describe('makeRecordId — composite ids (pin 1)', () => {
  it.each<{ kind: RegistryKind; dbId: number; expected: string }>([
    { kind: 'sport', dbId: 5, expected: 'sport:5' },
    { kind: 'competition', dbId: 101, expected: 'competition:101' },
    { kind: 'team', dbId: 1, expected: 'team:1' },
    { kind: 'player', dbId: 42, expected: 'player:42' },
  ])('$kind #$dbId → $expected', ({ kind, dbId, expected }) => {
    expect(makeRecordId(kind, dbId)).toBe(expected)
  })

  it('kind-scopes ids so colliding numeric ids across tables stay distinct', () => {
    const index = buildRegistryIndex(
      [{ id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' }],
      [makeCompetition({ id: 1 })],
      [makeTeam({ id: 1 })],
      [makePlayer({ id: 1 })],
    )
    expect([...index.byId.keys()].sort()).toEqual(['competition:1', 'player:1', 'sport:1', 'team:1'])
    expect(index.orderedRecords).toHaveLength(4)
  })
})

describe('buildRegistryIndex — one-pass structure (pin 7)', () => {
  it('projects every entity into orderedRecords (sports, competitions, teams, players)', () => {
    const index = fullIndex()
    expect(index.orderedRecords).toHaveLength(
      FIXTURE_SPORTS.length + FIXTURE_COMPETITIONS.length + FIXTURE_TEAMS.length + FIXTURE_PLAYERS.length,
    )
    // projection order is grouped by kind
    expect(index.orderedRecords.slice(0, FIXTURE_SPORTS.length).every((r) => r.kind === 'sport')).toBe(true)
    expect(index.orderedRecords.at(-1)?.kind).toBe('player')
  })

  it('groups records by kind, input order preserved within each kind', () => {
    const index = fullIndex()
    expect(index.byKind.sport.map((r) => r.dbId)).toEqual(FIXTURE_SPORTS.map((s) => s.id))
    expect(index.byKind.player.map((r) => r.name)).toEqual(FIXTURE_PLAYERS.map((p) => p.fullName))
  })

  it('resolves records by composite id, unknown id → undefined (quiet no-selection)', () => {
    const index = fullIndex()
    expect(index.byId.get('player:1')?.name).toBe('Jonas Vale')
    expect(index.byId.get('team:999')).toBeUndefined()
    expect(index.byId.get('not-a-valid-id')).toBeUndefined()
  })

  it('keeps the sport→competitions adjacency ONLY (team/player adjacency dropped)', () => {
    const index = fullIndex()
    // sport 1 owns competitions 101, 103, 108 (FIXTURE_COMPETITIONS sportId 1)
    expect(index.competitionIdsBySportId.get(1)).toEqual([101, 103, 108])
    // sport 4 owns exactly one (105)
    expect(index.competitionIdsBySportId.get(4)).toEqual([105])
    expect('teamPlayers' in index).toBe(false)
  })
})

describe('SOURCE predicate (pin 3) — UNDERSCORE adapter keys, first-key-wins', () => {
  it.each<{ row: string; externalRefs: Record<string, unknown> | undefined; expected: string }>([
    { row: 'undefined externalRefs → MANUAL', externalRefs: undefined, expected: 'MANUAL' },
    { row: 'empty {} (manual create default) → MANUAL', externalRefs: {}, expected: 'MANUAL' },
    { row: 'the_sports_db → TSDB', externalRefs: { the_sports_db: 'x' }, expected: 'TSDB' },
    { row: 'api_football → API-FB', externalRefs: { api_football: 'x' }, expected: 'API-FB' },
    { row: 'football_data → FB-DATA', externalRefs: { football_data: 'x' }, expected: 'FB-DATA' },
    { row: 'unknown key → uppercased raw, never dropped', externalRefs: { opta: 'x' }, expected: 'OPTA' },
    { row: 'unknown underscore key → uppercased raw verbatim', externalRefs: { statsbomb_open: 'x' }, expected: 'STATSBOMB_OPEN' },
    { row: 'multi-key: FIRST key is the primary source', externalRefs: { api_football: 'a', football_data: 'b' }, expected: 'API-FB' },
  ])('$row', ({ externalRefs, expected }) => {
    expect(teamRecord({ externalRefs }).source).toBe(expected)
  })

  it('sports + competitions have no import lineage field → always MANUAL', () => {
    expect(competitionRecord({}).source).toBe('MANUAL')
    expect(buildRegistryIndex(FIXTURE_SPORTS, [], [], []).orderedRecords[0].source).toBe('MANUAL')
  })
})

describe('STATUS word + semantic color token (players)', () => {
  it.each<{ status: string | undefined; word: string; color: string }>([
    { status: 'active', word: 'ACTIVE', color: 'green' },
    { status: 'injured', word: 'INJURED', color: 'amber' },
    { status: 'loaned', word: 'LOANED', color: 'neutral' },
    { status: 'retired', word: 'RETIRED', color: 'neutral' },
    { status: undefined, word: 'ACTIVE', color: 'green' }, // absent → active-equivalent
    { status: 'suspended', word: 'ACTIVE', color: 'green' }, // unknown enum → active-equivalent, never crash
  ])('status "$status" → $word/$color', ({ status, word, color }) => {
    const record = playerRecord({ status })
    expect(record.status.word).toBe(word)
    expect(record.status.color).toBe(color)
  })

  it('non-player kinds → ACTIVE green (per AC)', () => {
    expect(teamRecord({}).status).toEqual({ word: 'ACTIVE', color: 'green' })
    expect(competitionRecord({}).status).toEqual({ word: 'ACTIVE', color: 'green' })
    expect(buildRegistryIndex(FIXTURE_SPORTS, [], [], []).orderedRecords[0].status).toEqual({ word: 'ACTIVE', color: 'green' })
  })

  it('color is a semantic token, never a hex literal (anti-smart-ui)', () => {
    expect(playerRecord({ status: 'injured' }).status.color).not.toMatch(/^#/)
  })
})

describe('LINKED summary (from T0 embeds + client adjacency)', () => {
  it('sport → `N competitions` from the sport→competitions adjacency', () => {
    const index = fullIndex()
    // sport 1 → 3 competitions (101, 103, 108); sport 4 → 1
    expect(index.byId.get('sport:1')?.linkedSummary).toBe('3 competitions')
    expect(index.byId.get('sport:4')?.linkedSummary).toBe('1 competitions')
    // sport 6 exists nowhere in FIXTURE_COMPETITIONS
    expect(buildRegistryIndex([{ id: 6, name: 'Swimming', icon: '🏊', federation: 'FINA' }], [], [], []).orderedRecords[0].linkedSummary).toBe('0 competitions')
  })

  it.each<{ row: string; teamLinks: number | undefined; expected: string }>([
    { row: 'competition with 3 team links → `3 teams`', teamLinks: 3, expected: '3 teams' },
    { row: 'competition with 0 team links → `0 teams`', teamLinks: 0, expected: '0 teams' },
    { row: 'competition with absent _count → `0 teams`', teamLinks: undefined, expected: '0 teams' },
  ])('$row', ({ teamLinks, expected }) => {
    const overrides = teamLinks === undefined ? {} : { _count: { events: 0, teamLinks } }
    expect(competitionRecord(overrides).linkedSummary).toBe(expected)
  })

  it.each<{ row: string; count: { competitionLinks: number; playerLinks: number } | undefined; expected: string }>([
    { row: 'team competitionLinks + playerLinks summed', count: { competitionLinks: 2, playerLinks: 3 }, expected: '5 linked records' },
    { row: 'team with only competition links', count: { competitionLinks: 1, playerLinks: 0 }, expected: '1 linked records' },
    { row: 'team with absent _count → 0', count: undefined, expected: '0 linked records' },
  ])('$row', ({ count, expected }) => {
    const overrides = count === undefined ? {} : { _count: count }
    expect(teamRecord(overrides).linkedSummary).toBe(expected)
  })

  it.each<{ row: string; teamLinks: Player['teamLinks']; expected: string }>([
    { row: 'attached → current team name', teamLinks: [{ team: { id: 1, name: 'Riverside United' } }], expected: 'Riverside United' },
    { row: 'isCurrent link but team NULL (competition startlist) → —', teamLinks: [{ team: null }], expected: '—' },
    { row: 'no current link (empty) → —', teamLinks: [], expected: '—' },
    { row: 'absent teamLinks → —', teamLinks: undefined, expected: '—' },
    { row: 'first entry wins when multiple present', teamLinks: [{ team: { id: 2, name: 'Coastal Rovers' } }, { team: { id: 3, name: 'Mountain Athletic' } }], expected: 'Coastal Rovers' },
  ])('player $row', ({ teamLinks, expected }) => {
    expect(playerRecord({ teamLinks }).linkedSummary).toBe(expected)
  })

  it('the fixture universe wires the summaries end-to-end', () => {
    const index = fullIndex()
    expect(index.byId.get('team:1')?.linkedSummary).toBe('5 linked records')
    expect(index.byId.get('player:4')?.linkedSummary).toBe('—') // unattached (team null)
    expect(index.byId.get('player:5')?.linkedSummary).toBe('—') // unattached (no link)
    expect(index.byId.get('player:1')?.linkedSummary).toBe('Riverside United')
  })
})

describe('linkedSummaryOf — sync lookup (unknown id → nothing)', () => {
  it('returns the stored LINKED summary for a known id', () => {
    const index = fullIndex()
    expect(linkedSummaryOf(index, 'team:1')).toBe('5 linked records')
    expect(linkedSummaryOf(index, 'sport:1')).toBe('3 competitions')
  })

  it('unknown/malformed id → empty string (quiet no-selection)', () => {
    const index = fullIndex()
    expect(linkedSummaryOf(index, 'player:9999')).toBe('')
    expect(linkedSummaryOf(index, 'garbage')).toBe('')
  })
})

describe('search detail line (pin 4)', () => {
  it('player: position + #jersey', () => {
    expect(playerRecord({ position: 'Goalkeeper', jerseyNumber: 1 }).detail).toBe('Goalkeeper #1')
  })
  it('player: position only when no jersey', () => {
    expect(playerRecord({ position: 'Sprinter', jerseyNumber: null }).detail).toBe('Sprinter')
  })
  it('player: #jersey only when no position', () => {
    expect(playerRecord({ position: null, jerseyNumber: 7 }).detail).toBe('#7')
  })
  it('player: empty when neither', () => {
    expect(playerRecord({ position: null, jerseyNumber: null }).detail).toBe('')
  })
  it('team: country', () => {
    expect(teamRecord({ country: 'Belgium' }).detail).toBe('Belgium')
    expect(teamRecord({ country: undefined }).detail).toBe('')
  })
  it('competition: season', () => {
    expect(competitionRecord({ season: '2026' }).detail).toBe('2026')
  })
  it('sport: federation', () => {
    expect(buildRegistryIndex([{ id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' }], [], [], []).orderedRecords[0].detail).toBe('FIFA')
  })
})

describe('sportLabel resolution', () => {
  it('sport → its own name', () => {
    expect(buildRegistryIndex(FIXTURE_SPORTS, [], [], []).byId.get('sport:2')?.sportLabel).toBe('Tennis')
  })
  it('team/player prefer the embedded sport, fall back to the sports lookup', () => {
    const index = fullIndex()
    expect(index.byId.get('team:2')?.sportLabel).toBe('Football') // embedded sport
    expect(index.byId.get('team:1')?.sportLabel).toBe('Football') // NO embed → lookup by sportId 1
    expect(index.byId.get('player:1')?.sportLabel).toBe('Football') // NO embed → lookup
    expect(index.byId.get('player:5')?.sportLabel).toBe('Cycling') // embedded sport (id 3)
  })
  it('unresolvable sport → empty label (never crash)', () => {
    expect(buildRegistryIndex([], [], [makeTeam({ id: 1, sportId: 999, sport: null })], []).orderedRecords[0].sportLabel).toBe('')
  })
})

describe('projectRegistryRows — query × facet compose AND, O(rows)', () => {
  it('no query, no facet → the whole universe in order', () => {
    const index = fullIndex()
    expect(projectRegistryRows(index)).toBe(index.orderedRecords)
    expect(projectRegistryRows(index, {})).toHaveLength(index.orderedRecords.length)
  })

  it('facet narrows to a single kind (unfiltered by query)', () => {
    const index = fullIndex()
    const rows = projectRegistryRows(index, { facet: 'player' })
    expect(rows).toHaveLength(FIXTURE_PLAYERS.length)
    expect(rows.every((r) => r.kind === 'player')).toBe(true)
  })

  it('query is a case-insensitive substring over name', () => {
    const index = fullIndex()
    const rows = projectRegistryRows(index, { query: 'riverside' })
    expect(rows.map((r) => r.id)).toContain('team:1')
    expect(rows.every((r) => `${r.name} ${r.sportLabel} ${r.detail}`.toLowerCase().includes('riverside'))).toBe(true)
  })

  it('query matches the sport label', () => {
    const index = fullIndex()
    const rows = projectRegistryRows(index, { query: 'cycling' })
    // sport 3 name + every Cycling-sport competition/team/player
    expect(rows.some((r) => r.kind === 'player' && r.name === 'Neels Braam')).toBe(true)
  })

  it('query matches the detail line (player position)', () => {
    const index = fullIndex()
    const rows = projectRegistryRows(index, { query: 'goalkeeper' })
    expect(rows.map((r) => r.id)).toEqual(['player:1'])
  })

  it('query + facet compose AND', () => {
    const index = fullIndex()
    const rows = projectRegistryRows(index, { query: 'a', facet: 'team' })
    expect(rows.every((r) => r.kind === 'team')).toBe(true)
    expect(rows.map((r) => r.name)).toContain('Mountain Athletic')
    expect(rows.map((r) => r.name)).not.toContain('Jonas Vale')
  })

  it('zero matches → empty array (search/facet preserved by the caller)', () => {
    const index = fullIndex()
    expect(projectRegistryRows(index, { query: 'zzzznomatch' })).toEqual([])
  })

  it('whitespace-only query is treated as empty', () => {
    const index = fullIndex()
    expect(projectRegistryRows(index, { query: '   ' })).toHaveLength(index.orderedRecords.length)
  })
})

describe('registryFacetCounts — ALWAYS the unfiltered universe (A-3 precedent)', () => {
  it('counts per facet + all', () => {
    const index = fullIndex()
    expect(registryFacetCounts(index)).toEqual({
      all: index.orderedRecords.length,
      sport: FIXTURE_SPORTS.length,
      competition: FIXTURE_COMPETITIONS.length,
      team: FIXTURE_TEAMS.length,
      player: FIXTURE_PLAYERS.length,
    })
  })
})

describe('registryToolbarCounts — real counts, people segment reads N PLAYERS (pin 5)', () => {
  it('exposes sports/competitions/teams/players — no dishonest PEOPLE segment', () => {
    const index = fullIndex()
    const counters = registryToolbarCounts(index)
    expect(counters).toEqual({
      sports: FIXTURE_SPORTS.length,
      competitions: FIXTURE_COMPETITIONS.length,
      teams: FIXTURE_TEAMS.length,
      players: FIXTURE_PLAYERS.length,
    })
    expect('people' in counters).toBe(false)
  })
})

describe('linkedRecordListPlan — LAZY per-selection fetch plan (pinned for C-3, NOT fetched)', () => {
  it('sport → [] (client-derivable from competitionIdsBySportId, no fetch)', () => {
    expect(linkedRecordListPlan('sport', 1)).toEqual([])
  })
  it('competition → its teams', () => {
    expect(linkedRecordListPlan('competition', 101)).toEqual([{ relation: 'teams', path: '/teams?competitionId=101' }])
  })
  it('team → its competitions AND its players (two endpoints)', () => {
    expect(linkedRecordListPlan('team', 1)).toEqual([
      { relation: 'competitions', path: '/teams/1/competitions' },
      { relation: 'players', path: '/players?teamId=1' },
    ])
  })
  it('player → its teams', () => {
    expect(linkedRecordListPlan('player', 42)).toEqual([{ relation: 'teams', path: '/players/42/teams' }])
  })
})

describe('perf probe (pin 7) — build + project over 2,000 records is linear', () => {
  const STATUSES = ['active', 'injured', 'loaned', 'retired'] as const

  it('builds the index and runs a projection pass within a generous wall-clock bound', () => {
    const COUNT = 500 // × 4 kinds = 2,000 records
    const sports: Sport[] = Array.from({ length: COUNT }, (_, i) => ({
      id: i + 1,
      name: `Sport ${i}`,
      icon: 'x',
      federation: `Fed ${i}`,
    }))
    const competitions: Competition[] = Array.from({ length: COUNT }, (_, i) =>
      makeCompetition({ id: i + 1, sportId: (i % COUNT) + 1, _count: { events: 0, teamLinks: i % 5 } }),
    )
    const teams: Team[] = Array.from({ length: COUNT }, (_, i) =>
      makeTeam({
        id: i + 1,
        name: `Team ${i}`,
        externalRefs: i % 2 === 0 ? {} : { the_sports_db: `t-${i}` },
        _count: { competitionLinks: i % 3, playerLinks: i % 4 },
      }),
    )
    const players: Player[] = Array.from({ length: COUNT }, (_, i) =>
      makePlayer({
        id: i + 1,
        fullName: `Player ${i}`,
        status: STATUSES[i % 4],
        teamLinks: i % 2 === 0 ? [{ team: { id: i, name: `Team ${i}` } }] : [{ team: null }],
      }),
    )

    const start = performance.now()
    const index = buildRegistryIndex(sports, competitions, teams, players)
    const rows = projectRegistryRows(index, { query: 'player 1' })
    const elapsed = performance.now() - start

    expect(index.orderedRecords).toHaveLength(COUNT * 4)
    expect(rows.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500) // generous — pins linearity, NOT the E-1 SLO
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * registry-selectors v1.1 (C-3-T0) — ADDITIVE: notes/country display fields +
 * the linkedRecordsOf hop resolver. v1 surface (above) stays byte-stable.
 * ──────────────────────────────────────────────────────────────────────── */

describe('v1.1 — notes + split country/countryCode display fields (additive)', () => {
  it('team → notes + country NAME (countryCode null); detail stays byte-stable (country still searchable)', () => {
    const index = fullIndex()
    const team1 = index.byId.get('team:1')! // Riverside United (notes + Belgium)
    expect(team1.notes).toBe('Promoted from the second division')
    expect(team1.country).toBe('Belgium')
    expect(team1.countryCode).toBeNull() // teams carry a name, never an ISO code
    expect(team1.detail).toBe('Belgium') // UNCHANGED — country still folded into the search string
  })

  it('team → null notes but present country; countryCode still null', () => {
    const index = fullIndex()
    const team2 = index.byId.get('team:2')! // Coastal Rovers — no notes, Netherlands
    expect(team2.notes).toBeNull()
    expect(team2.country).toBe('Netherlands')
    expect(team2.countryCode).toBeNull()
  })

  it('player → notes + countryCode (ISO); country NAME null (honest split — one field never means two things)', () => {
    const record = playerRecord({ notes: 'Squad captain', countryCode: 'BE' })
    expect(record.notes).toBe('Squad captain')
    expect(record.countryCode).toBe('BE')
    expect(record.country).toBeNull() // players never carry a country NAME
  })

  it('player → null notes, country and countryCode when absent', () => {
    const index = fullIndex()
    const player1 = index.byId.get('player:1')! // Jonas Vale — no notes, no countryCode
    expect(player1.notes).toBeNull()
    expect(player1.country).toBeNull()
    expect(player1.countryCode).toBeNull()
  })

  it('sport + competition → null notes, country AND countryCode (no such fields on those types)', () => {
    const index = fullIndex()
    for (const id of ['sport:1', 'competition:101']) {
      expect(index.byId.get(id)!.notes).toBeNull()
      expect(index.byId.get(id)!.country).toBeNull()
      expect(index.byId.get(id)!.countryCode).toBeNull()
    }
  })
})

/** Link-row builders (service shapes; anonymised — no real athletes/teams). */
const tcLink = (
  competition: { id: number; name: string } | null,
  id = competition?.id ?? 0,
): TeamCompetitionLink => ({
  id,
  teamId: 1,
  competitionId: competition?.id ?? 0,
  seasonId: null,
  source: 'manual',
  competition: competition ? { id: competition.id, name: competition.name, season: '2026' } : undefined,
})

const ptLink = (
  team: { id: number; name: string } | null,
  id = team?.id ?? 0,
): PlayerTeamLink => ({
  id,
  playerId: 1,
  teamId: team?.id ?? null,
  competitionId: null,
  seasonId: null,
  isCurrent: true,
  source: 'manual',
  team: team ? { id: team.id, name: team.name } : null,
})

describe('v1.1 — linkedRecordsOf hop resolver (pure; empty sections OMITTED)', () => {
  it('sport → competitions section from the index adjacency (client-derivable, no fetch)', () => {
    const index = fullIndex()
    const sections = linkedRecordsOf(index, 'sport:1', {})
    expect(sections).toEqual<LinkedRecordSection[]>([
      {
        relation: 'competitions',
        records: [
          { recordId: 'competition:101', name: 'League A', kind: 'competition' },
          { recordId: 'competition:103', name: 'Cup C', kind: 'competition' },
          { recordId: 'competition:108', name: 'Series H', kind: 'competition' },
        ],
      },
    ])
  })

  it('sport with 0 competitions → [] (empty section omitted)', () => {
    const index = buildRegistryIndex([{ id: 9, name: 'Rowing', icon: '🚣', federation: 'FISA' }], [], [], [])
    expect(linkedRecordsOf(index, 'sport:9', {})).toEqual([])
  })

  it('competition → teams section from the fetched Team[]', () => {
    const index = fullIndex()
    const sections = linkedRecordsOf(index, 'competition:101', {
      teams: [makeTeam({ id: 1, name: 'Riverside United' }), makeTeam({ id: 2, name: 'Coastal Rovers' })],
    })
    expect(sections).toEqual<LinkedRecordSection[]>([
      {
        relation: 'teams',
        records: [
          { recordId: 'team:1', name: 'Riverside United', kind: 'team' },
          { recordId: 'team:2', name: 'Coastal Rovers', kind: 'team' },
        ],
      },
    ])
  })

  it('team → TWO sections (competitions + roster); null-competition links are skipped', () => {
    const index = fullIndex()
    const sections = linkedRecordsOf(index, 'team:1', {
      teamCompetitions: [tcLink({ id: 101, name: 'League A' }), tcLink(null, 99)],
      players: [makePlayer({ id: 1, fullName: 'Jonas Vale' }), makePlayer({ id: 2, fullName: 'Milo Ferran' })],
    })
    expect(sections).toEqual<LinkedRecordSection[]>([
      { relation: 'competitions', records: [{ recordId: 'competition:101', name: 'League A', kind: 'competition' }] },
      {
        relation: 'players',
        records: [
          { recordId: 'player:1', name: 'Jonas Vale', kind: 'player' },
          { recordId: 'player:2', name: 'Milo Ferran', kind: 'player' },
        ],
      },
    ])
  })

  it('team → only the non-empty section survives (competitions present, empty roster)', () => {
    const index = fullIndex()
    const sections = linkedRecordsOf(index, 'team:1', {
      teamCompetitions: [tcLink({ id: 101, name: 'League A' })],
      players: [],
    })
    expect(sections).toEqual<LinkedRecordSection[]>([
      { relation: 'competitions', records: [{ recordId: 'competition:101', name: 'League A', kind: 'competition' }] },
    ])
  })

  it('player → teams section; a null-team link (unattached/startlist) is SKIPPED', () => {
    const index = fullIndex()
    const sections = linkedRecordsOf(index, 'player:1', {
      playerTeams: [ptLink({ id: 1, name: 'Riverside United' }), ptLink(null, 7)],
    })
    expect(sections).toEqual<LinkedRecordSection[]>([
      { relation: 'teams', records: [{ recordId: 'team:1', name: 'Riverside United', kind: 'team' }] },
    ])
  })

  it('unattached player → [] (all links null / none fetched)', () => {
    const index = fullIndex()
    expect(linkedRecordsOf(index, 'player:5', { playerTeams: [] })).toEqual([])
    expect(linkedRecordsOf(index, 'player:5', { playerTeams: [ptLink(null)] })).toEqual([])
  })

  it('unknown / malformed recordId → [] (quiet, ops-selection rule 5)', () => {
    const index = fullIndex()
    expect(linkedRecordsOf(index, 'team:999', {})).toEqual([])
    expect(linkedRecordsOf(index, 'garbage', {})).toEqual([])
  })

  it('missing fetched payload defaults to [] (no throw)', () => {
    const index = fullIndex()
    expect(linkedRecordsOf(index, 'competition:101', {})).toEqual([])
    expect(linkedRecordsOf(index, 'team:1', {})).toEqual([])
  })
})
