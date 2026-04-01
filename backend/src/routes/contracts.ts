import { Router } from 'express'
import { ContractStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { writeOutboxEvent } from '../services/outbox.js'
import * as s from '../schemas/contracts.js'

const FINANCIAL_FIELDS = ['fee', 'notes'] as const

export function filterContractForRole(
  contract: Record<string, unknown>,
  role: string
): Record<string, unknown> {
  if (role === 'contracts' || role === 'admin') return contract
  const filtered = { ...contract }
  for (const field of FINANCIAL_FIELDS) {
    delete filtered[field]
  }
  return filtered
}

const router = Router()
const contractStatuses = new Set<string>(Object.values(ContractStatus))

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query
    const normalizedStatus = typeof status === 'string' && contractStatuses.has(status) ? status as ContractStatus : undefined
    
    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (normalizedStatus) where.status = normalizedStatus

    const contracts = await prisma.contract.findMany({
      where,
      include: {
        competition: {
          include: { sport: true }
        }
      },
      orderBy: { validUntil: 'asc' }
    })
    
    const role = (req.user as { role: string }).role
    res.json(contracts.map(c => filterContractForRole(c as Record<string, unknown>, role)))
  } catch (error) {
    next(error)
  }
})

router.get('/expiring', authenticate, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 90
    
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + days)
    
    const contracts = await prisma.contract.findMany({
      where: {
        tenantId: req.tenantId,
        validUntil: {
          gte: new Date(),
          lte: expiryDate
        },
        status: { in: ['valid', 'expiring'] }
      },
      include: {
        competition: {
          include: { sport: true }
        }
      },
      orderBy: { validUntil: 'asc' }
    })
    
    const role = (req.user as { role: string }).role
    res.json(contracts.map(c => filterContractForRole(c as Record<string, unknown>, role)))
  } catch (error) {
    next(error)
  }
})

router.get('/:id', authenticate, validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
      include: {
        competition: {
          include: { sport: true }
        }
      }
    })
    
    if (!contract) {
      return next(createError(404, 'Contract not found'))
    }
    
    const role = (req.user as { role: string }).role
    res.json(filterContractForRole(contract as Record<string, unknown>, role))
  } catch (error) {
    next(error)
  }
})

/** Auto-populate platforms[] from legacy boolean fields when platforms not explicitly provided */
function enrichPlatforms(data: Record<string, unknown>): void {
  if (data.platforms && (data.platforms as string[]).length > 0) return // Explicit platforms provided
  const platforms: string[] = []
  if (data.linearRights) platforms.push('linear')
  if (data.maxRights) platforms.push('on-demand')
  if (data.radioRights) platforms.push('radio')
  if (platforms.length > 0) data.platforms = platforms
}

router.post('/', authenticate, authorize('contracts', 'admin'), validate({ body: s.contractSchema }), async (req, res, next) => {
  try {
    enrichPlatforms(req.body)
    const user = req.user as { id: string }

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: { ...req.body, tenantId: req.tenantId! },
        include: { competition: { include: { sport: true } } }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'contract.created',
        aggregateType: 'Contract',
        aggregateId: String(created.id),
        payload: created,
      })

      return created
    })

    await writeAuditLog({
      userId: user.id,
      action: 'contract.create',
      entityType: 'contract',
      entityId: String(contract.id),
      newValue: contract,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.status(201).json(contract)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('contracts', 'admin'), validate({ params: s.idParam, body: s.contractSchema }), async (req, res, next) => {
  try {
    const contractId = Number(req.params.id)
    const existing = await prisma.contract.findFirst({ where: { id: contractId, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Contract not found'))

    enrichPlatforms(req.body)
    const user = req.user as { id: string }

    const contract = await prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id: contractId },
        data: req.body,
        include: { competition: { include: { sport: true } } }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'contract.updated',
        aggregateType: 'Contract',
        aggregateId: String(updated.id),
        payload: updated,
      })

      return updated
    })

    await writeAuditLog({
      userId: user.id,
      action: 'contract.update',
      entityType: 'contract',
      entityId: String(contract.id),
      oldValue: existing ?? undefined,
      newValue: contract,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.json(contract)
  } catch (error) {
    next(error)
  }
})

export default router
