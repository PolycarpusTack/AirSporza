import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

// GET /api/schedule-versions — list published versions (optional ?channelId, ?draftId)
router.get('/', async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.channelId) {
      where.channelId = Number(req.query.channelId)
    }
    if (req.query.draftId) {
      where.draftId = req.query.draftId as string
    }

    const versions = await prisma.scheduleVersion.findMany({
      where,
      include: {
        channel: { select: { id: true, name: true, color: true } },
        draft: { select: { id: true, dateRangeStart: true, dateRangeEnd: true } },
      },
      orderBy: { publishedAt: 'desc' },
    })

    res.json(versions)
  } catch (error) {
    next(error)
  }
})

// GET /api/schedule-versions/:id — get version snapshot
router.get('/:id', async (req, res, next) => {
  try {
    const version = await prisma.scheduleVersion.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId },
      include: {
        channel: true,
        draft: { select: { id: true, dateRangeStart: true, dateRangeEnd: true, channelId: true } },
        broadcastSlots: {
          include: {
            event: { select: { id: true, participants: true, sportId: true } },
          },
          orderBy: { plannedStartUtc: 'asc' },
        },
      },
    })

    if (!version) return next(createError(404, 'Schedule version not found'))

    res.json(version)
  } catch (error) {
    next(error)
  }
})

export default router
