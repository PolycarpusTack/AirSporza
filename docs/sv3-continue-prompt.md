# Continue: Domain-Gaps Initiative — Session Kickoff (saved 2026-07-24, post-#27)

> Paste into a fresh Claude Code session in `C:\Projects\Planza` to resume. Supersedes
> `docs/sv-rc5-continue-prompt.md` (2026-07-23 — fully executed: both its lanes are merged).
> Auto-memory `domain-gaps-initiative` mirrors this in short form. **Execution mode: DELIVERY,
> full governance** (CLAUDE.md + `.claude/frameworks/core-specification-v1.md`): DoR re-gate per
> story (backlog-health-advisor), TDD RED-first, one Hat per task, full review chain per story
> (two-hats-enforcer + test-quality-auditor + code-smell-detector + naming-reviewer — run the four
> IN PARALLEL as background agents), architect decisions surfaced not auto-picked, check in at
> story/EPIC boundaries. Delegate execution to `gpm-partner` (instruct: do NOT commit), verify its
> output yourself (tsc + full suites), apply review-chain fixes via the SAME agent (SendMessage —
> it keeps its context), then commit in hat-sliced commits per the two-hats recommendation.

## Where everything stands (all MERGED to main, tip `c82a01f`)

| Commit/PR | What | Key facts |
|---|---|---|
| #26 `c524154` | **RC-5** per-tenant accessibility config (T1 PREP loader/migration + T2 FEAT consumers + admin GET/PUT) | snapshot `accessibility-config v1`; NO flag (no-row IS the off state, parity byte-pinned); RC-0-T1 values now land as tenant-row DATA edits |
| `6bb2482` | **SV-2 backlog expansion** (docs-only, kept out of the #26 squash) | SV-2 story with the six 2026-07-23 architect decisions baked into ACs |
| #27 `c82a01f` | **SV-2** feed-change capture → RippleProposal (G8 fix) — 3 hat-sliced commits (T1 `1a2fb8f` / T2 `508c41e` / T3 `dda5f6f`) | snapshot `ripple v1`; flag `scheduleRipple` ships OFF (flag-OFF byte-identical pinned by characterization test #1); outbox `ripple_proposal.created:<tenantId>:<sourceChangeId>` same-tx |

**Baselines:** backend vitest **779 pass / 57 skipped** (run from `backend/`; RLS_TEST=1 suites skip
locally, run in CI DB job); frontend (repo root) **838 pass**; tsc clean both.

**Implicitly ratified at #27 merge (the 5 PR-body items, per the #25 precedent):**
(1) ADR-019 §1 amended — `preview` envelope `{proposed, manualReviewSlots, rights}` replaces
"afterSlots = proposed slot values"; (2) `updatedAt` = the SOLE stale-at-apply concurrency handle
(BroadcastSlot has no `version` column — **SV-3's apply design must confirm or add one**);
(3) fingerprint `sourceChangeId` includes `sourceId`+`sourceRecordId` (different source proposing
identical values SUPERSEDES, doesn't dedupe; REJECTED suppresses byte-identical re-proposal);
(4) outbox lane `['socketio']` only + histogram observes `created` only — revisit both at SV-3;
(5) P2002 import race heals on next feed run (documented in capture.ts header + contract).

**Candidate debt flagged, NOT registered (architect call, from #27):** import-retry noise from the
P2002 race (register only if observed) · per-slot rights `results` duplication in preview JSONB
(SV-3 contract extension can dedupe to event-level `{ok, results}` + `slotIds[]`).
**Open debt:** TD-32 (frontend `ApiError` discards structured 409 bodies — service with the FIRST
UI consumer of `accessibilityApi`, not before) · TD-28 (overrunStrategy zod drift — **servicing is
named on SV-3's pull gate**; SV-2 shipped only the guard).

**Deliberately uncommitted (do NOT commit unless asked):** `docs/extradesign/` + its
`REVIEW-VERDICT.md`, `docs/Application redesign review.zip`, `.claude/worktrees/`. Also on origin:
branch `chore/health-reevaluation-2026-07` — NOT this session's, don't touch.

## The open lanes

1. **SV-3 (code, next in EPIC SV) — TWO PEOPLE-GATES FIRST:**
   (a) **FEED=review ops-stakeholder taste-test** (ADR-019 Open assumption 2) — SV-3 must not
   freeze the review UX until it confirms; (b) **TD-28 servicing** is a named task on SV-3's pull
   gate (its apply path is the first slot-write surface; also: `eventSlotBridge` upsert INSERT arm
   seeds `overrunStrategy='EXTEND'` — apply must not clobber an existing slot's strategy).
   SV-3 is an OUTLINE in the backlog (updated at the SV-2 expansion, `6bb2482`) — run the same
   flow as SV-2: backlog-health-advisor DoR re-gate → backlog-builder expansion (it must consume
   `ripple v1`, the `updatedAt` stale-at-apply detection, supersession semantics, and the
   ratified items above) → architect micro-decisions → gpm-partner. Apply = accept/reject
   mutations reusing eventSlotBridge/`deriveSlotSyncValues` + scheduleOperations; apply re-runs
   validation authoritatively (enrichment annotations are advisory only).
2. **RC-0 people-work (architect's, anytime):** RC-0-T1 KPI verification — values now land as
   **VRT tenant-row upsert via `PUT /api/accessibility/config`** (RC-5 shipped the mechanism), not
   code edits · RC-0-T2 ADR-017 enforcement-boundary session (fixes provisional WARNING severities
   of `LISTED_EVENT_FTA`/`ACCESSIBILITY_UNPLANNED` + the N=14 lead-time guess — also now a config
   value) · RC-0-T3 besluit-2004 seed-list legal check.
3. **Standing threads:** RD-6 (RightsPolicy deprecation — needs prod `RIGHTS_WINDOWS_ENABLED` ON
   first) · RD-7 (slot coverage-category → non-LIVE holdback) · RC-3 HELD (Q4 reporting consumer +
   RC-0-T1 numbers) · RC-4 (EPIC RC smoke+runbook, READY after RC-3) · SV-4 note: must BUILD
   switch execution (ChannelSwitchAction dead-ends at EXECUTING) + revisit `CASCADE_PREVIEW_PARITY`
   flag posture + spike characterization test #2 (confirm no-op) · ops mutation surfaces +
   ImportView tabs (follow-on initiative).

## Conventions / gotchas (hard-won — do not relearn)

- Branch `feature/[STORY-ID]-slug`; commits `type(scope): summary` + trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; squash-merge (`gh pr merge N --squash
  --delete-branch`) ONLY on explicit architect approval; PR bodies end with the Claude Code line;
  hat-sliced commits per story (PREP extractions/widenings land in the PREPARATORY slice).
- Flags: build-time, `z.string().optional().transform(v => v === 'true')` — NEVER
  `z.coerce.boolean`. Service-level default `opts.<name>Enabled ?? env.FLAG` (named, not `flag`).
- NEVER `npx prisma format` (restore from HEAD + re-apply if it happens); keep schema diffs
  additive (append models/enums); `npx prisma generate` after schema changes.
- Backend tests from `backend/`; counts via `npx vitest run 2>&1 | grep -a "Test Files\|Tests \|Errors"`;
  stray errors under parallel-agent load = cold-cache flake, re-run before diagnosing — BUT
  2-files-FAILED-with-0-test-failures = module-level error, NOT a flake (this session: whole-module
  `vi.mock` factories break when the mocked module gains a new export a prod module imports —
  upgrade to partial mocks via `importActual` spread; `events.test.ts`/`eventsBulk.test.ts` now
  model the idiom).
- Multi-directory command chains: the Bash tool mangled `cd`-mid-chain commands repeatedly — write
  a `.sh` script to the scratchpad and `sh` it instead (see this session's `verify-rc5.sh` pattern:
  backend tsc → backend suite → cd root → root tsc → frontend suite, sequential to avoid
  parallel-suite flakes).
- backlog-builder rewrites files whole — verify with `git diff --stat` + a scan of removed lines
  (expect insertions + only-authorized replacements). Backlog AC text is the DoR-approved RECORD —
  post-hoc renames live in ADR amendments + contracts, never rewrite approved ACs (annotate at
  ratification instead).
- Naming reviews BEFORE snapshot freeze (contract snapshots freeze names at commit); check
  aggregate-first outbox grammar (`ripple_proposal.created`, `channel_switch.created`) and
  env-var↔flag pattern (`SCHEDULE_RIPPLE_ENABLED`/`scheduleRipple`).
- Anonymised fixtures; RLS `tenant_isolation` in the SAME migration as any new tenant table
  (ADR-011); tenant identity from the owning row/auth context, never client-supplied; outbox
  idempotency keys carry tenantId (global unique column, TD-13).
- Memory updates at every merge/boundary (auto-memory `domain-gaps-initiative` + MEMORY.md index).
