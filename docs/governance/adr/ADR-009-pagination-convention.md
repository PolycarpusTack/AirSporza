# ADR-009: Pagination convention — opt-in limit/offset with envelope

**Status:** Accepted (2026-06-12)

## Context

List endpoints returned entire tables (`findMany` with no `take`) and the SPA loads everything
into context — the biggest scalability cliff found by the evaluation (TD-7). The Planza frontend
is the API's only consumer (ASM-7, re-verified: no external consumers in webhook/integration configs),
so the migration can be coordinated rather than versioned.

## Decision

1. **Opt-in:** absent `limit`/`offset` → legacy plain-array response, byte-compatible. Either param
   present → envelope `{ data, pagination: { total, limit, offset } }`.
2. **Bounds:** `limit` 1–200 (Zod-validated, 400 on violation), `offset` ≥ 0. Shared fields in
   `backend/src/utils/pagination.ts` (`paginationQueryFields`, `getPagination`, `paginationEnvelope`).
3. **Stable ordering:** paginated queries append an `id` tiebreak to the endpoint's natural ordering
   (events: `startDateBE, startTimeBE, id`; teams: `name, id`; import records: `createdAt desc, id`).
4. **Cursor pagination deferred** until a proven need (deep-offset performance or live-shifting pages);
   limit/offset matches the planner's page-window access pattern and keeps `total` cheap.
5. Server-side *default* limits stay off until the frontend ships incremental loading (B-4-T3,
   `INCREMENTAL_LOADING` flag); a future `API_DEFAULT_PAGE_LIMIT` flips the default.

## Alternatives considered

- **Cursor (keyset) pagination:** better at depth, but no `total`, more complex client state; deferred.
- **Always-enveloped v2 endpoints:** versioning overhead unjustified with a single first-party consumer.
- **GraphQL/connection spec:** out of proportion for this API.

## Consequences

- Applied to `/api/events` (B-4-T1), `/api/teams` + import listings (B-4-T2); remaining
  `findMany` routes adopt the helper opportunistically (TD-7 servicing decision).
- **Amendment (B-4-T2):** the import listings (`/records/unlinked`, `/jobs`, `/merge-candidates`,
  `/dead-letters`) already accepted `limit` with plain-array responses, so for those endpoints the
  envelope keys on the NEW `offset` param only (`getOffsetPagination`); their lenient legacy `limit`
  parsing is preserved. Greenfield endpoints use the standard either-param rule.
- Field-visibility shaping (B-1) runs on the page slice before enveloping — order matters and is tested.

## Review date

After B-4-T3 ships incremental loading (default-limit decision), or 2026-12-12.
