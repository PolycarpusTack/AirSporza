import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/courts.js'

const router = Router()

// List courts (filter by venueId query param)
router.get('/', async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.venueId) {
      where.venueId = Number(req.query.venueId)
    }

    const courts = await prisma.court.findMany({
      where,
      include: { venue: { select: { id: true, name: true } } },
      orderBy: [{ broadcastPriority: 'desc' }, { name: 'asc' }]
    })
    res.json(courts)
  } catch (error) {
    next(error)
  }
})

// Get court by id
router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const court = await prisma.court.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
      include: { venue: { select: { id: true, name: true } } }
    })

    if (!court) {
      return next(createError(404, 'Court not found'))
    }

    res.json(court)
  } catch (error) {
    next(error)
  }
})

// Create court
router.post('/', authenticate, authorize('admin'), validate({ body: s.courtCreateSchema }), async (req, res, next) => {
  try {
    const { venueId, name, capacity, hasRoof, isShowCourt, broadcastPriority } = req.body

    // Verify venue belongs to tenant
    const venue = await prisma.venue.findFirst({
      where: { id: venueId, tenantId: req.tenantId }
    })
    if (!venue) return next(createError(404, 'Venue not found'))

    const court = await prisma.court.create({
      data: {
        venueId,
        name,
        capacity,
        hasRoof,
        isShowCourt,
        broadcastPriority,
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(court)
  } catch (error) {
    next(error)
  }
})

// Update court
router.put('/:id', authenticate, authorize('admin'), validate({ params: s.idParam, body: s.courtUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.court.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Court not found'))

    const { name, capacity, hasRoof, isShowCourt, broadcastPriority } = req.body
    const court = await prisma.court.update({
      where: { id: existing.id },
      data: { name, capacity, hasRoof, isShowCourt, broadcastPriority }
    })

    res.json(court)
  } catch (error) {
    next(error)
  }
})

// Delete court
router.delete('/:id', authenticate, authorize('admin'), validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const toDelete = await prisma.court.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Court not found'))

    await prisma.court.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Court deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
