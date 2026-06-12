# EPIC G — Phase Summary (2026-06-12): Teams Phase 3, Players domain

## What was built (all six stories)

- **G-3a (TD-21):** generic `processRecord(job, progress, raw, {entityType, normalize, upsert})` with the merge-review branch as a built-in `ProvisionOutcome`; the four entity processors are thin bindings. Landed BEFORE any player code, suite green, zero behavior change.
- **G-1:** `Player`, `CanonicalPlayer`, `PlayerAlias`, `PlayerTeam` — purely additive migration `20260612160000_add_player_repository` applied via the ADR-007 workflow; `verify-migrations.sh` extended to 9 assertion points; `migrate status` clean.
- **G-2:** TheSportsDB `fetchPlayers` (`lookup_all_players.php?id=<teamId>`) + `normalizePlayer`; optional adapter hooks so non-supporting sources fail with a clear message.
- **G-3b:** `entityScope 'players'` through the orchestrator (`importPlayers` iterates linked teams, auto-backfills a teams import when none); `upsertPlayer` with CanonicalPlayer→Player projection, field provenance (manual `notes` never overwritten), PlayerTeam membership derived from the fetched-under team.
- **G-4:** `findPlayerMatch` — exact source-link auto-merge; name fingerprints require sport + birthDate corroboration, otherwise → **review queue** (MergeCandidate), never silent merge (review-pass hardening, see below).
- **G-5:** `/api/players` — list (filters + ADR-009 pagination), autocomplete, CRUD, `PATCH /:id/notes` (admin+sports), membership CRUD with the TD-9 NULL-season guard. 21 supertest cases incl. RBAC.
- **G-6 (scoped):** `playersApi` service + Roster tab in the /teams drawer (avatar/position/country, notes-lock, synced/manual badge). Deferred: athlete grid for individual sports, player detail drawer, `integrationScope` UI wiring.

## Quality pass (2 focused review angles → 7 deduped findings, ALL fixed)

1. **(HIGH)** name-only fingerprint auto-merge collapsed distinct athletes (two "Danilo"s; cross-sport "John Smith") → sport + birthDate corroboration required; uncertain matches go to the MergeCandidate review queue with nothing overwritten.
2. Membership dup-guard keyed on `competitionId` while the DB unique is `(playerId, teamId, seasonId)` → guard aligned, 409 instead of P2002 500.
3. `getSourceTeamIds` copied a `take: 50` cap that silently truncated player imports after ~3 leagues → cap removed.
4. `sportId` not tenant-verified on player create/update (cross-tenant FK) → 400 guard added; same pre-existing gap fixed in `teams.ts`.
5. `importPlayers` swallowed the auto-backfill teams-import status → 'partial' propagates with a message.
6. Roster read-path ignored `isCurrent` (ex-players listed as current squad) → filter scoped to current memberships.
7. Sparse second source nulled canonical `birthDate`/`photoUrl`/`countryCode` on fingerprint match → only non-null incoming values applied.

## Deviations from the plan doc (accepted)

- `canonicalPlayerId` is TEXT (matches `CanonicalPlayer.id`; the `@db.Uuid` plan spec repeats the bug A-2-T3 fixed for teams).
- CanonicalPlayer/PlayerAlias built (plan: optional) — required for multi-source dedup.
- No RLS policies on the new tables — consistent with the Team precedent; the broader posture is now tracked as **TD-22** (partial RLS coverage, hardening story).
- No `player.*` outbox events — parity with the team projection; cross-cutting polish later.

## Verification

Backend suite 292+ green (41+ new tests incl. notes-protection, membership idempotency, RBAC); frontend 166; `verify-migrations.sh` 9/9 on a from-scratch database; live `migrate status` clean; CI green on push.

## What this closes

The Teams & Players repository (client ask, plan §3) is feature-complete through Phase 3.
Remaining plan phases: Phase 4 (structured `homeTeamId`/`awayTeamId` on events), Phase 5
(merge-review diff/bulk UI — now more valuable since uncertain player matches land in that queue).
