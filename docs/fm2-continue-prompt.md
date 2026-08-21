# Continue: Planza/FM — EPIC FM-2 Session Kickoff (saved 2026-08-21, post-FM2-1)

> Paste into a fresh Claude Code session in `/home/yannick/Claude/Projects/AirSporza` to resume.
> Supersedes nothing FM-specific (first FM continue-prompt); the domain-gaps initiative's own
> `docs/sv3-continue-prompt.md` is a separate, still-current thread — see "Standing threads" below.
> **Execution mode: DELIVERY, full governance** (CLAUDE.md + `.claude/frameworks/core-specification-v1.md`):
> DoR re-gate per EPIC (backlog-health-advisor), TDD RED-first, one Hat per task, architect
> decisions surfaced not auto-picked, check in at story/EPIC boundaries. Delegate execution to a
> `general-purpose` agent playing the `gpm-partner` role (instruct: do NOT commit), verify its
> output yourself (tsc + full suites, independently re-run — do not just trust the agent's own
> report), then commit in hat-sliced commits per task.

## Where everything stands (all MERGED to `origin/main`, tip `dd03c00`)

**EPIC FM-1 (Planza/FM tracer bullet) — COMPLETE**, all 7 stories shipped 2026-08-21: FM1-1
tokens, FM1-2 shell+URL state, FM1-3 action-item derivation, FM1-4 Home screen+migration, FM1-5
CONTINUE loop, FM1-6 create modal, FM1-7 smoke test+runbook (`docs/runbooks/fm-shell.md`). Flag
`fmShell`/`VITE_FM_SHELL` stays OFF everywhere incl. production — no rollout decision made yet.

**EPIC FM-2 (Schedule board upgrades) — backlog expanded and DoR-READY, execution IN PROGRESS.**
The DoR re-gate (`docs/backlog-planza-fm.md` §"EPIC FM-2", commit `5aaeb74`) surfaced a real gap:
the original outline assumed a structured 409 existed on the channel-reassignment write path — it
didn't. Architect ratified building it (decision C4) as a new named task, FM2-2-T0.

| Story | Task | Status |
|---|---|---|
| FM2-1 — Unplaced tray + suggestions | FM2-1-T1 (backend `GET /api/schedule/suggestions`) | ✅ merged `9ae89f7` |
| FM2-1 — Unplaced tray + suggestions | FM2-1-T2 (`FmScheduleBoard` screen scaffold) | ✅ merged `dd03c00` — **Story FM2-1 CLOSED** |
| FM2-2 — Inspector actions | FM2-2-T0 (new `broadcastSlotConcurrencyGuard` 409 on `PUT /broadcast-slots/:id`) | ⏳ **NOT STARTED** — an attempt was launched and killed cleanly mid-session (3 min in, zero disk changes, confirmed via `git status`) to free the session for this pickup. Relaunch fresh. |
| FM2-2 — Inspector actions | FM2-2-T1 (TD-32 fix: `ApiError.details`) | ⏳ blocked on nothing upstream — can run in PARALLEL with FM2-2-T0 |
| FM2-2 — Inspector actions | FM2-2-T2 (`EventInspector` v2 + wiring) | ⏳ blocked on FM2-2-T0 + FM2-2-T1 + FM2-1 (done) |
| FM2-3 — Conflict-aware rows | FM2-3-T1 | ⏳ blocked on FM2-1-T2 (done) — can start once picked up |
| FM2-4 — History + undo | FM2-4-T1, FM2-4-T2 | ⏳ FM2-4-T1 blocked on FM2-2-T0 (reuses its concurrency guard); FM2-4-T2 blocked on FM2-4-T1 + FM2-2-T2 |
| FM2-5 — Cascade banner | FM2-5-T1 | ⏳ **cross-epic pull gate**: blocked on EPIC SV's Story SV-3 being PULLED (see Standing threads) |

**Baselines (independently re-verified by the orchestrator at each merge, not just agent-reported):**
backend `npx vitest run` (from `backend/`) **821 pass / 66 skipped**; frontend `npx vitest run`
(repo root) **1000 pass**; `tsc --noEmit` clean both. Playwright: all 3 projects (`flag-on`,
`flag-off`, `flag-fm-on`) clean except **2 PRE-EXISTING, CONFIRMED-UNRELATED** flag-on failures
(`smoke-epic-b.flag-on.spec.ts` RIGHTS-tab URL param retention; `smoke-epic-c.flag-on.spec.ts`
registry row count 20 vs 24) — reproduced against clean `main` via `git stash` at FM1-7-T1, not
caused by any FM work; flag for separate architect attention, do not spend time chasing them here.

## The open lane

**EPIC FM-2 execution, next task: FM2-2-T0.** Full task spec: `docs/backlog-planza-fm.md` lines
839-871 (read the surrounding Story FM2-2 block, lines 766-900, for AC/Interfaces context). One-line
summary: add an OPTIONAL `expectedUpdatedAt` field to `PUT /api/broadcast-slots/:id`'s request body;
when present and stale, return `409 {error, message, currentUpdatedAt, currentSlot}`; when absent
(every existing caller today), behavior is byte-identical. Prefer the ATOMIC check-in-the-update-query
pattern `schedules.ts`'s `PATCH /schedule-drafts/:id` already uses (not a separate read-then-write,
which has a TOCTOU race) unless `BroadcastSlot`'s Prisma model can't support it. Watch for the
millisecond/microsecond `updatedAt` comparison trap — the SV-3 ripple work hit this exact class of
bug earlier in the project (`docs/sv3-continue-prompt.md`'s B2 note); verify Prisma's actual
`updatedAt` precision before trusting a raw equality check.

After FM2-2-T0 lands: FM2-2-T1 (TD-32, independent — could have run in parallel with T0, your call
next session) → FM2-2-T2 (EventInspector v2, needs both T0+T1) → FM2-3-T1 and FM2-4-T1/T2 (can
interleave, FM2-4 needs FM2-2-T0's guard) → FM2-5 stays parked on SV-3.

**After EPIC FM-2 fully lands:** the backlog's own EPIC FM-2 header flags a gap it deliberately did
NOT fill — recommend running the same DoR re-gate → backlog-builder expansion flow for **Story
FM2-6 (smoke test + runbook)**, mirroring FM1-7's shape, before calling EPIC FM-2 done. Also:
`fmScheduleUrlState.ts`/`useFmScheduleDay` selection is local-state-only today (not URL-persisted) —
revisit if a future story needs to deep-link a specific event into `/fm/schedule`.

## Standing threads (not this session's focus, but touch these lanes)

- **EPIC SV's Story SV-3** — DoR-READY but still UNPULLED as of 2026-08-21 (re-verified during the
  FM-2 DoR re-gate; no status doc newer than `docs/sv3-continue-prompt.md`, 2026-07-24, exists).
  Gated on an ops-stakeholder FEED=review taste-test that has not happened. This blocks FM2-5 only.
- **TD-32** (`docs/governance/debt-register.md`) — will be SETTLED by FM2-2-T1 (minimal fix:
  `ApiError` gains `details?: unknown`). Execution should record the settlement in the debt
  register per project convention — flagged as NOT done by the backlog expansion itself (out of
  its docs-only edit scope); do it as part of FM2-2-T1's own commit.
- **A new DRY flag from FM2-1-T2**: `RIGHTS_COLOR`/`CREW_COLOR`/`EDITORIAL_COLOR` word-color maps
  are now duplicated a 3rd time (`ops/ScheduleScreen.tsx`, `ops/EventInspector.tsx`,
  `FmScheduleBoard.tsx`) — Rule of Three is met, extraction was out of FM2-1-T2's file-touch
  bounds. Worth a follow-up PREPARATORY task (not urgent, not blocking).

## Conventions / gotchas (hard-won this session — do not relearn)

- **Playwright-heavy e2e tasks are prone to genuine agent stalls** in this environment (two
  separate FM1-7 attempts hit "no progress for 600s" and failed outright). When a task needs real
  `npx playwright test` runs with webServer boot, prefer driving it directly (short `timeout N`-
  wrapped Bash calls, incremental `-g "<test name>"` isolation) over one long blind subagent call.
- **A killed/failed subagent's file edits often survive and are usable** — check `git status`/
  `git diff` before assuming a stall means lost work (this happened for FM1-6-T1: killed mid
  "final review", implementation was complete and verified clean). Always re-verify independently
  (tsc + full suite) before trusting salvaged output. `TaskStop` (task_id from the launch result)
  is the tool; `ToolSearch("stop kill cancel agent task")` finds it if not already loaded.
- **Every FM task's verification must run the FULL unfiltered test suite**, not a scoped
  `src/components/fm/` run — FM1-4-T1 shipped with a scoped-run pass that missed a real regression
  in a sibling routing test file; only the full `npx vitest run` caught it. This is now a hard
  rule for this initiative, not a suggestion.
- **Always independently re-verify a subagent's report** — re-run tsc/tests yourself, re-read the
  actual diff, don't just trust the final message. This session caught: a broken route target
  (`/ops/rundown` instead of `/ops/planner`, FM1-3-T1), a mid-render `setState` bug (FM1-4-T1), a
  stale test assertion from an outdated placeholder (FM1-4-T1's full-suite catch), and confirmed
  (rather than assumed) that flagged "pre-existing" test failures actually predate the session's
  changes via `git stash` + rerun against clean `main`.
- **Signature drift between the story's literal AC prose and real shipped code is the norm, not
  the exception**, for anything crossing the frontend/backend boundary — `fmActionItems.ts`
  (FM1-3-T1) and `scheduleSuggestions.ts` (FM2-1-T1) both hit this (frontend selectors like
  `deriveCrewHealth`/`deriveRightsStatus` have no direct backend equivalent) and both resolved it
  the same way: investigate candidate backend functions, REJECT the ones that don't cleanly match
  the AC's exact boolean gate (documenting why), then mirror the frontend logic verbatim with a
  cross-referencing comment + a fixture-parity test proving both sides agree. Expect this pattern
  to recur in FM2-4 (undo) and beyond.
- **Backlog-builder agents can run very long on big expansions** (EPIC FM-2's own expansion took
  ~11 min of wall-clock/tool-use time but did NOT stall) — don't confuse "long" with "stuck";
  check elapsed time against the task's actual complexity before intervening.
- Branch: this project commits directly to `main` per observed convention this session (no feature
  branches were used) — confirm this is still wanted before deviating.
- Git identity on a fresh machine may need setting (`git config user.name`/`user.email`) — this
  bit a prior session; check `git log -1 --format='%an <%ae>'` if a commit fails with "Author
  identity unknown".
- Dev environment (if you need to run the app, not just tests): Postgres 17 container `planza-db`
  on `localhost:5433`, Redis container `planza-redis` on `localhost:6379`, both `--restart
  unless-stopped`. `npm run dev:full` — frontend on port **5177** (pinned, `strictPort`, since
  port 5173 collides with an unrelated local project). See `STATUS.md` for full detail.
