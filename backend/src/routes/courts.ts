import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

const courtCreateSchema = Joi.object({
  venueId: Joi.number().integer().positive().required(),
  name: Joi.string().required(),
  capacity: Joi.number().integer().min(0).allow(null).optional(),
  hasRoof: Joi.boolean().default(false),
  isShowCourt: Joi.boolean().default(false),
  broadcastPriority: Joi.number().integer().default(0),
})

const courtUpdateSchema = Joi.object({
  name: Joi.string().optional(),
  capacity: Joi.number().integer().min(0).allow(null).optional(),
  hasRoof: Joi.boolean().optional(),
  isShowCourt: Joi.boolean().optional(),
  broadcastPriority: Joi.number().integer().optional(),
})

// List courts (filter by venueId query param)
router.get('/', async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.venueId) {
      where.venueId = parseId(req.query.venueId as string)
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
router.get('/:id', async (req, res, next) => {
  try {
    const court = await prisma.court.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId },
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
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = courtCreateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const { venueId, name, capacity, hasRoof, isShowCourt, broadcastPriority } = value

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
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.court.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Court not found'))

    const { error: valErr, value } = courtUpdateSchema.validate(req.body)
    if (valErr) return next(createError(400, valErr.details[0].message))

    const { name, capacity, hasRoof, isShowCourt, broadcastPriority } = value
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
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const toDelete = await prisma.court.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Court not found'))

    await prisma.court.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Court deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
