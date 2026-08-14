# ADR-020: Planza/FM ships as a third parallel feature-flagged shell at `/fm/*`

**Status:** **Accepted** (2026-08-14, backlog-builder drafted; ratified by architect 2026-08-14 —
Recommendation as drafted, Option 3, no changes)

## Context

The Planza/FM concept (`docs/design_handoff_planza_fm/README.md`) unifies the legacy app
(Planner, Sports, Contracts, Import) and the existing Ops shell (`/ops/*`, ADR-012) into one
Football-Manager-style interface: an inbox/CONTINUE loop, a consequence-aware schedule board,
season calendar, sport drill-down pages, a crew squad view, and a Match Day screen. The
`IMPLEMENTATION_PLAN.md`'s own "guiding decisions" already state a preference ("New shell, not a
rewrite... mount `FmShell` at `/fm/*` as a third route family beside legacy and `/ops`, behind a
new `fmShell` flag. Reuse the OpsShell lazy-chunk + theme-guard pattern verbatim.") — this ADR
exists to make that an explicit, reviewable architectural decision rather than an implicit plan
footnote, because it determines routing, flag, and shell-skeleton work across the whole FM
initiative (EPIC FM-1 Story FM1-2 depends on it directly).

ADR-012 (ops shell strategy) already established the precedent for exactly this situation
(legacy screens overlapped by a redesign): a parallel flagged shell rather than an in-place
restyle. Verified this session: `OpsShell` (`src/components/ops/OpsShell.tsx`) is a self-contained
lazy chunk mounted at `${OPS_BASE}/*` in `src/App.tsx` behind `isOpsRedesignEnabled()`
(`src/flags.ts`, build-time `VITE_OPS_REDESIGN` — TD-27), with its own tab registry
(`OPS_TABS`), a badge-publishing context (`OpsTabBadgeContext`), and `OpsThemeProvider`. None of
this is ops-specific in a way that blocks reuse — it is a generic "flagged lazy route family with
a tab registry and a badge-publish context" pattern. ADR-012 itself is scoped narrowly to `/ops/*`
though ("Build the redesign as a parallel shell at `/ops/:tab`..."), so it does not, as written,
license a third shell at a different mount point — hence a new ADR rather than an amendment.

## Options considered

1. **Fold FM into the existing Ops shell** (extend `OPS_TABS`, add FM's screens as new ops tabs).
   Rejected in the plan's own reasoning: FM's information architecture (sidebar with
   OVERVIEW/PLANNING/SPORT/RESOURCES sections, inbox-first navigation, CONTINUE loop) is a
   different shell shape from the Ops top-bar tab strip, not an additive screen. Forcing it into
   `OpsShell`'s chrome would require a chrome rewrite mid-initiative, defeating the ops shell's own
   "existing screens untouched" guarantee (ADR-012 consequence #1).
2. **In-place rewrite of the legacy app toward FM.** Rejected for the same reason ADR-012 rejected
   it for Ops: entangles redesign work with live production screens, forces per-screen rollback
   instead of a global flag.
3. **Third parallel shell `FmShell` at `/fm/*`, behind a new `fmShell` flag, reusing the
   `OpsShell` lazy-chunk + tab-registry + badge-context pattern verbatim** (the plan's own
   preference). Existing `/ops/*` and legacy routes stay untouched; FM screens compose the same
   selectors/components ops already built (`EventInspector`, `ops/selectors.ts`,
   `detectCrewConflicts`, `groupEventsByDay`, `useContracts`).

## Recommendation

**Option 3.** It is the lowest-risk choice with a proven precedent one PR-history away
(`OpsShell v1`, `OPS_TABS`, `OpsTabBadgeContext` are all directly copyable shapes), it keeps
rollback to a single flag flip, and it does not require touching ADR-012/013/014 or any code they
govern. Concretely:

- Route: `FmShell` mounted at `/fm/*` in `App.tsx`, lazy-loaded, same `Suspense` pattern as
  `OpsShell`.
- Flag: `fmShell`, build-time (`VITE_FM_SHELL`), same explicit-string-comparison convention as
  `isOpsRedesignEnabled()` (never `z.coerce.boolean` — the RD-3/SV footgun already documented
  project-wide).
- Two shells (`/ops/*`, `/fm/*`) legitimately coexist through the FM initiative; retirement of
  `/ops/*` tabs into FM nav sections is explicitly Phase 5.3's own decision (ADR-016 precedent:
  cutover deferred to a hardening-stage ADR, informed by real usage), not this ADR.
- `fmUrlState` (or a sibling hook) starts as its own module rather than a forced extension of
  `opsUrlState` — Rule of Three (Core §5.5): FM is only the 2nd shell needing URL-backed
  selection; extract a shared implementation only if/when a 3rd shell needs it.

## Consequences

- Three shells (legacy, `/ops/*`, `/fm/*`) coexist during the initiative — matches the plan's own
  named risk ("Two-shell period... mitigated by flag + shared tokens; set a retirement ADR date up
  front"). This ADR is that up-front acknowledgment; the retirement date itself is Phase 5.3's
  call, gated on the ops-stakeholder taste-test (mirrors `docs/sv3-continue-prompt.md`'s
  FEED-review gate).
- FM screens that duplicate ops-screen intent short-term (e.g. FM Home CONTINUE deep-linking into
  `/ops/schedule?event=<id>` until FM's own Schedule board ships in EPIC FM-2) are an explicit,
  temporary bridge — see EPIC FM-1 Story FM1-4/FM1-5 note in the backlog — not a permanent
  duplication.
- Zero regression risk to current users of either existing shell; rollback = flag off.

## Review date

EPIC FM-1 kickoff (architect sign-off gates Story FM1-2's pull), or 2026-11-14.
