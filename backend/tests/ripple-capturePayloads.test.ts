/**
 * SV-2-T1 — pure ripple capture-payload builders (loader-free): FEED change
 * detection over the exact `shouldSync` trigger-field set (G8 parity — and the
 * set is the bridge's OWN exported const, review C1, so a 6th trigger field
 * cannot silently bypass capture), the `sourceChangeId` composition pin
 * (ADR-019 Open assumption 3 — decided at SV-2-T1: change-fingerprint, see
 * composeFeedSourceChangeId's header for the tradeoff), and the
 * beforeSlots/preview payload builders incl. the `updatedAt` concurrency
 * handle (BroadcastSlot carries NO `version` column — `ScheduleDraft.version`
 * is draft-level — so `updatedAt` is THE stale-at-apply handle SV-3 compares).
 *
 * TD-28 guard: the snapshot field subset EXCLUDES `overrunStrategy` (pinned
 * below) and the module types against Prisma-derived enums, never
 * `schemas/broadcastSlots.ts`.
 */
import { describe, it, expect } from 'vitest'
import { BroadcastSlotStatus } from '@prisma/client'
import { shouldSync, deriveSlotSyncValues, TRIGGER_FIELDS } from '../src/services/eventSlotBridge.js'
import {
  RIPPLE_TRIGGER_FIELDS,
  detectFeedScheduleChange,
  composeFeedSourceChangeId,
  buildBeforeSlots,
  buildPreview,
} from '../src/services/ripple/capturePayloads.js'

const baseEvent = {
  channelId: 3,
  startDateBE: new Date('2026-08-01T00:00:00.000Z'),
  startTimeBE: '20:00',
  durationMin: 105,
  status: 'published',
}

function slotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    autoLinked: true,
    channelId: 3,
    plannedStartUtc: new Date('2026-08-01T18:00:00.000Z'),
    plannedEndUtc: new Date('2026-08-01T19:45:00.000Z'),
    expectedDurationMin: 105,
    status: BroadcastSlotStatus.PLANNED,
    // Prisma-derived extra columns the builders must IGNORE (subset discipline):
    overrunStrategy: 'EXTEND',
    updatedAt: new Date('2026-07-20T10:00:00.000Z'),
    ...overrides,
  }
}

describe('SV-2-T1 detectFeedScheduleChange — shouldSync field-set parity (G8)', () => {
  it('exposes exactly the 5-field shouldSync trigger set', () => {
    expect([...RIPPLE_TRIGGER_FIELDS].sort()).toEqual(
      ['channelId', 'durationMin', 'startDateBE', 'startTimeBE', 'status'].sort(),
    )
  })

  it("IS the bridge's own exported const (C1: one source — a 6th trigger field cannot bypass capture)", () => {
    expect(RIPPLE_TRIGGER_FIELDS).toBe(TRIGGER_FIELDS)
  })

  it('no trigger-field change → no changes (non-trigger fields ignored)', () => {
    const after = { ...baseEvent, participants: 'A vs B (renamed)', score: '1-0' }
    const res = detectFeedScheduleChange(baseEvent, after)
    expect(res.hasChanges).toBe(false)
    expect(res.changedFields).toEqual([])
  })

  it.each(['channelId', 'startDateBE', 'startTimeBE', 'durationMin', 'status'] as const)(
    'single-field permutation %s: detection agrees with eventSlotBridge.shouldSync',
    (field) => {
      const mutation: Record<string, unknown> = {
        channelId: 4,
        startDateBE: new Date('2026-08-02T00:00:00.000Z'),
        startTimeBE: '21:15',
        durationMin: 90,
        status: 'cancelled',
      }
      const after = { ...baseEvent, [field]: mutation[field] }
      const res = detectFeedScheduleChange(baseEvent, after)
      expect(res.hasChanges).toBe(true)
      expect(res.changedFields).toEqual([field])
      // parity with the manual path's trigger:
      expect(shouldSync(baseEvent as never, after as never)).toBe(true)
    },
  )

  it('null vs empty-string is NOT a change (shouldSync `?? \'\'` semantics preserved)', () => {
    const before = { ...baseEvent, durationMin: null }
    const after = { ...baseEvent, durationMin: undefined }
    expect(detectFeedScheduleChange(before, after).hasChanges).toBe(false)
    expect(shouldSync(before as never, after as never)).toBe(false)
  })

  it('sub-second Date jitter is NOT a change (second-precision normalization matches String(Date) — C6)', () => {
    const before = { ...baseEvent, startDateBE: new Date('2026-08-01T00:00:00.000Z') }
    const after = { ...baseEvent, startDateBE: new Date('2026-08-01T00:00:00.450Z') }
    expect(detectFeedScheduleChange(before, after).hasChanges).toBe(false)
    expect(shouldSync(before as never, after as never)).toBe(false) // same equality verdict
  })

  it('multiple changed fields are all reported', () => {
    const after = { ...baseEvent, startTimeBE: '18:30', durationMin: 90 }
    const res = detectFeedScheduleChange(baseEvent, after)
    expect(res.hasChanges).toBe(true)
    expect([...res.changedFields].sort()).toEqual(['durationMin', 'startTimeBE'])
  })
})

describe('SV-2-T1 composeFeedSourceChangeId — change-fingerprint composition pin (ADR-019 OA3)', () => {
  const input = {
    eventId: 42,
    sourceId: 'src-1',
    sourceRecordId: 'rec-100',
    after: {
      channelId: 3,
      startDateBE: new Date('2026-08-02T00:00:00.000Z'),
      startTimeBE: '21:15',
      durationMin: 105,
      status: 'published',
    },
  }

  it('GOLDEN PIN: the exact composed id for a known change', () => {
    // Hard-coded literal (computed once): pins the full composition —
    // field order, second-precision ISO date normalization (machine/TZ
    // independent), job-id exclusion, tenant exclusion, prefix, hash length.
    // ANY composition change (which would orphan persisted idempotency keys)
    // goes RED here and must be a deliberate, migrated decision.
    expect(composeFeedSourceChangeId(input)).toBe('feed:42:72be41d9c7025106500e6281daf9ff64')
  })

  it('a different after-value → a different id (a NEW change proposes anew)', () => {
    const other = composeFeedSourceChangeId({
      ...input,
      after: { ...input.after, startTimeBE: '22:00' },
    })
    expect(other).not.toBe(composeFeedSourceChangeId(input))
  })

  it('a different source record → a different id (change identity = record R of source S says event E gets values V)', () => {
    expect(composeFeedSourceChangeId({ ...input, sourceRecordId: 'rec-200' })).not.toBe(
      composeFeedSourceChangeId(input),
    )
  })

  it('Date after-values hash by instant (second precision), not machine-local rendering', () => {
    const a = composeFeedSourceChangeId(input)
    // same instant, distinct object:
    const b = composeFeedSourceChangeId({
      ...input,
      after: { ...input.after, startDateBE: new Date(input.after.startDateBE.getTime()) },
    })
    // sub-second jitter folds into the same fingerprint (C6):
    const c = composeFeedSourceChangeId({
      ...input,
      after: { ...input.after, startDateBE: new Date(input.after.startDateBE.getTime() + 450) },
    })
    expect(b).toBe(a)
    expect(c).toBe(a)
  })
})

describe('SV-2-T1 payload builders — field subset + concurrency handles', () => {
  it('beforeSlots captures the proposed field subset PLUS the updatedAt handle, per slot', () => {
    const rows = [slotRow(), slotRow({ id: '44444444-4444-4444-8444-444444444444', autoLinked: false })]
    const before = buildBeforeSlots(rows as never)
    expect(before).toHaveLength(2)
    expect(before[0]).toEqual({
      slotId: rows[0].id,
      autoLinked: true,
      channelId: 3,
      plannedStartUtc: '2026-08-01T18:00:00.000Z',
      plannedEndUtc: '2026-08-01T19:45:00.000Z',
      expectedDurationMin: 105,
      status: 'PLANNED',
      // THE stale-at-apply concurrency handle (no version column on BroadcastSlot):
      updatedAt: '2026-07-20T10:00:00.000Z',
    })
  })

  it('TD-28 guard: overrunStrategy is NOT part of the snapshot field subset', () => {
    const before = buildBeforeSlots([slotRow()] as never)
    expect(Object.keys(before[0])).not.toContain('overrunStrategy')
  })

  it('preview: proposed writes ONLY for autoLinked slots; manual slots become manual-review entries; rights passed through', () => {
    const auto = slotRow()
    const manual = slotRow({ id: '44444444-4444-4444-8444-444444444444', autoLinked: false })
    const derived = deriveSlotSyncValues(
      { ...baseEvent, startTimeBE: '21:15', status: 'published' } as never,
      'Europe/Brussels',
    )
    const preview = buildPreview([auto, manual] as never, derived, null)
    expect(preview.proposed).toHaveLength(1)
    expect(preview.proposed[0]).toEqual({
      slotId: auto.id,
      channelId: 3,
      plannedStartUtc: '2026-08-01T19:15:00.000Z', // 21:15 BE (CEST, UTC+2) → 19:15Z
      plannedEndUtc: '2026-08-01T21:00:00.000Z', // +105 min
      expectedDurationMin: 105,
      status: 'PLANNED',
    })
    expect(preview.manualReviewSlots).toEqual([
      { slotId: manual.id, channelId: 3, reason: 'MANUAL_LINK' },
    ])
    // rights annotations are built by enrichment and passed IN (C4 — single-step
    // construction, no build-then-mutate); null when capture ran without them:
    expect(preview.rights).toBeNull()
  })

  it('preview with underivable sync values: NO proposed writes, autoLinked slots surfaced as manual-review NOT_DERIVABLE', () => {
    const preview = buildPreview([slotRow()] as never, null, null)
    expect(preview.proposed).toEqual([])
    expect(preview.manualReviewSlots).toEqual([
      { slotId: slotRow().id, channelId: 3, reason: 'NOT_DERIVABLE' },
    ])
  })

  it('round-trip: beforeSlots/preview survive JSON serialization intact (Json column posture)', () => {
    const rows = [slotRow()]
    const before = buildBeforeSlots(rows as never)
    const preview = buildPreview(rows as never, deriveSlotSyncValues(baseEvent as never, 'Europe/Brussels'), null)
    expect(JSON.parse(JSON.stringify(before))).toEqual(before)
    expect(JSON.parse(JSON.stringify(preview))).toEqual(preview)
  })
})

describe('SV-2-T1 deriveSlotSyncValues — the single source of "what the bridge would write" (extracted, behavior-preserving)', () => {
  it('derives the exact syncEventToSlot write set for a schedulable event', () => {
    const derived = deriveSlotSyncValues(baseEvent as never, 'Europe/Brussels')
    expect(derived).toEqual({
      channelId: 3,
      plannedStartUtc: new Date('2026-08-01T18:00:00.000Z'), // 20:00 CEST → 18:00Z
      plannedEndUtc: new Date('2026-08-01T19:45:00.000Z'), // +105 min
      expectedDurationMin: 105,
      status: BroadcastSlotStatus.PLANNED,
    })
  })

  it('defaults durationMin to 90 when unknown (bridge parity)', () => {
    const derived = deriveSlotSyncValues({ ...baseEvent, durationMin: null } as never, 'Europe/Brussels')
    expect(derived?.expectedDurationMin).toBe(90)
    expect(derived?.plannedEndUtc).toEqual(new Date('2026-08-01T19:30:00.000Z'))
  })

  it.each([
    ['cancelled', BroadcastSlotStatus.VOIDED],
    ['live', BroadcastSlotStatus.LIVE],
    ['completed', BroadcastSlotStatus.COMPLETED],
    ['published', BroadcastSlotStatus.PLANNED],
  ] as const)('maps event status %s → slot %s (bridge parity)', (evStatus, slotStatus) => {
    const derived = deriveSlotSyncValues({ ...baseEvent, status: evStatus } as never, 'Europe/Brussels')
    expect(derived?.status).toBe(slotStatus)
  })

  it('returns null when channelId / startDateBE / startTimeBE is missing (bridge skip parity)', () => {
    expect(deriveSlotSyncValues({ ...baseEvent, channelId: null } as never, 'Europe/Brussels')).toBeNull()
    expect(deriveSlotSyncValues({ ...baseEvent, startTimeBE: '' } as never, 'Europe/Brussels')).toBeNull()
  })
})
