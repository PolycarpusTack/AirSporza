import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/competitions.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { sportId } = req.query

    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (sportId) where.sportId = Number(sportId)

    const competitions = await prisma.competition.findMany({
      where,
      include: {
        sport: true,
        _count: { select: { events: true } }
      },
      orderBy: [
        { sportId: 'asc' },
        { name: 'asc' }
      ]
    })

    res.json(competitions)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const competition = await prisma.competition.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
      include: {
        sport: true,
        contracts: {
          take: 1,
          orderBy: { updatedAt: 'desc' }
        },
        events: {
          take: 10,
          orderBy: { startDateBE: 'desc' }
        }
      }
    })

    if (!competition) {
      return next(createError(404, 'Competition not found'))
    }

    res.json({
      ...competition,
      contract: competition.contracts[0] ?? null,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('admin'), validate({ body: s.competitionCreateSchema }), async (req, res, next) => {
  try {
    const { sportId, name, matches, season } = req.body

    const competition = await prisma.competition.create({
      data: { sportId, name, matches: matches || 0, season, tenantId: req.tenantId! }
    })

    res.status(201).json(competition)
  } catch (error) {
    next(error)
  }
})

export default router
