import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { sportId } = req.query
    
    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (sportId) where.sportId = parseId(sportId as string)

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

router.get('/:id', async (req, res, next) => {
  try {
    const competition = await prisma.competition.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId },
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

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { sportId, name, matches, season } = req.body
    
    if (!sportId || !name || !season) {
      return next(createError(400, 'SportId, name and season are required'))
    }
    
    const competition = await prisma.competition.create({
      data: { sportId, name, matches: matches || 0, season, tenantId: req.tenantId! }
    })
    
    res.status(201).json(competition)
  } catch (error) {
    next(error)
  }
})

export default router
