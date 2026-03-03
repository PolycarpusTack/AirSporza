import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const sports = await prisma.sport.findMany({
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

router.get('/:id', async (req, res, next) => {
  try {
    const sport = await prisma.sport.findUnique({
      where: { id: parseId(req.params.id) },
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

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, icon, federation } = req.body
    
    if (!name || !icon) {
      return next(createError(400, 'Name and icon are required'))
    }
    
    const sport = await prisma.sport.create({
      data: { name, icon, federation }
    })
    
    res.status(201).json(sport)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, icon, federation } = req.body
    
    const sport = await prisma.sport.update({
      where: { id: parseId(req.params.id) },
      data: { name, icon, federation }
    })
    
    res.json(sport)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await prisma.sport.delete({
      where: { id: parseId(req.params.id) }
    })
    
    res.json({ message: 'Sport deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
