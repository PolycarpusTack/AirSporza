# Session kickoff prompt — Ops redesign: finish Story A-4, then A-5

Paste the block below into a fresh Claude Code session in `C:\Projects\Planza`.
(Written for Opus 4.8: every binding fact is stated inline — execute as written, do not re-derive
decisions that are marked as already made.)

---

Continue the Ops redesign (EPIC A tracer bullet). Execute **A-4-T1 (EventInspector component)**,
then **Story A-5 (E2E smoke + runbook)**, then the **EPIC A retro**. DELIVERY mode per CLAUDE.md.

## Where we are (verified state — do not re-audit)

- Stories A-1, A-2, A-3 are DONE and **merged to main** (PRs #6, #9, #8).
- Branch **`feature/A-4-event-inspector`** exists (based on the A-3 tip `5aa5299`, an ancestor of
  main — a PR from it to main will show only A-4 commits). On it, already committed:
  - `55dc20f` fix(crew): conflict display strings (getDateKey normalization)
  - `fdc9c4a` feat(ops): A-4-T0 ops-selectors v2 (`deriveRightsInfo`, `deriveCrewRoles`,
    `filterConflictsToEvent`) — the A-4 DoR gate added task T0 because v1 selectors could not
    produce the RIGHTS "until <date>". Both tasks passed the full review chain.
- Suite: **407/407**, `tsc -b` clean. Flag `VITE_OPS_REDESIGN` default OFF.
- The working tree may contain uncommitted `docs/` files from the parallel domain-gaps/rights
  session (`debt-register.md` edits, ADR-015, `docs/backlog-planza-domain-gaps.md`, plans, zips)
  and `.claude/worktrees/`. **Never stage, edit, or revert those.** Stage files for commits
  explicitly by path — never `git add -A`.

## Context to read first (in this order, nothing else needed)

1. `docs/backlog-planza-ops-redesign.md` §Story A-4 + §4 Domain Glossary.
2. `docs/governance/contracts/ops-selectors.md` (**v2** — the surface T1 consumes).
3. `docs/governance/contracts/ops-selection.md`, `ops-tokens.md` (v3), `OpsShell.md` (v1).
4. `docs/design_handoff_planza_ops/README.md` §1 SCHEDULE **inspector spec** (exact styling).
5. `src/pages/ops/ScheduleScreen.tsx` (the mount point + established component idioms) and
   `src/components/ops/__fixtures__/opsFixtureWeek.ts` (test data; deep-frozen — never mutate).

## Task A-4-T1 — EventInspector (Hat FEATURE, TDD: interaction tests FIRST)

Use the `gpm-partner` agent (ZAP per `.claude/frameworks/gpm-v2.1.md`); flow per CLAUDE.md:
gpm-partner executes → review chain (`two-hats-enforcer` + `naming-reviewer` +
`test-quality-auditor`, run in parallel) → apply findings → commit `feat(ops): ...`.

**Component:** `src/components/ops/EventInspector.tsx` (SHARED — B-1 Rundown will reuse it).
Props-driven, NO fetching, NO `useApp` inside (decision already made):

```ts
export interface EventInspectorProps {
  event: Event | null                    // null → quiet empty state
  contracts: Contract[]                  // ScheduleScreen already fetches these
  techPlans: TechPlan[]
  conflicts: ConflictMap                 // the screen's single detectCrewConflicts pass
  conflictGroups: PersonConflictGroup[]  // single memoized groupConflictsByPerson pass (screen-side)
  crewFields: FieldConfig[]
  competitionName?: string
  now?: Date                             // testability seam; tests pass FIXTURE_NOW
}
```

**Mount:** third child of ScheduleScreen's flex row (its comments mark the slot), width 320px,
`--surface-shell` bg, 1px left border. ScheduleScreen resolves `eventId` (string from
`useOpsSelection`) → `Event | null` and threads the props; it must call
`groupConflictsByPerson(techPlans, events)` ONCE, memoized, next to its existing
`detectCrewConflicts` memo.

**Sections (design README §1 inspector spec is the styling source of truth; ops-tokens v3 vars
only — `--rights-*`/`--crew-*` aliases for words, `--status-*` ONLY for editorial words, no hex):**
1. INSPECTOR label; LIVE/DELAYED bordered badge + editorial status word + title (15px/600).
   Badge rule (pinned decision): from `isLive`/`isDelayedLive` booleans; **both true → LIVE wins**;
   neither → no badge. Do NOT use `event.status === 'live'` for the badge.
2. Mono meta lines: competition; `WED 4 MAR · 21:00 · 150 min · <channel>` — duration via
   `effectiveDurationMin(event)` from `src/utils/dateTime.ts` (sanctioned accessor, TD-24),
   channel from `event.channel?.name` with `—` when null (matches the table column).
   Date format `WED 4 MAR` = component-local formatter (do NOT extract/share with
   ScheduleScreen's `dayHeaderLabel` — Rule of Three, this is occurrence two).
3. Red conflict callout (1px `--alert-danger` border, 10% alpha bg via color-mix, radius 6) when
   `filterConflictsToEvent(event, conflictGroups)` is non-empty; text from `PersonConflictGroup`
   detail; the `role` field is a raw crew **fieldId** — map to label via `crewFields`.
4. RIGHTS section: dot + status word + `until <date>` from `deriveRightsInfo` —
   `validUntil: null` → no "until" line; lapsed date renders (informative).
5. CREW section: rows from `deriveCrewRoles` — dot (state color), name (11.5px/600, `—` when
   null), role label mono `--text-shell-3`, right-aligned state word.
6. TECH PLANS: chips from the event's plans (`planType` label) + dashed `+ PLAN` ghost button
   navigating to **`/sports`** (plain absolute navigation — SportsWorkspace cannot preselect an
   event, its selection is component-local state; this limitation is recorded; RequireRole may
   bounce non-planner roles — acceptable, documented).
7. No selection → quiet empty state (mono label).

**AC interpretation pins (already decided — write tests to these):**
- "Updates without full-screen re-render" means: NO remount/refetch/state-loss —
  `contractsApi.list` called exactly ONCE across selection changes; `sportFilter` preserved.
  Test via mock call-count + state assertions, never render-count.
- Crew rows derive from `crewFields` (visible, non-checkbox) — never a hard-coded role list.
- Editorial word colors: only draft/ready/approved; other statuses render `—` (ScheduleScreen
  precedent).

**Test guidance:** follow `src/pages/ops/ScheduleScreen.test.tsx` house patterns (vi.hoisted app
state, mocked `contractsApi`, MemoryRouter, explicit `cleanup()` in afterEach — vitest globals are
OFF). Fixture: extend ADDITIVELY via `makeEvent`/`makeContract` (fixtures are deep-frozen; A-3/A-4-T0
tests pin existing entries). Add badge/editorial/channel permutation events (none exist yet:
no fixture event sets `isLive`, `isDelayedLive`, `status`, or `channel`).

**Hand-off:** Contract Snapshot **`EventInspector v1`** in `docs/governance/contracts/`
(props table above + pinned decisions). Update backlog A-4-T1 line to DONE. Full suite
(baseline 407/407) + `tsc` before commit.

## Then Story A-5 — E2E smoke + runbook (closes the tracer bullet)

Run the `backlog-health-advisor` DoR gate first (verify: which e2e stack exists — the backlog says
"existing e2e stack"; if NONE exists, STOP and ask the user before introducing one). Scope per
backlog A-5-T1: flag ON → `/ops` → schedule renders fixture week → facet → row → inspector conflict
callout → theme toggle → reload persists → flag OFF → redirect. Write
`docs/runbooks/ops-shell.md` (rollback = flag off = REDEPLOY, per TD-27 — state it honestly).
Then the **EPIC A retro** per backlog §10: Phase Summary, update §6 Architecture Memory
(planned → built), mode check, then expand EPIC B with `backlog-builder` if the user wants to continue.

## Standing rules (do not violate)

- TD-23: never import `ui/Btn` or `ui/Button` into ops code.
- TD-24: never read `Event.linearChannel/radioChannel/onDemandChannel/duration` or Contract
  boolean rights; sanctioned paths are `event.channel` relation + `effectiveDurationMin`.
- OpsShell v1: any navigation inside `/ops/*` uses absolute paths (`OPS_BASE`); `setSearchParams`
  is safe.
- Commit per task; report shortcuts as debt-register candidates BUT check `git status` first — if
  `docs/governance/debt-register.md` still has uncommitted parallel-session edits, report the
  entry text in your summary instead of editing the file.
- STOP and ask only if: a pull-gate contract contradicts the codebase, no e2e stack exists (A-5),
  or an AC cannot be satisfied without touching a legacy screen (ADR-012 forbids that).

Report at the end: tasks done with commit hashes, test counts, snapshot(s) produced, review-chain
outcomes, and the retro summary.

---

After EPIC A closes: next is EPIC B (Rundown + Rights) — B-1-T1 starts with the AS-3
BroadcastSlot coverage pull gate (SPIKE if <90%). The AS-4 threshold formulas are PROVISIONAL
pending the rights-windows work (ADR-015, separate track) — the revisit only touches
`src/components/ops/selectors.ts` + its permutation tables.
