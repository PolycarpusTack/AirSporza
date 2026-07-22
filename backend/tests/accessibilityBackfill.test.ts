/**
 * TD-31 — accessibility-deliverable backfill reconciliation.
 *
 * Gated (RLS_TEST=1 + APP_DATABASE_URL + DATABASE_URL); runs in CI's DB job,
 * skips clean locally. Same posture as accessibilityDeliverable.test.ts.
 *
 * WHY the suite re-runs the backfill projection rather than reading
 * migration-time output: CI provisions a FRESH database, so `migrate deploy`
 * applies the backfill INSERT (migration 20260722120000) against ZERO events.
 * Instead we build a controlled fixture and execute the migration's REAL INSERT
 * text (read from migration.sql at test time) scoped to the test tenant — so
 * any edit or break to the migration projection is reflected here, killing the
 * copy-drift trap (idiom: rightsWindow-backfill.test.ts).
 *
 * Asserts MECHANISM, never LEGAL correctness: T888=REQUIRED-for-every-sport is
 * the provisional TODO-KPI empty-exclusion-set assumption (RC-0-T1).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const run =
  process.env.RLS_TEST === '1' && !!process.env.APP_DATABASE_URL && !!process.env.DATABASE_URL

let owner: PrismaClient
if (run) {
  owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
}

const MIGRATION_SQL = fileURLToPath(
  new URL('../prisma/migrations/20260722120000_backfill_accessibility_deliverables/migration.sql', import.meta.url),
)

// The INSERT comes from migration.sql verbatim; only a tenant filter is spliced
// in (BEFORE the ON CONFLICT clause — the production INSERT has no WHERE, it
// backfills every event in one shot). Reading the real statement (not a
// hand-copy) means a broken migration projection breaks this test too.
function buildScopedBackfill(): string {
  const sql = readFileSync(MIGRATION_SQL, 'utf8')
  const start = sql.indexOf('INSERT INTO "AccessibilityDeliverable"')
  if (start === -1) throw new Error('backfill INSERT not found in migration.sql')
  const end = sql.indexOf(';', start)
  if (end === -1) throw new Error('unterminated backfill INSERT in migration.sql')
  const insert = sql.slice(start, end) // statement body, minus the trailing ';'
  const conflictAt = insert.indexOf('ON CONFLICT')
  if (conflictAt === -1) throw new Error('ON CONFLICT clause not found in backfill INSERT')
  return `${insert.slice(0, conflictAt)} WHERE e."tenantId" = $1::uuid ${insert.slice(conflictAt)}`
}

describe.skipIf(!run)('TD-31 accessibility-deliverable backfill reconciliation', () => {
  const slug = `acc-backfill-${Date.now()}`
  let tenantId = ''
  let sportId = 0
  let competitionId = 0
  let bareEventId = 0 // pre-TD-31 imported event: NO deliverable rows at all
  let partialEventId = 0 // hook-seeded event whose T888 already progressed to PLANNED

  async function makeEvent(n: number) {
    return owner.event.create({
      data: {
        tenantId, sportId, competitionId, participants: `Test Team A vs Test Team B (${n})`,
        startDateBE: new Date('2026-06-01'), startTimeBE: '20:00',
      },
    })
  }

  beforeAll(async () => {
    const t = await owner.tenant.create({ data: { name: 'Acc Backfill', slug } })
    tenantId = t.id
    const sport = await owner.sport.create({ data: { tenantId, name: `Sp ${slug}`, icon: 'i', federation: 'F' } })
    sportId = sport.id
    const comp = await owner.competition.create({ data: { tenantId, sportId, name: `C ${slug}`, matches: 1, season: '2026' } })
    competitionId = comp.id

    bareEventId = (await makeEvent(1)).id
    const partial = await makeEvent(2)
    partialEventId = partial.id
    // Existing row that the backfill must NOT clobber (ON CONFLICT DO NOTHING).
    await owner.accessibilityDeliverable.create({
      data: { tenantId, eventId: partialEventId, type: 'T888', status: 'PLANNED' },
    })

    await owner.$executeRawUnsafe(buildScopedBackfill(), tenantId)
  })

  afterAll(async () => {
    await owner.accessibilityDeliverable.deleteMany({ where: { tenantId } })
    await owner.event.deleteMany({ where: { tenantId } })
    await owner.competition.deleteMany({ where: { tenantId } })
    await owner.sport.deleteMany({ where: { tenantId } })
    await owner.tenant.delete({ where: { id: tenantId } })
    await owner.$disconnect()
  })

  it('every event ends with exactly 3 deliverable rows (one per type)', async () => {
    for (const eventId of [bareEventId, partialEventId]) {
      const rows = await owner.accessibilityDeliverable.findMany({ where: { eventId } })
      expect(rows).toHaveLength(3)
      expect(rows.map(r => r.type).sort()).toEqual(['AUDIO_DESCRIPTION', 'T888', 'VGT'])
    }
  })

  it('a row-less event gets the defaults (T888=REQUIRED, AD/VGT=NOT_REQUIRED — TODO-KPI empty set)', async () => {
    const rows = await owner.accessibilityDeliverable.findMany({ where: { eventId: bareEventId } })
    const statusByType = Object.fromEntries(rows.map(r => [r.type, r.status]))
    expect(statusByType).toEqual({ T888: 'REQUIRED', AUDIO_DESCRIPTION: 'NOT_REQUIRED', VGT: 'NOT_REQUIRED' })
  })

  it('existing rows survive untouched — only the missing types are inserted', async () => {
    const rows = await owner.accessibilityDeliverable.findMany({ where: { eventId: partialEventId } })
    const statusByType = Object.fromEntries(rows.map(r => [r.type, r.status]))
    expect(statusByType).toEqual({ T888: 'PLANNED', AUDIO_DESCRIPTION: 'NOT_REQUIRED', VGT: 'NOT_REQUIRED' })
  })

  it('the backfill is idempotent — a re-run inserts nothing new', async () => {
    await owner.$executeRawUnsafe(buildScopedBackfill(), tenantId)
    expect(await owner.accessibilityDeliverable.count({ where: { tenantId } })).toBe(6)
  })
})
