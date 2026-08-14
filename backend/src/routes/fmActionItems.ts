/**
 * FM1-4-T1 — action-item resolution (Contract Snapshot `ActionItemResolution v1`,
 * FM1-4-T0's hand-off). Acknowledgment overlay ONLY: resolving an item does not
 * remove it from a future fmActionItems v1 derivation — an item whose
 * underlying condition is actually fixed simply stops being *derived* on a
 * later load, independent of this flag (per the migration's own header
 * comment and the story AC).
 *
 * POST /api/fm/action-items/resolve {itemKey} → {resolvedAt}
 *   Idempotent by (tenantId, userId, itemKey): raw-SQL INSERT ... ON CONFLICT
 *   DO UPDATE, mirroring settings.ts's upsertSetting idiom (never a
 *   findFirst-then-create race). The DO UPDATE SET is a deliberate SELF
 *   no-op ("resolvedAt" = the row's own "resolvedAt") purely so RETURNING
 *   still yields a row on the conflict path — the ORIGINAL resolvedAt is
 *   preserved, never bumped by a re-resolve (no un-resolve affordance in FM-1).
 *
 * GET /api/fm/action-items/resolutions → {itemKeys: string[]}
 *   JUDGMENT CALL (flagged for architect review, not silently assumed): the
 *   story's literal Interfaces list names only the POST route, but its own AC
 *   requires "on reload it is STILL shown, dimmed/✓" — unsatisfiable without a
 *   way to read back which items THIS user has already resolved. This GET is
 *   the minimal shape useFmActionItems() needs (current user + tenant only,
 *   itemKeys only) — no other row data (resolvedAt, id) is consumed by FM1-4-T1.
 */
import { Router } from 'express'
import { Prisma } from '@prisma/client'
import type { Request } from 'express'
import { prisma } from '../db/prisma.js'
import { validate } from '../middleware/validate.js'
import * as s from '../schemas/fmActionItems.js'

const router = Router()

/** Single cast path for the authenticated user id (settings.ts/accessibility.ts precedent). */
function getCurrentUserId(req: Request): string {
  return (req.user as { id: string }).id
}

// GET /resolutions — the current user's resolved item keys for this tenant.
router.get('/resolutions', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req)
    const rows = await prisma.actionItemResolution.findMany({
      where: { tenantId: req.tenantId, userId },
      select: { itemKey: true },
    })
    res.json({ itemKeys: rows.map((r) => r.itemKey) })
  } catch (error) {
    next(error)
  }
})

// POST /resolve {itemKey} — idempotent acknowledgment upsert.
router.post('/resolve', validate({ body: s.resolveActionItemSchema }), async (req, res, next) => {
  try {
    const { itemKey } = req.body as { itemKey: string }
    const userId = getCurrentUserId(req)
    const tenantId = req.tenantId!

    const rows = await prisma.$queryRaw<Array<{ resolvedAt: Date }>>(Prisma.sql`
      INSERT INTO "ActionItemResolution" ("id", "tenantId", "userId", "itemKey", "resolvedAt")
      VALUES (gen_random_uuid(), ${tenantId}::uuid, ${userId}, ${itemKey}, NOW())
      ON CONFLICT ("tenantId", "userId", "itemKey")
      DO UPDATE SET "resolvedAt" = "ActionItemResolution"."resolvedAt"
      RETURNING "resolvedAt"
    `)

    res.json({ resolvedAt: rows[0].resolvedAt.toISOString() })
  } catch (error) {
    next(error)
  }
})

export default router
