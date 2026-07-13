/**
 * RC-1-T1 — Listed-Events data model: structural integrity + RLS + edit round-trip.
 *
 * Gated (RLS_TEST=1 + APP_DATABASE_URL + DATABASE_URL) — runs in CI's DB job, skips
 * clean locally. Same posture as rightsWindow-backfill.test.ts.
 *
 * These assert STRUCTURE, never LEGAL CORRECTNESS. The seed's category list +
 * fullLiveRequired flags are provisional (TODO-LEGAL, RC-0-T3); "flags correct per
 * besluit 28 May 2004" is legal people-work, deliberately NOT tested here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const run =
  process.env.RLS_TEST === '1' && !!process.env.APP_DATABASE_URL && !!process.env.DATABASE_URL

let owner: PrismaClient
let app: PrismaClient
if (run) {
  owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
  app = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
}

describe.skipIf(!run)('RC-1-T1 ListedEventCategory structural integrity', () => {
  const slug = `lec-struct-${Date.now()}`
  let tenantId = ''
  let sportId = 0
  let competitionId = 0
  let categoryId = 0
  let channelId = 0

  beforeAll(async () => {
    const t = await owner.tenant.create({ data: { name: 'LEC Struct', slug } })
    tenantId = t.id
    const sport = await owner.sport.create({ data: { tenantId, name: `Sp ${slug}`, icon: 'i', federation: 'F' } })
    sportId = sport.id
    const comp = await owner.competition.create({
      data: { tenantId, sportId, name: `C ${slug}`, matches: 1, season: '2026' },
    })
    competitionId = comp.id
    const cat = await owner.listedEventCategory.create({
      data: {
        tenantId, sportId, name: 'World Cup (football) — final phase',
        fullLiveRequired: true, besluitRef: 'besluit 28 May 2004 (PROVISIONAL — verify RC-0-T3)',
      },
    })
    categoryId = cat.id
    const ch = await owner.channel.create({ data: { tenantId, name: `Ch ${slug}`, types: ['linear'] } })
    channelId = ch.id
  })

  afterAll(async () => {
    await owner.event.deleteMany({ where: { tenantId } })
    await owner.listedEventCategory.deleteMany({ where: { tenantId } })
    await owner.channel.deleteMany({ where: { tenantId } })
    await owner.competition.deleteMany({ where: { tenantId } })
    await owner.sport.deleteMany({ where: { tenantId } })
    await owner.tenant.delete({ where: { id: tenantId } })
    await owner.$disconnect()
    await app.$disconnect()
  })

  it('(a) EVERY listed-event category row is structurally valid (seed integrity — non-empty name, no orphan sportId)', async () => {
    const cats = await owner.listedEventCategory.findMany()
    expect(cats.length).toBeGreaterThan(0) // includes the fixture row → non-vacuous
    for (const cat of cats) {
      expect(cat.name.length).toBeGreaterThan(0)
      const sport = await owner.sport.findUnique({ where: { id: cat.sportId } })
      expect(sport, `category ${cat.id} sportId ${cat.sportId} must resolve`).not.toBeNull()
    }
  })

  it('(c) an admin edit round-trips (fullLiveRequired flips and persists)', async () => {
    await owner.listedEventCategory.update({ where: { id: categoryId }, data: { fullLiveRequired: false } })
    const after = await owner.listedEventCategory.findFirstOrThrow({ where: { id: categoryId } })
    expect(after.fullLiveRequired).toBe(false)
    await owner.listedEventCategory.update({ where: { id: categoryId }, data: { fullLiveRequired: true } })
  })

  it('(d) Event.listedCategoryId is nullable and the FK SET-NULLs on category delete (event survives)', async () => {
    // A disposable category so the delete does not affect the shared fixture.
    const disposable = await owner.listedEventCategory.create({
      data: { tenantId, sportId, name: 'Disposable', fullLiveRequired: false },
    })
    const linked = await owner.event.create({
      data: {
        tenantId, sportId, competitionId, participants: 'A v B',
        startDateBE: new Date('2026-06-01'), startTimeBE: '20:00', listedCategoryId: disposable.id,
      },
    })
    // Also prove nullability: an event with no category is valid.
    const unlinked = await owner.event.create({
      data: { tenantId, sportId, competitionId, participants: 'C v D', startDateBE: new Date('2026-06-02'), startTimeBE: '20:00' },
    })
    expect(unlinked.listedCategoryId).toBeNull()

    await owner.listedEventCategory.delete({ where: { id: disposable.id } })
    const afterDelete = await owner.event.findUniqueOrThrow({ where: { id: linked.id } })
    expect(afterDelete.listedCategoryId).toBeNull() // SET NULL, event not deleted
  })

  it('(e) Channel.isFreeToAir defaults to false', async () => {
    const ch = await owner.channel.findUniqueOrThrow({ where: { id: channelId } })
    expect(ch.isFreeToAir).toBe(false)
  })
})

describe.skipIf(!run)('RC-1-T1 ListedEventCategory RLS tenant_isolation binds (ADR-011 gate)', () => {
  const slugA = `lec-rls-a-${Date.now()}`
  const slugB = `lec-rls-b-${Date.now()}`
  let tenantA = ''
  let tenantB = ''
  let sportA = 0

  async function seedCategory(tenantId: string, tag: string): Promise<number> {
    const sport = await owner.sport.create({ data: { tenantId, name: `S ${tag}`, icon: 'i', federation: 'F' } })
    await owner.listedEventCategory.create({
      data: { tenantId, sportId: sport.id, name: `Cat ${tag}`, fullLiveRequired: true },
    })
    return sport.id
  }

  beforeAll(async () => {
    const a = await owner.tenant.create({ data: { name: 'LEC RLS A', slug: slugA } })
    const b = await owner.tenant.create({ data: { name: 'LEC RLS B', slug: slugB } })
    tenantA = a.id
    tenantB = b.id
    sportA = await seedCategory(tenantA, slugA)
    await seedCategory(tenantB, slugB)
  })

  afterAll(async () => {
    for (const tid of [tenantA, tenantB]) {
      await owner.listedEventCategory.deleteMany({ where: { tenantId: tid } })
      await owner.sport.deleteMany({ where: { tenantId: tid } })
    }
    await owner.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } })
    await owner.$disconnect()
    await app.$disconnect()
  })

  it('with tenant A context, the app role sees ONLY tenant A categories', async () => {
    const cats = await app.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
      return tx.listedEventCategory.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    })
    expect(cats.map(c => c.tenantId)).toEqual([tenantA])
  })

  it('cross-tenant INSERT is rejected by the policy (write-path proof)', async () => {
    await app.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
    await expect(
      app.listedEventCategory.create({
        data: { tenantId: tenantB, sportId: sportA, name: 'Smuggled', fullLiveRequired: false },
      }),
    ).rejects.toThrow()
  })

  it('without tenant context, the app role sees NO categories', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const cats = await bare.listedEventCategory.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
      expect(cats).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('the owner connection still bypasses RLS (worker posture unchanged)', async () => {
    const cats = await owner.listedEventCategory.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    expect(cats).toHaveLength(2)
    expect(cats.map(c => c.tenantId).sort()).toEqual([tenantA, tenantB].sort())
  })
})
