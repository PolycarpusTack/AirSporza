/**
 * RC-1-T2 — Listed-Events (evenementen van aanzienlijk belang, besluit 28 May 2004).
 * Category CRUD (admin-editable per AS-3 — an edit takes effect with no deploy),
 * read-only suggestion, and human confirm/dismiss of an event's listed-category link.
 *
 * NO validation codes are emitted here (no ValidationResult). The `regulatoryCompliance`
 * flag gates RC-1-T3's `LISTED_EVENT_FTA` emission only — this surface is flag-independent.
 *
 * SUGGESTIONS NEVER AUTO-BIND: /suggest is read-only and never writes listedCategoryId;
 * only /confirm sets it. RE-SUGGEST LIMITATION: /dismiss clears the link but there is no
 * `dismissed` column (out of scope this task), so a derived /suggest would re-surface a
 * previously dismissed category — suppressing that is a UI/refinement concern, not a
 * schema change here.
 */
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { suggestListedCategories } from '../services/listedEvents/suggest.js'
import * as s from '../schemas/listedEvents.js'
import type { Request } from 'express'

const router = Router()

/** Load an event only if it belongs to the request tenant (else null → caller 404s). */
function loadTenantEvent(req: Request, eventId: number) {
  return prisma.event.findFirst({ where: { id: eventId, tenantId: req.tenantId } })
}

/** Single audit path for confirm/dismiss — owns the req.user cast, kills drift. */
async function logEventCategoryChange(
  req: Request,
  params: { eventId: number; oldId: number | null; newId: number | null; action: string },
): Promise<void> {
  const user = req.user as { id: string }
  await writeAuditLog({
    userId: user.id,
    action: params.action,
    entityType: 'event',
    entityId: String(params.eventId),
    oldValue: { listedCategoryId: params.oldId },
    newValue: { listedCategoryId: params.newId },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    tenantId: req.tenantId,
  })
}

// GET /categories — list the tenant's listed-event categories.
router.get('/categories', authenticate, async (req, res, next) => {
  try {
    const categories = await prisma.listedEventCategory.findMany({
      where: { tenantId: req.tenantId },
      orderBy: [{ sportId: 'asc' }, { name: 'asc' }],
    })
    res.json(categories)
  } catch (error) {
    next(error)
  }
})

// PUT /categories/:id — admin edit (AS-3). The "edit takes effect without deploy" path.
router.put(
  '/categories/:id',
  authenticate,
  authorize('admin'),
  validate({ params: s.categoryIdParam, body: s.categoryUpdateSchema }),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id)
      const existing = await prisma.listedEventCategory.findFirst({ where: { id, tenantId: req.tenantId } })
      if (!existing) return next(createError(404, 'Listed-event category not found'))

      const body = req.body as { name?: string; fullLiveRequired?: boolean; besluitRef?: string | null }
      const data: Record<string, unknown> = {}
      if (body.name !== undefined) data.name = body.name
      if (body.fullLiveRequired !== undefined) data.fullLiveRequired = body.fullLiveRequired
      if (body.besluitRef !== undefined) data.besluitRef = body.besluitRef

      const updated = await prisma.listedEventCategory.update({ where: { id }, data })
      const user = req.user as { id: string }
      await writeAuditLog({
        userId: user.id,
        action: 'listedEventCategory.update',
        entityType: 'listedEventCategory',
        entityId: String(id),
        oldValue: existing,
        newValue: updated,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tenantId: req.tenantId,
      })
      res.json(updated)
    } catch (error) {
      next(error)
    }
  }
)

// GET /events/:eventId/suggest — read-only suggestions (NEVER writes listedCategoryId).
router.get('/events/:eventId/suggest', authenticate, validate({ params: s.eventIdParam }), async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId)
    // suggest needs the competition name, so it tenant-scopes inline (same guard as
    // loadTenantEvent, with the extra include).
    const event = await prisma.event.findFirst({
      where: { id: eventId, tenantId: req.tenantId },
      include: { competition: { select: { name: true } } },
    })
    if (!event) return next(createError(404, 'Event not found'))

    const categories = await prisma.listedEventCategory.findMany({ where: { tenantId: req.tenantId } })
    const suggestions = suggestListedCategories(
      { sportId: event.sportId, competitionName: event.competition?.name },
      categories,
    )
    res.json(suggestions)
  } catch (error) {
    next(error)
  }
})

// POST /events/:eventId/confirm { categoryId } — bind the category (idempotent by eventId).
router.post(
  '/events/:eventId/confirm',
  authenticate,
  authorize('planner', 'admin'),
  validate({ params: s.eventIdParam, body: s.confirmSchema }),
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.eventId)
      const { categoryId } = req.body as { categoryId: number }

      const event = await loadTenantEvent(req, eventId)
      if (!event) return next(createError(404, 'Event not found'))
      // Category must belong to the same tenant — no cross-tenant binding.
      const category = await prisma.listedEventCategory.findFirst({ where: { id: categoryId, tenantId: req.tenantId } })
      if (!category) return next(createError(400, 'Unknown listed-event category'))

      // Idempotent: a repeat confirm re-writes the same link and returns the row.
      const updated = await prisma.event.update({ where: { id: eventId }, data: { listedCategoryId: categoryId } })
      await logEventCategoryChange(req, { eventId, oldId: event.listedCategoryId, newId: categoryId, action: 'event.listedCategory.confirm' })
      res.json(updated)
    } catch (error) {
      next(error)
    }
  }
)

// POST /events/:eventId/dismiss — clear the link (idempotent no-op when already null).
router.post(
  '/events/:eventId/dismiss',
  authenticate,
  authorize('planner', 'admin'),
  validate({ params: s.eventIdParam }),
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.eventId)
      const event = await loadTenantEvent(req, eventId)
      if (!event) return next(createError(404, 'Event not found'))

      const updated = await prisma.event.update({ where: { id: eventId }, data: { listedCategoryId: null } })
      await logEventCategoryChange(req, { eventId, oldId: event.listedCategoryId, newId: null, action: 'event.listedCategory.dismiss' })
      res.json(updated)
    } catch (error) {
      next(error)
    }
  }
)

export default router
