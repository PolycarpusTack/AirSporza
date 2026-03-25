import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/sports.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const sports = await prisma.sport.findMany({
      where: { tenantId: req.tenantId },
      include: {
        _count: { select: { competitions: true, events: true } }
      },
      orderBy: { name: 'asc' }
    })
    res.json(sports)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const sport = await prisma.sport.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
      include: {
        competitions: {
          include: {
            _count: { select: { events: true } }
          }
        }
      }
    })

    if (!sport) {
      return next(createError(404, 'Sport not found'))
    }

    res.json(sport)
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('admin'), validate({ body: s.sportCreateSchema }), async (req, res, next) => {
  try {
    const { name, icon, federation } = req.body

    const sport = await prisma.sport.create({
      data: { name, icon, federation, tenantId: req.tenantId! }
    })

    res.status(201).json(sport)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('admin'), validate({ params: s.idParam, body: s.sportUpdateSchema }), async (req, res, next) => {
  try {
    const { name, icon, federation } = req.body

    const existing = await prisma.sport.findFirst({ where: { id: Number(req.params.id), tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Sport not found'))
    const sport = await prisma.sport.update({
      where: { id: existing.id },
      data: { name, icon, federation }
    })

    res.json(sport)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', authenticate, authorize('admin'), validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const toDelete = await prisma.sport.findFirst({ where: { id: Number(req.params.id), tenantId: req.tenantId } })
    if (!toDelete) return next(createError(404, 'Sport not found'))
    await prisma.sport.delete({
      where: { id: toDelete.id }
    })

    res.json({ message: 'Sport deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
