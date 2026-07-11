/**
 * RD-3-T2 — DB-backed defect-(b) proof (ADR-015 Acceptance record §2).
 *
 * Gated (RLS_TEST=1 + DATABASE_URL) — runs in CI's DB job, skips locally.
 *
 * FIXTURE CONSTRAINT (DoR refinement / TD-28): the checker counts only
 * CONFIRMED|RECONCILED RunLedger states, which the run-ledger API's zod status enum
 * CANNOT create — so CONFIRMED runs here are inserted DIRECTLY via Prisma (owner
 * client), never through the API. Seeding via the API would yield un-counted states
 * and the per-category tally would be vacuously empty.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { loadContractRunTally } from '../src/services/validation/runTally.js'
import { checkRightsForEvent } from '../src/services/rightsChecker.js'

const run = process.env.RLS_TEST === '1' && !!process.env.DATABASE_URL

let db: PrismaClient
if (run) db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })

const slug = `rd3-pipe-${Date.now()}`
let tenantId = ''
let contractId = 0
let eventId = 0
let channelId = 0
const slotIds: string[] = []

async function makeSlot(): Promise<string> {
  const s = await db.broadcastSlot.create({
    data: { tenantId, channelId, eventId, plannedStartUtc: new Date('2026-03-02T12:00:00.000Z') },
  })
  slotIds.push(s.id)
  return s.id
}

async function confirmedRun(slotId: string, runType: 'LIVE' | 'TAPE_DELAY'): Promise<void> {
  // DIRECT Prisma insert — CONFIRMED is unreachable via the run-ledger API (TD-28).
  await db.runLedger.create({
    data: {
      tenantId, broadcastSlotId: slotId, eventId, channelId, contractId,
      runType, status: 'CONFIRMED', endedAtUtc: new Date('2026-03-01T10:00:00.000Z'),
    },
  })
}

describe.skipIf(!run)('RD-3-T2 defect-(b): CONFIRMED ledger runs drive per-category window limits', () => {
  beforeAll(async () => {
    const t = await db.tenant.create({ data: { name: 'RD3 Pipe', slug } })
    tenantId = t.id
    const sport = await db.sport.create({ data: { tenantId, name: `Sp ${slug}`, icon: 'i', federation: 'F' } })
    const comp = await db.competition.create({ data: { tenantId, sportId: sport.id, name: `C ${slug}`, matches: 1, season: '2026' } })
    const channel = await db.channel.create({ data: { tenantId, name: `Ch ${slug}`, types: ['linear'] } })
    channelId = channel.id
    const event = await db.event.create({
      data: {
        tenantId, sportId: sport.id, competitionId: comp.id, channelId,
        participants: 'A v B', startDateBE: new Date('2026-03-02'), startTimeBE: '12:00', durationMin: 90,
      },
    })
    eventId = event.id
    const contract = await db.contract.create({
      data: { tenantId, competitionId: comp.id, status: 'valid', coverageType: 'LIVE' },
    })
    contractId = contract.id
    // LIVE window, maxRuns 3 (headroom to prove per-category isolation below).
    await db.rightsWindow.create({
      data: { tenantId, contractId, category: 'LIVE', maxRuns: 3, platforms: ['linear'] },
    })
  })

  afterAll(async () => {
    await db.runLedger.deleteMany({ where: { tenantId } })
    await db.broadcastSlot.deleteMany({ where: { tenantId } })
    await db.rightsWindow.deleteMany({ where: { tenantId } })
    await db.contract.deleteMany({ where: { tenantId } })
    await db.event.deleteMany({ where: { tenantId } })
    await db.channel.deleteMany({ where: { tenantId } })
    await db.competition.deleteMany({ where: { tenantId } })
    await db.sport.deleteMany({ where: { tenantId } })
    await db.tenant.delete({ where: { id: tenantId } })
    await db.$disconnect()
  })

  // One self-contained story — builds the full ledger state and asserts each stage,
  // so there is no cross-`it` ordering dependency (window maxRuns = 3).
  it('per-category tally isolation + MAX_RUNS_EXCEEDED via checkRightsForEvent v2', async () => {
    // 2 CONFIRMED LIVE + 1 CONFIRMED TAPE_DELAY (direct Prisma — CONFIRMED is
    // API-unreachable per TD-28).
    await confirmedRun(await makeSlot(), 'LIVE')
    await confirmedRun(await makeSlot(), 'LIVE')
    await confirmedRun(await makeSlot(), 'TAPE_DELAY')

    const tally = await loadContractRunTally(db, tenantId, [contractId])
    expect(tally).toContainEqual({ contractId, category: 'LIVE', count: 2 })
    expect(tally).toContainEqual({ contractId, category: 'DELAYED', count: 1 })

    // LIVE tally (2) < maxRuns (3) → the DELAYED run did NOT inflate the LIVE count.
    const before = await checkRightsForEvent(eventId, { db, windowsEnabled: true })
    expect(before.results.some(r => r.code === 'MAX_RUNS_EXCEEDED')).toBe(false)

    // A third CONFIRMED LIVE run reaches maxRuns → EXCEEDED.
    await confirmedRun(await makeSlot(), 'LIVE')
    const after = await checkRightsForEvent(eventId, { db, windowsEnabled: true })
    expect(after.results.some(r => r.code === 'MAX_RUNS_EXCEEDED')).toBe(true)
    expect(after.ok).toBe(false)
  })

  // Order-independent: window codes never appear on the flag-OFF path, regardless of
  // ledger state, so this asserts a property that does not depend on the story above.
  it('flag OFF (legacy path) emits NO window codes', async () => {
    const res = await checkRightsForEvent(eventId, { db, windowsEnabled: false })
    expect(res.results.some(r =>
      r.code === 'NO_WINDOWS' || r.code === 'WINDOW_UNSCOPED' || r.code === 'WINDOW_CATEGORY_MISSING'
    )).toBe(false)
  })
})
