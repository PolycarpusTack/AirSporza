# CONTRACT SNAPSHOT: rights-window v1

Version: 1 · Date: 2026-07-10 · Task: RD-2-T2 (nested CRUD) · ADR-015 · consumers: contracts UI (rights-window editor, RD-2-T3), RD-3 checker v2 · smoke: RD-5

The first write surface for Rights Windows — multi-window, category-aware children
of Contract. Storage is flag-independent (`rightsWindows` gates validation-code
EMISSION in RD-3, not persistence); T2 emits NO new validation codes.

## Entity (Prisma `RightsWindow`, ADR-015 §1 — backfilled 1:1 from Contract in RD-2-T1)

| field | type | notes |
|---|---|---|
| `id` | uuid | client-suppliable (idempotent create) |
| `contractId` | int | parent Contract (path-scoped) |
| `tenantId` | uuid | tenant-scoped + RLS `tenant_isolation` |
| `category` | CoverageType | `LIVE\|HIGHLIGHTS\|DELAYED\|CLIP\|ARCHIVE` |
| `exclusivity` | ExclusivityTier | `EXCLUSIVE\|NON_EXCLUSIVE\|OPEN_NET`, default `NON_EXCLUSIVE` |
| `territory` | string[] | `[]` = unrestricted (intersects all — ADR-015 Acc. rec. §4) |
| `platforms` | string[] | lowercase channel-type vocab (`linear\|on-demand\|radio\|fast\|pop-up`); `[]` = unrestricted. NOT the UPPERCASE Platform enum |
| `windowStartUtc` | ISO datetime \| null | null = unbounded-past |
| `windowEndUtc` | ISO datetime \| null | null = unbounded-future |
| `maxRuns` | int \| null | null = no limit (RD-1F null-semantics) |
| `holdbackHoursMin` | int \| null | per-window earliest-release (ADR-015 §4) |
| `createdAt`/`updatedAt` | ISO datetime | server-set |

## Endpoints — base `/api/contracts/:contractId/rights-windows`

Inherit `authenticate` + `setTenantContext` + `standardLimiter` from the contracts
mount. Every call first verifies the parent Contract belongs to the tenant → **404
`Contract not found`** if not (isolation). Reads: `authenticate`. Writes:
`authorize('contracts','admin')` + `writeAuditLog`.

| method | path | success | body |
|---|---|---|---|
| GET | `/:contractId/rights-windows` | 200 `RightsWindow[]` (asc by createdAt) | — |
| POST | `/:contractId/rights-windows` | **201** created · **200** existing (idempotent) | create body |
| PUT | `/:contractId/rights-windows/:windowId` | 200 updated (full replace) | full body |
| DELETE | `/:contractId/rights-windows/:windowId` | 200 `{ success: true }` | — |

**Create/PUT body:** `{ id?: uuid, category, exclusivity?=NON_EXCLUSIVE, territory?=[],
platforms?=[], windowStartUtc?: iso|null, windowEndUtc?: iso|null, maxRuns?: int|null,
holdbackHoursMin?: int|null }` (`rightsWindowCreateSchema`).

## Idempotency (POST)

Client supplies `id` (uuid). If that id already exists on THIS contract+tenant →
**200** with the existing row, `create` NOT called (no duplicate, not 409). Absent id
→ server generates one, 201.

## Overlap 409 (the DECIDED 4-way rule — architect 2026-07-10)

Pure predicate `windowsOverlap(a,b)` in `backend/src/services/rightsWindows/overlap.ts`.
Two windows on one contract overlap **IFF ALL FOUR**: (1) same `category` AND (2)
intersecting validity period (**half-open** `[start,end)`; null start = -∞, null end =
+∞; two null-bounded windows always intersect) AND (3) intersecting `territory` AND
(4) intersecting `platforms`, where empty `[]` = unrestricted = intersects every scope.
Disjoint on ANY dimension is legitimate (BE-LIVE vs NL-LIVE; linear vs on-demand) and
does NOT 409. On create/update the candidate is checked against existing siblings
(PUT excludes self); first overlap → **409** with a remediation message naming the
conflicting window id.

## Error shapes

| status | when | body |
|---|---|---|
| 400 | unknown `category`/`exclusivity`, non-uuid `windowId`, bad datetime | `{ error: 'Validation failed', details: {...} }` |
| 403 | write by a non-`contracts`/`admin` role | `{ error: 'Forbidden' }` |
| 404 | contract not in tenant, or window not found | `{ ...message: 'Contract not found' \| 'Rights window not found' }` |
| 409 | overlaps an existing sibling window | `{ ...message: 'Rights window overlaps existing window <id>: …' }` |

## Frontend service — `src/services/rightsWindows.ts`

`rightsWindowsApi = { list(contractId), create(contractId, data), update(contractId,
windowId, data), delete(contractId, windowId) }`. `RightsWindow` / `RightsWindowInput`
types import `CoverageType` + `ExclusivityTier` from `@planza/shared`.

## Depends-on / consumers

- **Depends:** RD-2-T1 (`RightsWindow` table + enums + RLS, committed `30457f7`);
  contracts router mount (`index.ts:112`); `@planza/shared` `CoverageType`/`ExclusivityTier`.
- **Consumers:** RD-2-T3 matrix (`windows[]` additive, exposes OPEN_NET); RD-3 checker v2
  (loads Contract `include: { rightsWindows }`); RD-5 smoke.
- **Debt:** TD-28 registered (zod↔Prisma enum drift on the *existing* contract/policy/
  broadcast surfaces) — this NEW surface validates against the full enum set, adds no drift.
