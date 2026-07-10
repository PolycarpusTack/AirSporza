# Session kickoff prompt — Ops redesign: EPIC C (Registry), resume at C-1

Paste the block below into a fresh Claude Code session in `C:\Projects\Planza`.
(Every binding fact is stated inline — execute as written, do not re-derive decisions that are
marked as already made.)

---

Continue the Ops redesign, now in **EPIC C — REGISTRY**. Resume at **Story C-1** (state check
below decides whether C-1-T0 needs finishing or reviewing), then execute C-1-T1 → C-1-T2 →
stories C-2 … C-5 → C-7 smoke → EPIC C retro. DELIVERY mode per CLAUDE.md.

## Where we are (verified state 2026-07-05 EOD — do not re-audit)

- **EPIC A done** (retro included) — PR **#10** open (`feature/A-4-event-inspector` → main).
- **EPIC B done** (retro included) — PR **#11** open (`feature/B-1-rundown-lanes` → the A-4
  branch, stacked; merge #10 first, GitHub retargets). Neither PR is merged yet.
- **Current branch `feature/C-1-registry-selectors`** (stacked on the B branch). On it:
  - `db7da90` EPIC C expansion — 7 stories in house idiom; **AS-5 resolved: NO
    performer/staff/person entities exist** → Registry v1 = sports/competitions/teams/players
    only; C-6 is a deferred stub.
  - `3c13f94` C-1 re-gate — the API-shape pull gate **FAILED as written** (TeamCompetition/
    PlayerTeam links do NOT ride the bulk list payloads; per-entity endpoints only → N+1).
    **User decision (sign-off recorded on the card): HYBRID** — new C-1-T0 PREPARATORY adds
    additive `_count`/current-team embeds to the three list routes; linked-record LISTS resolve
    lazily per selection via the four existing endpoints (`/teams/:id/competitions`,
    `/players/:id/teams`, `/players?teamId=`, `/teams?competitionId=`).
- Baselines: vitest **551/551** (runs under the repo `TZ=America/New_York` pin in
  vitest.config.ts), Playwright e2e **6/6** across both flag profiles (`npm run test:e2e`),
  `npx tsc -b` clean. Flag `VITE_OPS_REDESIGN` default OFF.
- **In flight at session end:** C-1-T0 was dispatched to a gpm-partner agent (backend embeds)
  and the session was closed while it ran — the agent is DEAD; only its file edits (if any)
  survive. **STATE CHECK first:** run `git status`. Three possible states:
  1. Tree clean (beyond the known parallel-session files) → execute C-1-T0 fresh (spec below).
  2. Uncommitted changes to `backend/src/routes/{competitions,teams,players}.ts` + backend
     tests + `src/data/types.ts` → VERIFY before trusting: backend test suite green (scripts in
     `backend/package.json`), `npx vitest run` 551/551, `npx tsc -b` clean. All green → treat
     as finished: review chain, commit. Anything red or half-done → state 3.
  3. Partial/unverifiable → DISCARD only the task's own files (`git checkout --` those exact
     paths — NEVER touch debt-register.md/ADR-015/domain-gaps docs) and execute C-1-T0 fresh.
     It is a small, fully specified task; redoing beats forensics on a dead agent's tree.
- The working tree may still contain uncommitted `docs/` files from the parallel domain-gaps
  session (`debt-register.md` edits, ADR-015, `docs/backlog-planza-domain-gaps.md`, plans,
  zips) and `.claude/worktrees/`. **Never stage, edit, or revert those.** Stage explicitly by
  path — never `git add -A` at repo root.

## Context to read first (in this order)

1. `docs/backlog-planza-ops-redesign.md` §EPIC C header + §Story C-1 (the 8 pins + HYBRID
   re-gate text are binding) — then skim §Story C-2/C-3 for what T1's hand-off must serve.
2. `docs/governance/contracts/`: `useContracts.md` (v1 — the hook idiom `useRegistryData` must
   mirror), `ops-selection.md` (v1 — `?record` is the reserved param, C-2-T1 bumps to v2),
   `ops-selectors.md` (v3 — byte-stable sibling-module rule), `ops-tokens.md` (v3 — `--kind-*`
   + `-bg` chip tints exist).
3. `docs/design_handoff_planza_ops/README.md` §4 REGISTRY + the registry section of
   `Planza App.dc.html` (exact styling/derivations; grid `minmax(220px,1fr) 110px 110px 150px
   84px 78px`).
4. `src/services/teams.ts`, `players.ts`, `sports.ts` + `backend/src/routes/{teams,players,
   competitions}.ts` (list handlers; provenance scalars all ride — verified) and
   `backend/prisma/schema.prisma` (Player/PlayerTeam/Team models, relation field names).
5. House test patterns: `src/pages/ops/RightsScreen.test.tsx` (latest idiom: appState via
   vi.hoisted, inverse settle-gate, deepFreeze) + `src/components/ops/__fixtures__/
   opsFixtureWeek.ts` (deep-frozen, extend ADDITIVELY only).

## Task C-1-T0 — backend list-payload embeds (Hat PREPARATORY — may already be done, see state check)

Additive payload keys ONLY (no endpoint/verb/filter changes): competitions list `_count` gains
`teamLinks`; teams list gains `_count: { competitionLinks, playerLinks(isCurrent) }` (verify
relation field names in schema.prisma + whether the installed Prisma supports filtered
`_count.select.where` — fall back to an id-only embed if not, record it); players list gains
current-team embed `teamLinks: { where isCurrent, select team { id, name } }`. Extend backend
route tests (existing tests stay green; additive expectation keys acceptable, declared) +
`src/data/types.ts` additively. Commit message conv: `feat(registry): C-1-T0 ...` or
`chore(backend):` — PREPARATORY, single commit unit.

## Then C-1-T1 (registry selectors) and C-1-T2 (useRegistryData)

Execute per the card — key pins to hold: composite record ids `<kind>:<dbId>`; TD-25 (repo
relations only, never Event.participants); SOURCE predicate pinned at T1 against
ImportGovernanceService semantics (`isManaged`/`externalRefs` — fields verified riding);
player `status` enum values/casing verified in `backend/src/schemas/players.ts` BEFORE the
color-map tests; index-once (by-id/by-kind/sport→competitions only — team/player adjacency
DROPPED per HYBRID); 2,000-record perf probe; fixtures additive with ANONYMISED player names
(EPIC C DoD 3 — PII); `linkedRecordSummary` is sync from embeds, linked LISTS stay lazy
(fetch plan pinned in the contract for C-3). T2 mirrors useContracts v1 (`isSettled` flips on
success OR failure; `refresh()` refetches all four; bare-array response pin). Hand-offs:
`registry-selectors v1`, `useRegistryData v1`. Opus-grade review on T1's graph derivation.

## Proven flow per task (binding — worked for all of A/B)

gpm-partner executes (TDD RED first) → review chain in PARALLEL (`two-hats-enforcer` +
`naming-reviewer` + `test-quality-auditor` — ask test-quality to run MUTATION PROBES, they
caught real holes at B-1/B-3) → apply findings → orchestrator verifies independently (run the
suites yourself before committing) → commit per task with explicit paths. PREP vs FEATURE
splits as separate commits (B-2/B-3 precedent; hunk-split staging via `git apply --cached`
works when files overlap). DoR gate (backlog-health-advisor) before each STORY start —
premises get verified, not assumed (this caught the A-5 e2e-stack lie, the B-1 geometry gaps,
the B-3 reconciliation contradiction, and the C-1 N+1).

## Standing rules (do not violate)

- TD-23 (no ui/Btn|Button in ops), TD-24 (sanctioned accessors only), TD-25 (no
  Event.participants for registry links).
- ops-selectors v3, rundown-layout v1, EventInspector v1, useContracts v1 are byte-stable —
  registry code goes in NEW sibling modules (`registrySelectors.ts`, `useRegistryData.ts`).
- Registry gets its OWN RecordInspector (EventInspector is event-scoped; 320px chrome is a
  Rule-of-Two watch item, do NOT extract).
- Vitest globals OFF; explicit cleanup(); fixtures deep-frozen; anonymised person names.
- Report debt candidates as TEXT (debt-register.md has uncommitted parallel-session edits).
- STOP and ask the user only if: a pull-gate contract contradicts the codebase, a write
  endpoint needed by C-4/C-5 doesn't exist (check at THOSE gates: `sportsApi`/`competitionsApi`
  create endpoints are UNVERIFIED — teams/players create + saveNotes DO exist), or an AC can't
  be met without touching a legacy screen.

## Open items parked for the architect (do not act, keep visible)

- ADR-014 amendment: OpsShell tab NavLinks drop `?day`/`?event` (shared selection is
  deep-link-only) — parked at the EPIC B retro.
- Backend `broadcastSlots.ts` inclusive-`lte` day window (midnight slot returns for two days —
  suspected bug; e2e models half-open and documents the divergence).
- AS-4 threshold formulas PROVISIONAL (rights-windows track, ADR-015) · AS-8 ON-DEM column
  reserved · TD-26 designer sign-off · TD-27 runtime-flag decision at EPIC E.

Report at the end: tasks done with commit hashes, test counts, snapshots produced,
review-chain outcomes, debt candidates, and what's next.

---

After C-1 closes: C-2 (toolbar/facets/table + ops-selection v2 `?record`), C-3
(RecordInspector + lazy linked lists + hopping), C-4 (create modal — FIRST WRITE PATH,
endpoint-inventory gate BLOCKING), C-5 (remarks via saveNotes), C-7 (stateful-interception
smoke + runbook §registry), EPIC C retro, then EPIC D expansion.
