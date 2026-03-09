import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

const teamCreateSchema = Joi.object({
  name: Joi.string().required(),
  shortName: Joi.string().allow('', null).optional(),
  country: Joi.string().allow('', null).optional(),
  logoUrl: Joi.string().uri().allow('', null).optional(),
  externalRefs: Joi.object().default({}),
})

const teamUpdateSchema = Joi.object({
  name: Joi.string().optional(),
  shortName: Joi.string().allow('', null).optional(),
  country: Joi.string().allow('', null).optional(),
  logoUrl: Joi.string().uri().allow('', null).optional(),
  externalRefs: Joi.object().optional(),
})

// List all teams for tenant (with optional search)
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (search && typeof search === 'string') {
      where.name = { contains: search, mode: 'insensitive' }
    }

    const teams = await prisma.team.findMany({
      where,
      orderBy: { name: 'asc' }
    })
    res.json(teams)
  } catch (error) {
    next(error)
  }
})

// Autocomplete — search by name prefix (for dropdowns)
router.get('/autocomplete', async (req, res, next) => {
  try {
    const q = (req.query.q as string) || ''
    const teams = await prisma.team.findMany({
      where: {
        tenantId: req.tenantId,
        name: { startsWith: q, mode: 'insensitive' }
      },
      select: { id: true, name: true, shortName: true, country: true, logoUrl: true },
      take: 20,
      orderBy: { name: 'asc' }
    })
    res.json(teams)
  } catch (error) {
    next(error)
  }
})

// Get team by id
router.get('/:id', async (req, res, next) => {
  try {
    const team = await prisma.team.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })

    if (!team) {
      return next(createError(404, 'Team not found'))
    }

    res.json(team)
  } catch (error) {
    next(error)
  }
})

// Create team
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = teamCreateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const { name, shortName, country, logoUrl, externalRefs } = value

    const team = await prisma.team.create({
      data: {
        name,
        shortName,
        country,
        logoUrl,
        externalRefs,
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(team)
  } catch (error) {
    next(error)
  }
})

// Update team
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.team.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Team not found'))

    const { error: valErr, value } = teamUpdateSchema.validate(req.body)
    if (valErr) return next(createError(400, valErr.details[0].message))

    const { name, shortName, country, logoUrl, externalRefs } = value
    const team = await prisma.team.update({
      where: { id: existing.id },
      data: { name, shortName, country, logoUrl, externalRefs }
    })

    res.json(team)
  } catch (error) {
    next(error)
  }
})

// Delete team
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const toDelete = await prisma.team.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Team not found'))

    await prisma.team.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Team deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
