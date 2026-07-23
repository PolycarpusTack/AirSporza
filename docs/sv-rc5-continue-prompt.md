# Continue: Domain-Gaps Initiative — Session Kickoff (saved 2026-07-23, post-#25)

> Paste into a fresh Claude Code session in `C:\Projects\Planza` to resume. The auto-memory
> `domain-gaps-initiative` mirrors this in short form. **Execution mode: DELIVERY, full
> governance** (CLAUDE.md + `.claude/frameworks/core-specification-v1.md`): DoR re-gate per story
> (backlog-health-advisor), TDD RED-first, one Hat per task, the full review chain on every task
> (two-hats-enforcer + test-quality-auditor + code-smell-detector + naming-reviewer /
> ubiquitous-language-guard — run the four reviewers IN PARALLEL as background agents; that's the
> established pattern), architect decisions surfaced not auto-picked, check in at story/EPIC
> boundaries. Delegate execution to `gpm-partner` (instruct it: do NOT commit; leave the tree for
> review), verify its output yourself (tsc + full suite), apply review-chain fixes, then commit.

## Where everything stands (all MERGED to main, tip `fa5093a`)

| PR | What | Key facts |
|---|---|---|
| #22/#23 | RC-1 Listed Events · RC-2 Accessibility Deliverables (T1 model+defaulting, T2 state machine+API+KPI, T3 `ACCESSIBILITY_UNPLANNED`+TD-30 stub removal) | snapshots `listed-events v1`, `accessibility v1`; both flags ship OFF |
| #24 | TD-31: `seedDefaultAccessibilityDeliverables(tx, event)` service — ALL five event-creation sites seed; backfill migration `20260722120000` | tenantId read from the event row (structural tenant safety) |
| #25 | AS-8: `CASCADE_PREVIEW_PARITY` (TD-5/12/13/14 settled) — flag-gated anchor+confidence parity per ADR-008; flag-independent: deterministic outbox key `cascade.recomputed:<tenantId>:<courtId>:<dateStr>:<5-min bucket>` + outbox write in the engine tx | **flag ships OFF; TD-13/14 reliability is LIVE; EPIC SV (SV-2+) IS UNBLOCKED** |

**Baselines:** backend vitest **675 pass / 42 skipped** (run from `backend/`, NOT repo root — root runs
the frontend suite, 838 pass); backend+root tsc clean. Gated suites (RLS_TEST=1) skip locally, run in CI.

**Architect decisions recorded (backlog, RC-2 addendum, 2026-07-23):** (A) accessibility lifecycle
FORWARD-ONLY · (B) T888 CONFIG-LOCKED (both doors 400) · (C) per-tenant config approved → Story RC-5.
Implicitly ratified at #25 merge: tenant-in-idempotency-key + 5-minute bucket.

**Open debt:** TD-32 (frontend `ApiError` discards structured 409 bodies — service with the FIRST UI
consumer of `accessibilityApi`, not before). Residual note on TD-31: "every creation site seeds" is
convention — re-check when a new event writer lands.

**Deliberately uncommitted (do NOT commit unless asked):** `docs/extradesign/` + its
`REVIEW-VERDICT.md` (design review: fixture family = MINE, registry = SHELVE; mine-list lives in the
verdict file — RightsPackageVersion→RD follow-on, RemediationTask/taint→SV-4/5, register-console
UX→Teams/Players follow-on), `docs/Application redesign review.zip`, `.claude/worktrees/`.

## The three open lanes

1. **SV-2 (code, L)** — feed→`RippleProposal` per **ADR-019** (accepted): FEED changes = propose
   (fixes G8 silently-stale slots), MANUAL/CASCADE = auto-apply; apply reuses
   eventSlotBridge/scheduleOperations; idempotent by `sourceChangeId`; supersession; apply re-runs
   validation. AS-8 gate now satisfied. Re-gate DoR first (backlog-health-advisor) — the backlog
   §SV was written pre-ADR-019-acceptance; check SV-2's ACs against the ADR. Mind TD-28 (slot-sync)
   notes in the register. Later: SV-3 → SV-4 (must BUILD switch execution — ChannelSwitchAction
   executes nothing today) → SV-5.
2. **RC-5 (code, M)** — per-tenant accessibility config, **DoR READY** (backlog, after RC-4):
   T1 PREPARATORY `TenantAccessibilityConfig` (migration + RLS + `loadTenantAccessibilityConfig`
   merging over the three constants in `backend/src/config/accessibility.ts`; partial-row merge
   semantics to be decided+pinned in T1) · T2 FEATURE consumer wiring (seeding service, KPI targets
   param, lead time) + admin GET/PUT + snapshot `accessibility-config v1`. Mechanism-only; values
   stay TODO-KPI until RC-0-T1.
3. **RC-0 people-work (the architect's, not codeable):** RC-0-T1 KPI verification (fills
   `docs/plans/rc-0-kpi-verification-checklist.md` → config/tenant-row values) · RC-0-T2 ADR-017
   enforcement-boundary session (fixes the provisional WARNING severities of `LISTED_EVENT_FTA` +
   `ACCESSIBILITY_UNPLANNED` and the lead-time N=14 guess) · RC-0-T3 besluit-2004 seed-list check.

## Suggested flow (with parallel execution)

**Recommended: Option P (parallel lanes) —**
1. Kick off **RC-5** via gpm-partner FIRST (smaller, self-contained: touches only
   config/accessibility.ts consumers + a new table — zero overlap with SV's cascade/import/slot
   files). While it runs in the background:
2. Run **SV-2 DoR re-gate** (backlog-health-advisor against ADR-019) and read the SV-1 spike memo
   (`docs/plans/2026-07-11-sv-1-ripple-spike.md`) — this is reading/gating work that costs no tree
   state.
3. When RC-5's execution returns: review chain (4 parallel reviewers) → fixes → commit → PR →
   architect merge. THEN branch for SV-2 and execute it with full focus (it's the largest story;
   its review chain will be heavier).
4. The architect runs the RC-0 people-work in parallel with all of the above at any time — its
   outputs land as config edits/tenant rows + an ADR-017 update + severity config, no code
   sequencing dependency (RC-5 makes the KPI values land as data instead of code).

**Sequencing rule for parallel code work:** one branch at a time in the primary tree. If two code
stories must genuinely run simultaneously, give the second gpm-partner `isolation: worktree` — but
prefer serial branches; this session's pattern (execute → review in parallel → commit → merge →
next branch) had zero conflicts. NEVER run two agents that write the same files concurrently;
reviewers (read-only) always parallelize safely.

**Boundary checkpoints:** after RC-5 PR and after SV-2 PR, stop and check in (merge decision +
surfaced decisions), as done for #23/#24/#25.

## Conventions / gotchas (hard-won this session — do not relearn)

- Branch `feature/[STORY-ID]-slug`; commits `type(scope): summary`, trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; squash-merge PRs (`gh pr merge N
  --squash --delete-branch`) ONLY on explicit architect approval; PR bodies end with the
  Claude Code attribution line.
- Flags: build-time, `z.string().optional().transform(v => v === 'true')` — NEVER
  `z.coerce.boolean`. Service-level default `opts.flag ?? env.FLAG` (rightsChecker pattern).
- NEVER run `npx prisma format` (it reformats the whole schema and destroys additive-diff
  discipline — restore from HEAD + re-apply if it happens). Keep every FEATURE diff additive;
  verify with `git diff -w` / `git diff main --stat`.
- Run backend tests from `backend/`; capture counts with
  `npx vitest run 2>&1 | grep -a "Test Files\|Tests \|Errors"` (plain `tail -N` can cut the counts
  and pipe masks exit codes). A run with stray "N errors" under heavy parallel-agent load is a
  known cold-cache/load flake — re-run before diagnosing.
- backlog-builder rewrites files whole (Write tool) — always verify its output with
  `git diff --stat` (expect insertions-only).
- Characterization suites: env-pin flags inside the suite (Proxy mock), expectation changes only
  with inline ADR justifications, one at a time.
- Anonymised fixtures; RLS `tenant_isolation` on every new tenant table (ADR-011); tenant
  identifiers derived from the owning row, not passed alongside it (TD-31 lesson).
- Memory updates at every merge/boundary (auto-memory `domain-gaps-initiative` + MEMORY.md index).

## Standing threads (unchanged)

RD-6 (RightsPolicy deprecation — needs prod `RIGHTS_WINDOWS_ENABLED` ON first, a deploy-pipeline
action) · RD-7 (slot coverage-category → unlocks non-LIVE holdback) · RC-3 HELD (Q4
reporting-consumer + RC-0-T1 numbers) · RC-4 (EPIC RC smoke+runbook, READY after RC-3) · ops
mutation surfaces + ImportView tabs reconciliation (follow-on initiative; mine the register-console
UX patterns from the extradesign verdict when it starts).
