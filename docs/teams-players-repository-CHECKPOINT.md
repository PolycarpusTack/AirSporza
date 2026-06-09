# Teams & Players Repository — Session Checkpoint

_Last worked: 2026-06-09 · Pick up: 2026-06-10_
_Branch: `feat/teams-repository-phase0` · Plan: [`teams-players-repository-plan.md`](./teams-players-repository-plan.md) · Mockup: [`../mockups/teams-repository-mockup.html`](../mockups/teams-repository-mockup.html)_

## TL;DR
Phases 0–2 of the Teams repository are **implemented, typechecked, and committed**. The client's
core ask — a teams repository that self-updates from a free API, supports league assignment, and
holds protected editorial remarks — is feature-complete. **Players (Phase 3) is the next big piece
and has not been started.** Nothing has been applied to a database yet (`prisma db push` pending —
needs Postgres).

## Done this session (all on branch `feat/teams-repository-phase0`)
| Commit | Phase | What |
|---|---|---|
| `50687f9` | — | Plan doc + interactive HTML mockup |
| `aa51e84` | 0 | `Team` schema (`sportId`, `canonicalTeamId`, `notes`, `isManaged`); teams route filters + `PATCH /:id/notes`; `teamsApi`; `/teams` "Squads" page (tree, table, drawer Overview/Remarks/Sources, Add-team modal); sidebar nav |
| `4819ee4` | 1 | `TheSportsDbAdapter.fetchTeams`/`normalizeTeam`; `upsertTeam()` projects `CanonicalTeam → Team` (the bridge); adapter unit tests |
| `7b5b4c5` | 2 | `TeamCompetition` model + back-relations; `?competitionId=` filter + membership CRUD routes; import auto-derives membership from league; Sport→Competition tree + assign/remove UI |

## Verification status
- ✅ Backend `tsc --noEmit` — clean
- ✅ Frontend `tsc -b --force` — clean (0 errors)
- ✅ `vitest` adapter tests — 5/5 pass (`backend/tests/the-sports-db-adapter.test.ts`)
- ✅ Prisma schema valid, client generated (v5.22.0)
- ⚠️ ESLint — could not run (this sandbox lacks root lint tooling `@eslint/js`/`typescript-eslint`); unrelated to the code
- ⛔ Not run against a DB — see "Pending" below

## Pending — to make it live (needs your Postgres + a free TheSportsDB key)
```bash
cd backend && npm run db:push     # adds Team columns + TeamCompetition table (additive, no data migration)
npm run dev:full                  # open /teams as an admin or sports user
```
Then to actually populate teams from the API:
1. Configure a `the_sports_db` import source (apiKey + baseUrl).
2. Run a **competitions** import (creates league source-links), then a **teams** import.

## Environment gotchas (so tomorrow doesn't lose time)
- **Dependencies were not installed** in this working copy at session start (`node_modules` empty).
  `npm install` was run; backend deps installed fine, but the root **`react` packages did not
  install** and had to be added explicitly. If `npx tsc -b` reports "Cannot find module 'react'",
  run `npm install` and confirm `node_modules/react` exists.
- **`tsc -b` is incremental** — a stale `tsconfig.tsbuildinfo` can report success without
  recompiling. Use `npx tsc -b --force` for a trustworthy frontend typecheck.
- Run backend typecheck **from `backend/`** (`npx tsc --noEmit`); running from repo root pulls in
  the frontend and falsely errors.
- I reverted an unintended `package.json`/`package-lock.json` version bump caused by the React
  reinstall — working tree is clean.

## Next up (in recommended order)
1. **Phase 3 — Players/athletes** (the big one, ~6–9 d in the plan): `Player` + `PlayerTeam` models;
   adapter `fetchPlayers`/`normalizePlayer`; `entityScope: 'players'` path in `ImportJobRunner`
   (clone the team path); `DeduplicationService` player matching; `players` route + `playersApi`;
   Roster tab in the team drawer + individual-athlete grid for cycling/tennis. See plan §3 Phase 3.
2. **football-data.org / API-Football team adapters** (small): implement the same
   `fetchTeams`/`normalizeTeam` pattern for broader football squads + multi-source enrichment.
3. **Phase 4** — structured event participants (`Event.homeTeamId/awayTeamId`) + backfill.
4. **Phase 5** — merge-review diff/bulk UI (also UX Part-A "Track 1") + design-system polish.

## Open decisions (carried forward)
- **v1 scope**: teams-only (done) vs teams+players — players still pending a go/no-go.
- **TheSportsDB commercial licensing** for logo/artwork in production output — confirm before
  exposing logos; text fields are safe for internal planning regardless.
- (Resolved) `Team` vs `CanonicalTeam` → **Option B (bridge)**, implemented.

## Known tech-debt / caveats from the implementation (documented in code)
- Slight team-name variants across sources can create a **duplicate operational `Team` row** —
  reconciliation is the later merge-candidate phase.
- Manual-edit protection currently keys off the **`isManaged`** toggle + cross-source field
  priority, not a true field-level "manual" provenance source — a later governance refinement.
- Only **TheSportsDB** team import is implemented; football-data.org / API-Football team hooks are
  not yet written (same pattern).
- `TeamCompetition` null-season uniqueness is enforced in the **route** (the DB `@@unique` can't
  dedupe NULL seasons in Postgres).
