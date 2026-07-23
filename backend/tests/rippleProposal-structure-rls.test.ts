/**
 * SV-2-T1 — RippleProposal structural integrity + RLS. Gated (RLS_TEST=1 +
 * APP_DATABASE_URL + DATABASE_URL); runs in CI's DB job, skips clean locally.
 * Same posture as accessibilityDeliverable.test.ts / tenantAccessibilityConfig-
 * structure-rls.test.ts.
 *
 * Pins the DB-level idempotency mechanics the capture path (SV-2-T2) relies on:
 * unique (tenantId, sourceChangeId) — the SAME sourceChangeId under TWO tenants
 * is two independent rows (RD-2 idempotent-echo lesson: no cross-tenant dedupe,
 * no leak), and the tenant_isolation policy binds (ADR-011: policy shipped in
 * the SAME migration, 20260723150000_add_ripple_proposal).
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

afterAll(async () => {
  if (!run) return
  await owner.$disconnect()
  await app.$disconnect()
})

async function seedTenant(tag: string) {
  const t = await owner.tenant.create({ data: { name: `Ripple ${tag}`, slug: `ripple-${tag}-${Date.now()}` } })
  const sport = await owner.sport.create({ data: { tenantId: t.id, name: `S ${tag} ${Date.now()}`, icon: 'i', federation: 'F' } })
  const comp = await owner.competition.create({ data: { tenantId: t.id, sportId: sport.id, name: `C ${tag} ${Date.now()}`, matches: 1, season: '2026' } })
  const ev = await owner.event.create({
    data: { tenantId: t.id, sportId: sport.id, competitionId: comp.id, participants: 'x', startDateBE: new Date('2026-08-01'), startTimeBE: '20:00' },
  })
  return { tenantId: t.id, eventId: ev.id }
}

async function cleanTenant(tenantId: string) {
  await owner.rippleProposal.deleteMany({ where: { tenantId } })
  await owner.event.deleteMany({ where: { tenantId } })
  await owner.competition.deleteMany({ where: { tenantId } })
  await owner.sport.deleteMany({ where: { tenantId } })
  await owner.tenant.delete({ where: { id: tenantId } })
}

const proposalData = (tenantId: string, eventId: number, sourceChangeId: string) => ({
  tenantId,
  eventId,
  source: 'FEED' as const,
  sourceChangeId,
  beforeSlots: [{ slotId: 's1' }],
  preview: { proposed: [], manualReviewSlots: [], rights: null },
})

describe.skipIf(!run)('SV-2-T1 RippleProposal structural integrity', () => {
  let a: { tenantId: string; eventId: number }
  let b: { tenantId: string; eventId: number }

  beforeAll(async () => {
    a = await seedTenant('struct-a')
    b = await seedTenant('struct-b')
  })

  afterAll(async () => {
    await cleanTenant(a.tenantId)
    await cleanTenant(b.tenantId)
  })

  it('defaults: status PENDING, confidence NULL (v1 — no feed-confidence source wired)', async () => {
    const p = await owner.rippleProposal.create({ data: proposalData(a.tenantId, a.eventId, 'feed:1:aa') })
    expect(p.status).toBe('PENDING')
    expect(p.confidence).toBeNull()
    expect(p.decidedAt).toBeNull()
    expect(p.decidedBy).toBeNull()
  })

  it('unique (tenantId, sourceChangeId): same-tenant duplicate is rejected', async () => {
    await owner.rippleProposal.create({ data: proposalData(a.tenantId, a.eventId, 'feed:1:bb') })
    await expect(
      owner.rippleProposal.create({ data: proposalData(a.tenantId, a.eventId, 'feed:1:bb') }),
    ).rejects.toThrow(/Unique constraint/)
  })

  it('the SAME sourceChangeId under TWO tenants → two independent proposals (no cross-tenant dedupe)', async () => {
    const shared = 'feed:1:cc'
    const pa = await owner.rippleProposal.create({ data: proposalData(a.tenantId, a.eventId, shared) })
    const pb = await owner.rippleProposal.create({ data: proposalData(b.tenantId, b.eventId, shared) })
    expect(pa.id).not.toBe(pb.id)
    expect(pa.tenantId).toBe(a.tenantId)
    expect(pb.tenantId).toBe(b.tenantId)
  })

  it('event delete CASCADEs its proposals (proposal is a child of the event, ADR-019 §1)', async () => {
    const extra = await owner.event.create({
      data: {
        tenantId: a.tenantId,
        sportId: (await owner.event.findUniqueOrThrow({ where: { id: a.eventId } })).sportId,
        competitionId: (await owner.event.findUniqueOrThrow({ where: { id: a.eventId } })).competitionId,
        participants: 'y',
        startDateBE: new Date('2026-08-02'),
        startTimeBE: '18:00',
      },
    })
    await owner.rippleProposal.create({ data: proposalData(a.tenantId, extra.id, 'feed:2:dd') })
    await owner.event.delete({ where: { id: extra.id } })
    expect(await owner.rippleProposal.count({ where: { eventId: extra.id } })).toBe(0)
  })
})

describe.skipIf(!run)('SV-2-T1 RippleProposal RLS tenant_isolation binds (ADR-011 gate)', () => {
  let a: { tenantId: string; eventId: number }
  let b: { tenantId: string; eventId: number }

  beforeAll(async () => {
    a = await seedTenant('rls-a')
    b = await seedTenant('rls-b')
    await owner.rippleProposal.create({ data: proposalData(a.tenantId, a.eventId, 'feed:rls:a') })
    await owner.rippleProposal.create({ data: proposalData(b.tenantId, b.eventId, 'feed:rls:b') })
  })

  afterAll(async () => {
    await cleanTenant(a.tenantId)
    await cleanTenant(b.tenantId)
  })

  it('with tenant A context, the app role sees ONLY tenant A proposals', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_tenant_context(${a.tenantId}::uuid)`
      return tx.rippleProposal.findMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    })
    expect(rows.map((r) => r.tenantId)).toEqual([a.tenantId])
  })

  it('cross-tenant INSERT is rejected BY THE POLICY (write-path proof)', async () => {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_tenant_context(${a.tenantId}::uuid)`
        return tx.rippleProposal.create({ data: proposalData(b.tenantId, b.eventId, 'feed:rls:x') })
      }),
    ).rejects.toThrow(/row-level security|violates.*policy/i)
  })

  it('without tenant context, the app role sees NO proposals', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const rows = await bare.rippleProposal.findMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
      expect(rows).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('the owner connection still bypasses RLS (worker posture unchanged)', async () => {
    const rows = await owner.rippleProposal.findMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    expect(rows.map((r) => r.tenantId).sort()).toEqual([a.tenantId, b.tenantId].sort())
  })
})
