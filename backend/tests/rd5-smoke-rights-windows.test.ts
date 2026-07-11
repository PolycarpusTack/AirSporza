/**
 * RD-5-T1 — EPIC RD tracer smoke (closes the tracer). DB-gated integration through
 * the REAL routes (RD has no UI, so this is HTTP/route-level, not Playwright).
 *
 * Gated (RLS_TEST=1 + DATABASE_URL) — runs in CI's DB job, skips clean locally.
 * Seeds via the app's Prisma; auth is mocked to inject the seeded tenant; the flag
 * (`env.RIGHTS_WINDOWS_ENABLED`) is a mutable singleton read per-request, toggled here.
 *
 * WHY MAX_RUNS_EXCEEDED and not HOLDBACK_VIOLATION (architect-confirmed adaptation):
 * the backlog RD-5 AC demonstrates holdback via a "DELAYED-run intent" slot, but that
 * is NOT reachable end-to-end — `BroadcastSlot` has no coverage-category column, so
 * every real slot resolves to runIntent 'LIVE' (RD-3-T2's documented limit; slot-level
 * category is a deferred RD-retro refinement). So the reachable tracer is a LIVE-window
 * per-category run-limit violation (the defect-(b) headline of RD-3), plus a LIVE-window
 * platform-scope violation. The holdback gap is documented in docs/runbooks/rights-windows.md.
 *
 * FIXTURE CONSTRAINT (TD-28): CONFIRMED runs are inserted via DIRECT Prisma — the
 * run-ledger API's zod status enum cannot create CONFIRMED, so API seeding would leave
 * the per-category tally vacuously empty.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

const run = process.env.RLS_TEST === '1' && !!process.env.DATABASE_URL

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: unknown; headers: Record<string, unknown> }, _: unknown, next: () => void) => {
    req.user = { id: 'u1', role: 'admin', tenantId: (globalThis as Record<string, unknown>).__RD5_TENANT__ }
    next()
  },
  authorize: (..._roles: string[]) => (_: unknown, __: unknown, next: () => void) => next(),
}))

vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

import request from 'supertest'
import { buildApp } from '../src/index.js'
import { prisma } from '../src/db/prisma.js'
import { env } from '../src/config/env.js'

const app = buildApp()
const slug = `rd5-smoke-${Date.now()}`
const DATE = '2026-03-02'
const PLANNED = new Date('2026-03-02T12:00:00.000Z')

let tenantId = ''
let chLinearId = 0
let chOnDemandId = 0
let event1Id = 0
let slot1Id = ''
let slot2Id = ''
let draftId = ''

const codesFor = (slots: Array<{ slotId: string; results: Array<{ code: string }> }>, slotId: string) =>
  slots.find(s => s.slotId === slotId)?.results.map(r => r.code) ?? []

describe.skipIf(!run)('RD-5 smoke — window-aware rights through the real routes', () => {
  beforeAll(async () => {
    const t = await prisma.tenant.create({ data: { name: 'RD5 Smoke', slug } })
    tenantId = t.id
    ;(globalThis as Record<string, unknown>).__RD5_TENANT__ = tenantId

    const sport = await prisma.sport.create({ data: { tenantId, name: `Sp ${slug}`, icon: 'i', federation: 'F' } })
    const comp = await prisma.competition.create({ data: { tenantId, sportId: sport.id, name: `C ${slug}`, matches: 1, season: '2026' } })

    const chLinear = await prisma.channel.create({ data: { tenantId, name: `Lin ${slug}`, types: ['linear'] } })
    chLinearId = chLinear.id
    const chOnDemand = await prisma.channel.create({ data: { tenantId, name: `OD ${slug}`, types: ['on-demand'] } })
    chOnDemandId = chOnDemand.id

    const event1 = await prisma.event.create({
      data: { tenantId, sportId: sport.id, competitionId: comp.id, channelId: chLinearId, participants: 'A v B', startDateBE: new Date(DATE), startTimeBE: '12:00', durationMin: 90 },
    })
    event1Id = event1.id
    const event2 = await prisma.event.create({
      data: { tenantId, sportId: sport.id, competitionId: comp.id, channelId: chOnDemandId, participants: 'C v D', startDateBE: new Date(DATE), startTimeBE: '14:00', durationMin: 90 },
    })

    const contract = await prisma.contract.create({ data: { tenantId, competitionId: comp.id, status: 'valid', coverageType: 'LIVE' } })
    // LIVE window, run limit 1, scoped to the `linear` platform.
    await prisma.rightsWindow.create({ data: { tenantId, contractId: contract.id, category: 'LIVE', maxRuns: 1, platforms: ['linear'] } })

    const slot1 = await prisma.broadcastSlot.create({ data: { tenantId, channelId: chLinearId, eventId: event1Id, contentSegment: 'FULL', plannedStartUtc: PLANNED } })
    slot1Id = slot1.id
    const slot2 = await prisma.broadcastSlot.create({ data: { tenantId, channelId: chOnDemandId, eventId: event2.id, contentSegment: 'FULL', plannedStartUtc: new Date('2026-03-02T14:00:00.000Z') } })
    slot2Id = slot2.id

    // DIRECT Prisma: 1 CONFIRMED LIVE run for event1's contract → LIVE tally = 1 = maxRuns.
    await prisma.runLedger.create({
      data: { tenantId, broadcastSlotId: slot1Id, eventId: event1Id, channelId: chLinearId, contractId: contract.id, runType: 'LIVE', status: 'CONFIRMED', endedAtUtc: new Date('2026-03-02T13:30:00.000Z') },
    })

    const draft = await prisma.scheduleDraft.create({
      data: { tenantId, channelId: chLinearId, dateRangeStart: new Date(DATE), dateRangeEnd: new Date(DATE) },
    })
    draftId = draft.id
  })

  afterAll(async () => {
    env.RIGHTS_WINDOWS_ENABLED = false
    await prisma.runLedger.deleteMany({ where: { tenantId } })
    await prisma.scheduleDraft.deleteMany({ where: { tenantId } })
    await prisma.broadcastSlot.deleteMany({ where: { tenantId } })
    await prisma.rightsWindow.deleteMany({ where: { tenantId } })
    await prisma.contract.deleteMany({ where: { tenantId } })
    await prisma.event.deleteMany({ where: { tenantId } })
    await prisma.channel.deleteMany({ where: { tenantId } })
    await prisma.competition.deleteMany({ where: { tenantId } })
    await prisma.sport.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
    delete (globalThis as Record<string, unknown>).__RD5_TENANT__
  })

  it('flag ON: draft validate surfaces MAX_RUNS_EXCEEDED (window v2 + per-category ledger tally)', async () => {
    env.RIGHTS_WINDOWS_ENABLED = true
    const res = await request(app).post(`/api/schedule-drafts/${draftId}/validate`).expect(200)
    const codes = res.body.results.map((r: { code: string }) => r.code)
    expect(codes).toContain('MAX_RUNS_EXCEEDED')
  })

  it('flag ON: GET /rights/check-slots reflects the same violation for the slot (RD-4 wired to v2)', async () => {
    env.RIGHTS_WINDOWS_ENABLED = true
    const res = await request(app).get(`/api/rights/check-slots?channelId=${chLinearId}&date=${DATE}`).expect(200)
    expect(codesFor(res.body.slots, slot1Id)).toContain('MAX_RUNS_EXCEEDED')
    expect(res.body.slots.find((s: { slotId: string }) => s.slotId === slot1Id).ok).toBe(false)
  })

  it('flag ON: window SCOPE — a linear-only window vs an on-demand channel → PLATFORM_NOT_COVERED', async () => {
    env.RIGHTS_WINDOWS_ENABLED = true
    const res = await request(app).get(`/api/rights/check-slots?channelId=${chOnDemandId}&date=${DATE}`).expect(200)
    expect(codesFor(res.body.slots, slot2Id)).toContain('PLATFORM_NOT_COVERED')
  })

  it('flag OFF: the same draft validates with NO window codes (legacy parity)', async () => {
    env.RIGHTS_WINDOWS_ENABLED = false
    const res = await request(app).post(`/api/schedule-drafts/${draftId}/validate`).expect(200)
    const codes: string[] = res.body.results.map((r: { code: string }) => r.code)
    const windowCodes = ['NO_WINDOWS', 'WINDOW_UNSCOPED', 'WINDOW_CATEGORY_MISSING', 'HOLDBACK_VIOLATION', 'HOLDBACK_LIVE_END_UNKNOWN']
    expect(codes.some(c => windowCodes.includes(c))).toBe(false)
    // Legacy contract has maxLiveRuns null → the run-limit check does not fire either.
    expect(codes).not.toContain('MAX_RUNS_EXCEEDED')
  })
})
