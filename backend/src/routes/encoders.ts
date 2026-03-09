import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

const encoderUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  location: Joi.string().allow('', null).optional(),
  notes: Joi.string().allow('', null).optional(),
  isActive: Joi.boolean().optional(),
})

router.get('/', async (req, res, next) => {
  try {
    const encoders = await prisma.encoder.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { name: 'asc' }
    })

    const plans = await prisma.techPlan.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, crew: true, planType: true, eventId: true }
    })
    
    const encoderUsage: Record<string, { planId: number; planType: string; eventId: number }> = {}
    plans.forEach((plan: { id: number; crew: unknown; planType: string; eventId: number }) => {
      const crew = plan.crew as Record<string, string>
      if (crew.encoder) {
        encoderUsage[crew.encoder] = {
          planId: plan.id,
          planType: plan.planType,
          eventId: plan.eventId
        }
      }
    })
    
    const result = encoders.map((enc: { id: number; name: string; location: string | null; isActive: boolean; notes: string | null }) => ({
      ...enc,
      inUse: encoderUsage[enc.name] || null
    }))
    
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, location, notes } = req.body
    
    if (!name) {
      return next(createError(400, 'Name is required'))
    }
    
    const encoder = await prisma.encoder.create({
      data: { name, location, notes, tenantId: req.tenantId! }
    })
    
    res.status(201).json(encoder)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.encoder.findFirst({ where: { id: parseId(req.params.id), tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Encoder not found'))
    const { error: valErr, value } = encoderUpdateSchema.validate(req.body)
    if (valErr) return next(createError(400, valErr.details[0].message))
    const encoder = await prisma.encoder.update({
      where: { id: existing.id },
      data: value
    })
    
    res.json(encoder)
  } catch (error) {
    next(error)
  }
})

export default router
