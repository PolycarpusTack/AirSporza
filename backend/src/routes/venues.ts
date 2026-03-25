import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/venues.js'

const router = Router()

// List all venues for tenant
router.get('/', async (req, res, next) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { tenantId: req.tenantId },
      include: {
        _count: { select: { courts: true, events: true } }
      },
      orderBy: { name: 'asc' }
    })
    res.json(venues)
  } catch (error) {
    next(error)
  }
})

// Get venue by id (with courts)
router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const venue = await prisma.venue.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
      include: {
        courts: { orderBy: { broadcastPriority: 'desc' } }
      }
    })

    if (!venue) {
      return next(createError(404, 'Venue not found'))
    }

    res.json(venue)
  } catch (error) {
    next(error)
  }
})

// Create venue (admin only)
router.post('/', authenticate, authorize('admin'), validate({ body: s.venueCreateSchema }), async (req, res, next) => {
  try {
    const { name, timezone, country, address, capacity } = req.body

    const venue = await prisma.venue.create({
      data: {
        name,
        timezone,
        country,
        address,
        capacity,
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(venue)
  } catch (error) {
    next(error)
  }
})

// Update venue
router.put('/:id', authenticate, authorize('admin'), validate({ params: s.idParam, body: s.venueUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.venue.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Venue not found'))

    const { name, timezone, country, address, capacity } = req.body
    const venue = await prisma.venue.update({
      where: { id: existing.id },
      data: { name, timezone, country, address, capacity }
    })

    res.json(venue)
  } catch (error) {
    next(error)
  }
})

// Delete venue
router.delete('/:id', authenticate, authorize('admin'), validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const toDelete = await prisma.venue.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Venue not found'))

    await prisma.venue.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Venue deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
