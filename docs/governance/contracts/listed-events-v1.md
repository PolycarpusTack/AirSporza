# CONTRACT SNAPSHOT: listed-events v1

Version: 1 · Date: 2026-07-13 · Task: RC-1-T2 · pull-gate: RC-1-T1 schema (`65feb36`) · consumers: RC-1-T3 (`LISTED_EVENT_FTA` codes), ops event UI (own backlog) · smoke: RC-1-T3/retro

Category catalog + suggestion + human confirm/dismiss for "events of major importance"
(besluit 28 May 2004). No validation codes here — flag-independent storage/suggestion.

## Endpoints — base `/api/listed-events`

Mounted with `authenticate` + `setTenantContext` + `standardLimiter`. Tenant-scoped
throughout (`findFirst({ where: { id, tenantId } })`).

| method | path | authz | notes |
|---|---|---|---|
| GET | `/categories` | authenticate | list tenant's `ListedEventCategory` rows (ordered sportId, name) |
| PUT | `/categories/:id` | **admin** | edit `name`/`fullLiveRequired`/`besluitRef` (AS-3); `writeAuditLog`; 404 if not tenant's |
| GET | `/events/:eventId/suggest` | authenticate | ranked suggestions; **read-only, never writes** |
| POST | `/events/:eventId/confirm` `{ categoryId }` | planner/admin | set `Event.listedCategoryId`; idempotent; audit |
| POST | `/events/:eventId/dismiss` | planner/admin | set `Event.listedCategoryId = null`; idempotent; audit |

**Errors:** 404 event/category not in tenant; **400** `Unknown listed-event category`
when the confirm `categoryId` is not the tenant's; 400 zod (empty `name`, bad ids);
403 wrong role.

## AS-3 editability (no-deploy correction)

`PUT /categories/:id` is the "edit takes effect without a deploy" path — the category
catalog + `fullLiveRequired` flags are **data**, not product constants. A legal correction
(e.g. after RC-0-T3 verifies the besluit) is a PUT, not a release. Every edit is audited.

## Suggestion heuristic (pure — `services/listedEvents/suggest.ts`)

`suggestListedCategories({ sportId, competitionName }, categories) → ListedEventCategory[]`,
pure/no-DB, deterministic:
- **sportId match is NECESSARY** — a category for a different sport is never suggested.
- Among sport matches, rank by **token overlap** of the event's competition name vs the
  category name (significant lowercase tokens, length ≥ 3), descending.
- A sport match with **zero overlap is STILL suggested** (sport is the necessary signal) —
  it ranks last. Ties break by category id ascending.
- No sport match / no categories → `[]`.

The route fetches the tenant's categories + the event (with `competition.name`), calls the
pure fn, returns the ranked list.

## NEVER auto-bind

`/suggest` is strictly read-only — it NEVER writes `Event.listedCategoryId`. Binding is an
explicit human act via `/confirm`. This keeps a machine heuristic from silently asserting a
legal obligation.

## Idempotency

- **confirm** — idempotent by `eventId`: a repeat confirm re-writes the same link and
  returns the row (200), never a duplicate.
- **dismiss** — idempotent: dismissing an already-null link is a 200 no-op.

## RE-SUGGEST LIMITATION (known, deferred)

`/dismiss` clears the link but there is **no `dismissed` column** (out of scope for this
FEATURE task). A derived `/suggest` recomputes from sport/name and would therefore
**re-surface** a previously dismissed category. Suppressing re-suggestion of a dismissed
event is a UI/refinement concern (or a later schema addition) — NOT added here; do not
introduce a schema column to work around it in this task.

## Flag posture

None on this surface. No `ValidationResult` is emitted anywhere. The
`regulatoryCompliance` flag gates only RC-1-T3's `LISTED_EVENT_FTA` code emission; storage,
CRUD, suggestion, and confirm/dismiss work regardless.

## Frontend — `src/services/listedEvents.ts`

`listedEventsApi = { listCategories(), updateCategory(id, data), suggest(eventId),
confirm(eventId, categoryId), dismiss(eventId) }`. Types: `ListedEventCategory`,
`ListedEventCategoryInput` (name/fullLiveRequired/besluitRef), `EventListedCategoryLink`
(confirm/dismiss return).

## Depends-on / consumers

- **Depends:** RC-1-T1 schema (`ListedEventCategory`, `Event.listedCategoryId` SET NULL).
- **Consumers:** RC-1-T3 (window/FTA validation codes read the confirmed link); ops event
  UI (own backlog).
