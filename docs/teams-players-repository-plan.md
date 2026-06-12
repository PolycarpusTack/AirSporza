# Teams & Players Repository — Development Plan

_Status: proposal · Target: Planza (sporza-planner) · Author: planning session 2026-06-09_

A repository of up-to-date teams, players/athletes and competition memberships, kept
fresh from free sports APIs, enriched with manual remarks that survive re-sync, and
assignable to leagues/competitions.

---

## 0. Executive summary — how much already exists

The import/canonical infrastructure is ~70% of this feature and is already in place:

| Capability | State | Evidence |
|---|---|---|
| Import engine (jobs, rate limits, dead-letters, schedules, sync history) | ✅ done | `backend/src/import/services/*`, `routes/import*.ts` |
| **Team import path** (`importTeams` → `processTeamRecord` → `upsertTeam`) | ✅ done | `ImportJobRunner.ts:276,385,834` |
| Canonical team + aliases + source links + provenance | ✅ done | `upsertTeam()` writes `CanonicalTeam`, `TeamAlias`, `ImportSourceLink`, `FieldProvenance` |
| **Manual-edit protection** (`shouldApplyImportedField`) | ✅ done, used for events | `ImportGovernanceService.ts`, `ImportJobRunner.ts:1300+` |
| Adapters for TheSportsDB / API-Football / football-data.org | ✅ exist (fixtures+competitions) | `import/adapters/*Adapter.ts` |
| Adapter `fetchTeams`/`normalizeTeam` hooks | ⚠️ declared, **unimplemented** | `BaseAdapter.ts:15,20`; not in `TheSportsDbAdapter` |
| Operational `Team` model + CRUD route | ✅ exists, **isolated** | `routes/teams.ts` — no link to Competition/Event/Canonical |
| `'teams'` import scope in UI | ✅ wired | `App.tsx:88` `integrationScope` union |
| Bridge: `CanonicalTeam` → operational `Team` | ❌ missing | `prisma.team.*` only in `routes/teams.ts` |
| Team ↔ Competition/Season membership | ❌ missing | no join table |
| **Player / athlete** entity (model, adapter, dedup, UI) | ❌ missing entirely | — |
| Structured event participants (vs free-text `participants` string) | ❌ free text | `Event.participants String`; runner builds `"Home vs Away"` |
| Frontend `/teams` page + `teamsApi` service | ❌ missing | no `src/services/teams.ts`, no page |
| Merge-review UI (diff / bulk) | ⚠️ minimal | `ImportView` ReviewTab |

**Implication:** the heavy lifting (governance, dedup, jobs, provenance) is reusable as-is.
The real work is: (a) one bridge decision + table, (b) adapter team/player implementations,
(c) a Player domain, (d) the `/teams` UI, (e) a participants migration, (f) merge-UI polish.

---

## 1. Decisions (recommended defaults)

1. **`Team` vs `CanonicalTeam` → Option B (bridge, not consolidate).**
   Keep operational `Team` as the user-facing repository; add `canonicalTeamId` linking it to
   the import layer. `upsertTeam()` gains a step that projects the canonical record into `Team`,
   respecting provenance. _Why:_ least churn — `routes/teams.ts`, autocomplete, and the future UI
   all target `Team`; canonical/dedup stays the import-side source of truth.

2. **v1 scope = Teams + memberships first, Players in Phase 3.**
   Ship value early (Phase 0 page over existing data; Phase 1 makes import real) before the
   larger Player build.

3. **Primary source = TheSportsDB** (multi-sport, already integrated, has logos), with
   football-data.org / API-Football as football enrichment via the existing priority/provenance
   overlay. **Open: confirm commercial-use licensing** before exposing logos in production output;
   text-only fields are safe for internal planning regardless.

4. **Remarks = manual-only fields**, never imported, protected by the existing provenance
   mechanism (source `manual` ⇒ `shouldApplyImportedField` returns false).

---

## 2. Data model changes (`backend/prisma/schema.prisma`)

Applied with `prisma db push` (repo convention — no migrations folder; expression indexes live in
raw SQL).

```prisma
// EXTEND operational Team
model Team {
  // ...existing...
  canonicalTeamId String?     @db.Uuid          // bridge to import layer
  notes           String?                        // editorial remarks (manual-only)
  isManaged       Boolean     @default(false)    // a human has curated this record
  sportId         Int?                            // currently absent; needed for scoping
  // relations
  canonicalTeam   CanonicalTeam? @relation(fields: [canonicalTeamId], references: [id])
  competitions    TeamCompetition[]
  playerLinks     PlayerTeam[]
  @@index([canonicalTeamId])
  @@index([tenantId, sportId])
}

// NEW — team ↔ competition/season membership (the "assign to league" feature)
model TeamCompetition {
  id            Int      @id @default(autoincrement())
  tenantId      String   @db.Uuid
  teamId        Int
  competitionId Int
  seasonId      Int?                              // null = all seasons
  source        String   @default("manual")      // manual | the_sports_db | ...
  createdAt     DateTime @default(now())
  team          Team        @relation(fields: [teamId], references: [id], onDelete: Cascade)
  competition   Competition @relation(fields: [competitionId], references: [id], onDelete: Cascade)
  season        Season?     @relation(fields: [seasonId], references: [id])
  @@unique([teamId, competitionId, seasonId])
  @@index([tenantId, competitionId])
}

// NEW — athlete (works for team sports AND individual sports)
model Player {
  id              Int      @id @default(autoincrement())
  tenantId        String   @db.Uuid
  sportId         Int
  canonicalId     String?  @db.Uuid              // future CanonicalPlayer bridge
  fullName        String
  shortName       String?
  countryCode     String?
  position        String?                         // null for tennis/cycling
  jerseyNumber    Int?
  birthDate       DateTime? @db.Date
  photoUrl        String?
  status          String   @default("active")     // active|injured|loaned|retired
  notes           String?                          // manual-only remarks
  isManaged       Boolean  @default(false)
  externalRefs    Json     @default("{}")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  sport           Sport       @relation(fields: [sportId], references: [id])
  teamLinks       PlayerTeam[]
  @@unique([tenantId, sportId, fullName, birthDate])
  @@index([tenantId, sportId])
}

// NEW — player ↔ team membership over time (also covers cycling team rosters)
model PlayerTeam {
  id        Int       @id @default(autoincrement())
  tenantId  String    @db.Uuid
  playerId  Int
  teamId    Int?                                  // null = unattached individual athlete
  competitionId Int?                              // for individual-sport startlists
  seasonId  Int?
  fromDate  DateTime? @db.Date
  toDate    DateTime? @db.Date
  isCurrent Boolean   @default(true)
  player    Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  team      Team?  @relation(fields: [teamId], references: [id], onDelete: Cascade)
  @@index([tenantId, teamId])
  @@index([tenantId, competitionId])
}
```

Plus: add `CanonicalTeam.team Team[]` back-relation, and (Phase 4) `Event.homeTeamId/awayTeamId Int?`.
Remember every model is tenant-scoped + RLS (`setTenantRLS`) — add tenant relation arrays on `Tenant`.

---

## 3. Phased plan (file-by-file)

### Phase 0 — Foundation & read-only UI _(ship first, zero import risk)_
**Backend**
- `schema.prisma`: add `Team.notes/isManaged/sportId/canonicalTeamId` (nullable, additive). `db push`.
- `routes/teams.ts`: extend list to support `?competitionId=` / `?sportId=` filters and include
  membership counts; add `PATCH /:id/notes` (admin/sports) writing `notes` + provenance `manual`.
- `schemas/teams.ts`: extend zod schemas for new fields.

**Frontend**
- `src/services/teams.ts` (NEW) — `teamsApi` (`list`, `get`, `create`, `update`, `saveNotes`,
  `autocomplete`) mirroring `services/sports.ts`. Export from `services/index.ts`.
- `src/pages/TeamsView.tsx` (NEW) — tree (Sport→Competition) + table, reusing `Card`, `Badge`,
  `EmptyState`, `Toggle`, `Autocomplete`, `ConfirmDialog`. Detail drawer (reuse `EventDetailPanel`
  pattern) with tabs Overview / Roster / Remarks / Sources. _(Mockup already built:
  `mockups/teams-repository-mockup.html` — use as the visual/interaction spec.)_
- `src/App.tsx`: add lazy route `/teams` under `RequireRole` (sports/planner/admin).
- `src/components/layout/Sidebar.tsx`: add nav item "Squads" (`Users` icon) to `NAV_MAIN`.
- `src/pages/index.ts`: export `TeamsView`.

_Deliverable:_ a working repository page over current data; remarks editable & protected.

### Phase 1 — Activate team import (make the repo self-updating)
**Adapters** (`backend/src/import/adapters/`)
- Implement `fetchTeams(window)` + `normalizeTeam(raw): NormalizedTeam` in `TheSportsDbAdapter`
  (`lookup_all_teams.php?id=<leagueId>`), `FootballDataAdapter` (`/competitions/{id}/teams`),
  `ApiFootballAdapter` (`/teams?league=&season=`). Hooks already exist on `BaseAdapter`.
- Verify `NormalizedTeam` type in `import/types.ts` carries: sourceId, name, sport, country,
  logoUrl, shortName, externalRefs.

**Runner bridge** (`ImportJobRunner.ts`)
- In `upsertTeam()` (line 834): after the canonical upsert, **project into operational `Team`**
  — upsert `Team` keyed by `(tenantId, name)` or `canonicalTeamId`, set `canonicalTeamId`, and
  apply imported fields through `shouldApplyImportedField` so manual edits/`notes` are preserved.
  Record provenance for `Team` fields too.
- No change needed to `executeJob`/`importTeams` — already routed.

**No new infra** — rate limits, dead letters, schedules, sync history all already cover teams.

_Deliverable:_ "Sync now" / scheduled import populates and refreshes teams with logos; manual
edits survive.

### Phase 2 — Competition membership ("assign to league")
- `schema.prisma`: add `TeamCompetition`. `db push`.
- `routes/teams.ts` (or new `routes/teamCompetitions.ts`): `POST/DELETE` membership;
  `GET /api/competitions/:id/teams`.
- During team import, derive membership from the league the team was fetched under (source links
  already map source→competition via `getSourceCompetitionIds`).
- Frontend: "Assign to competitions" chips in the team drawer + Add-team modal; tree counts read
  from membership.

_Deliverable:_ selecting a competition scopes the list to its members; a team in two competitions
appears under both.

### Phase 3 — Players / athletes
**Schema:** add `Player`, `PlayerTeam` (+ optional `CanonicalPlayer`/`PlayerAlias` mirroring team
canonical pattern if multi-source dedup is needed). `db push`.

**Backend**
- `routes/players.ts` (NEW): CRUD + `autocomplete` + `PATCH /:id/notes`; `schemas/players.ts`.
- Register in `index.ts` (`/api/players`, authenticate + tenant + standardLimiter).
- Adapter hooks: add `fetchPlayers?`/`normalizePlayer?` to `ImportAdapter` (`BaseAdapter.ts`) and
  implement for the football sources (`/teams/{id}/players`, squads). Add `entityScope: 'players'`
  case to `executeJob` + `importPlayers`/`processPlayerRecord`/`upsertPlayer` in `ImportJobRunner.ts`
  (clone the team path; create `PlayerTeam` membership).
- `import/types.ts`: add `NormalizedPlayer`; `EntityType` += `'player'`; `scopeToRecordType` +=
  `players→player`.
- `DeduplicationService`: add player matching (name + birthDate + country) → merge candidates,
  same `MergeCandidate` flow.

**Frontend**
- `src/services/players.ts` (NEW). Roster tab in team drawer; athlete grid for individual sports
  (cycling/tennis) — both shown in the mockup. Player-detail drawer.
- `App.tsx` `integrationScope` union += `'players'`.

_Deliverable:_ rosters for team sports; athlete repositories for cycling/tennis; player merge review.

### Phase 4 — Structured event participants
- `schema.prisma`: `Event.homeTeamId/awayTeamId Int?` (keep `participants` String as
  `@deprecated` fallback — mirrors the existing `linearChannel`→`channelId` migration pattern).
- `ImportJobRunner.buildImportedEventData` (line 1242): resolve `normalized.homeTeam/awayTeam`
  against `TeamAlias`/`CanonicalTeam` → set FKs; keep building the display string for back-compat.
- Backfill script in `backend/src/scripts/` to resolve historical `participants` text → team FKs
  where confident; leave ambiguous ones as text + flag.
- Frontend forms (`DynamicEventForm`, `EventDetailPanel`): team-pickers via `teamsApi.autocomplete`.

_Deliverable:_ events linked to repository teams; enables future team-level rights/coverage views.

### Phase 5 — Merge-review UI upgrade + polish (also Part-A "Track 1")
- `ImportView` ReviewTab: side-by-side **field diff**, confidence, **bulk approve/reject**,
  pre-commit preview — generalized over `entityType ∈ {event, team, player}`.
- `services/imports.ts`: extend approve/reject for team/player candidates.
- Fold in the cheap design-system fixes (`Btn`→`Button`, `.inp`/`.field-input`, brand-gradient
  token, modal-size tokens, `<Skeleton>`) so the new screens use the cleaned-up primitives.

---

## 4. Cross-cutting concerns
- **Tenancy/RLS:** every new model gets `tenantId` + `Tenant` back-relation + `setTenantRLS`
  coverage; follow existing `@@index([tenantId, …])` conventions.
- **Provenance/remarks:** reuse `recordFieldProvenance` + `shouldApplyImportedField`; `notes`
  always provenance `manual`. Surface per-field "synced vs edited" badge + "revert to source"
  (in mockup).
- **Outbox/webhooks:** emit `team.created/updated`, `player.created/updated` via `writeOutboxEvent`
  for downstream integrations, matching event handling.
- **Audit:** manual create/edit/delete + merge decisions → `AuditLog` (existing middleware pattern).
- **Seed:** extend `backend/prisma/seed.ts` with a few demo teams/players for dev.

## 5. Testing
- Unit (`vitest`): adapter `normalizeTeam`/`normalizePlayer`; canonical→`Team` projection respects
  provenance; membership upserts; dedup matching for players.
- Integration (`supertest`): `teams`/`players` routes incl. notes-protection on re-sync
  (import → manual edit → re-import asserts edit survives).
- E2E-ish: run TheSportsDB team import against a fixture league; assert merge-candidate creation on
  fuzzy match.

## 6. Sequencing & effort (rough)
| Phase | Scope | Effort |
|---|---|---|
| 0 | Foundation + read-only `/teams` page | 3–4 d |
| 1 | Team import activation (adapters + bridge) | 3–4 d |
| 2 | Competition membership + assignment UI | 2–3 d |
| 3 | Players (model + import + dedup + roster UI) | 6–9 d |
| 4 | Structured event participants + backfill | 4–6 d |
| 5 | Merge-review UI + design polish | 3–5 d |

Phases 0–2 deliver the client's core ask (repository + import + league assignment + remarks).
3–5 complete athletes, fixture linkage, and the trust/UX upgrades.

## 7. Risks & mitigations
- **API licensing (TheSportsDB logos)** → confirm commercial terms; gate logo display behind a
  config flag; text fields safe regardless.
- **Dedup false-merges** → conservative thresholds + mandatory human review (existing
  `MergeCandidate` flow); never auto-merge on fuzzy.
- **`Team` vs `CanonicalTeam` drift** → single projection point in `upsertTeam`; integration test
  asserts parity.
- **Participants migration regressions** → keep `participants` string as fallback; backfill is
  additive and reversible; flag low-confidence resolutions instead of guessing.
- **Free-tier rate limits** (API-Football 100/day) → already handled by `ImportRateLimitService`
  + scheduled incremental jobs; prefer TheSportsDB for breadth.
