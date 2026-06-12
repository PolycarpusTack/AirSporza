# CONTRACT SNAPSHOT: FieldVisibilityFilter

Version: 1 · Date: 2026-06-12 · Task: B-1-T1 (input contract for B-1-T2)

## Route inventory (every surface emitting FieldDefinition-governed data)

| # | Surface | File | What leaks today | Enforcement |
|---|---|---|---|---|
| 1 | `GET /api/fields` | `backend/src/routes/fieldConfig.ts:17` | The FieldDefinition list itself (incl. `visibleByRoles`, `conditionalRules`) — drives all dynamic form/view rendering | **Primary choke point**: filter definitions by role |
| 2 | `GET /api/events` | `backend/src/routes/events.ts:69-94` | `customValues[]` (CustomFieldValue rows keyed by fieldId) + legacy `customFields` JSONB per event | Strip values for restricted fieldIds |
| 3 | `GET /api/events/:id` | `backend/src/routes/events.ts:~363` | Same shape as #2 | Same |
| 4 | `GET /api/tech-plans`, `GET /api/tech-plans/:id` | `backend/src/routes/techPlans.ts:19,43` | `crew` JSONB keyed by crew-section FieldDefinition ids | Strip restricted crew keys |

**Out of scope (with rationale):** publish feeds/webhook payloads carry no customFields/customValues (verified — zero references in `publish.ts`/`publishService.ts`) and are endpoint-credentialed, not role-scoped. Write paths unchanged (B-1 is read-shaping only).

## ASM-5 pull-gate finding

The frontend **never references `visibleByRoles`** (zero hits in `src/`): the admin UI makes no promise about it today — the attribute is settable only via the API. Consequence: `[] = visible to all roles` is uncontradicted and confirmed as the semantics. Follow-up (out of B-1 scope, noted for backlog): FieldConfigurator UI lacks an editor for `visibleByRoles`.

## Public interface

```ts
// backend/src/services/fieldVisibility.ts
type Role = 'planner' | 'sports' | 'contracts' | 'admin'

/** Definitions the given role may see. [] = public. Unknown entries in
 *  visibleByRoles are dropped with a logger.warn; if dropping makes a
 *  non-empty list empty, the field is RESTRICTED (fail-closed). */
filterFieldDefs<T extends { id|name, visibleByRoles: string[] }>(defs: T[], role: Role): T[]

/** Ids of definitions the role may NOT see (complement of filterFieldDefs). */
restrictedFieldIds(defs: Pick<FieldDefinition,'id'|'name'|'visibleByRoles'>[], role: Role): Set<string>

/** Returns a copy of items with restricted keys removed from `customFields`
 *  (JSONB, keyed by field name/id) and restricted rows removed from
 *  `customValues` (keyed by fieldId). Non-mutating. */
stripRestrictedValues<T>(items: T[], restricted: Set<string>): T[]

/** Same for TechPlan.crew JSONB (crew-section field ids). */
stripRestrictedCrew<T extends { crew?: Record<string, unknown> }>(plans: T[], restricted: Set<string>): T[]

/** Flag gate — all shaping is bypassed entirely when off. */
isFieldVisibilityEnforced(): boolean   // env FIELD_VISIBILITY_ENFORCEMENT === 'true', default off
```

## Error shapes

No new error responses. Unknown-role entries → `logger.warn('field-visibility: unknown role %s on field %s', …)` once per def per request shaping, fail-closed as above. Filter never throws on malformed defs — a def it cannot interpret is restricted.

## Semantics (normative)

1. `visibleByRoles: []` → visible to every authenticated role.
2. `visibleByRoles: ['admin']` → visible to admin only.
3. `role ∈ visibleByRoles` → visible.
4. Unknown role string inside `visibleByRoles` → ignored + warned; if the remaining list is empty but the original was not → restricted (fail-closed).
5. Flag off → all four functions are identity/no-op; responses byte-identical to today.
6. Tenant scoping: defs are always queried by `req.tenantId` — tenant A defs never shape tenant B responses.

## Test list for B-1-T2 (write first, all failing)

1. flag off: `GET /api/fields` byte-identical (deep-equal snapshot)
2. flag off: `GET /api/events` byte-identical
3. flag on, `[]`: def present for planner/sports/contracts/admin
4. flag on, `['admin']`: def absent from `/api/fields` for sports
5. flag on, `['admin']`: def present for admin
6. flag on, `['admin']`: customValues row stripped from `GET /api/events` for sports
7. flag on, `['admin']`: legacy `customFields` JSONB key stripped for sports
8. flag on, `['admin']`: value present for admin
9. flag on, `['sports','admin']`: present for sports
10. flag on, unknown role entry: restricted for non-admin + `logger.warn` asserted
11. flag on: `GET /api/events/:id` strips identically to list
12. flag on: tech-plan `crew` key stripped for restricted crew-section def
13. flag on: pure-unit fail-closed: non-empty list reduced to empty → restricted
14. unit: `stripRestrictedValues` does not mutate input
15. tenant isolation: tenant A restricted def does not strip tenant B payloads

Dependencies: existing RBAC test harness (`backend/tests/contracts-rbac.test.ts` mock patterns). Domain terms: Field Definition, Field Visibility (glossary).
