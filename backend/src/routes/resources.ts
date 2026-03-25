import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/resources.js'

const router = Router()

// GET /api/resources — list all resources
router.get('/', authenticate, async (req, res, next) => {
  try {
    const resources = await prisma.resource.findMany({ where: { tenantId: req.tenantId }, orderBy: { name: 'asc' } })
    res.json(resources)
  } catch (error) { next(error) }
})

// POST /api/resources — create resource (admin only)
router.post('/', authenticate, authorize('admin'), validate({ body: s.resourceSchema }), async (req, res, next) => {
  try {
    const resource = await prisma.resource.create({ data: { ...req.body, tenantId: req.tenantId! } })
    res.status(201).json(resource)
  } catch (error) { next(error) }
})

// PUT /api/resources/:id — update resource (admin only)
router.put('/:id', authenticate, authorize('admin'), validate({ params: s.resourceIdParam, body: s.resourceSchema }), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.resource.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Resource not found'))
    const resource = await prisma.resource.update({ where: { id: existing.id }, data: req.body })
    res.json(resource)
  } catch (error) { next(error) }
})

// GET /api/resources/:id/assignments — list assignments for a resource
router.get('/:id/assignments', authenticate, validate({ params: s.resourceIdParam }), async (req, res, next) => {
  try {
    const resourceId = Number(req.params.id)
    const assignments = await prisma.resourceAssignment.findMany({
      where: { tenantId: req.tenantId, resourceId },
      include: { techPlan: { include: { event: true } } },
    })
    res.json(assignments)
  } catch (error) { next(error) }
})

// POST /api/resources/:id/assign — assign resource to a tech plan
router.post('/:id/assign', authenticate, authorize('sports', 'admin'), validate({ params: s.resourceIdParam, body: s.assignSchema }), async (req, res, next) => {
  try {
    const resourceId = Number(req.params.id)

    // Enforce capacity and create assignment in a single transaction
    const resource = await prisma.resource.findFirst({ where: { id: resourceId, tenantId: req.tenantId } })
    if (!resource) return next(createError(404, 'Resource not found'))

    const assignment = await prisma.$transaction(async (tx) => {
      const currentUsage = await tx.resourceAssignment.aggregate({
        where: { tenantId: req.tenantId, resourceId },
        _sum: { quantity: true },
      })
      const used = currentUsage._sum.quantity ?? 0
      if (used + req.body.quantity > resource.capacity) {
        throw Object.assign(new Error(`Resource "${resource.name}" is at capacity (${used}/${resource.capacity})`), { isCapacity: true })
      }

      return tx.resourceAssignment.create({
        data: { tenantId: req.tenantId!, resourceId, techPlanId: req.body.techPlanId, quantity: req.body.quantity, notes: req.body.notes },
      })
    }).catch((err) => {
      if (err.isCapacity) return null
      throw err
    })

    if (!assignment) return next(createError(409, `Resource "${resource.name}" is at capacity`))
    res.status(201).json(assignment)
  } catch (error) { next(error) }
})

// DELETE /api/resources/:id/assign/:techPlanId — remove assignment
router.delete('/:id/assign/:techPlanId', authenticate, authorize('sports', 'admin'), validate({ params: s.assignDeleteParams }), async (req, res, next) => {
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
