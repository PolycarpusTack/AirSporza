import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

const venueCreateSchema = Joi.object({
  name: Joi.string().required(),
  timezone: Joi.string().default('Europe/Brussels'),
  country: Joi.string().allow('', null).optional(),
  address: Joi.string().allow('', null).optional(),
  capacity: Joi.number().integer().min(0).allow(null).optional(),
})

const venueUpdateSchema = Joi.object({
  name: Joi.string().optional(),
  timezone: Joi.string().optional(),
  country: Joi.string().allow('', null).optional(),
  address: Joi.string().allow('', null).optional(),
  capacity: Joi.number().integer().min(0).allow(null).optional(),
})

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
router.get('/:id', async (req, res, next) => {
  try {
    const venue = await prisma.venue.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId },
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
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = venueCreateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const { name, timezone, country, address, capacity } = value

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
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.venue.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Venue not found'))

    const { error: valErr, value } = venueUpdateSchema.validate(req.body)
    if (valErr) return next(createError(400, valErr.details[0].message))

    const { name, timezone, country, address, capacity } = value
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
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const toDelete = await prisma.venue.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Venue not found'))

    await prisma.venue.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Venue deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
