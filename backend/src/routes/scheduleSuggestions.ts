/**
 * FM2-1-T1 — read-only schedule-suggestions surface (Contract Snapshot
 * `scheduleSuggestions v1`, see scheduleSuggestions.ts for the full
 * derivation + Pull Gate resolution notes):
 *
 *   GET /api/schedule/suggestions?week=<ISO-week-start>
 *
 * A NEW dedicated file (TD-2's god-file lesson — not appended to the already
 * large schedules.ts/broadcastSlots.ts). This route is deliberately THIN: it
 * only loads the week-scoped rows the pure `computeScheduleSuggestions`
 * needs and hands them off — no business logic lives here.
 *
 * Week boundary: half-open `[weekStart, weekEnd)` UTC-day math on
 * `Event.startDateBE`, matching `broadcastSlots.ts`'s `dateStart`/`dateEnd`
 * convention on `plannedStartUtc` (reused, not reinvented) and
 * `ops/selectors.ts`'s `groupEventsByDay` week semantics.
 */
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { createError } from '../middleware/errorHandler.js'
import { computeScheduleSuggestions } from '../services/scheduleSuggestions.js'

const router = Router()

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

router.get('/', async (req, res, next) => {
  try {
    const week = typeof req.query.week === 'string' ? req.query.week : undefined
    if (!week || !WEEK_RE.test(week)) {
      return next(createError(400, 'week is required and must be an ISO date string (YYYY-MM-DD)'))
    }

    const weekStartMs = Date.parse(`${week}T00:00:00Z`)
    if (Number.isNaN(weekStartMs)) {
      return next(createError(400, 'week must be a valid ISO date string (YYYY-MM-DD)'))
    }

    const weekStart = new Date(weekStartMs)
    const weekEnd = new Date(weekStartMs + 7 * DAY_MS)
    const tenantId = req.tenantId!

    const events = await prisma.event.findMany({
      where: { tenantId, startDateBE: { gte: weekStart, lt: weekEnd } },
      select: {
        id: true,
        channelId: true,
        competitionId: true,
        startDateBE: true,
        startTimeBE: true,
        durationMin: true,
      },
      orderBy: [{ startDateBE: 'asc' }, { startTimeBE: 'asc' }, { id: 'asc' }],
    })

    if (events.length === 0) {
      return res.json({ week, unplaced: [] })
    }

    const eventIds = events.map((e) => e.id)
    const competitionIds = [...new Set(events.map((e) => e.competitionId))]

    const [slotsForEvents, techPlans, contracts, channels, channelLoadRows] = await Promise.all([
      prisma.broadcastSlot.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true },
      }),
      prisma.techPlan.findMany({
        where: { eventId: { in: eventIds } },
        select: { id: true, eventId: true, crew: true },
      }),
      prisma.contract.findMany({
        where: { tenantId, competitionId: { in: competitionIds } },
      }),
      prisma.channel.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      prisma.broadcastSlot.groupBy({
        by: ['channelId'],
        where: { tenantId, channelId: { not: null }, plannedStartUtc: { gte: weekStart, lt: weekEnd } },
        _count: { _all: true },
      }),
    ])

    const channelLoad = new Map<number, number>()
    for (const row of channelLoadRows) {
      if (row.channelId != null) channelLoad.set(row.channelId, row._count._all)
    }

    const result = computeScheduleSuggestions({
      week,
      now: new Date(),
      events,
      slotsForEvents,
      techPlans,
      contracts,
      channels,
      channelLoad,
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})

export default router
