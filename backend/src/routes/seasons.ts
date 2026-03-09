import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

const stageSchema = Joi.object({
  name: Joi.string().required(),
  stageType: Joi.string().required(),
  sortOrder: Joi.number().integer().default(0),
  advancementRules: Joi.object().default({}),
  sportMetadata: Joi.object().default({}),
})

const seasonCreateSchema = Joi.object({
  competitionId: Joi.number().integer().positive().required(),
  name: Joi.string().required(),
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
  sportMetadata: Joi.object().default({}),
  stages: Joi.array().items(stageSchema).optional(),
})

const seasonUpdateSchema = Joi.object({
  name: Joi.string().optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  sportMetadata: Joi.object().optional(),
})

const stageCreateSchema = Joi.object({
  name: Joi.string().required(),
  stageType: Joi.string().required(),
  sortOrder: Joi.number().integer().default(0),
  advancementRules: Joi.object().default({}),
  sportMetadata: Joi.object().default({}),
})

const roundCreateSchema = Joi.object({
  name: Joi.string().required(),
  roundNumber: Joi.number().integer().required(),
  scheduledDateStart: Joi.string().isoDate().allow(null).optional(),
  scheduledDateEnd: Joi.string().isoDate().allow(null).optional(),
})

// List seasons (optional ?competitionId filter)
router.get('/', async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (req.query.competitionId) {
      where.competitionId = parseId(req.query.competitionId as string)
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
router.get('/:id', async (req, res, next) => {
  try {
    const season = await prisma.season.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId },
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
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = seasonCreateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const { competitionId, name, startDate, endDate, sportMetadata, stages } = value

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
            create: stages.map((s: { name: string; stageType: string; sortOrder?: number; advancementRules?: Record<string, unknown>; sportMetadata?: Record<string, unknown> }) => ({
              name: s.name,
              stageType: s.stageType,
              sortOrder: s.sortOrder ?? 0,
              advancementRules: s.advancementRules || {},
              sportMetadata: s.sportMetadata || {},
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
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.season.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Season not found'))

    const { error, value } = seasonUpdateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const { name, startDate, endDate, sportMetadata } = value
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
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.season.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Season not found'))

    // Cascade delete: rounds -> stages -> season (all in one transaction)
    await prisma.$transaction(async (tx) => {
      const stageIds = (await tx.stage.findMany({
        where: { seasonId: existing.id },
        select: { id: true }
      })).map(s => s.id)

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
router.post('/:id/stages', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const season = await prisma.season.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!season) return next(createError(404, 'Season not found'))

    const { error: valErr, value } = stageCreateSchema.validate(req.body)
    if (valErr) return next(createError(400, valErr.details[0].message))

    const { name, stageType, sortOrder, advancementRules, sportMetadata } = value

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
router.post('/stages/:stageId/rounds', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const stage = await prisma.stage.findFirst({
      where: { id: parseId(req.params.stageId), tenantId: req.tenantId }
    })
    if (!stage) return next(createError(404, 'Stage not found'))

    const { error: valErr, value } = roundCreateSchema.validate(req.body)
    if (valErr) return next(createError(400, valErr.details[0].message))

    const { name, roundNumber, scheduledDateStart, scheduledDateEnd } = value

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
