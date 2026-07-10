# CONTRACT SNAPSHOT: registry-selectors

Version: 1.1 · Date: 2026-07-06 · Task: C-1-T1 (v1) + C-3-T0 (v1.1) · consumers: RegistryScreen/toolbar/facets C-2, RecordInspector C-3

**Changelog**
- **v1.1 (2026-07-06, C-3-T0 prep):** ADDITIVE only — v1 surface byte-stable
  (66 v1 tests unchanged + green).
  - `RegistryRecord` gains `notes: string | null` (team/player `notes`; null for
    sport/competition) and TWO source-faithful country fields (split so one field
    never means two things): `country: string | null` = team country NAME only
    (null for sport/competition AND player); `countryCode: string | null` = player
    `countryCode` (ISO) only (null for sport/competition AND team). Team country is
    ALSO still folded into `detail` (searchable); `detail` is byte-unchanged.
  - New pure hop resolver `linkedRecordsOf` + types `LinkedRecord`,
    `LinkedRecordSection`, `LinkedRecordPayloads` (see below). No fetch — C-3-T1
    fetches via the typed services and passes raw results in via `fetched`.
  - **Provenance note:** the design's `· LAST SYNC 2H AGO` provenance suffix is
    NOT renderable — no sync-timestamp field exists on any list/record payload.
    C-3 drops it (renders the `SYNCED FROM …` / `MANUAL RECORD …` prefix only).

Pure registry-projection selectors — a NEW sibling module to `selectors.ts`
(ops-selectors v3 stays byte-stable; sibling-module rule / TD-25). No React, no
fetch, no `Date.now()`/`Math.random()`. Projects the four registry collections
(sports / competitions / teams / players — AS-5: no performer/staff kinds) into a
single tested record universe whose LINKED summaries derive from the C-1-T0
list-payload embeds and the client-derivable sport→competitions adjacency.

## Public interface

```ts
// src/components/ops/registrySelectors.ts
export type RegistryKind = 'sport' | 'competition' | 'team' | 'player'
export type RegistryFacet = 'all' | RegistryKind
export type RegistryStatusColor = 'green' | 'amber' | 'neutral'   // semantic token, NEVER hex

export interface RegistryStatus { word: string; color: RegistryStatusColor }

export interface RegistryRecord {
  id: string                 // composite `<kind>:<dbId>` (pin 1) — opaque, doubles as the ?record value
  kind: RegistryKind
  dbId: number               // table-native id (collides across tables — always pair with kind)
  name: string
  sportLabel: string         // '' when unresolvable — searchable
  detail: string             // search detail (pin 4): player `position #jersey`, team country, comp season, sport federation
  linkedSummary: string      // LINKED column string (see derivations)
  source: string             // SOURCE code (pin 3)
  status: RegistryStatus
  notes: string | null       // v1.1 — team/player notes (C-3 REMARKS box); null for sport/competition
  country: string | null     // v1.1 — team country NAME only; null for sport/competition AND player; team country ALSO in `detail`
  countryCode: string | null // v1.1 — player countryCode (ISO) only; null for sport/competition AND team
}
export type RegistryRow = RegistryRecord   // rows ARE records; the filter only selects which surface

export interface RegistryIndex {
  byId: Map<string, RegistryRecord>                 // ?record resolver (unknown id → undefined)
  byKind: Record<RegistryKind, RegistryRecord[]>    // input order preserved per kind
  orderedRecords: RegistryRecord[]                  // all records: sports, competitions, teams, players
  competitionIdsBySportId: Map<number, number[]>    // the ONLY adjacency kept (team/player adjacency DROPPED — HYBRID)
}

export interface RegistryFacetCounts { all: number; sport: number; competition: number; team: number; player: number }
export interface RegistryToolbarCounts { sports: number; competitions: number; teams: number; players: number }

export interface LinkedRecordFetchPlan {
  relation: 'teams' | 'competitions' | 'players'
  path: string               // API path relative to the ops api base — NOT fetched here (C-3 fetches)
}

export function makeRecordId(kind: RegistryKind, dbId: number): string
export function buildRegistryIndex(sports: Sport[], competitions: Competition[], teams: Team[], players: Player[]): RegistryIndex
export function projectRegistryRows(index: RegistryIndex, filters?: { query?: string; facet?: RegistryFacet }): RegistryRow[]
export function linkedSummaryOf(index: RegistryIndex, recordId: string): string
export function registryFacetCounts(index: RegistryIndex): RegistryFacetCounts
export function registryToolbarCounts(index: RegistryIndex): RegistryToolbarCounts
export function linkedRecordListPlan(kind: RegistryKind, dbId: number): LinkedRecordFetchPlan[]

// ── v1.1 (C-3-T0): hop resolver ──
export interface LinkedRecord { recordId: string; name: string; kind: RegistryKind } // recordId via makeRecordId
export interface LinkedRecordSection { relation: 'competitions' | 'teams' | 'players'; records: LinkedRecord[] }
export interface LinkedRecordPayloads {         // raw payloads C-3-T1 fetches (shapes from src/services/*)
  teams?: Team[]                                // ENTITY array   — competition → its teams (teamsApi.list({ competitionId }))
  teamCompetitions?: TeamCompetitionLink[]      // JUNCTION ROWS  — team → its competitions (teamsApi.listCompetitions; competition embed may be null)
  players?: Player[]                            // ENTITY array   — team → its roster        (playersApi.list({ teamId }))
  playerTeams?: PlayerTeamLink[]                // JUNCTION ROWS  — player → its teams        (playersApi.listTeams; team embed may be null)
}
export function linkedRecordsOf(index: RegistryIndex, recordId: string, fetched?: LinkedRecordPayloads): LinkedRecordSection[]
```

## Semantics (normative — write tests to these)

1. **Composite id (pin 1):** `<kind>:<dbId>`. Numeric ids collide across tables, so
   the kind scopes them. Opaque; unknown/malformed id resolves to nothing
   (`byId.get` → undefined; `linkedSummaryOf` → `''`) — screen shows quiet
   no-selection (ops-selection rule 5).
2. **SOURCE (pin 3) — verified against `backend/src/import/stages/provision.ts` + adapters:**
   `externalRefs` is a `{ [sourceCode]: sourceId }` map (imports write ≥1 key;
   manual creates default `{}`). No keys (null / undefined / `{}`) → `MANUAL`;
   else the FIRST key mapped: `the_sports_db→TSDB`, `api_football→API-FB`,
   `football_data→FB-DATA`, any other key → `key.toUpperCase()` (uppercased raw,
   never dropped). `isManaged` is NOT the signal (import sets it false; editing
   sets it true regardless of origin). Sports & competitions have no lineage
   field on their type → always `MANUAL` (locally seeded).
   **Discrepancy recorded:** the backlog AC wrote `api-football` / `football-data.org`
   (marketing/domain names). The real `externalRefs` keys are the adapter
   `sourceCode` constants with UNDERSCORES — the code keys the underscore forms.
   Treat the AC text as a documentation error.
3. **STATUS — verified against `backend/src/schemas/players.ts` (LOWERCASE enum
   `active|injured|loaned|retired`, default `active`):** `active→ACTIVE green`,
   `injured→INJURED amber`, `loaned→LOANED neutral`, `retired→RETIRED neutral`.
   Non-player kinds and unknown/absent status → `ACTIVE green` (active-equivalent,
   never crash). Color is a semantic token the COMPONENT maps to a CSS var
   (anti-smart-ui) — asserted non-hex.
4. **LINKED summaries (from the C-1-T0 embeds — see `src/data/types.ts`):**
   sport → `${N} competitions` (from `competitionIdsBySportId`, client-derivable);
   competition → `${_count.teamLinks} teams`;
   team → `${_count.competitionLinks + _count.playerLinks} linked records`
   (playerLinks server-filtered to isCurrent);
   player → current team name (first `teamLinks` entry) or `—` when there is no
   isCurrent link OR the link's team is null (unattached / competition startlist).
5. **Filter (pin 4):** `projectRegistryRows` composes AND — facet narrows to a kind
   (`'all'` = whole universe), query is a case-insensitive substring over
   name + sportLabel + detail. O(rows). Empty/whitespace query returns the facet
   base BY REFERENCE (read-only for React consumers; no allocation on the
   no-search path).
6. **Facet counts (`registryFacetCounts`) ALWAYS reflect the unfiltered universe**
   (A-3 precedent) — the function takes no query, structurally guaranteeing it.
7. **Counters (`registryToolbarCounts`):** real counts; the people segment is
   `N PLAYERS` (pin 5 — the design's `12 PEOPLE` assumed person Kinds, dishonest
   under AS-5).
8. **Index once (pin 7):** `buildRegistryIndex` is a pure O(n) builder; the CALLER
   memoizes (useMemo per data change — C-2). Adjacency kept: sport→competitions
   ONLY; team/player adjacency DROPPED (those linked LISTS are lazy — C-3).
9. **`notes` / `country` / `countryCode` (v1.1):** always present (null when N/A).
   team → `notes` + `country` (NAME), `countryCode` null; player → `notes` +
   `countryCode` (ISO), `country` null; sport/competition → all null. The two
   country fields are SPLIT so one field never means two things. C-3 renders the
   single "COUNTRY (when present)" attribute row from `country ?? countryCode` — a
   team shows a name, a player shows an ISO code; identical output, honest field
   names. `country`/`countryCode` are additive DISPLAY data; `detail` still
   contains team country (byte-stable, searchable).
10. **`linkedRecordsOf` (v1.1) — pure hop resolver:** turns fetched link payloads
    into uniform clickable hop sections (mirrors the `linkedRecordListPlan`
    relations). Per kind:
    - **sport** → NO fetch; reads `competitionIdsBySportId` + `byId` → one
      `competitions` section (client-derivable, pin 7).
    - **competition** → `fetched.teams` → one `teams` section.
    - **team** → `fetched.teamCompetitions` → `competitions` section (links with a
      null `competition` embed SKIPPED) + `fetched.players` → `players` section.
    - **player** → `fetched.playerTeams` → `teams` section (links with a null
      `team` SKIPPED — the unattached / competition-startlist case has no team to
      hop to).
    Unknown/malformed recordId → `[]` (quiet, rule 5). **Empty-section rule:
    sections with zero rows are OMITTED** (the inspector never renders an empty
    header; C-3 renders exactly what it receives). Missing `fetched` fields
    default to `[]` (no throw).

## Lazy linked-record LIST plan (pinned here, consumed by C-3 — HYBRID decision)

`linkedRecordListPlan(kind, dbId)` returns the endpoints C-3 fetches on selection
(one call per relation; never fetched in this module):
- sport → `[]` (client-derivable from `competitionIdsBySportId`)
- competition → `GET /teams?competitionId=<id>`
- team → `GET /teams/<id>/competitions` + `GET /players?teamId=<id>`
- player → `GET /players/<id>/teams`

## Test seam

Pure functions — feed the deep-frozen `FIXTURE_SPORTS / FIXTURE_COMPETITIONS /
FIXTURE_TEAMS / FIXTURE_PLAYERS` (opsFixtureWeek.ts; player names ANONYMISED, EPIC
C DoD 3) into `buildRegistryIndex`. `linkedRecordsOf` takes the fixture index plus
inline anonymised `TeamCompetitionLink[]` / `PlayerTeamLink[]` / `Team[]` /
`Player[]` payloads. No mocks, no clock. 80 tests, 95.69% branch (v1.1).

## Depends on

`src/data/types.ts` C-1-T0 embeds (`Competition._count`, `Team._count`,
`Player.teamLinks`) · fixture families in `opsFixtureWeek.ts` · v1.1 TYPE-ONLY
import of `TeamCompetitionLink` / `PlayerTeamLink` from `src/services` (erased —
no runtime services dependency; still no React, no fetch).

## Domain terms used

Kind, Record, Provenance→SOURCE, LINKED summary, STATUS, Facet, Counters
(backlog §4 + §EPIC C glossary).
