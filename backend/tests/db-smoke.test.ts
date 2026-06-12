/**
 * DB-backed smoke test (A-2-T4): one real Prisma round-trip through the RLS
 * tenant-context path against an actual PostgreSQL database.
 *
 * Skipped unless DB_SMOKE=1 — the regular suite stays mock-only and DB-free.
 * CI runs this in the `migrations` job after `prisma migrate deploy`;
 * locally: DB_SMOKE=1 DATABASE_URL=<scratch-db-url> npx vitest run tests/db-smoke.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const slug = `db-smoke-${Date.now()}`

describe.skipIf(!process.env.DB_SMOKE)('DB smoke (real Postgres)', () => {
  afterAll(async () => {
    await prisma.team.deleteMany({ where: { tenant: { slug } } })
    await prisma.tenant.deleteMany({ where: { slug } })
    await prisma.$disconnect()
  })

  it('creates a tenant, sets RLS context, and round-trips a Team with repository fields', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'DB Smoke Tenant', slug },
    })

    // The same context-setting path the app/workers use (utils/setTenantRLS.ts).
    // ::uuid cast required — Prisma binds strings as text.
    await prisma.$executeRaw`SELECT set_tenant_context(${tenant.id}::uuid)`

    const created = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name: 'DB Smoke FC',
        notes: 'protected editorial remark',
        isManaged: true,
      },
    })
    expect(created.id).toBeGreaterThan(0)

    const found = await prisma.team.findMany({ where: { tenantId: tenant.id } })
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('DB Smoke FC')
    expect(found[0].notes).toBe('protected editorial remark')
    expect(found[0].isManaged).toBe(true)
    expect(found[0].canonicalTeamId).toBeNull()
  })
})
