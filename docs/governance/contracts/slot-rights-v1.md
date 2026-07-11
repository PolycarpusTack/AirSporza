# CONTRACT SNAPSHOT: slot-rights v1

Version: 1 · Date: 2026-07-11 · Task: RD-4 (T1 endpoint + T2 service/selector) · pull-gate: `rights-checker v2` (RD-3) · ADR-009 pagination · consumers: ops rights views (adopt via their own backlog) · smoke: RD-5

Channel-day, per-slot rights check — the read-only slice that surfaces checker v2
results one slot at a time for a day's schedule.

## Endpoint — `GET /api/rights/check-slots`

Mounted under `/rights` (inherits `authenticate` + `setTenantContext` + `standardLimiter`).

**Query params:**
| param | required | notes |
|---|---|---|
| `channelId` | yes | positive int; 400 otherwise |
| `date` | yes | `^\d{4}-\d{2}-\d{2}$`; 400 if malformed/unparseable |
| `territory` | no | forwarded to the checker (event-level) |
| `limit` | no | default 100, clamped 1..200 |
| `cursor` | no | opaque base64url; continues a page (ADR-009). A corrupt cursor (non-uuid decode) → **400 `invalid cursor`**, never a 500 |

**Day window:** half-open `[date, date + 1 day)` on `plannedStartUtc` (`gte` day-start,
`lt` next-midnight — never `lte`). Tenant-scoped (`where.tenantId`).

## Response

```jsonc
{
  "slots": [ { "slotId": "uuid", "ok": true, "results": [ /* ValidationResult[] */ ] } ],
  "nextCursor": "b64url | null",
  "hasMore": true
}
```

- Slots ordered `plannedStartUtc asc, id asc`. Each entry `{ slotId, ok, results }`
  (TS `SlotRightsCheckResult`) where `results` is the checker v2 `ValidationResult[]`.
- **Batching:** the distinct linked `eventId`s are checked once via
  `checkRightsForEvents`, then mapped back to slots (no N+1; two slots on the same
  event share the result).
- **Event-less slot** (no `eventId`): never dropped — `{ slotId, ok: true, results:
  [{ code: 'SLOT_EVENT_MISSING', severity: 'INFO', scope: ['rights','slot'] }] }`.
- **Linked-but-unresolvable event** (`eventId` set but absent from the checker result —
  not found / cross-tenant / dropped): NOT a false all-clear — `{ slotId, ok: false,
  results: [{ code: 'SLOT_EVENT_UNRESOLVED', severity: 'WARNING', scope: ['rights','slot'] }] }`.

## Pagination (ADR-009)

`take: limit + 1` → `hasMore = fetched > limit` (drop the extra). `nextCursor =
base64url(lastSlotId)` when `hasMore`, else `null`. A supplied `cursor` decodes to
the slot id and continues via Prisma `cursor: { id }, skip: 1`. Cursor is opaque —
callers pass `nextCursor` back verbatim.

## Flag parity

The route does NOT read the flag or plumb `windowsEnabled` — `checkRightsForEvents`
already defaults it to `env.RIGHTS_WINDOWS_ENABLED` (matching the sibling `/check` and
`/check/batch` routes). Flag ON → window-aware v2 results, flag OFF → legacy scalar;
the **response shape is identical** either way (only `results[]` content differs).

## Frontend — `src/services/rights.ts`

- `rightsApi.checkSlots(channelId, date, opts?: { territory?, limit?, cursor? }) →
  Promise<SlotRightsCheckResponse>`.
- Types: `SlotRightsCheckResult { slotId, ok, results }` (parallels `RightsCheckResult`),
  `SlotRightsCheckResponse { slots, nextCursor, hasMore }`.

## Selector — `deriveSlotRightsStatus(results): 'CLEAR' | 'WARNING' | 'VIOLATION'`

Pure severity rollup. Precedence: any `ERROR` → `VIOLATION`; else any `WARNING` →
`WARNING`; else (only `INFO`, or empty) → `CLEAR`. **Lives in the rights DOMAIN
service (`src/services/rights.ts`), NOT in `src/components/ops/`** (anti-smart-ui —
ops screens adopt it via their own backlog). No UI changes in RD-4.

`SlotRightsStatus` (`CLEAR|WARNING|VIOLATION`) is a **severity rollup** — distinct from
the ops `RightsStatus` (`VALID|EXPIRING|…`) contract-lifecycle enum; adopters must not
conflate the two.

## Depends-on / consumers

- **Depends:** `rights-checker v2` (RD-3, merged) — `checkRightsForEvents(eventIds,
  { territory, windowsEnabled })`; ADR-009 cursor idiom (`publish.ts`).
- **Consumers:** ops day-view rights badges (future, own backlog); RD-5 smoke.
