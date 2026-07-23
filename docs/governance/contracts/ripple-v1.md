# CONTRACT SNAPSHOT: ripple v1

Version: 1 · Date: 2026-07-23 · Task: SV-2 (T1 schema/payload-builders · T2 capture · T3 read surface + enrichment + measurement) · pull-gate: AS-8 (`CASCADE_PREVIEW_PARITY` on main, TD-5/12/13/14 settled) + ADR-019 Accepted · consumers: SV-3 (**extends this snapshot** with accept/reject — see Boundary) · smoke: none yet (no frontend consumer in SV-2)

Feed-change capture → reviewable **Ripple Proposals** (ADR-019, the G8 fix). A feed
re-import that changes a slot-linked event's schedule-relevant fields still writes
the event row immediately (feed stays authoritative, byte-identical to before), and
additionally creates a `RippleProposal` (`source=FEED`, `status=PENDING`) — **no
slot is written**. The PENDING window's event≠slot divergence IS the surfaced
staleness, by design. MANUAL stays auto-sync (eventSlotBridge); CASCADE stays auto
to `estimated*` — both pinned byte-identical by negative tests.

## Boundary (ADR-019 Open assumption 2 — restated)

**SV-2 ships NO review endpoints/UX beyond the read-only list/get below.**
Accept/reject mutations and any review UX belong to SV-3, which must not freeze
that UX before the ops-stakeholder taste-test. SV-3 **extends** this contract
(same read shape + mutations); v1 readers stay valid.

## Storage — `RippleProposal` (migration `20260723150000`, RLS same-migration, rollback.sql alongside)

ADR-019 §1 shape (as **amended 2026-07-23** — the `afterSlots` sketch shipped as
`preview`, see below). `@@unique([tenantId, sourceChangeId])` · FK event **ON
DELETE CASCADE** (child of the event) · `confidence Int?` is **NULL in v1** (no
feed-confidence source wired — stated, not silent) · indexes: tenantId, eventId,
(tenantId, status).

### `sourceChangeId` — change-fingerprint (ADR-019 OA3, DECIDED at SV-2-T1)

`feed:<eventId>:<sha256/32 over {eventId, sourceId, sourceRecordId, normalized
after-values of the 5 trigger fields}>` — composed in
`backend/src/services/ripple/capturePayloads.ts`, pinned by a **golden-value
test** in `ripple-capturePayloads.test.ts` (any composition change orphans
persisted idempotency keys → deliberate, migrated decision only).

- **Rejected alternative** (import-job-id + event-id): no job id reaches the
  capture seam, and a job-id key would make every later job carrying an
  IDENTICAL change supersede an identical PENDING proposal (review-queue noise).
- **Property:** identical change dedupes across retries/replays/jobs → idempotent
  echo of the same row. **Accepted limitation:** a REJECTED proposal suppresses
  re-proposal of the byte-identical change until a different change intervenes.
- Date values normalize to ISO at **second precision** (machine/TZ-independent,
  matches `shouldSync`'s `String(Date)` equality — no sub-second spurious
  proposals). Tenant is NOT in the fingerprint; cross-tenant separation is the
  composite unique (same fingerprint under two tenants = two independent
  proposals).
- **Concurrency/race:** two concurrent imports of the same change can race the
  unique index; the loser's import tx aborts (P2002) and **the next feed run
  owns the retry** — its re-import takes the echo path against the winner's
  identical row (eventual-consistency window = one import cycle, never a
  duplicate).

### Payload columns

```jsonc
// beforeSlots (Json): EVERY linked slot (auto + manual), pre-change
[{
  "slotId": "uuid", "autoLinked": true, "channelId": 3,
  "plannedStartUtc": "ISO|null", "plannedEndUtc": "ISO|null",
  "expectedDurationMin": 105, "status": "PLANNED",
  "updatedAt": "ISO"   // THE stale-at-apply concurrency handle (see below)
}]

// preview (Json): the review ENVELOPE — deliberately NOT named "afterSlots":
// it is not the after-state mirror of beforeSlots
{
  "proposed": [{        // ONLY autoLinked slots — what SV-3's bridge apply CAN write
    "slotId": "uuid", "channelId": 3,
    "plannedStartUtc": "ISO", "plannedEndUtc": "ISO",
    "expectedDurationMin": 105, "status": "PLANNED"
  }],
  "manualReviewSlots": [{ // informational, NO proposed write
    "slotId": "uuid", "channelId": 3,
    "reason": "MANUAL_LINK" /* or "NOT_DERIVABLE" */
  }],
  "rights": {           // ADVISORY creation-time enrichment (null if not run)
    "advisory": true, "checked": true, "checkedAtUtc": "ISO",
    "slots": [{ "slotId": "uuid", "ok": false, "results": [ /* ValidationResult[] */ ] }]
    // failure shape (sanitized — raw error text stays in the server log):
    // { "advisory": true, "checked": false, "reason": "CHECK_FAILED", "error": "<ErrorClassName>" }
  }
}
```

- **Boolean naming (deliberate):** `advisory` = never authoritative (SV-3
  re-checks); `checked` = "did the enrichment RUN" (not a compliance verdict —
  an `available` flag in a rights domain read as one); per-slot `ok` = the
  checker's own slot-rights v1 lexicon. Kept distinct on purpose.
- **Concurrency handle:** `BroadcastSlot` has **no `version` column**
  (`ScheduleDraft.version` is draft-level), so `updatedAt` is THE handle —
  SV-3's stale-at-apply detection compares the live slot's `updatedAt` against
  `beforeSlots[].updatedAt` (a PENDING proposal whose slots were manually edited
  must surface, never silently overwrite).
- **Proposed field subset** = exactly what `syncEventToSlot` writes, derived from
  the single extracted source of truth `deriveSlotSyncValues`
  (`eventSlotBridge.ts`); the trigger-field set is likewise the bridge's own
  exported `TRIGGER_FIELDS` const — one source, a 6th trigger field flows into
  capture automatically. **`overrunStrategy` is excluded** (the bridge's update
  arm never rewrites it — also keeps snapshots clear of the TD-28 zod drift; all
  typing is Prisma-derived).
- `preview.rights` is **advisory only** — SV-3's apply re-runs `slot-rights v1`
  authoritatively. Enrichment runs on the capture tx (post-change event values);
  failure logs + annotates `checked:false` — the proposal is never lost and the
  import never fails (TD-18 fail-visible).
- **Note for SV-3 (shape-change is SV-3 scope, not v1):** `rights.slots[]`
  duplicates the event-level `{ok, results}` per slot (all slots share one
  event); an event-level result + `slotIds[]` would dedupe — take it when
  extending the contract if payload size matters.

## Capture semantics (`backend/src/services/ripple/capture.ts`, seam: `provision.ts` → `updateImportedEvent`)

- **Trigger:** any change in `{channelId, startDateBE, startTimeBE, durationMin,
  status}` — the exact `shouldSync` set of the manual path (same exported
  const; parity additionally pinned per-field).
- Update path ONLY (create sites have no linked slots). No linked slots → no
  proposal; the event updates as today.
- **Idempotent echo:** existing `(tenantId, sourceChangeId)` → same row returned,
  no duplicate, **no supersession**, no second outbox row.
- **Supersession:** a NEW change marks the event's PENDING proposals (ANY
  source) `SUPERSEDED`, then creates — one PENDING proposal per event.
- **Outbox (ADR-001):** `ripple_proposal.created` (aggregate-first grammar,
  `channel_switch.*` analogue — SV-3 adds `.applied/.rejected/.superseded`)
  written IN THE SAME TX via `writeOutboxEventDeduped`; key
  `ripple_proposal.created:<tenantId>:<sourceChangeId>` (tenantId in the key —
  TD-13: `idempotencyKey` is a GLOBAL unique). Routed `['socketio']` only until
  SV-3 defines the external review surface.
- **Flag `SCHEDULE_RIPPLE_ENABLED`** (build-time per TD-27; explicit
  `v === 'true'` parse, never `z.coerce.boolean`; service boundary reads
  `opts.rippleEnabled ?? env`): OFF = the import path is **byte-identical to
  today** incl. DB traffic (the spike memo's characterization test #1 is the
  pin AND was the RED for the flag-on fix).

## Read surface — base `/api/ripple-proposals` (authenticate + setTenantContext + standardLimiter)

| method | path | notes |
|---|---|---|
| GET | `/` | ADR-009: `limit` (default 100, clamp 1..200), opaque base64url `cursor` (corrupt → 400, never 500); filters `status` (validated against the **Prisma** `RippleStatus` enum) + `eventId` (positive int); order `createdAt desc, id desc` |
| GET | `/:id` | non-uuid → 400; tenant-scoped miss → **404** (cross-tenant ids included — no existence leak) |

**List response:** `{ "proposals": [RippleProposal…], "nextCursor": "b64url|null",
"hasMore": bool }`. Proposal rows serialize verbatim (`id, tenantId, eventId,
source, sourceChangeId, status, beforeSlots, preview, confidence: null,
createdAt, decidedAt, decidedBy, rationale`). Tenant comes from the auth context
ONLY.

## Measurement (ADR-019 Open assumption 1)

`/metrics` (D-2 registry): histogram **`ripple_proposal_capture_duration_seconds`**
(full capture incl. enrichment; observed on `created` only; **5s bucket boundary
makes the `< 5s p95` SLO assertable from the scrape**) + counter
**`ripple_proposals_captured_total{outcome=created|echoed}`** (quantifies the
feed-change volume OA1 left open; batching/dedup becomes its own story if the
numbers demand). Tests pin the recording mechanism (count delta + SLO bucket +
enrichment-inclusion); the production p95 is read from the scrape — no fake
load test, no wall-clock asserts.

## Frontend

**None in SV-2** (no review UX — Boundary above). Ops surfaces adopt via their
own backlog after SV-3.

## Depends-on / consumers

- **Depends:** ADR-019 (Accepted; §1 amended 2026-07-23 — `preview` envelope) ·
  `slot-rights v1` machinery (`checkRightsForEvent`; `db` widened to accept the
  capture tx — additive) · `writeOutboxEventDeduped` (TD-13/14 settlements) ·
  ADR-011 RLS posture · ADR-009 pagination idiom.
- **Consumers:** **SV-3** (accept/reject + stale-at-apply via the `updatedAt`
  handles + authoritative rights re-check — extends this snapshot) · SV-4+
  (contingency work reads the same model) · future ops Sync/Rundown surfacing.
