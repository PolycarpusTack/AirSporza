/**
 * SV-2-T2 — FEED-change capture → RippleProposal at the provision.ts seam
 * (`updateImportedEvent`, the ONLY import path that updates existing events —
 * create sites produce events with no linked slots, so no proposal by
 * definition). Prisma fully mocked (house idiom: import-accessibility-seeding
 * .test.ts); flag pinned via the env Proxy idiom (cascade-preview-parity).
 *
 * FIRST TDD step = the spike memo's characterization test #1: a re-import with a
 * changed startsAtUtc on an event with an autoLinked slot leaves
 * `plannedStartUtc` UNCHANGED. That is BOTH the flag-off pin (today's
 * silently-stale behavior is preserved byte-identically) AND the RED for the
 * flag-on fix (SV-2 surfaces the divergence as a PENDING proposal — still NO
 * slot write; SV-3 owns apply).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Mutable flag holder so individual tests can flip SCHEDULE_RIPPLE_ENABLED. */
const flagState = { scheduleRipple: false }

vi.mock('../src/config/env.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/config/env.js')>()
  return {
    ...mod,
    env: new Proxy(mod.env, {
      get(target, prop, receiver) {
        if (prop === 'SCHEDULE_RIPPLE_ENABLED') return flagState.scheduleRipple
        return Reflect.get(target, prop, receiver)
      },
    }),
  }
})

// Transaction-client spies, hoisted for the vi.mock factory. Each $transaction
// invocation gets a FRESH tx instance (recorded in txInstances) so tests can
// prove event-update + proposal-create + outbox shared ONE transaction.
const {
  txEventFindUnique, txEventUpdate, txSlotFindMany, txChannelFindFirst,
  txProposalFindFirst, txProposalUpdateMany, txProposalCreate,
  txOutboxCreate, txOutboxCreateMany, txQueryRaw, txSlotUpdate, txSlotUpdateMany,
  txInstances,
} = vi.hoisted(() => ({
  txEventFindUnique: vi.fn(),
  txEventUpdate: vi.fn(),
  txSlotFindMany: vi.fn(),
  txChannelFindFirst: vi.fn(),
  txProposalFindFirst: vi.fn(),
  txProposalUpdateMany: vi.fn(),
  txProposalCreate: vi.fn(),
  txOutboxCreate: vi.fn(),
  txOutboxCreateMany: vi.fn(),
  txQueryRaw: vi.fn(),
  txSlotUpdate: vi.fn(),
  txSlotUpdateMany: vi.fn(),
  txInstances: [] as Array<Record<string, Record<string, ReturnType<typeof vi.fn>>>>,
}))

vi.mock('../src/db/prisma.js', () => {
  const makeTx = () => {
    const tx = {
      $queryRaw: vi.fn((...a: unknown[]) => txQueryRaw(...a)),
      event: {
        findUnique: vi.fn((...a: unknown[]) => txEventFindUnique(...a)),
        update: vi.fn((...a: unknown[]) => txEventUpdate(...a)),
      },
      broadcastSlot: {
        findMany: vi.fn((...a: unknown[]) => txSlotFindMany(...a)),
        update: vi.fn((...a: unknown[]) => txSlotUpdate(...a)),
        updateMany: vi.fn((...a: unknown[]) => txSlotUpdateMany(...a)),
      },
      channel: { findFirst: vi.fn((...a: unknown[]) => txChannelFindFirst(...a)) },
      rippleProposal: {
        findFirst: vi.fn((...a: unknown[]) => txProposalFindFirst(...a)),
        updateMany: vi.fn((...a: unknown[]) => txProposalUpdateMany(...a)),
        create: vi.fn((...a: unknown[]) => txProposalCreate(...a)),
      },
      outboxEvent: {
        create: vi.fn((...a: unknown[]) => txOutboxCreate(...a)),
        createMany: vi.fn((...a: unknown[]) => txOutboxCreateMany(...a)),
      },
    }
    txInstances.push(tx as never)
    return tx
  }
  return {
    prisma: {
      sport: { findFirst: vi.fn() },
      canonicalCompetition: { upsert: vi.fn() },
      competition: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      competitionAlias: { upsert: vi.fn() },
      importSourceLink: { upsert: vi.fn() },
      $transaction: vi.fn(async (cb: (client: ReturnType<typeof makeTx>) => unknown) => cb(makeTx())),
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn(),
    },
  }
})

// Keep provision's projection light: stub governance side effects (house posture).
vi.mock('../src/import/services/ImportGovernanceService.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/import/services/ImportGovernanceService.js')>()
  return {
    ...actual,
    getFieldSourceCodes: vi.fn().mockResolvedValue({}),
    recordFieldProvenance: vi.fn().mockResolvedValue(undefined),
    shouldApplyImportedField: vi.fn().mockReturnValue(true),
  }
})

// Exact dedup hit → the updateImportedEvent path.
vi.mock('../src/import/stages/shared.js', () => ({
  deduplicationService: {
    findExactMatch: vi.fn().mockResolvedValue({ entityId: '42' }),
    findFingerprintMatch: vi.fn().mockResolvedValue(null),
    findFuzzyMatch: vi.fn().mockResolvedValue([]),
  },
  normalizeName: (s: string) => s.toLowerCase().trim(),
}))

import { prisma } from '../src/db/prisma.js'
import { upsertEvent } from '../src/import/stages/provision.js'
import { composeFeedSourceChangeId } from '../src/services/ripple/capturePayloads.js'
import type { CanonicalImportEvent, RawSourceRecord } from '../src/import/types.js'

const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const TENANT = '00000000-0000-0000-0000-000000000001'
const TENANT_B = '00000000-0000-0000-0000-000000000002'
const SPORT_ID = 5
const COMPETITION_ID = 7
const EVENT_ID = 42

/** Re-import moves kickoff to 21:15 Brussels (19:15Z in August, CEST). */
const normalized: CanonicalImportEvent = {
  externalKeys: [{ source: 'football_data', id: 'ext-100' }],
  sportName: 'Football',
  competitionName: 'Test Cup',
  status: 'scheduled',
  startsAtUtc: '2026-08-01T19:15:00.000Z',
  homeTeam: 'Test Team A',
  awayTeam: 'Test Team B',
  metadata: {},
}

const rawRecord: RawSourceRecord = {
  id: 'rec-100',
  type: 'event',
  raw: {},
  fetchedAt: new Date('2026-08-01T00:00:00.000Z'),
}

const existingRow = {
  id: EVENT_ID,
  tenantId: TENANT,
  sportId: SPORT_ID,
  competitionId: COMPETITION_ID,
  participants: 'Test Team A vs Test Team B',
  phase: '',
  category: 'Imported',
  content: 'Test Cup',
  startDateBE: new Date('2026-08-01T00:00:00.000Z'),
  startTimeBE: '20:00',
  startDateOrigin: null,
  startTimeOrigin: null,
  complex: '',
  livestreamDate: null,
  livestreamTime: null,
  linearChannel: '',
  radioChannel: '',
  linearStartTime: '20:00',
  isLive: false,
  isDelayedLive: false,
  videoRef: '',
  winner: '',
  score: '',
  duration: '',
  customFields: {},
  createdById: null,
  channelId: 3,
  durationMin: 105,
  status: 'published',
}

const updatedRow = {
  ...existingRow,
  startTimeBE: '21:15',
  sport: { id: SPORT_ID, name: 'Football' },
  competition: { id: COMPETITION_ID, name: 'Test Cup' },
}

const autoSlot = {
  id: '33333333-3333-4333-8333-333333333333',
  autoLinked: true,
  channelId: 3,
  plannedStartUtc: new Date('2026-08-01T18:00:00.000Z'),
  plannedEndUtc: new Date('2026-08-01T19:45:00.000Z'),
  expectedDurationMin: 105,
  status: 'PLANNED',
  updatedAt: new Date('2026-07-20T10:00:00.000Z'),
}

const manualSlot = {
  ...autoSlot,
  id: '44444444-4444-4444-8444-444444444444',
  autoLinked: false,
}

const expectedSourceChangeId = composeFeedSourceChangeId({
  eventId: EVENT_ID,
  sourceId: 'src-1',
  sourceRecordId: 'rec-100',
  after: {
    channelId: updatedRow.channelId,
    startDateBE: updatedRow.startDateBE,
    startTimeBE: updatedRow.startTimeBE,
    durationMin: updatedRow.durationMin,
    status: updatedRow.status,
  },
})

/** The single tx instance the event update ran on. */
function updatingTx() {
  const owners = txInstances.filter((t) => t.event.update.mock.calls.length > 0)
  expect(owners).toHaveLength(1)
  return owners[0]
}

function assertNoSlotWrite() {
  // The bridge's upsert is $queryRaw; ANY slot write on the import path would
  // surface on one of these. plannedStartUtc stays UNCHANGED — the G8 pin.
  expect(txQueryRaw).not.toHaveBeenCalled()
  expect(txSlotUpdate).not.toHaveBeenCalled()
  expect(txSlotUpdateMany).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  txInstances.length = 0
  flagState.scheduleRipple = false

  txEventFindUnique.mockResolvedValue(existingRow)
  txEventUpdate.mockResolvedValue(updatedRow)
  txSlotFindMany.mockResolvedValue([autoSlot])
  txChannelFindFirst.mockResolvedValue({ timezone: 'Europe/Brussels' })
  txProposalFindFirst.mockResolvedValue(null)
  txProposalUpdateMany.mockResolvedValue({ count: 0 })
  txProposalCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: '55555555-5555-4555-8555-555555555555',
    status: 'PENDING',
    confidence: null,
    ...args.data,
  }))
  txOutboxCreate.mockResolvedValue({})
  txOutboxCreateMany.mockResolvedValue({ count: 1 })

  mp.sport.findFirst.mockResolvedValue({ id: SPORT_ID, name: 'Football' })
  mp.canonicalCompetition.upsert.mockResolvedValue({ id: 'cc-1' })
  mp.competition.findUnique.mockResolvedValue(null)
  mp.competition.create.mockResolvedValue({ id: COMPETITION_ID, matches: 0 })
  mp.competition.update.mockResolvedValue({ id: COMPETITION_ID, matches: 0 })
  mp.competition.findFirst.mockResolvedValue({ id: COMPETITION_ID })
  mp.competitionAlias.upsert.mockResolvedValue({})
  mp.importSourceLink.upsert.mockResolvedValue({})
})

describe('SV-2-T2 characterization #1 (spike memo) — flag OFF: byte-identical silently-stale import', () => {
  it('re-import with changed startsAtUtc on an event with an autoLinked slot: event row written, plannedStartUtc UNCHANGED, NO proposal, NO extra queries', async () => {
    const result = await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(result).toEqual({ kind: 'updated' })
    expect(txEventUpdate).toHaveBeenCalledTimes(1)
    assertNoSlotWrite()
    // Flag OFF short-circuits BEFORE any ripple query — byte-identical DB
    // traffic to today's import path (the silently-stale behavior, preserved):
    expect(txSlotFindMany).not.toHaveBeenCalled()
    expect(txProposalFindFirst).not.toHaveBeenCalled()
    expect(txProposalCreate).not.toHaveBeenCalled()
    expect(txOutboxCreateMany).not.toHaveBeenCalled()
    // the pre-existing event.updated outbox write is untouched:
    expect(txOutboxCreate).toHaveBeenCalledTimes(1)
  })
})

describe('SV-2-T2 flag ON — FEED change on a slot-linked event proposes (the G8 fix)', () => {
  beforeEach(() => {
    flagState.scheduleRipple = true
  })

  it('creates a PENDING FEED proposal; the event row write is byte-identical; STILL no slot write', async () => {
    // Capture the flag-off event write for the byte-identical comparison.
    flagState.scheduleRipple = false
    await upsertEvent('src-1', TENANT, rawRecord, normalized)
    const flagOffUpdateArgs = txEventUpdate.mock.calls[0]

    vi.clearAllMocks()
    txInstances.length = 0
    flagState.scheduleRipple = true

    const result = await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(result).toEqual({ kind: 'updated' })
    // Feed stays authoritative for event data — same write, immediately:
    expect(txEventUpdate).toHaveBeenCalledTimes(1)
    expect(txEventUpdate.mock.calls[0]).toEqual(flagOffUpdateArgs)
    // The PENDING window's event≠slot divergence IS the surfaced staleness:
    assertNoSlotWrite()

    expect(txProposalCreate).toHaveBeenCalledTimes(1)
    const data = txProposalCreate.mock.calls[0][0].data
    expect(data.tenantId).toBe(TENANT) // from the event row, never client input
    expect(data.eventId).toBe(EVENT_ID)
    expect(data.source).toBe('FEED')
    expect(data.sourceChangeId).toBe(expectedSourceChangeId)
    expect(data.beforeSlots).toEqual([
      {
        slotId: autoSlot.id,
        autoLinked: true,
        channelId: 3,
        plannedStartUtc: '2026-08-01T18:00:00.000Z',
        plannedEndUtc: '2026-08-01T19:45:00.000Z',
        expectedDurationMin: 105,
        status: 'PLANNED',
        updatedAt: '2026-07-20T10:00:00.000Z', // the stale-at-apply handle
      },
    ])
    expect(data.preview.proposed).toEqual([
      {
        slotId: autoSlot.id,
        channelId: 3,
        plannedStartUtc: '2026-08-01T19:15:00.000Z', // 21:15 BE (CEST) → 19:15Z
        plannedEndUtc: '2026-08-01T21:00:00.000Z', // +105 min
        expectedDurationMin: 105,
        status: 'PLANNED',
      },
    ])
    expect(data.preview.manualReviewSlots).toEqual([])
    // confidence is NOT set (NULL in v1 — no feed-confidence source wired):
    expect(data.confidence).toBeUndefined()

    // Same-transaction proof: event update + proposal create share ONE tx
    // instance (the outbox same-tx proof lives in the outbox test below).
    const tx = updatingTx()
    expect(tx.rippleProposal.create).toHaveBeenCalledTimes(1)
  })

  it('writes ripple_proposal.created via writeOutboxEventDeduped IN THE SAME TX, tenantId in the key (TD-13 lesson)', async () => {
    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(txOutboxCreateMany).toHaveBeenCalledTimes(1)
    const args = txOutboxCreateMany.mock.calls[0][0]
    expect(args.skipDuplicates).toBe(true) // dedup insert — a retry cannot poison the tx
    expect(args.data).toHaveLength(1)
    const row = args.data[0]
    expect(row.eventType).toBe('ripple_proposal.created')
    expect(row.aggregateType).toBe('RippleProposal')
    expect(row.tenantId).toBe(TENANT)
    expect(row.idempotencyKey).toBe(`ripple_proposal.created:${TENANT}:${expectedSourceChangeId}`)
    // Same-transaction proof (ADR-001): the outbox row rode the tx that wrote
    // the event + proposal.
    const tx = updatingTx()
    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1)
  })

  it('idempotent re-emit: same sourceChangeId → the SAME proposal (no duplicate, NO supersession, no second outbox row)', async () => {
    txProposalFindFirst.mockResolvedValue({
      id: 'existing-proposal',
      tenantId: TENANT,
      eventId: EVENT_ID,
      sourceChangeId: expectedSourceChangeId,
      status: 'PENDING',
    })

    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(txProposalFindFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      sourceChangeId: expectedSourceChangeId,
    })
    expect(txProposalCreate).not.toHaveBeenCalled()
    expect(txProposalUpdateMany).not.toHaveBeenCalled() // re-emit takes precedence over supersession
    expect(txOutboxCreateMany).not.toHaveBeenCalled()
    // the event row still updates (feed authoritative), as today:
    expect(txEventUpdate).toHaveBeenCalledTimes(1)
  })

  it('supersession: a NEW change (different sourceChangeId) marks PENDING same-event proposals (any source) SUPERSEDED before creating', async () => {
    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(txProposalUpdateMany).toHaveBeenCalledTimes(1)
    expect(txProposalUpdateMany.mock.calls[0][0]).toEqual({
      where: { tenantId: TENANT, eventId: EVENT_ID, status: 'PENDING' }, // any source — deliberately no source filter
      data: { status: 'SUPERSEDED' },
    })
    // supersede-then-create ordering:
    const supersedeOrder = txProposalUpdateMany.mock.invocationCallOrder[0]
    const createOrder = txProposalCreate.mock.invocationCallOrder[0]
    expect(supersedeOrder).toBeLessThan(createOrder)
  })

  it('a FEED change on an event with NO linked slots → NO proposal; the event updates as today', async () => {
    txSlotFindMany.mockResolvedValue([])

    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(txEventUpdate).toHaveBeenCalledTimes(1)
    expect(txProposalCreate).not.toHaveBeenCalled()
    expect(txProposalUpdateMany).not.toHaveBeenCalled()
    expect(txOutboxCreateMany).not.toHaveBeenCalled()
  })

  it('no trigger-field change (only non-schedule fields) → NO proposal and NO ripple queries', async () => {
    txEventUpdate.mockResolvedValue({ ...updatedRow, startTimeBE: existingRow.startTimeBE, winner: 'Test Team A' })

    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(txSlotFindMany).not.toHaveBeenCalled()
    expect(txProposalCreate).not.toHaveBeenCalled()
  })

  it('manually-linked slots get manual-review entries, never proposed writes', async () => {
    txSlotFindMany.mockResolvedValue([autoSlot, manualSlot])

    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    const data = txProposalCreate.mock.calls[0][0].data
    expect(data.preview.proposed.map((p: { slotId: string }) => p.slotId)).toEqual([autoSlot.id])
    expect(data.preview.manualReviewSlots).toEqual([
      { slotId: manualSlot.id, channelId: 3, reason: 'MANUAL_LINK' },
    ])
    expect(data.beforeSlots).toHaveLength(2) // before captures ALL linked slots
  })

  it('cross-JOB dedupe: the same change re-imported by a later job (new fetchedAt) takes the echo path', async () => {
    // First import creates the proposal…
    await upsertEvent('src-1', TENANT, rawRecord, normalized)
    expect(txProposalCreate).toHaveBeenCalledTimes(1)
    const created = await txProposalCreate.mock.results[0].value

    // …a LATER job re-fetches the identical record (only fetchedAt differs —
    // no job identifier or fetch timestamp is part of the fingerprint):
    txProposalFindFirst.mockResolvedValue(created)
    const laterJobRecord = { ...rawRecord, fetchedAt: new Date('2026-08-02T06:00:00.000Z') }
    await upsertEvent('src-1', TENANT, laterJobRecord, normalized)

    // Both runs looked up the SAME sourceChangeId…
    const lookedUp = txProposalFindFirst.mock.calls.map((c) => c[0].where.sourceChangeId)
    expect(lookedUp).toEqual([expectedSourceChangeId, expectedSourceChangeId])
    // …and the second run echoed instead of creating/superseding:
    expect(txProposalCreate).toHaveBeenCalledTimes(1)
    expect(txProposalUpdateMany).toHaveBeenCalledTimes(1) // first run only
  })

  it('slot + channel lookups are tenant-scoped from the OWNING EVENT row (TD-31 lesson)', async () => {
    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(txSlotFindMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, eventId: EVENT_ID })
    expect(txChannelFindFirst.mock.calls[0][0].where).toMatchObject({ id: 3, tenantId: TENANT })
  })

  it('cross-tenant: the SAME feed change under two tenants → two proposals with the SAME sourceChangeId, each under its own tenant', async () => {
    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    // Same event id + values under tenant B (fingerprint is tenant-free by design):
    txEventFindUnique.mockResolvedValue({ ...existingRow, tenantId: TENANT_B })
    txEventUpdate.mockResolvedValue({ ...updatedRow, tenantId: TENANT_B })
    await upsertEvent('src-1', TENANT_B, rawRecord, normalized)

    expect(txProposalCreate).toHaveBeenCalledTimes(2)
    const [first, second] = txProposalCreate.mock.calls.map((c) => c[0].data)
    expect(first.tenantId).toBe(TENANT)
    expect(second.tenantId).toBe(TENANT_B)
    expect(first.sourceChangeId).toBe(expectedSourceChangeId)
    expect(second.sourceChangeId).toBe(expectedSourceChangeId)
    // …and the outbox keys stay distinct because tenantId is IN the key (TD-13):
    const keys = txOutboxCreateMany.mock.calls.map((c) => c[0].data[0].idempotencyKey)
    expect(keys[0]).not.toBe(keys[1])
  })
})
