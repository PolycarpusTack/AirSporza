import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

/**
 * GET /api/cascade/estimates?courtId=N&date=YYYY-MM-DD
 *
 * REST fallback used by useCascade on initial mount and on date/court
 * change — before any socket push has arrived. The /cascade Socket.IO
 * namespace pushes fresh estimates after each runCascade, but the
 * client needs a way to backfill what's already persisted from prior
 * cascade runs (engine.runCascade writes CascadeEstimate rows in the
 * same transaction that updates BroadcastSlot).
 *
 * Joins via Event.sportMetadata->>'court_id' — matches the expression
 * index `event_court_day_idx` declared in
 * add_performance_followup_indexes.sql, so the JSONB path lookup is
 * indexed and not a sequential scan.
 */
router.get('/estimates', async (req, res, next) => {
  try {
    const courtId = Number(req.query.courtId)
    const dateStr = typeof req.query.date === 'string' ? req.query.date : null
    if (!Number.isFinite(courtId) || courtId <= 0) {
      throw createError(400, 'courtId query param is required and must be a positive integer')
    }
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw createError(400, 'date query param is required in YYYY-MM-DD format')
    }
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) {
      throw createError(400, 'date query param is not parseable as a date')
    }

    // Find events on this court+date, then their CascadeEstimate rows.
    // Two queries keep the SQL straightforward and let Prisma type the
    // result; a single JSONB-path join would be marginally faster but
    // opaque.
    const events = await prisma.event.findMany({
      where: {
        tenantId: req.tenantId,
        startDateBE: date,
        sportMetadata: { path: ['court_id'], equals: courtId } as Prisma.JsonFilter,
      },
      select: { id: true },
    })
    const eventIds = events.map(e => e.id)
    if (eventIds.length === 0) {
      return res.json([])
    }

    const rows = await prisma.cascadeEstimate.findMany({
      where: {
        tenantId: req.tenantId,
        eventId: { in: eventIds },
      },
      orderBy: { estimatedStartUtc: 'asc' },
    })
    res.json(rows)
  } catch (error) { next(error) }
})

export default router
