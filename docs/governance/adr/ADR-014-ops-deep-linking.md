# ADR-014: Ops navigation state is URL-backed (deep-linkable)

**Status:** Accepted (2026-07-02)

## Context

The design handoff recommends deep-linking tab + selection into the URL. Today, planner state
(selected date, filters, selection) is component-local; the only cross-screen hand-off is a
hard `window.location.href = '/sports?eventId=...'`. The Ops design shares selection between
SCHEDULE and the rundown (PLANNER) screens and hops between registry records — state that dies
with the component makes those flows unshareable and unrestorable.

## Decision

Ops navigation state lives in the URL via react-router `useSearchParams`:

- Route: `/ops/:tab` (schedule | planner | rights | registry | sync).
- Query params: `?event=<id>` (shared Schedule/Rundown selection), `?day=<ISO date>`
  (rundown day / schedule week context), `?record=<id>` (registry inspector).
- Wrapped in dedicated hooks (`useOpsSelection`, `useOpsDay`) so components never touch
  search params directly; hooks validate params and fall back silently on unknown ids.
- Ephemeral UI state (hover, open modals, facet filters, search text) stays component-local;
  facet/search promotion to URL can be revisited if sharing demand appears.

## Consequences

- Selection survives reload, back/forward works, and links are shareable — which also makes
  E2E smoke tests simpler (navigate by URL).
- URL becomes a public contract: param names above don't change without a migration shim.
- The existing (non-ops) planner is not retrofitted; if EPIC E cutover replaces it, this
  pattern comes along for free.

## Review date

EPIC E, or 2026-10-02.
