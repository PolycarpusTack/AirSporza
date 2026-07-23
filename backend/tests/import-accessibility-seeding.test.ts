/**
 * TD-31 — import-path event creation must seed default accessibility deliverables.
 *
 * RC-2-T1 wired the defaulting hook into the two events-route create sites only;
 * the import paths (`upsertEvent` fresh-create, `manualCreateNormalizedEvent`)
 * created events with NO deliverable rows — invisible to the RC-2-T2 KPI
 * aggregation and the RC-2-T3 ACCESSIBILITY_UNPLANNED check. These tests pin the
 * fix: each import-path `tx.event.create` is followed, in the SAME transaction,
 * by the shared seeding writer (same createMany shape events.test.ts asserts for
 * the routes). Prisma fully mocked (house idiom: player-import.test.ts /
 * mergeCandidates-tenant-scope.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Transaction-client spies, hoisted for the vi.mock factory. The seeding call is
// asserted on the TX client — proving it runs inside the same transaction as the
// event create, not after commit. Each $transaction invocation gets a FRESH tx
// instance (recorded in txInstances) so tests can prove create + seed shared ONE
// transaction — a singleton tx would let a seed-after-commit regression pass.
const { txEventCreate, txDeliverableCreateMany, txInstances } = vi.hoisted(() => ({
  txEventCreate: vi.fn(),
  txDeliverableCreateMany: vi.fn(),
  txInstances: [] as Array<{ event: { create: ReturnType<typeof vi.fn> }; accessibilityDeliverable: { createMany: ReturnType<typeof vi.fn> } }>,
}))

vi.mock('../src/db/prisma.js', () => {
  const makeTx = () => {
    const tx = {
      event: { create: vi.fn((...a: unknown[]) => txEventCreate(...a)) },
      accessibilityDeliverable: { createMany: vi.fn((...a: unknown[]) => txDeliverableCreateMany(...a)) },
      // RC-5-T2: the seeding choke point reads the tenant config on the same tx (null → constant fallback).
      tenantAccessibilityConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    txInstances.push(tx)
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

/** The single tx instance on which the event was created — create and seed must both live here. */
function creatingTx() {
  const owners = txInstances.filter(t => t.event.create.mock.calls.length > 0)
  expect(owners).toHaveLength(1)
  return owners[0]
}

// Keep provision's projection light: stub governance + outbox side effects
// (same posture as mergeCandidates-tenant-scope.test.ts).
vi.mock('../src/import/services/ImportGovernanceService.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/import/services/ImportGovernanceService.js')>()
  return {
    ...actual,
    getFieldSourceCodes: vi.fn().mockResolvedValue({}),
    recordFieldProvenance: vi.fn().mockResolvedValue(undefined),
    shouldApplyImportedField: vi.fn().mockReturnValue(true),
  }
})

vi.mock('../src/services/outbox.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/services/outbox.js')>()
  return { ...actual, writeOutboxEvent: vi.fn().mockResolvedValue(undefined) }
})

// No dedup hit on the fresh-create path: exact/fingerprint/fuzzy all miss.
vi.mock('../src/import/stages/shared.js', () => ({
  deduplicationService: {
    findExactMatch: vi.fn().mockResolvedValue(null),
    findFingerprintMatch: vi.fn().mockResolvedValue(null),
    findFuzzyMatch: vi.fn().mockResolvedValue([]),
  },
  normalizeName: (s: string) => s.toLowerCase().trim(),
}))

import { prisma } from '../src/db/prisma.js'
import { upsertEvent, manualCreateNormalizedEvent } from '../src/import/stages/provision.js'
import { buildDefaultAccessibilityDeliverables } from '../src/config/accessibility.js'
import type { CanonicalImportEvent, RawSourceRecord } from '../src/import/types.js'

const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const TENANT = '00000000-0000-0000-0000-000000000001'
const SPORT_ID = 5
const COMPETITION_ID = 7

const normalized: CanonicalImportEvent = {
  externalKeys: [{ source: 'football_data', id: 'ext-100' }],
  sportName: 'Football',
  competitionName: 'Test Cup',
  status: 'scheduled',
  startsAtUtc: '2026-08-01T18:00:00.000Z',
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

const createdEvent = {
  id: 42,
  tenantId: TENANT,
  sportId: SPORT_ID,
  competitionId: COMPETITION_ID,
  participants: 'Test Team A vs Test Team B',
}

const expectedSeedCall = {
  data: buildDefaultAccessibilityDeliverables(createdEvent).map(d => ({ ...d, eventId: createdEvent.id, tenantId: TENANT })),
  skipDuplicates: true,
}

beforeEach(() => {
  txInstances.length = 0
  txEventCreate.mockReset()
  txDeliverableCreateMany.mockReset()
  txEventCreate.mockResolvedValue(createdEvent)
  txDeliverableCreateMany.mockResolvedValue({ count: 3 })

  mp.sport.findFirst.mockResolvedValue({ id: SPORT_ID, name: 'Football' })
  mp.canonicalCompetition.upsert.mockResolvedValue({ id: 'cc-1' })
  mp.competition.findUnique.mockResolvedValue(null)
  mp.competition.create.mockResolvedValue({ id: COMPETITION_ID, matches: 0 })
  mp.competition.update.mockResolvedValue({ id: COMPETITION_ID, matches: 0 })
  mp.competition.findFirst.mockResolvedValue({ id: COMPETITION_ID })
  mp.competitionAlias.upsert.mockResolvedValue({})
  mp.importSourceLink.upsert.mockResolvedValue({})
})

describe('TD-31 — upsertEvent fresh-create seeds accessibility deliverables', () => {
  it('creates the event AND seeds the default deliverables in the same transaction', async () => {
    const result = await upsertEvent('src-1', TENANT, rawRecord, normalized)

    expect(result).toEqual({ kind: 'created' })
    expect(txEventCreate).toHaveBeenCalledTimes(1)
    expect(txDeliverableCreateMany).toHaveBeenCalledTimes(1)
    expect(txDeliverableCreateMany).toHaveBeenCalledWith(expectedSeedCall)
    // same-transaction proof: the seed ran on the SAME tx instance as the create
    const tx = creatingTx()
    expect(tx.accessibilityDeliverable.createMany).toHaveBeenCalledTimes(1)
  })
})

describe('TD-31 — manualCreateNormalizedEvent seeds accessibility deliverables', () => {
  it('creates the event AND seeds the default deliverables in the same transaction', async () => {
    const created = await manualCreateNormalizedEvent({
      sourceId: 'src-1',
      sourceRecordId: 'rec-200',
      normalized,
      tenantId: TENANT,
    })

    expect(created).toEqual(createdEvent)
    expect(txEventCreate).toHaveBeenCalledTimes(1)
    expect(txDeliverableCreateMany).toHaveBeenCalledTimes(1)
    expect(txDeliverableCreateMany).toHaveBeenCalledWith(expectedSeedCall)
    // same-transaction proof: the seed ran on the SAME tx instance as the create
    const tx = creatingTx()
    expect(tx.accessibilityDeliverable.createMany).toHaveBeenCalledTimes(1)
  })
})
