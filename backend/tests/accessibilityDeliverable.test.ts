/**
 * RC-2-T1 — AccessibilityDeliverable structural integrity + RLS + the defaulting
 * hook's DB wiring. Gated (RLS_TEST=1 + APP_DATABASE_URL + DATABASE_URL); runs in
 * CI's DB job, skips clean locally. Same posture as listedEventCategory.test.ts.
 *
 * Asserts STRUCTURE + MECHANISM, never LEGAL correctness (the T888 exclusion set is
 * provisional TODO-KPI, verified via RC-0-T1).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildDefaultAccessibilityDeliverables } from '../src/config/accessibility.js'

const run =
  process.env.RLS_TEST === '1' && !!process.env.APP_DATABASE_URL && !!process.env.DATABASE_URL

let owner: PrismaClient
let app: PrismaClient
if (run) {
  owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
  app = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
}

async function makeEvent(tenantId: string, sportId: number, competitionId: number, n: number) {
  return owner.event.create({
    data: {
      tenantId, sportId, competitionId, participants: `E${n}`,
      startDateBE: new Date('2026-06-01'), startTimeBE: '20:00',
    },
  })
}

/**
 * Mirrors the event-create routes' seeding hook (same createMany shape). The route→hook
 * wiring itself is asserted in events.test.ts; this suite proves the DB-level mechanism.
 */
async function seedDefaultDeliverables(tenantId: string, event: { id: number; sportId: number }) {
  await owner.accessibilityDeliverable.createMany({
    data: buildDefaultAccessibilityDeliverables(event).map(d => ({ ...d, eventId: event.id, tenantId })),
    skipDuplicates: true,
  })
}

describe.skipIf(!run)('RC-2-T1 AccessibilityDeliverable structural integrity + defaulting hook', () => {
  const slug = `acc-struct-${Date.now()}`
  let tenantId = ''
  let sportId = 0
  let competitionId = 0

  beforeAll(async () => {
    const t = await owner.tenant.create({ data: { name: 'Acc Struct', slug } })
    tenantId = t.id
    const sport = await owner.sport.create({ data: { tenantId, name: `Sp ${slug}`, icon: 'i', federation: 'F' } })
    sportId = sport.id
    const comp = await owner.competition.create({ data: { tenantId, sportId, name: `C ${slug}`, matches: 1, season: '2026' } })
    competitionId = comp.id
  })

  afterAll(async () => {
    await owner.accessibilityDeliverable.deleteMany({ where: { tenantId } })
    await owner.event.deleteMany({ where: { tenantId } })
    await owner.competition.deleteMany({ where: { tenantId } })
    await owner.sport.deleteMany({ where: { tenantId } })
    await owner.tenant.delete({ where: { id: tenantId } })
    await owner.$disconnect()
    await app.$disconnect()
  })

  it('(mechanism) a new event (sport NOT excluded) gets T888=REQUIRED + AD/VGT=NOT_REQUIRED', async () => {
    const ev = await makeEvent(tenantId, sportId, competitionId, 1)
    await seedDefaultDeliverables(tenantId, ev)
    const rows = await owner.accessibilityDeliverable.findMany({ where: { eventId: ev.id }, orderBy: { type: 'asc' } })
    const statusByType = Object.fromEntries(rows.map(r => [r.type, r.status]))
    expect(statusByType).toEqual({ T888: 'REQUIRED', AUDIO_DESCRIPTION: 'NOT_REQUIRED', VGT: 'NOT_REQUIRED' })
  })

  it('(mechanism) the hook is idempotent — re-run does not duplicate (unique eventId,type)', async () => {
    const ev = await makeEvent(tenantId, sportId, competitionId, 2)
    await seedDefaultDeliverables(tenantId, ev)
    await seedDefaultDeliverables(tenantId, ev) // re-run
    expect(await owner.accessibilityDeliverable.count({ where: { eventId: ev.id } })).toBe(3)
  })

  it('unique (eventId, type) is enforced (direct duplicate rejected)', async () => {
    const ev = await makeEvent(tenantId, sportId, competitionId, 3)
    await owner.accessibilityDeliverable.create({ data: { tenantId, eventId: ev.id, type: 'T888', status: 'REQUIRED' } })
    await expect(
      owner.accessibilityDeliverable.create({ data: { tenantId, eventId: ev.id, type: 'T888', status: 'PLANNED' } }),
    ).rejects.toThrow(/Unique constraint/)
  })

  it('event delete CASCADEs its deliverables', async () => {
    const ev = await makeEvent(tenantId, sportId, competitionId, 4)
    await seedDefaultDeliverables(tenantId, ev)
    await owner.event.delete({ where: { id: ev.id } })
    expect(await owner.accessibilityDeliverable.count({ where: { eventId: ev.id } })).toBe(0)
  })
})

describe.skipIf(!run)('RC-2-T1 AccessibilityDeliverable RLS tenant_isolation binds (ADR-011 gate)', () => {
  const slugA = `acc-rls-a-${Date.now()}`
  const slugB = `acc-rls-b-${Date.now()}`
  let tenantA = ''
  let tenantB = ''
  let eventA = 0

  async function seedTenant(tenantId: string, tag: string): Promise<number> {
    const sport = await owner.sport.create({ data: { tenantId, name: `S ${tag}`, icon: 'i', federation: 'F' } })
    const comp = await owner.competition.create({ data: { tenantId, sportId: sport.id, name: `C ${tag}`, matches: 1, season: '2026' } })
    const ev = await owner.event.create({
      data: { tenantId, sportId: sport.id, competitionId: comp.id, participants: 'x', startDateBE: new Date('2026-06-01'), startTimeBE: '20:00' },
    })
    await owner.accessibilityDeliverable.create({ data: { tenantId, eventId: ev.id, type: 'T888', status: 'REQUIRED' } })
    return ev.id
  }

  beforeAll(async () => {
    const a = await owner.tenant.create({ data: { name: 'Acc RLS A', slug: slugA } })
    const b = await owner.tenant.create({ data: { name: 'Acc RLS B', slug: slugB } })
    tenantA = a.id
    tenantB = b.id
    eventA = await seedTenant(tenantA, slugA)
    await seedTenant(tenantB, slugB)
  })

  afterAll(async () => {
    for (const tid of [tenantA, tenantB]) {
      await owner.accessibilityDeliverable.deleteMany({ where: { tenantId: tid } })
      await owner.event.deleteMany({ where: { tenantId: tid } })
      await owner.competition.deleteMany({ where: { tenantId: tid } })
      await owner.sport.deleteMany({ where: { tenantId: tid } })
    }
    await owner.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } })
    await owner.$disconnect()
    await app.$disconnect()
  })

  it('with tenant A context, the app role sees ONLY tenant A deliverables', async () => {
    const rows = await app.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
      return tx.accessibilityDeliverable.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    })
    expect(rows.map(r => r.tenantId)).toEqual([tenantA])
  })

  it('cross-tenant INSERT is rejected by the policy (write-path proof)', async () => {
    await app.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
    await expect(
      app.accessibilityDeliverable.create({ data: { tenantId: tenantB, eventId: eventA, type: 'VGT', status: 'REQUIRED' } }),
    ).rejects.toThrow()
  })

  it('without tenant context, the app role sees NO deliverables', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const rows = await bare.accessibilityDeliverable.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
      expect(rows).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('the owner connection still bypasses RLS (worker posture unchanged)', async () => {
    const rows = await owner.accessibilityDeliverable.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.tenantId).sort()).toEqual([tenantA, tenantB].sort())
  })
})
