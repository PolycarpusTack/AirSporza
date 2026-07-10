/**
 * RD-2-T1 — RightsWindow backfill reconciliation + RLS binding proof (ADR-015 §1/§2).
 *
 * Two gated suites (RLS_TEST=1 + APP_DATABASE_URL + DATABASE_URL), same posture
 * as tests/rls-enforcement.test.ts: they run in CI's migrations job against real
 * Postgres and skip cleanly locally (no reachable DB).
 *
 * WHY the reconciliation suite re-runs the backfill projection rather than reading
 * migration-time output: CI provisions a FRESH database, so `migrate deploy`
 * applies the backfill INSERT (migration 20260710120001) against ZERO contracts,
 * and `seed.ts` inserts contracts only AFTERWARDS. Asserting "every seeded
 * contract has a window" would therefore be order-dependent and false. Instead we
 * build a controlled fixture and execute the migration's REAL INSERT text (read
 * from migration.sql at test time) scoped to the test tenant — so any edit or
 * break to the migration projection is reflected here, killing the copy-drift trap.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

const MIGRATION_SQL = fileURLToPath(
  new URL('../prisma/migrations/20260710120001_add_rights_window/migration.sql', import.meta.url),
)

// Column list + coverageType→category mapping come from migration.sql verbatim;
// only a tenant filter is appended for isolation (the production INSERT has no
// WHERE — it backfills every contract in one shot). Reading the real statement
// (not a hand-copy) means a broken migration projection breaks this test too.
function buildScopedBackfill(): string {
  const sql = readFileSync(MIGRATION_SQL, 'utf8')
  const start = sql.indexOf('INSERT INTO "RightsWindow"')
  if (start === -1) throw new Error('backfill INSERT not found in migration.sql')
  const end = sql.indexOf(';', start)
  if (end === -1) throw new Error('unterminated backfill INSERT in migration.sql')
  const insert = sql.slice(start, end) // statement body, minus the trailing ';'
  return `${insert} WHERE c."tenantId" = $1::uuid`
}

async function backfillForTenant(tenantId: string): Promise<void> {
  await owner.$executeRawUnsafe(buildScopedBackfill(), tenantId)
}

describe.skipIf(!run)('RD-2-T1 RightsWindow backfill reconciliation (ADR-015 §1)', () => {
  const slug = `rw-recon-${Date.now()}`
  let tenantId = ''
  let compId = 0
  // contracts: null-limit, positive-limit, non-LIVE category, ARCHIVE category
  let cNull = 0
  let cLimit = 0
  let cHighlights = 0
  let cArchive = 0

  beforeAll(async () => {
    const t = await owner.tenant.create({ data: { name: 'RW Recon', slug } })
    tenantId = t.id
    const sport = await owner.sport.create({
      data: { tenantId, name: `Tennis ${slug}`, icon: 'tennis', federation: 'ITF' },
    })
    const comp = await owner.competition.create({
      data: { tenantId, sportId: sport.id, name: `Cup ${slug}`, matches: 10, season: '2026' },
    })
    compId = comp.id

    // maxLiveRuns/tapeDelayHoursMin NULL must survive as NULL on the window (RD-1F
    // semantics — no ?? 0 / COALESCE anywhere on the backfill path).
    const c1 = await owner.contract.create({
      data: { tenantId, competitionId: compId, coverageType: 'LIVE' },
    })
    cNull = c1.id
    const c2 = await owner.contract.create({
      data: {
        tenantId,
        competitionId: compId,
        coverageType: 'LIVE',
        maxLiveRuns: 3,
        tapeDelayHoursMin: 24,
        territory: ['BE', 'NL'],
        platforms: ['linear'],
      },
    })
    cLimit = c2.id
    const c3 = await owner.contract.create({
      data: { tenantId, competitionId: compId, coverageType: 'HIGHLIGHTS' },
    })
    cHighlights = c3.id
    // ARCHIVE exercises the real `c."coverageType"::"CoverageType"` cast through
    // the migration projection (the enum extension must accept it).
    const c4 = await owner.contract.create({
      data: { tenantId, competitionId: compId, coverageType: 'ARCHIVE' },
    })
    cArchive = c4.id

    await backfillForTenant(tenantId)
  })

  afterAll(async () => {
    await owner.rightsWindow.deleteMany({ where: { tenantId } })
    await owner.contract.deleteMany({ where: { tenantId } })
    await owner.competition.deleteMany({ where: { tenantId } })
    await owner.sport.deleteMany({ where: { tenantId } })
    await owner.tenant.delete({ where: { id: tenantId } })
    await owner.$disconnect()
    await app.$disconnect()
  })

  it('(a) every contract owns at least one RightsWindow', async () => {
    for (const contractId of [cNull, cLimit, cHighlights, cArchive]) {
      const n = await owner.rightsWindow.count({ where: { contractId } })
      expect(n).toBeGreaterThanOrEqual(1)
    }
  })

  it('(b) window count reconciles exactly one-per-contract (count == contract count)', async () => {
    const contracts = await owner.contract.count({ where: { tenantId } })
    const windows = await owner.rightsWindow.count({ where: { tenantId } })
    expect(windows).toBe(contracts)
  })

  it('(c) a null maxLiveRuns yields maxRuns=null (NOT 0 — RD-1F null-semantics)', async () => {
    const w = await owner.rightsWindow.findFirstOrThrow({ where: { contractId: cNull } })
    expect(w.maxRuns).toBeNull()
    expect(w.holdbackHoursMin).toBeNull()
    expect(w.exclusivity).toBe('NON_EXCLUSIVE')
    expect(w.category).toBe('LIVE')
  })

  it('(d) scalar rights map through verbatim (limit, holdback, category, territory, platforms)', async () => {
    const limit = await owner.rightsWindow.findFirstOrThrow({ where: { contractId: cLimit } })
    expect(limit.maxRuns).toBe(3)
    expect(limit.holdbackHoursMin).toBe(24)
    expect(limit.territory).toEqual(['BE', 'NL'])
    expect(limit.platforms).toEqual(['linear'])

    const hi = await owner.rightsWindow.findFirstOrThrow({ where: { contractId: cHighlights } })
    expect(hi.category).toBe('HIGHLIGHTS')
    // empty arrays copy as-is (= unrestricted, ADR-015 Acceptance record §4)
    expect(hi.territory).toEqual([])
    expect(hi.platforms).toEqual([])
  })

  it('(e) the backfill cast projects ARCHIVE through the extended enum', async () => {
    const w = await owner.rightsWindow.findFirstOrThrow({ where: { contractId: cArchive } })
    expect(w.category).toBe('ARCHIVE')
  })
})

describe.skipIf(!run)('RD-2-T1 RightsWindow RLS tenant_isolation binds (ADR-011 gate)', () => {
  const slugA = `rw-rls-a-${Date.now()}`
  const slugB = `rw-rls-b-${Date.now()}`
  let tenantA = ''
  let tenantB = ''
  let contractA = 0

  async function seedWindow(tenantId: string, tag: string): Promise<number> {
    const sport = await owner.sport.create({
      data: { tenantId, name: `S ${tag}`, icon: 'i', federation: 'F' },
    })
    const comp = await owner.competition.create({
      data: { tenantId, sportId: sport.id, name: `C ${tag}`, matches: 1, season: '2026' },
    })
    const contract = await owner.contract.create({
      data: { tenantId, competitionId: comp.id, coverageType: 'LIVE' },
    })
    await owner.rightsWindow.create({
      data: { tenantId, contractId: contract.id, category: 'LIVE' },
    })
    return contract.id
  }

  beforeAll(async () => {
    const a = await owner.tenant.create({ data: { name: 'RW RLS A', slug: slugA } })
    const b = await owner.tenant.create({ data: { name: 'RW RLS B', slug: slugB } })
    tenantA = a.id
    tenantB = b.id
    contractA = await seedWindow(tenantA, slugA)
    await seedWindow(tenantB, slugB)
  })

  afterAll(async () => {
    for (const tid of [tenantA, tenantB]) {
      await owner.rightsWindow.deleteMany({ where: { tenantId: tid } })
      await owner.contract.deleteMany({ where: { tenantId: tid } })
      await owner.competition.deleteMany({ where: { tenantId: tid } })
      await owner.sport.deleteMany({ where: { tenantId: tid } })
    }
    await owner.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } })
    await owner.$disconnect()
    await app.$disconnect()
  })

  it('with tenant A context, the app role sees ONLY tenant A windows', async () => {
    // set_config(..,true) is transaction-local, and Prisma pools connections, so the
    // context set and the query must share one interactive transaction (ADR-011).
    const windows = await app.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
      return tx.rightsWindow.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } })
    })
    expect(windows.map(w => w.tenantId)).toEqual([tenantA])
  })

  it('cross-tenant INSERT is rejected by the policy (write-path proof)', async () => {
    // App role in tenant A context must not be able to write a window into tenant B.
    await app.$executeRaw`SELECT set_tenant_context(${tenantA}::uuid)`
    await expect(
      app.rightsWindow.create({
        data: { tenantId: tenantB, contractId: contractA, category: 'LIVE' },
      }),
    ).rejects.toThrow()
  })

  it('without tenant context, the app role sees NO windows', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } })
    try {
      const windows = await bare.rightsWindow.findMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      })
      expect(windows).toHaveLength(0)
    } finally {
      await bare.$disconnect()
    }
  })

  it('the owner connection still bypasses RLS (worker posture unchanged)', async () => {
    const windows = await owner.rightsWindow.findMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    })
    expect(windows).toHaveLength(2)
  })
})
