/**
 * SV-2-T3 — creation-time rights enrichment + generation measurement.
 *
 * Enrichment: proposal creation runs the slot-rights check (RD-4 machinery:
 * `checkRightsForEvent`, the same event→slots mapping as `slot-rights v1`) over
 * the affected slots ON THE CAPTURE TX (post-change event values) and stores
 * ADVISORY annotations in the preview envelope (`preview.rights`). SV-3's
 * apply re-runs the check authoritatively. An enrichment failure annotates
 * `checked:false` with a SANITIZED reason — the proposal is NEVER lost and the
 * import NEVER fails (fail-visible, TD-18 lesson).
 *
 * Measurement (ADR-019 Open assumption 1):
 * `ripple_proposal_capture_duration_seconds` (histogram, 5s SLO bucket
 * boundary) + `ripple_proposals_captured_total` (counter by outcome). This
 * pins the RECORDING MECHANISM — the production p95 comes from the Prometheus
 * scrape of the same histogram (no fake load test, no wall-clock asserts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const flagState = { scheduleRipple: true }

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

const { checkRightsForEventMock } = vi.hoisted(() => ({
  checkRightsForEventMock: vi.fn(),
}))

vi.mock('../src/services/rightsChecker.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/services/rightsChecker.js')>()
  return { ...actual, checkRightsForEvent: checkRightsForEventMock }
})

const {
  txEventFindUnique, txEventUpdate, txSlotFindMany, txChannelFindFirst,
  txProposalFindFirst, txProposalUpdateMany, txProposalCreate,
  txOutboxCreate, txOutboxCreateMany, txInstances,
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
  txInstances: [] as Array<Record<string, Record<string, ReturnType<typeof vi.fn>>>>,
}))

vi.mock('../src/db/prisma.js', () => {
  const makeTx = () => {
    const tx = {
      event: {
        findUnique: vi.fn((...a: unknown[]) => txEventFindUnique(...a)),
        update: vi.fn((...a: unknown[]) => txEventUpdate(...a)),
      },
      broadcastSlot: { findMany: vi.fn((...a: unknown[]) => txSlotFindMany(...a)) },
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

vi.mock('../src/import/services/ImportGovernanceService.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/import/services/ImportGovernanceService.js')>()
  return {
    ...actual,
    getFieldSourceCodes: vi.fn().mockResolvedValue({}),
    recordFieldProvenance: vi.fn().mockResolvedValue(undefined),
    shouldApplyImportedField: vi.fn().mockReturnValue(true),
  }
})

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
import { rippleProposalCaptureDuration, rippleProposalsCaptured } from '../src/metrics.js'
import type { CanonicalImportEvent, RawSourceRecord } from '../src/import/types.js'

const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const TENANT = '00000000-0000-0000-0000-000000000001'
const EVENT_ID = 42

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
  sportId: 5,
  competitionId: 7,
  participants: 'Test Team A vs Test Team B',
  startDateBE: new Date('2026-08-01T00:00:00.000Z'),
  startTimeBE: '20:00',
  channelId: 3,
  durationMin: 105,
  status: 'published',
  customFields: {},
  createdById: null,
} as Record<string, unknown>

const updatedRow = { ...existingRow, startTimeBE: '21:15' }

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

const checkerResult = {
  eventId: EVENT_ID,
  ok: false,
  results: [
    { code: 'PLATFORM_NOT_LICENSED', severity: 'ERROR', scope: ['rights'], message: 'nope' },
  ],
}

async function histogramStats() {
  const metric = await rippleProposalCaptureDuration.get()
  const count = metric.values.find((v) => v.metricName?.endsWith('_count'))?.value ?? 0
  const sum = metric.values.find((v) => v.metricName?.endsWith('_sum'))?.value ?? 0
  const bucketBoundaries = metric.values
    .filter((v) => v.metricName?.endsWith('_bucket'))
    .map((v) => (v.labels as { le: number | string }).le)
  return { count, sum, bucketBoundaries }
}

async function counterValue(outcome: string) {
  const metric = await rippleProposalsCaptured.get()
  return metric.values.find((v) => (v.labels as { outcome?: string }).outcome === outcome)?.value ?? 0
}

function updatingTx() {
  const owners = txInstances.filter((t) => t.event.update.mock.calls.length > 0)
  expect(owners).toHaveLength(1)
  return owners[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  txInstances.length = 0
  flagState.scheduleRipple = true

  checkRightsForEventMock.mockResolvedValue(checkerResult)
  txEventFindUnique.mockResolvedValue(existingRow)
  txEventUpdate.mockResolvedValue(updatedRow)
  txSlotFindMany.mockResolvedValue([autoSlot])
  txChannelFindFirst.mockResolvedValue({ timezone: 'Europe/Brussels' })
  txProposalFindFirst.mockResolvedValue(null)
  txProposalUpdateMany.mockResolvedValue({ count: 0 })
  txProposalCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: '55555555-5555-4555-8555-555555555555',
    status: 'PENDING',
    ...args.data,
  }))
  txOutboxCreate.mockResolvedValue({})
  txOutboxCreateMany.mockResolvedValue({ count: 1 })

  mp.sport.findFirst.mockResolvedValue({ id: 5, name: 'Football' })
  mp.canonicalCompetition.upsert.mockResolvedValue({ id: 'cc-1' })
  mp.competition.findUnique.mockResolvedValue(null)
  mp.competition.create.mockResolvedValue({ id: 7, matches: 0 })
  mp.competition.update.mockResolvedValue({ id: 7, matches: 0 })
  mp.competition.findFirst.mockResolvedValue({ id: 7 })
  mp.competitionAlias.upsert.mockResolvedValue({})
  mp.importSourceLink.upsert.mockResolvedValue({})
})

describe('SV-2-T3 creation-time rights enrichment (advisory, slot-rights v1 machinery)', () => {
  it('stores ADVISORY per-slot annotations in preview.rights, run on the capture tx (post-change values)', async () => {
    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(txProposalCreate).toHaveBeenCalledTimes(1)
    const rights = txProposalCreate.mock.calls[0][0].data.preview.rights
    expect(rights.advisory).toBe(true) // SV-3's apply re-runs authoritatively
    expect(rights.checked).toBe(true) // "did the check RUN" — not a compliance verdict
    expect(typeof rights.checkedAtUtc).toBe('string')
    expect(rights.slots).toEqual([
      { slotId: autoSlot.id, ok: false, results: checkerResult.results },
    ])

    // The check ran against THE CAPTURE TX → sees the just-written event values.
    expect(checkRightsForEventMock).toHaveBeenCalledTimes(1)
    const [eventIdArg, optsArg] = checkRightsForEventMock.mock.calls[0]
    expect(eventIdArg).toBe(EVENT_ID)
    expect(optsArg.db).toBe(updatingTx())
  })

  it('enrichment failure → checked:false with SANITIZED reason (no raw message in API-served JSONB); proposal NEVER lost, import NEVER failed (TD-18)', async () => {
    checkRightsForEventMock.mockRejectedValue(new Error('rights backend down: secret dsn'))

    const result = await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(result).toEqual({ kind: 'updated' }) // import succeeded
    expect(txProposalCreate).toHaveBeenCalledTimes(1) // proposal kept
    const rights = txProposalCreate.mock.calls[0][0].data.preview.rights
    expect(rights).toEqual({
      advisory: true,
      checked: false,
      reason: 'CHECK_FAILED', // classification — the raw message stays in the server log
      error: 'Error', // error class name only
    })
    expect(txOutboxCreateMany).toHaveBeenCalledTimes(1) // fan-out kept too
  })
})

describe('SV-2-T3 measurement — proposal volume + capture duration (ADR-019 OA1, <5s p95 SLO incl. enrichment)', () => {
  it('records the capture duration (incl. enrichment) in the histogram, with the SLO bucket boundary', async () => {
    const before = await histogramStats()

    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    const after = await histogramStats()
    // The recorded observation covers detection, snapshots, ENRICHMENT, create,
    // outbox. No wall-clock assert here — the < 5s p95 SLO is asserted from the
    // production Prometheus scrape of this same histogram; the mechanism pin is
    // the count delta + the 5s bucket boundary below.
    expect(after.count).toBe(before.count + 1)
    expect(after.bucketBoundaries).toContain(5)
  })

  it('slow enrichment is INCLUDED in the recorded latency (the measurement is honest about the enrichment cost)', async () => {
    checkRightsForEventMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(checkerResult), 120)),
    )
    const before = await histogramStats()

    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    const after = await histogramStats()
    expect(after.count).toBe(before.count + 1)
    expect(after.sum - before.sum).toBeGreaterThanOrEqual(0.1) // ≥ the enrichment delay
  })

  it('counts proposal volume by outcome: created vs idempotent echo', async () => {
    const createdBefore = await counterValue('created')
    const echoedBefore = await counterValue('echoed')

    await upsertEvent('src-1', TENANT, rawRecord, normalized)
    expect(await counterValue('created')).toBe(createdBefore + 1)

    txProposalFindFirst.mockResolvedValue({ id: 'existing', tenantId: TENANT, status: 'PENDING' })
    await upsertEvent('src-1', TENANT, rawRecord, normalized)
    expect(await counterValue('echoed')).toBe(echoedBefore + 1)
    expect(await counterValue('created')).toBe(createdBefore + 1) // unchanged
  })

  it('flag OFF records nothing (no phantom volume)', async () => {
    flagState.scheduleRipple = false
    const before = await histogramStats()

    await upsertEvent('src-1', TENANT, rawRecord, normalized)

    const after = await histogramStats()
    expect(after.count).toBe(before.count)
  })
})
