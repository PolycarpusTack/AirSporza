# CONTRACT SNAPSHOT: accessibility-config v1

Version: 1 · Date: 2026-07-23 · Task: RC-5-T2 · pull-gate: RC-5-T1 loader/schema · consumers: seeding choke point (TD-31, all five event-creation sites), KPI aggregation (`/kpi`), stage-4 `ACCESSIBILITY_UNPLANNED`, RC-0-T1 (verified values land as a VRT tenant-row upsert, not a code edit) · smoke: RC-4-T1's constant-fallback path stays valid (fallback parity asserted here)

Per-tenant accessibility configuration (AS-10: client regulatory rules are tenant
configuration, never product constants). Moves the three globals in
`backend/src/config/accessibility.ts` — `T888_EXCLUDED_SPORT_IDS`,
`ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE`, `ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS` —
behind a per-tenant loader with the constants as documented fallback defaults.
**Mechanism only:** whether any configured value is legally/contractually correct
stays RC-0-T1's oracle (TODO-KPI posture carries over unchanged, AS-1).

## Storage — `TenantAccessibilityConfig` (migration `20260723120000`)

At most ONE row per tenant (`@unique tenantId`, FK → Tenant, RLS `tenant_isolation`
in the same migration, ADR-011; rollback.sql alongside, ADR-004/007). Every config
column NULLABLE — NULL = "fall back to that field's constant". `t888ExcludedSportIds`
is JSONB (int array), **not** `INTEGER[]`: NULL ("fall back") must stay distinct from
`[]` ("explicitly no exclusions"), and Prisma scalar lists cannot be NULL.

## Loader — `services/accessibility/tenantConfig.ts`

`loadTenantAccessibilityConfig(tx, tenantId) → EffectiveAccessibilityConfig`
(`{ t888ExcludedSportIds: ReadonlySet<number>, kpiTargetPctByType:
Record<AccessibilityType, number|null>, unplannedLeadTimeDays: number }`), plus two
pure helpers it shares with the routes — ONE reader posture for the stored Json:
`toEffectiveAccessibilityConfig(row | null)` (the single merge implementation) and
`overrideOf(row | null) → AccessibilityConfigOverride | null` (the stored-override
view, same narrowing: non-numeric/unknown-key kpi values are dropped). tenantId
comes from the auth context or the owning row (event.tenantId) — never client input
(TD-31 lesson). Naming note: `unplannedLeadTimeDays` was naming-reviewed and KEPT
deliberately — it mirrors the RC-2 `ACCESSIBILITY_UNPLANNED` check/constant lexicon.

**PINNED MERGE SEMANTICS (RC-5-T1):**
- **No row → EXACTLY the constants**, returned by reference (byte-identical
  behavior; tested with `toBe`).
- **Row → per-field merge:** a NULL field falls back to THAT field's constant; a
  non-NULL field replaces it. `[]` for the exclusion set is an override.
- **`kpiTargetPctByType` merges per type key** over the constant record; unknown
  stored keys are dropped → the record is ALWAYS exhaustive over
  `AccessibilityType` (the KPI report derives its buckets from these keys — a
  partial/polluted stored record can never drop or invent a bucket).

## Consumers (wired at route/service boundaries — pure fn signatures unchanged)

| consumer | boundary | wiring |
|---|---|---|
| deliverable defaulting | `services/accessibility/seeding.ts` (TD-31 choke point — covers ALL five event-creation sites at once) | loader on the SAME tx as the event create, tenant = `event.tenantId`; exclusion set → `buildDefaultAccessibilityDeliverables` |
| KPI targets | `GET /api/accessibility/kpi` route | loader per request; targets → `aggregateAccessibilityKpi(rows, targets)` |
| stage-4 lead time | `routes/schedules.ts` `buildScheduleValidationContext` (regulatory flag ON only — flag OFF adds NO query, stage 4 stays byte-identical) | loader per request; `leadTimeDays` threaded into `context.accessibilityUnplanned` |

## Endpoints — base `/api/accessibility` (admin only)

| method | path | authz | notes |
|---|---|---|---|
| GET | `/config` | **admin** | the tenant's config; 403 otherwise |
| PUT | `/config` | **admin** | per-tenant upsert (retry-safe, REPLACE semantics; read-previous + upsert in one transaction); audited (`tenantAccessibilityConfig.update` — action prefixed with the entityType, house convention; old/new = override view); `updatedBy` stamped |

**Response body (both verbs):**

```json
{
  "effective": { "t888ExcludedSportIds": [7, 9], "kpiTargetPctByType": { "T888": 90, "AUDIO_DESCRIPTION": null, "VGT": null }, "unplannedLeadTimeDays": 30 },
  "override":  { "t888ExcludedSportIds": [7, 9], "kpiTargetPctByType": { "T888": 90 }, "unplannedLeadTimeDays": 30 }
}
```

`effective` = what consumers apply (merged); `override` = the raw stored row
(`null` = no row; a `null` field = falls back) — so an admin can tell tenant values
from fallback defaults without a second source. `effective.t888ExcludedSportIds` is
sorted ascending.

**PUT body** (`replaceConfigSchema` — "replace", not "update": the endpoint has
REPLACE semantics, a plain `update` would falsely suggest partial patch; `.strict()`
at both levels): every field optional/nullable — omitted or `null` CLEARS the
override for that field (stored as SQL NULL → falls back). `kpiTargetPctByType` is a
partial record over the enum; targets are validated 0–100 **inclusive**.

**Errors:** 403 non-admin; **400 with field-level zod detail** for: target outside
0–100, negative/non-integer lead time, unknown deliverable type key, non-positive
sport id, and ANY stray top-level key — including a client-supplied `tenantId` (the
tenant comes from the auth context ONLY).

## Flag posture

**None.** The mechanism is inherently backward-compatible: with no tenant row every
consumer is byte-identical to the pre-RC-5 constant-only behavior (fallback parity is
pinned by tests at all three consumers), so there is no flag-OFF state distinct from
"no row". The stage-4 consumer additionally sits behind the existing
`regulatoryCompliance` flag (unchanged); storage/CRUD is flag-independent, mirroring
the RC-1/RC-2 posture.

## Frontend — `src/services/accessibility.ts`

`accessibilityApi.getConfig()` / `accessibilityApi.replaceConfig(input)`. Types:
`AccessibilityConfigResponse` (`{ effective, override }`),
`EffectiveAccessibilityConfig` (exact backend-type match), `AccessibilityConfigOverride`,
`AccessibilityConfigInput`.

## Depends-on / consumers

- **Depends:** RC-5-T1 schema + loader; `accessibility v1` (deliverable rows, KPI
  aggregation, seeding hook); ADR-011 RLS posture.
- **Consumers:** RC-0-T1 (VRT values as a data edit — constants keep their TODO-KPI
  markers until then); any future admin config UI (own backlog); tenant-#2
  onboarding.
