# Session kickoff prompt — Ops redesign: EPIC D (Sync), resume at D-1

Paste the block below into a fresh Claude Code session in `C:\Projects\Planza`.
(Every binding fact is stated inline — execute as written; decisions marked "already made"
are not to be re-litigated. Two architect GATES are flagged — STOP and ask at those.)

---

Continue the Ops redesign, now in **EPIC D — SYNC (import health + merge review)**. EPIC C
(Registry) is COMPLETE incl. retro; EPIC D is EXPANDED (detailed backlog written). Resume by
**executing Story D-1**, then D-2 → D-3 → D-4 → EPIC D retro. DELIVERY mode per CLAUDE.md.

## Where we are (verified state 2026-07-06 EOD — do not re-audit)

- **EPIC C COMPLETE** (retro included) — 13 commits `4b47ecc`→`8cff0ec` on the current branch
  **`feature/C-1-registry-selectors`** (stacked on the EPIC B branch/PR #11 → PR #10; NONE pushed
  or merged). Contracts frozen: `registry-selectors v1.1`, `useRegistryData v1`, `ops-selection v2`,
  `RecordInspector v1.1`, `registry-create v1`, `ops-e2e v1.1` (all in `docs/governance/contracts/`).
- **EPIC D EXPANDED** — `f82de72` wrote the detailed §EPIC D into `docs/backlog-planza-ops-redesign.md`
  (4 stories, the EPIC-C format). Read §EPIC D there first — its AC + Pinned decisions are binding.
- **Baselines:** vitest **714/714** (repo `TZ=America/New_York` pin), backend **349** (7 pre-existing
  skips), Playwright e2e **10/10** (`npm run test:e2e`; note: the two-profile webServer build can
  time out at 180s in a constrained sandbox — a fresh `rm -rf dist-e2e` + retry succeeds), `npx tsc -b`
  clean. Flag `VITE_OPS_REDESIGN` default OFF.
- **Working tree:** clean except the parallel-session domain-gaps docs (`debt-register.md` modified;
  untracked `docs/backlog-planza-domain-gaps.md`, `docs/*-continue-*.md`, `docs/ops-domain-*.md`,
  `docs/plans/rd-1-*`, `ADR-015`, zips, `.claude/worktrees/`). **Never stage, edit, or revert those.**
  Stage explicitly by path — never `git add -A`. (`dist-e2e/` is gitignored.)

## EPIC D shape (from the expansion — DAG + gates)

- **D-1** (M, **READY, no gate — START HERE**): pure `syncSelectors.ts` (`deriveJobCard`,
  `pendingCandidateCount`) + `useSyncData` hook + SyncScreen replacing the OpsShell
  `ops-screen-sync` placeholder + tab-badge wiring. Tasks D-1-T1 (selectors) → D-1-T2 (hook+screen).
- **D-2** (M→L): merge review cards. **D-2-T0 = BLOCKING ARCHITECT GATE** — Rule of Three: the merge
  derivation now has 2 consumers (legacy `ImportView.ReviewTab` + SyncScreen). Extraction is pinned
  SELECTOR-ONLY (`deriveMergeCard`). ADR-012 says legacy ImportView stays untouched → **ask the
  architect: does D-2-T0 dedup ReviewTab's already-duplicated bits onto the shared selector, or ship
  the module SyncScreen-only and defer ImportView migration to EPIC E?** Then D-2-T1 (NEW diff table).
- **D-3** (M): merge decisions (2nd write surface). **D-3-T0 = BLOCKING ARCHITECT GATE** — AS-7
  REFUTED (verified in `backend/src/routes/import/mergeCandidates.ts`): the routes have NO
  already-decided guard, so `approve-merge` re-runs the merge and `create-new` creates a DUPLICATE
  event on a re-decide. **Ask the architect: add an additive `status !== 'pending'` 409 guard
  (D-3-T0 backend, mirrors C-4-T0), or accept the UI-only mitigation** (single-flight + pending-only
  listing + terminal button-replacement)? Then D-3-T1 (wire APPROVE MERGE / KEEP SEPARATE,
  single-flight, badge decrement — review Opus on the write path).
- **D-4** (M): `e2e/smoke-epic-d.flag-on.spec.ts` + the ops-e2e store gains merge-decision emulation
  (C-7 stateful-store precedent) + runbook §sync. Then EPIC D retro.
- DAG: `D-1-T1→{D-1-T2,D-2-T0}`; `D-1-T2→{D-2-T1,D-4-T1}`; `D-2-T0→D-2-T1→D-3-T1`; `D-3-T0(cond)→D-3-T1→D-4-T1`.

## D-1 specifics (verified premises — build to these)

- Backend serves everything D-1 reads (NO backend change): `GET /import/jobs` embeds
  `_count: { records, deadLetters }` + `source.code/name`; job status enum
  `queued/running/completed/failed/partial`; merge candidates via
  `importsApi.listMergeCandidates({ status: 'pending' })`. Service = `src/services/imports.ts`
  (`importsApi`: `listJobs`, `listMergeCandidates`, `approveMergeCandidate`, `createMergeCandidateEntity`,
  `ignoreMergeCandidate`).
- Pins: job-card derivation is PURE (`deriveJobCard` in `src/components/ops/syncSelectors.ts` — new
  sibling; ops-selectors v3 + registry-selectors v1.1 stay byte-stable); `NIGHTLY SYNC · 02:00 CET`
  is static copy (schedule not in any API); dead-letter count is per-job `_count.deadLetters`; badge
  count = pending candidate set length from `useSyncData` (verify the OpsShell v1 badge-slot
  mechanism); `confidence` is a Decimal-serialized STRING typed `number` → explicit `Number()`
  coercion (used in D-2, verify vs `DeduplicationService`); fixtures additive `FIXTURE_JOBS` +
  `FIXTURE_MERGE_CANDIDATES` (+ `makeJob`/`makeMergeCandidate`) in `opsFixtureWeek.ts`, anonymised
  (EPIC C DoD 3), existing exports byte-stable.
- Hand-offs: `sync-selectors v1` (D-1-T1), `useSyncData v1` (D-1-T2). Mirror `useRegistryData v1`
  idiom (`isSettled` on both-settled; `refresh()` refetches both; bare-array pin).

## Proven flow per task (binding — worked for all of A/B/C)

Per STORY: DoR re-gate first (`backlog-health-advisor` — premises get VERIFIED against code, not
assumed; this caught the C-1 N+1, the C-3 contract gap, and the C-4 dup-500 — and pre-refuted AS-7
in the D expansion). Per TASK: `gpm-partner` executes (TDD RED first) → review chain in PARALLEL
(`two-hats-enforcer` + `naming-reviewer` + `test-quality-auditor` with **MUTATION PROBES** — they
caught a real hole on every C feature task) → apply findings → orchestrator VERIFIES independently
(run the suites yourself before committing) → commit per task with explicit paths + the contract
snapshot. PREP/extraction = separate commit (Two Hats). Naming/public-API renames land BEFORE the
contract freezes.

**★ CRITICAL review-tooling rule (hazard hit twice in EPIC C):** the `test-quality-auditor` reverts
mutation probes and MUST NOT use `git checkout`/`git restore` — the task files are UNCOMMITTED, so
git-revert DISCARDS the work. **In every test-quality dispatch, instruct it: back up the file to the
scratchpad dir and restore FROM THAT COPY; verify byte-identical via `diff`, never git.**

## Standing rules (do not violate)

- Ops idiom: derived logic in PURE selectors under `src/components/ops/` (anti-smart-ui); screens
  render+wire only; flag `VITE_OPS_REDESIGN`; replace the OpsShell `ops-screen-sync` placeholder in
  place (keep the testid). Sibling-module rule — new `syncSelectors.ts`/`useSyncData.ts`, byte-stable
  existing modules.
- TD-23 (no ui/Btn|Button in ops), TD-24 (sanctioned accessors), TD-25 (repo relations, not
  Event.participants). Vitest globals OFF; explicit cleanup(); fixtures deep-frozen; anonymised names.
- 2nd write surface (merge decisions): single-flight guard (synchronous ref latch — `registry-create v1`
  `isSubmittingRef` precedent), gate-pinned error/idempotency contract (do NOT guess shapes).
- Report debt candidates as TEXT (debt-register.md has uncommitted parallel-session edits).
- **STOP and ask the architect at the two gates above** (D-2-T0 ADR-012 extraction; D-3-T0 AS-7
  backend guard) — both are genuine architect calls with tradeoffs, mirroring the C-4 gate.

## Open items parked for the architect (do not act, keep visible)

- Initiative is UNPUSHED/UNMERGED: PRs #10 (A) → #11 (B) → this stacked C/D branch. Merge/push is a
  housekeeping step whenever the architect wants it.
- ADR-014 amendment: carry `?day`/`?event`/`?record` across tab switches (currently deep-link only) —
  parked at the EPIC B retro.
- Backend `broadcastSlots.ts` inclusive-`lte` day window (midnight slot returns for two days —
  suspected bug; e2e models half-open and documents the divergence).
- E-2 designer notes (EPIC C): `--registry-*` STATUS token family · sport-icon + per-kind create
  fields · provenance shows SOURCE code not full name · registry row-click keyboard a11y.
- AS-4 threshold formulas PROVISIONAL (ADR-015, rights-windows track) · TD-26 designer sign-off ·
  TD-27 runtime-flag decision at EPIC E.

Report at the end of each task: commit hash, test counts, snapshots produced, review-chain outcomes,
debt candidates, and what's next.

---

After EPIC D closes: EPIC E — HARDENING + cutover decision (Mode: HARDENING) — SLO measurement (E-1),
the ImportView/ReviewTab migration if deferred from D-2-T0, TD-27 runtime-flag decision, cutover ADR.
