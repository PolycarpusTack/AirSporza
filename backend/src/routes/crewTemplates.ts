import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

const createSchema = Joi.object({
  name:     Joi.string().required(),
  planType: Joi.string().allow(null).default(null),
  crewData: Joi.object().required(),
  isShared: Joi.boolean().default(false),
})

const updateSchema = Joi.object({
  name:     Joi.string().optional(),
  crewData: Joi.object().optional(),
  isShared: Joi.boolean().optional(),
})

// GET /api/crew-templates — list templates visible to current user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).user?.id as string | undefined
    const templates = await prisma.crewTemplate.findMany({
      where: {
        tenantId: req.tenantId,
        OR: [
          { createdById: null },       // system defaults
          { isShared: true },          // shared by others
          ...(userId ? [{ createdById: userId }] : []),  // user's own
        ],
      },
      orderBy: { name: 'asc' },
    })
    res.json(templates)
  } catch (error) { next(error) }
})

// GET /api/crew-templates/for-plan-type/:planType — system default for a plan type
router.get('/for-plan-type/:planType', authenticate, async (req, res, next) => {
  try {
    const planType = req.params.planType as string
    const template = await prisma.crewTemplate.findFirst({
      where: { tenantId: req.tenantId, planType, createdById: null },
    })
    res.json(template ?? null)
  } catch (error) { next(error) }
})

// POST /api/crew-templates — create a template
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const userId = (req as any).user?.id as string
    const template = await prisma.crewTemplate.create({
      data: { ...value, tenantId: req.tenantId!, createdById: userId },
    })
    res.status(201).json(template)
  } catch (error) { next(error) }
})

// PUT /api/crew-templates/:id — update (owner or system only)
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return next(createError(400, 'Invalid id'))
    const existing = await prisma.crewTemplate.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Template not found'))
    const userId = (req as any).user?.id as string
    const userRole = (req as any).user?.role as string | undefined
    // System defaults (createdById === null) can only be edited by admins
    if (existing.createdById === null && userRole !== 'admin') {
      return next(createError(403, 'Only admins can edit system default templates'))
    }
    if (existing.createdById !== null && existing.createdById !== userId && userRole !== 'admin') {
      return next(createError(403, 'Not allowed to update this template'))
    }
    const { error, value } = updateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const template = await prisma.crewTemplate.update({ where: { id: existing.id }, data: value })
    res.json(template)
  } catch (error) { next(error) }
})

// DELETE /api/crew-templates/:id — delete (owner or system only)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return next(createError(400, 'Invalid id'))
    const existing = await prisma.crewTemplate.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Template not found'))
    const userId = (req as any).user?.id as string
    const userRole = (req as any).user?.role as string | undefined
    // System defaults (createdById === null) can only be deleted by admins
    if (existing.createdById === null && userRole !== 'admin') {
      return next(createError(403, 'Only admins can delete system default templates'))
    }
    if (existing.createdById !== null && existing.createdById !== userId && userRole !== 'admin') {
      return next(createError(403, 'Not allowed to delete this template'))
    }
    await prisma.crewTemplate.delete({ where: { id: existing.id } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
