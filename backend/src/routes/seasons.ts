import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/seasons.js'

const router = Router()

// List seasons (optional ?competitionId filter)
router.get('/', async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (req.query.competitionId) {
      where.competitionId = Number(req.query.competitionId)
    }

    const seasons = await prisma.season.findMany({
      where,
      include: {
        competition: true,
        _count: { select: { stages: true, events: true } }
      },
      orderBy: { startDate: 'desc' }
    })
    res.json(seasons)
  } catch (error) {
    next(error)
  }
})

// Get season by id (with stages and their rounds)
router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const season = await prisma.season.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
      include: {
        competition: true,
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            rounds: { orderBy: { roundNumber: 'asc' } }
          }
        }
      }
    })

    if (!season) {
      return next(createError(404, 'Season not found'))
    }

    res.json(season)
  } catch (error) {
    next(error)
  }
})

// Create season (with optional nested stages)
router.post('/', authenticate, authorize('admin'), validate({ body: s.seasonCreateSchema }), async (req, res, next) => {
  try {
    const { competitionId, name, startDate, endDate, sportMetadata, stages } = req.body

    const season = await prisma.season.create({
      data: {
        competitionId,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        sportMetadata: sportMetadata || {},
        tenantId: req.tenantId!,
        ...(stages && stages.length > 0 ? {
          stages: {
            create: stages.map((st: { name: string; stageType: string; sortOrder?: number; advancementRules?: Record<string, unknown>; sportMetadata?: Record<string, unknown> }) => ({
              name: st.name,
              stageType: st.stageType,
              sortOrder: st.sortOrder ?? 0,
              advancementRules: st.advancementRules || {},
              sportMetadata: st.sportMetadata || {},
              tenantId: req.tenantId!
            }))
          }
        } : {})
      },
      include: {
        stages: { orderBy: { sortOrder: 'asc' } }
      }
    })

    res.status(201).json(season)
  } catch (error) {
    next(error)
  }
})

// Update season
router.put('/:id', authenticate, authorize('admin'), validate({ params: s.idParam, body: s.seasonUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.season.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Season not found'))

    const { name, startDate, endDate, sportMetadata } = req.body
    const season = await prisma.season.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined && { name }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(sportMetadata !== undefined && { sportMetadata })
      },
      include: {
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: { rounds: { orderBy: { roundNumber: 'asc' } } }
        }
      }
    })

    res.json(season)
  } catch (error) {
    next(error)
  }
})

// Delete season (cascades stages and rounds via DB)
router.delete('/:id', authenticate, authorize('admin'), validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const existing = await prisma.season.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Season not found'))

    // Cascade delete: rounds -> stages -> season (all in one transaction)
    await prisma.$transaction(async (tx) => {
      const stageIds = (await tx.stage.findMany({
        where: { seasonId: existing.id },
        select: { id: true }
      })).map(st => st.id)

      // Unlink events from rounds/stages/season
      await tx.event.updateMany({
        where: { seasonId: existing.id },
        data: { seasonId: null, stageId: null, roundId: null }
      })
      // Delete rounds for all stages
      await tx.round.deleteMany({ where: { stageId: { in: stageIds } } })
      // Delete stages
      await tx.stage.deleteMany({ where: { seasonId: existing.id } })
      // Delete season
      await tx.season.delete({ where: { id: existing.id } })
    })

    res.json({ message: 'Season deleted successfully' })
  } catch (error) {
    next(error)
  }
})

// Create stage within a season
router.post('/:id/stages', authenticate, authorize('admin'), validate({ params: s.idParam, body: s.stageCreateSchema }), async (req, res, next) => {
  try {
    const season = await prisma.season.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!season) return next(createError(404, 'Season not found'))

    const { name, stageType, sortOrder, advancementRules, sportMetadata } = req.body

    const stage = await prisma.stage.create({
      data: {
        seasonId: season.id,
        name,
        stageType,
        sortOrder: sortOrder ?? 0,
        advancementRules: advancementRules || {},
        sportMetadata: sportMetadata || {},
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(stage)
  } catch (error) {
    next(error)
  }
})

// Create round within a stage
router.post('/stages/:stageId/rounds', authenticate, authorize('admin'), validate({ params: s.stageIdParam, body: s.roundCreateSchema }), async (req, res, next) => {
  try {
    const stage = await prisma.stage.findFirst({
      where: { id: Number(req.params.stageId), tenantId: req.tenantId }
    })
    if (!stage) return next(createError(404, 'Stage not found'))

    const { name, roundNumber, scheduledDateStart, scheduledDateEnd } = req.body

    const round = await prisma.round.create({
      data: {
        stageId: stage.id,
        name,
        roundNumber,
        scheduledDateStart: scheduledDateStart ? new Date(scheduledDateStart) : null,
        scheduledDateEnd: scheduledDateEnd ? new Date(scheduledDateEnd) : null,
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(round)
  } catch (error) {
    next(error)
  }
})

export default router
