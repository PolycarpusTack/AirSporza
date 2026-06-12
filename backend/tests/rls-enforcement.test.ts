/**
 * RLS enforcement proof (ADR-011 layer 2, TD-22): connecting as the non-owner
 * `planza_app` role, tenant_isolation policies must actually bind.
 *
 * Skipped unless RLS_TEST=1 — CI's migrations job provisions the role with
 * LOGIN, sets APP_DATABASE_URL, and runs this suite against real Postgres.
 * Locally: see docs/governance/runbook-ci-and-migrations.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const run = process.env.RLS_TEST === '1' && !!process.env.APP_DATABASE_URL && !!process.env.DATABASE_URL

// Lazy: constructing PrismaClient with an undefined URL throws at collection
// time even when the suite is skipped.
let owner: PrismaClient
let app: PrismaClient
if (run) {
  owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
  app = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
}

const slugA = `rls-a-${Date.now()}`
const slugB = `rls-b-${Date.now()}`
let tenantA = ''
let tenantB = ''

describe.skipIf(!run)('RLS enforcement via planza_app (ADR-011)', () => {
  beforeAll(async () => {
    const a = await owner.tenant.create({ data: { name: 'RLS Tenant A', slug: slugA } })
    const b = await owner.tenant.create({ data: { name: 'RLS Tenant B', slug: slugB } })
    tenantA = a.id
    tenantB = b.id
    await owner.team.create({ data: { tenantId: tenantA, name: 'Alpha FC' } })
    await owner.team.create({ data: { tenantId: tenantB, name: 'Beta FC' } })
    await owner.user.create({ data: { tenantId: tenantA, email: `rls-${Date.now()}@planza.dev`, role: 'planner' } })
  })

  afterAll(async () => {
    await owner.team.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    await owner.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    await owner.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } })
    await owner.$disconnect()
    await app.$disconnect()
  })

  it('with TRANSACTION-scoped tenant A context, the app role sees ONLY tenant A rows', async () => {
    // ADR-011 discovery: set_tenant_context uses set_config(.., true) which is
    // TRANSACTION-local, and Prisma pools connections — context must be set
    // inside the same interactive transaction as the query. This is the
    // pattern layer-2 activation must adopt per request.
    const teams = await app.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
      return tx.team.findMany({ where: { name: { in: ['Alpha FC', 'Beta FC'] } } })
    })
    expect(teams.map(t => t.name)).toEqual(['Alpha FC'])
  })

  it('PINNED: the naive sequential pattern (setTenantRLS then query) fails EMPTY, not with an error', async () => {
    // Documents why activation needs the transaction wrapper: set_config(..,true)
    // is transaction-local, so the context set by a standalone statement is gone
    // for the next query. The NULLIF policy hardening (20260612190000) makes the
    // expired-context case fail-empty instead of erroring with 22P02.
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      await bare.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
      const teams = await bare.team.findMany({ where: { name: { in: ['Alpha FC', 'Beta FC'] } } })
      expect(teams).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('without tenant context, the app role sees NOTHING in tenant tables', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const teams = await bare.team.findMany({ where: { name: { in: ['Alpha FC', 'Beta FC'] } } })
      expect(teams).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('cross-tenant INSERT is rejected by the policy', async () => {
    await app.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
    await expect(
      app.team.create({ data: { tenantId: tenantB, name: 'Smuggled FC' } })
    ).rejects.toThrow()
  })

  it('auth user lookup works WITHOUT tenant context (auth_lookup policy)', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const users = await bare.user.findMany({ where: { tenantId: tenantA } })
      expect(users.length).toBeGreaterThan(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('the owner connection still bypasses (worker posture unchanged)', async () => {
    const teams = await owner.team.findMany({ where: { name: { in: ['Alpha FC', 'Beta FC'] } } })
    expect(teams).toHaveLength(2)
  })
})
