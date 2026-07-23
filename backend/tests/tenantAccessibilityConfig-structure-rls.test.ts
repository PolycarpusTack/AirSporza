/**
 * RC-5-T1 — TenantAccessibilityConfig structural integrity + RLS + the loader's
 * DB wiring. Gated (RLS_TEST=1 + APP_DATABASE_URL + DATABASE_URL); runs in CI's
 * DB job, skips clean locally. Same posture as accessibilityDeliverable.test.ts.
 * (Loader merge MECHANICS live in tenantAccessibilityConfig-loader.test.ts —
 * this file proves the DB-level structure and the policy binding.)
 *
 * Asserts STRUCTURE + MECHANISM (unique tenantId, RLS tenant_isolation, per-field
 * merge over the constants), never LEGAL correctness of any configured value
 * (TODO-KPI posture, AS-1 — the value oracle stays RC-0-T1).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { loadTenantAccessibilityConfig } from '../src/services/accessibility/tenantConfig.js'
import {
  T888_EXCLUDED_SPORT_IDS,
  ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE,
  ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS,
} from '../src/config/accessibility.js'

const run =
  process.env.RLS_TEST === '1' && !!process.env.APP_DATABASE_URL && !!process.env.DATABASE_URL

let owner: PrismaClient
let app: PrismaClient
if (run) {
  owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
  app = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
}

// ONE disconnect for the whole file: both describes share the module-level
// clients, so per-describe $disconnect would tear them down under the other
// suite (and double-disconnect at the end).
afterAll(async () => {
  if (!run) return
  await owner.$disconnect()
  await app.$disconnect()
})

describe.skipIf(!run)('RC-5-T1 TenantAccessibilityConfig structural integrity + loader wiring', () => {
  const slug = `taccfg-struct-${Date.now()}`
  let tenantId = ''
  let bareTenantId = '' // tenant WITHOUT a config row → constants must apply
  let uniqTenantId = '' // dedicated tenant for the self-contained unique-constraint proof

  beforeAll(async () => {
    const t = await owner.tenant.create({ data: { name: 'TacCfg Struct', slug } })
    tenantId = t.id
    const bare = await owner.tenant.create({ data: { name: 'TacCfg Bare', slug: `${slug}-bare` } })
    bareTenantId = bare.id
    const uniq = await owner.tenant.create({ data: { name: 'TacCfg Uniq', slug: `${slug}-uniq` } })
    uniqTenantId = uniq.id
  })

  afterAll(async () => {
    const ids = [tenantId, bareTenantId, uniqTenantId]
    await owner.tenantAccessibilityConfig.deleteMany({ where: { tenantId: { in: ids } } })
    await owner.tenant.deleteMany({ where: { id: { in: ids } } })
  })

  it('(mechanism) loader with NO row → exactly the constants (fallback parity)', async () => {
    const cfg = await loadTenantAccessibilityConfig(owner, bareTenantId)
    expect(cfg.t888ExcludedSportIds).toBe(T888_EXCLUDED_SPORT_IDS)
    expect(cfg.kpiTargetPctByType).toBe(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE)
    expect(cfg.unplannedLeadTimeDays).toBe(ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS)
  })

  it('(mechanism) loader merges a PARTIAL row per field over the constants', async () => {
    await owner.tenantAccessibilityConfig.create({
      data: { tenantId, t888ExcludedSportIds: [7, 9], unplannedLeadTimeDays: 30 },
    })
    const cfg = await loadTenantAccessibilityConfig(owner, tenantId)
    expect([...cfg.t888ExcludedSportIds].sort()).toEqual([7, 9])
    expect(cfg.unplannedLeadTimeDays).toBe(30)
    // NULL field → its constant:
    expect(cfg.kpiTargetPctByType).toEqual(ACCESSIBILITY_KPI_TARGET_PCT_BY_TYPE)
  })

  it('unique tenantId is enforced (one config row per tenant — upsert-only surface)', async () => {
    // Self-contained: this test creates BOTH the first row and the duplicate.
    await owner.tenantAccessibilityConfig.create({ data: { tenantId: uniqTenantId, unplannedLeadTimeDays: 5 } })
    await expect(
      owner.tenantAccessibilityConfig.create({ data: { tenantId: uniqTenantId, unplannedLeadTimeDays: 6 } }),
    ).rejects.toThrow(/Unique constraint/)
  })
})

describe.skipIf(!run)('RC-5-T1 TenantAccessibilityConfig RLS tenant_isolation binds (ADR-011 gate)', () => {
  const slugA = `taccfg-rls-a-${Date.now()}`
  const slugB = `taccfg-rls-b-${Date.now()}`
  let tenantA = ''
  let tenantB = ''

  beforeAll(async () => {
    const a = await owner.tenant.create({ data: { name: 'TacCfg RLS A', slug: slugA } })
    const b = await owner.tenant.create({ data: { name: 'TacCfg RLS B', slug: slugB } })
    tenantA = a.id
    tenantB = b.id
    await owner.tenantAccessibilityConfig.create({ data: { tenantId: tenantA, unplannedLeadTimeDays: 7 } })
    await owner.tenantAccessibilityConfig.create({ data: { tenantId: tenantB, unplannedLeadTimeDays: 21 } })
  })

  afterAll(async () => {
    await owner.tenantAccessibilityConfig.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    await owner.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } })
  })

  it('with tenant A context, the app role sees ONLY tenant A config', async () => {
    const rows = await app.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
      return tx.tenantAccessibilityConfig.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    })
    expect(rows.map(r => r.tenantId)).toEqual([tenantA])
  })

  it('cross-tenant INSERT is rejected BY THE POLICY (write-path proof)', async () => {
    await expect(
      app.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
        return tx.tenantAccessibilityConfig.upsert({
          where: { tenantId: tenantB },
          create: { tenantId: tenantB, unplannedLeadTimeDays: 1 },
          update: { unplannedLeadTimeDays: 1 },
        })
      }),
    ).rejects.toThrow(/row-level security|violates.*policy/i)
  })

  it('without tenant context, the app role sees NO config rows', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const rows = await bare.tenantAccessibilityConfig.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
      expect(rows).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('the owner connection still bypasses RLS (worker posture unchanged)', async () => {
    const rows = await owner.tenantAccessibilityConfig.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    expect(rows.map(r => r.tenantId).sort()).toEqual([tenantA, tenantB].sort())
  })
})
