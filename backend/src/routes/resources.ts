import { Router } from 'express'
import Joi from 'joi'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

const assignSchema = Joi.object({
  techPlanId: Joi.number().integer().positive().required(),
  quantity:   Joi.number().integer().min(1).max(100).default(1),
  notes:      Joi.string().allow('', null).optional(),
})

const resourceSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid('ob_van', 'camera_unit', 'commentary_team', 'production_staff', 'other').required(),
  capacity: Joi.number().integer().min(1).default(1),
  isActive: Joi.boolean(),
  notes: Joi.string().allow('').optional().allow(null),
})

// GET /api/resources — list all resources
router.get('/', authenticate, async (req, res, next) => {
  try {
    const resources = await prisma.resource.findMany({ where: { tenantId: req.tenantId }, orderBy: { name: 'asc' } })
    res.json(resources)
  } catch (error) { next(error) }
})

// POST /api/resources — create resource (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = resourceSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const resource = await prisma.resource.create({ data: { ...value, tenantId: req.tenantId! } })
    res.status(201).json(resource)
  } catch (error) { next(error) }
})

// PUT /api/resources/:id — update resource (admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return next(createError(400, 'Invalid id'))
    const existing = await prisma.resource.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Resource not found'))
    const { error, value } = resourceSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const resource = await prisma.resource.update({ where: { id: existing.id }, data: value })
    res.json(resource)
  } catch (error) { next(error) }
})

// GET /api/resources/:id/assignments — list assignments for a resource
router.get('/:id/assignments', authenticate, async (req, res, next) => {
  try {
    const resourceId = Number(req.params.id)
    if (!Number.isFinite(resourceId)) return next(createError(400, 'Invalid resource ID'))
    const assignments = await prisma.resourceAssignment.findMany({
      where: { tenantId: req.tenantId, resourceId },
      include: { techPlan: { include: { event: true } } },
    })
    res.json(assignments)
  } catch (error) { next(error) }
})

// POST /api/resources/:id/assign — assign resource to a tech plan
router.post('/:id/assign', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const resourceId = Number(req.params.id)
    if (!Number.isFinite(resourceId)) return next(createError(400, 'Invalid resource ID'))
    const { error: valErr, value } = assignSchema.validate(req.body)
    if (valErr) return next(createError(400, valErr.details[0].message))

    // Enforce capacity
    const resource = await prisma.resource.findFirst({ where: { id: resourceId, tenantId: req.tenantId } })
    if (!resource) return next(createError(404, 'Resource not found'))
    const currentUsage = await prisma.resourceAssignment.aggregate({
      where: { tenantId: req.tenantId, resourceId },
      _sum: { quantity: true },
    })
    const used = currentUsage._sum.quantity ?? 0
    if (used + value.quantity > resource.capacity) {
      return next(createError(409, `Resource "${resource.name}" is at capacity (${used}/${resource.capacity})`))
    }

    const assignment = await prisma.resourceAssignment.create({
      data: { tenantId: req.tenantId!, resourceId, techPlanId: value.techPlanId, quantity: value.quantity, notes: value.notes },
    })
    res.status(201).json(assignment)
  } catch (error) { next(error) }
})

// DELETE /api/resources/:id/assign/:techPlanId — remove assignment
router.delete('/:id/assign/:techPlanId', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    await prisma.resourceAssignment.delete({
      where: {
        resourceId_techPlanId: {
          resourceId: Number(req.params.id),
          techPlanId: Number(req.params.techPlanId),
        },
      },
    })
    res.json({ ok: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return next(createError(404, 'Assignment not found'))
    }
    next(error)
  }
})

export default router
