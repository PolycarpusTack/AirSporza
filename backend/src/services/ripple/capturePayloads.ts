/**
 * SV-2-T1 — pure ripple capture-payload builders (loader-free; no DB, no env).
 * Consumed by the SV-2-T2 capture seam in `import/stages/provision.ts`
 * (`updateImportedEvent`) via `./capture.ts`, and pinned by
 * `tests/ripple-capturePayloads.test.ts`.
 *
 * ── sourceChangeId composition (ADR-019 Open assumption 3 — DECIDED HERE) ──
 * `sourceChangeId` is a CHANGE-FINGERPRINT:
 *   `feed:<eventId>:<sha256/32 over {eventId, sourceId, sourceRecordId,
 *    normalized after-values of the 5 trigger fields}>`
 * against the REAL identifiers available at the capture seam (`sourceId`,
 * `rawRecord.id`, the updated event row). Tradeoff vs import-job-id+event-id:
 *  - no job id is threaded into `updateImportedEvent` at all (it would need a
 *    signature change through 4 call sites for no semantic gain);
 *  - a job-id key would make every LATER job carrying an IDENTICAL change mint a
 *    new proposal superseding an identical PENDING one — review-queue noise;
 *  - the fingerprint dedupes identical changes across jobs (retry, replay, and
 *    unchanged re-fetch all fold into one proposal — idempotent 200 echo).
 * Accepted limitation (documented, deliberate): a REJECTED proposal suppresses
 * re-proposal of the byte-identical change until a different change intervenes —
 * i.e. "this exact change was already reviewed", which also prevents the feed
 * from spamming the queue with a change ops keeps refusing.
 * `sourceUpdatedAt` is deliberately EXCLUDED: feeds bump timestamps without
 * content change, which would defeat the cross-job dedupe property.
 * Tenant is NOT part of the id — cross-tenant separation is the DB unique
 * `(tenantId, sourceChangeId)` (RD-2 idempotent-echo lesson).
 *
 * ── Payload shapes ──
 * `beforeSlots` (column): per linked slot, the proposed-field subset
 * {channelId, plannedStartUtc, plannedEndUtc, expectedDurationMin, status}
 * PLUS the concurrency handle `updatedAt` (BroadcastSlot has NO `version`
 * column — `ScheduleDraft.version` is draft-level — so `updatedAt` is THE
 * stale-at-apply handle SV-3 compares) and the `autoLinked` marker.
 * `preview` (column — NOT an after-state mirror of `beforeSlots`, hence the
 * name): an ENVELOPE `{ proposed, manualReviewSlots, rights }` — `proposed[]`
 * writes ONLY for autoLinked slots (what SV-3's eventSlotBridge apply can
 * write), `manualReviewSlots[]` informational entries with no proposed write,
 * `rights` = advisory enrichment annotations (built at creation time by
 * `./enrichment.ts`; null when capture ran without enrichment).
 *
 * TD-28 guard: `overrunStrategy` is EXCLUDED from the field subset and all
 * typing derives from `@prisma/client` — never `schemas/broadcastSlots.ts`
 * (its zod enum has drifted from the Prisma enum).
 */
import { createHash } from 'node:crypto'
import type { BroadcastSlotStatus } from '@prisma/client'
import type { ValidationResult } from '../validation/types.js'
import { TRIGGER_FIELDS, type DerivedSlotSyncValues } from '../eventSlotBridge.js'

/**
 * The exact `shouldSync` trigger-field set of the manual path — full parity
 * closes G8. NOT a copy: re-exported from the bridge's single ordered source
 * (review C1), so a future 6th trigger field flows into capture automatically.
 * Parity is additionally pinned per-field against `shouldSync` itself in
 * ripple-capturePayloads.test.ts.
 */
export const RIPPLE_TRIGGER_FIELDS = TRIGGER_FIELDS

export type RippleTriggerField = (typeof RIPPLE_TRIGGER_FIELDS)[number]

/** Loose event view: only the trigger-field values matter here. */
export type RippleTriggerFieldValues = Partial<Record<RippleTriggerField, unknown>>

/**
 * `shouldSync` compares `String(v ?? '')`; we keep those equality semantics but
 * normalize Date values to ISO **truncated to second precision** so the
 * persisted fingerprint is machine/timezone independent (String(Date) renders
 * in server-local time) while matching String(Date)'s second-precision
 * equality exactly — a sub-second timestamp jitter can never mint a spurious
 * "change" (and thus a spurious proposal) that shouldSync would not see.
 */
function normalizeTriggerValue(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 19) + 'Z' : String(v ?? '')
}

/**
 * FEED change detection over the 5-field trigger set — `shouldSync` semantics
 * (String-normalized comparison, `?? ''` for null/undefined) plus WHICH fields
 * changed (needed for the fingerprint and honest logging).
 */
export function detectFeedScheduleChange(
  beforeEvent: RippleTriggerFieldValues,
  afterEvent: RippleTriggerFieldValues,
): { hasChanges: boolean; changedFields: RippleTriggerField[] } {
  const changedFields = RIPPLE_TRIGGER_FIELDS.filter(
    (field) => normalizeTriggerValue(beforeEvent[field]) !== normalizeTriggerValue(afterEvent[field]),
  )
  return { hasChanges: changedFields.length > 0, changedFields }
}

/** Compose the change-fingerprint sourceChangeId (header: decision + tradeoff). */
export function composeFeedSourceChangeId(input: {
  eventId: number
  sourceId: string
  sourceRecordId: string
  after: RippleTriggerFieldValues
}): string {
  const canonical = JSON.stringify({
    eventId: input.eventId,
    sourceId: input.sourceId,
    sourceRecordId: input.sourceRecordId,
    // Fixed field order (RIPPLE_TRIGGER_FIELDS declaration order) → stable JSON.
    after: Object.fromEntries(
      RIPPLE_TRIGGER_FIELDS.map((f) => [f, normalizeTriggerValue(input.after[f])]),
    ),
  })
  const fingerprint = createHash('sha256').update(canonical).digest('hex').slice(0, 32)
  return `feed:${input.eventId}:${fingerprint}`
}

/** The slot columns the payload builders read (Prisma-derived subset). */
export interface RippleSlotSnapshotInput {
  id: string
  autoLinked: boolean
  channelId: number | null
  plannedStartUtc: Date | null
  plannedEndUtc: Date | null
  expectedDurationMin: number | null
  status: BroadcastSlotStatus
  updatedAt: Date
}

export interface RippleBeforeSlot {
  slotId: string
  autoLinked: boolean
  channelId: number | null
  plannedStartUtc: string | null
  plannedEndUtc: string | null
  expectedDurationMin: number | null
  status: BroadcastSlotStatus
  /** THE stale-at-apply concurrency handle (no version column on BroadcastSlot). */
  updatedAt: string
}

export interface RippleProposedWrite {
  slotId: string
  channelId: number
  plannedStartUtc: string
  plannedEndUtc: string
  expectedDurationMin: number
  status: BroadcastSlotStatus
}

export interface RippleManualReviewSlot {
  slotId: string
  channelId: number | null
  /**
   * MANUAL_LINK: manually-linked slot — the bridge never writes it, review by hand.
   * NOT_DERIVABLE: the updated event no longer yields bridge-derivable values
   * (channel/date/time missing or channel not visible) — nothing to propose.
   */
  reason: 'MANUAL_LINK' | 'NOT_DERIVABLE'
}

export interface RippleRightsSlotAnnotation {
  slotId: string
  ok: boolean
  results: ValidationResult[]
}

/**
 * Advisory rights annotations stored in the preview envelope. Boolean naming is
 * deliberate: `advisory` (never authoritative — SV-3 re-checks), `checked`
 * (did the enrichment RUN — not a compliance verdict), per-slot `ok` (the
 * checker's own lexicon, slot-rights v1).
 */
export interface RippleRightsAnnotations {
  /** Always true — SV-3's apply re-runs the check authoritatively. */
  advisory: true
  /** Whether the enrichment check ran; false = annotation unavailable, see reason. */
  checked: boolean
  checkedAtUtc?: string
  slots?: RippleRightsSlotAnnotation[]
  /** Present when checked=false: sanitized classification, never raw error text. */
  reason?: 'CHECK_FAILED'
  /** Error class name only (no message — this JSONB is API-served). */
  error?: string
}

export interface RipplePreview {
  proposed: RippleProposedWrite[]
  manualReviewSlots: RippleManualReviewSlot[]
  rights: RippleRightsAnnotations | null
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

/** Pre-change snapshot of every linked slot (auto + manual), incl. handles. */
export function buildBeforeSlots(slots: RippleSlotSnapshotInput[]): RippleBeforeSlot[] {
  return slots.map((s) => ({
    slotId: s.id,
    autoLinked: s.autoLinked,
    channelId: s.channelId,
    plannedStartUtc: iso(s.plannedStartUtc),
    plannedEndUtc: iso(s.plannedEndUtc),
    expectedDurationMin: s.expectedDurationMin,
    status: s.status,
    updatedAt: s.updatedAt.toISOString(),
  }))
}

/**
 * Build the preview envelope in one step (no build-then-mutate): proposed
 * writes for autoLinked slots (from the single bridge derivation),
 * manually-linked slots as manual-review entries, and the advisory rights
 * annotations. When the derivation is null (underivable), autoLinked slots
 * ALSO fall back to manual review — a proposal must never promise a write the
 * bridge can't make.
 */
export function buildPreview(
  slots: RippleSlotSnapshotInput[],
  derived: DerivedSlotSyncValues | null,
  rights: RippleRightsAnnotations | null,
): RipplePreview {
  const proposed: RippleProposedWrite[] = []
  const manualReviewSlots: RippleManualReviewSlot[] = []
  for (const s of slots) {
    if (s.autoLinked && derived) {
      proposed.push({
        slotId: s.id,
        channelId: derived.channelId,
        plannedStartUtc: derived.plannedStartUtc.toISOString(),
        plannedEndUtc: derived.plannedEndUtc.toISOString(),
        expectedDurationMin: derived.expectedDurationMin,
        status: derived.status,
      })
    } else {
      manualReviewSlots.push({
        slotId: s.id,
        channelId: s.channelId,
        reason: s.autoLinked ? 'NOT_DERIVABLE' : 'MANUAL_LINK',
      })
    }
  }
  return { proposed, manualReviewSlots, rights }
}
