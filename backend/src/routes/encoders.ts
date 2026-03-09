import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

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
    const encoder = await prisma.encoder.update({
      where: { id: existing.id },
      data: req.body
    })
    
    res.json(encoder)
  } catch (error) {
    next(error)
  }
})

export default router
