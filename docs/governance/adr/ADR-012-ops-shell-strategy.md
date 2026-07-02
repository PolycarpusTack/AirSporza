# ADR-012: Ops redesign ships as a parallel feature-flagged shell

**Status:** Accepted (2026-07-02)

## Context

The "Ops" redesign (`docs/design_handoff_planza_ops/`) covers five monitoring surfaces that
overlap existing pages: SCHEDULE≈ScheduleView, PLANNER≈PlannerView, RIGHTS≈ContractsView,
REGISTRY≈TeamsView, SYNC≈ImportView. The design explicitly keeps existing editing surfaces
(contract forms, tech-plan editor, crew assignment) out of scope — it is a browsing/monitoring
layer, not a full replacement. Two strategies were considered:

1. **In-place redesign** — restyle each existing page toward the Ops language. Rejected:
   entangles redesign work with live production screens, forces the editing surfaces to
   restyle prematurely, and makes rollback per-screen instead of global.
2. **Parallel flagged shell** — new `OpsShell` mounted at `/ops/*`, gated by a feature flag,
   existing routes untouched.

## Decision

Build the redesign as a parallel shell at `/ops/:tab` behind feature flag **`opsRedesign`**
(default OFF). Existing pages are not modified; ops screens are new components under
`src/components/ops/` + `src/pages/ops/`, lazy-loaded so the flag-off bundle is unchanged.
Existing editing screens remain the system of record for mutations; ops surfaces link to them.

The cutover/deprecation decision (replace old routes, or keep both permanently) is explicitly
deferred to EPIC E (hardening) as its own ADR, informed by real usage of the flagged shell.

## Consequences

- Zero regression risk to current users; rollback = flag off.
- Temporary duplication of some presentation logic (e.g. merge-candidate review exists in
  `ImportView` and will exist in the SYNC screen). This is the designated Rule-of-Three
  extraction point — shared logic is extracted when the second consumer lands (EPIC D), and
  tracked in the debt register if deferred.
- Two UIs coexist until EPIC E; navigation between them is one-way (ops → existing editors).

## Review date

EPIC E kickoff, or 2026-10-02.
