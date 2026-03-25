import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/crewTemplates.js'

const router = Router()

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
router.post('/', authenticate, validate({ body: s.createSchema }), async (req, res, next) => {
  try {
    const userId = (req as any).user?.id as string
    const template = await prisma.crewTemplate.create({
      data: { ...req.body, tenantId: req.tenantId!, createdById: userId },
    })
    res.status(201).json(template)
  } catch (error) { next(error) }
})

// PUT /api/crew-templates/:id — update (owner or system only)
router.put('/:id', authenticate, validate({ params: s.idParam, body: s.updateSchema }), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
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
    const template = await prisma.crewTemplate.update({ where: { id: existing.id }, data: req.body })
    res.json(template)
  } catch (error) { next(error) }
})

// DELETE /api/crew-templates/:id — delete (owner or system only)
router.delete('/:id', authenticate, validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
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
