/**
 * FM1-4-T0 — ActionItemResolution structural integrity + RLS. Gated (RLS_TEST=1
 * + APP_DATABASE_URL + DATABASE_URL); runs in CI's DB job, skips clean locally.
 * Same posture as rippleProposal-structure-rls.test.ts / tenantAccessibilityConfig-
 * structure-rls.test.ts.
 *
 * Pins the DB-level idempotency mechanics the resolve route (FM1-4-T1) relies on:
 * unique (tenantId, userId, itemKey) — re-resolving the SAME item by the SAME user
 * is a no-op backstop at the DB layer (app layer does the upsert /
 * ON-CONFLICT-DO-NOTHING), the SAME itemKey under TWO tenants (or two different
 * users) is NOT deduped (RD-2 idempotent-echo lesson: no cross-tenant/cross-user
 * leak), and the tenant_isolation policy binds (ADR-011: policy shipped in the
 * SAME migration, 20260814200000_add_action_item_resolution).
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
  const t = await owner.tenant.create({ data: { name: `AIR ${tag}`, slug: `air-${tag}-${Date.now()}` } })
  const u = await owner.user.create({
    data: { tenantId: t.id, email: `air-${tag}-${Date.now()}@example.test`, role: 'planner' },
  })
  return { tenantId: t.id, userId: u.id }
}

async function cleanTenant(tenantId: string) {
  await owner.actionItemResolution.deleteMany({ where: { tenantId } })
  await owner.user.deleteMany({ where: { tenantId } })
  await owner.tenant.delete({ where: { id: tenantId } })
}

const resolutionData = (tenantId: string, userId: string, itemKey: string) => ({
  tenantId,
  userId,
  itemKey,
})

describe.skipIf(!run)('FM1-4-T0 ActionItemResolution structural integrity', () => {
  let a: { tenantId: string; userId: string }
  let b: { tenantId: string; userId: string }

  beforeAll(async () => {
    a = await seedTenant('struct-a')
    b = await seedTenant('struct-b')
  })

  afterAll(async () => {
    await cleanTenant(a.tenantId)
    await cleanTenant(b.tenantId)
  })

  it('creates a resolution row with resolvedAt defaulted (idempotency AS-2 concrete shape)', async () => {
    const r = await owner.actionItemResolution.create({
      data: resolutionData(a.tenantId, a.userId, 'CONFLICT:event:42'),
    })
    expect(r.tenantId).toBe(a.tenantId)
    expect(r.userId).toBe(a.userId)
    expect(r.itemKey).toBe('CONFLICT:event:42')
    expect(r.resolvedAt).toBeInstanceOf(Date)
  })

  it('unique (tenantId, userId, itemKey): re-resolving the SAME item by the SAME user is rejected at the DB layer (idempotency backstop for the app-layer upsert)', async () => {
    await owner.actionItemResolution.create({ data: resolutionData(a.tenantId, a.userId, 'RIGHTS:event:7') })
    await expect(
      owner.actionItemResolution.create({ data: resolutionData(a.tenantId, a.userId, 'RIGHTS:event:7') }),
    ).rejects.toThrow(/Unique constraint/)
  })

  it('the SAME itemKey under TWO tenants → two independent resolutions (no cross-tenant dedupe)', async () => {
    const key = 'UNPLACED:event:9'
    const ra = await owner.actionItemResolution.create({ data: resolutionData(a.tenantId, a.userId, key) })
    const rb = await owner.actionItemResolution.create({ data: resolutionData(b.tenantId, b.userId, key) })
    expect(ra.id).not.toBe(rb.id)
    expect(ra.tenantId).toBe(a.tenantId)
    expect(rb.tenantId).toBe(b.tenantId)
  })

  it('the SAME itemKey by TWO different users in the SAME tenant → two independent resolutions (per-user acknowledgment, not shared)', async () => {
    const key = 'CREW:event:11'
    const otherUser = await owner.user.create({
      data: { tenantId: a.tenantId, email: `air-struct-a-other-${Date.now()}@example.test`, role: 'planner' },
    })
    const r1 = await owner.actionItemResolution.create({ data: resolutionData(a.tenantId, a.userId, key) })
    const r2 = await owner.actionItemResolution.create({ data: resolutionData(a.tenantId, otherUser.id, key) })
    expect(r1.id).not.toBe(r2.id)
  })

  it('user delete CASCADEs their resolutions (a resolution is a child of the acknowledging user)', async () => {
    const extraUser = await owner.user.create({
      data: { tenantId: a.tenantId, email: `air-struct-a-cascade-${Date.now()}@example.test`, role: 'planner' },
    })
    await owner.actionItemResolution.create({ data: resolutionData(a.tenantId, extraUser.id, 'FEED:event:99') })
    await owner.user.delete({ where: { id: extraUser.id } })
    expect(await owner.actionItemResolution.count({ where: { userId: extraUser.id } })).toBe(0)
  })
})

describe.skipIf(!run)('FM1-4-T0 ActionItemResolution RLS tenant_isolation binds (ADR-011 gate)', () => {
  let a: { tenantId: string; userId: string }
  let b: { tenantId: string; userId: string }

  beforeAll(async () => {
    a = await seedTenant('rls-a')
    b = await seedTenant('rls-b')
    await owner.actionItemResolution.create({ data: resolutionData(a.tenantId, a.userId, 'CONFLICT:event:1') })
    await owner.actionItemResolution.create({ data: resolutionData(b.tenantId, b.userId, 'CONFLICT:event:2') })
  })

  afterAll(async () => {
    await cleanTenant(a.tenantId)
    await cleanTenant(b.tenantId)
  })

  it('with tenant A context, the app role sees ONLY tenant A resolutions', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_tenant_context(${a.tenantId}::uuid)`
      return tx.actionItemResolution.findMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    })
    expect(rows.map((r) => r.tenantId)).toEqual([a.tenantId])
  })

  it('cross-tenant INSERT is rejected BY THE POLICY (write-path proof)', async () => {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_tenant_context(${a.tenantId}::uuid)`
        return tx.actionItemResolution.create({ data: resolutionData(b.tenantId, b.userId, 'CONFLICT:event:x') })
      }),
    ).rejects.toThrow(/row-level security|violates.*policy/i)
  })

  it('without tenant context, the app role sees NO resolutions', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const rows = await bare.actionItemResolution.findMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
      expect(rows).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('the owner connection still bypasses RLS (worker posture unchanged)', async () => {
    const rows = await owner.actionItemResolution.findMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })
    expect(rows.map((r) => r.tenantId).sort()).toEqual([a.tenantId, b.tenantId].sort())
  })
})
