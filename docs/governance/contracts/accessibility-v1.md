# CONTRACT SNAPSHOT: accessibility v1

Version: 1 · Date: 2026-07-22 · Task: RC-2-T2 · pull-gate: RC-2-T1 schema (`775a77b`) · consumers: RC-2-T3 (`ACCESSIBILITY_UNPLANNED` check), RC-4-T1, ops event UI (own backlog) · smoke: RC-2-T3/retro

Accessibility deliverables per event (G11): T888 subtitling, audio description (AD),
VGT sign language — one row per (event, type), lifecycle status, audited transitions,
and a KPI coverage endpoint. No validation codes here — flag-independent storage/CRUD
(the `regulatoryCompliance` flag gates only RC-2-T3's `ACCESSIBILITY_UNPLANNED`).

## Endpoints — base `/api/accessibility`

Mounted with `authenticate` + `setTenantContext` + `standardLimiter`. Tenant-scoped
throughout (`findFirst({ where: { id, tenantId } })` on every event/row lookup and
`tenantId` on every aggregate query).

| method | path | authz | notes |
|---|---|---|---|
| GET | `/events/:eventId/deliverables` | authenticate | the event's deliverable rows (ordered by type); 404 event not in tenant |
| POST | `/events/:eventId/requirement` `{ type, required }` | planner/admin | toggle REQUIRED ↔ NOT_REQUIRED for **AD/VGT only**; upserts legacy rows; idempotent; audit |
| POST | `/deliverables/:id/transition` `{ status, expectedStatus }` | planner/admin | one lifecycle step; optimistic guard; audit; 404 row not in tenant |
| GET | `/kpi?from&to` | authenticate | coverage % per type over the period (event `startDateBE` in `[from, to]`) |

**Errors:** 404 event/deliverable not in tenant; **400** T888 requirement change (both
doors — see policy below), zod (bad ids, missing `expectedStatus`, unparseable or
inverted `from`/`to`); **409** stale `expectedStatus` or illegal step (body below);
403 wrong role.

## State machine (pure — `services/accessibility/transitions.ts`)

Single source of truth `ACCESSIBILITY_TRANSITIONS`:

```
NOT_REQUIRED → [REQUIRED]
REQUIRED     → [NOT_REQUIRED, PLANNED]
PLANNED      → [CONFIRMED]
CONFIRMED    → [DELIVERED]
DELIVERED    → []            (terminal)
```

Skips, self-transitions, and backward steps are rejected. **Undoing lifecycle progress
(e.g. PLANNED → REQUIRED) is deliberately NOT modelled** — an architect decision if ops
needs it. Helpers: `allowedNextStatuses(from)`, `canTransitionAccessibility(from, to)`,
`isRequirementToggle(from, to)` (any step into/out of NOT_REQUIRED),
`resolveRequirementChange(type, currentStatus|null, required)` (full setRequirement
semantics: T888 lock, legacy create, no-op, legality — the router only dispatches),
`T888_REQUIREMENT_POLICY_MESSAGE` (the one 400 text for both closed doors).

## Optimistic guard / retry-safe idempotency

Every transition carries **`expectedStatus`** (mandatory). If the row's status differs
(lost response, concurrent edit) or the step is illegal → **409** with:

```json
{ "error": "...", "message": "...", "currentStatus": "PLANNED", "allowedNext": ["CONFIRMED"] }
```

(`error` and `message` carry the same text — `message` is what the shared ApiClient
reads. NOTE **TD-32**: the ApiClient currently discards the structured body, so
frontend consumers must re-fetch `list()` after a 409 until `ApiError` carries it.)

A retry never double-applies: the second attempt's `expectedStatus` no longer matches
and the body tells the client the real state + the legal next steps.
`setRequirement` is idempotent by (eventId, type): repeating the same toggle — or
`required=true` on a row already past REQUIRED — is a 200 no-op (no write, no audit).

## T888 policy (AS-1 / TODO-KPI)

T888's requirement comes from the RC-2-T1 config defaulting
(`T888_EXCLUDED_SPORT_IDS`, provisional `TODO-KPI`), so it is **not per-event
switchable**: `setRequirement` with `type: 'T888'` → 400, and a T888 transition
touching NOT_REQUIRED (either direction) → 400. T888 **lifecycle** steps
(REQUIRED → PLANNED → CONFIRMED → DELIVERED) are unrestricted. AD/VGT requirement
toggles are legal through both `setRequirement` (ergonomic door) and `transition`
(machine-legal step).

## Legacy-row upsert

Events created before the RC-2-T1 migration have no seeded rows. `setRequirement`
creates the missing (eventId, type) row at the requested requirement (tenant-stamped,
`updatedBy` set, audited with `oldStatus: NOT_REQUIRED`). `transition` does NOT create
rows — it 404s.

## Audit

Every status **write** (not no-ops) → `writeAuditLog`: actions
`accessibilityDeliverable.setRequirement` / `accessibilityDeliverable.transition`,
`entityType: 'accessibilityDeliverable'`, `entityId: String(id)`,
`oldValue/newValue: { status }`, userId + ip + user-agent + tenantId. `updatedBy` is
stamped on the row on every write.

## KPI endpoint (pure aggregation — `services/accessibility/kpi.ts`)

`GET /kpi?from&to` → `{ from, to, byType: AccessibilityKpiEntry[] }` with one entry
per type (stable order T888, AUDIO_DESCRIPTION, VGT):

- `total` — all rows of the type whose event `startDateBE` ∈ `[from, to]` (inclusive)
- `requiredCount` — `status !== NOT_REQUIRED` (denominator)
- `deliveredCount` — `status === DELIVERED` (numerator)
- `coveragePct` — `deliveredCount / requiredCount * 100`, 2 decimals; **null when
  requiredCount = 0** (never a fake 100%)
- `targetPct` — **CONFIG-read** from `ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE`
  (`config/accessibility.ts`, provisional `TODO-KPI`, AS-1 — T888 carries the claimed
  beheersovereenkomst number, verified via RC-0-T1 as a config edit; AD/VGT `null` =
  no target). NEVER hardcoded in route/aggregator/tests.

**Reconciliation guarantee (tested):** every raw row lands in exactly one type bucket
(buckets derive from the config record's keys — a new enum member cannot be silently
dropped); `requiredCount`/`deliveredCount` equal independent raw-row filters; totals
sum to the row count.

## Flag posture

None on this surface. Storage, defaulting (RC-2-T1), setRequirement, transitions, and
KPI work regardless of `regulatoryCompliance`. The flag gates only RC-2-T3's stage-4
`ACCESSIBILITY_UNPLANNED` emission (which supersedes the dead `ACCESSIBILITY_MISSING`
stub — removed in RC-2-T3, not here).

## Frontend — `src/services/accessibility.ts`

`accessibilityApi = { list(eventId), setRequirement(eventId, type, required),
transition(id, status, expectedStatus), kpi(from, to) }`. Types:
`AccessibilityDeliverable`, `AccessibilityKpiEntry`, `AccessibilityKpiReport`,
`SwitchableAccessibilityType` (= `Exclude<AccessibilityType, 'T888'>`); the
`AccessibilityType`/`AccessibilityStatus` unions come from `@planza/shared`.

## Depends-on / consumers

- **Depends:** RC-2-T1 schema (`AccessibilityDeliverable`, `@@unique([eventId, type])`,
  RLS, `updatedBy`) + defaulting hook (`buildDefaultAccessibilityDeliverables` +
  `T888_EXCLUDED_SPORT_IDS`, both `config/accessibility.ts`).
- **Consumers:** RC-2-T3 stage-4 `ACCESSIBILITY_UNPLANNED` (lead-time check reads
  status ≥ PLANNED); RC-4-T1; ops event UI (own backlog). Import pipeline defaulting
  (provision/csvImport) is **TD-31**, scheduled RC-2-T3 — NOT covered here.
