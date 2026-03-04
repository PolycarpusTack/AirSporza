import { Router } from 'express'
import { ContractStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'
import { writeAuditLog } from '../utils/audit.js'

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
    
    const where = normalizedStatus ? { status: normalizedStatus } : {}
    
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

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: parseId(req.params.id) },
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

router.post('/', authenticate, authorize('contracts', 'admin'), async (req, res, next) => {
  try {
    const contract = await prisma.contract.create({
      data: req.body,
      include: { competition: { include: { sport: true } } }
    })

    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'contract.create',
      entityType: 'contract',
      entityId: String(contract.id),
      newValue: contract,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(201).json(contract)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('contracts', 'admin'), async (req, res, next) => {
  try {
    const contractId = parseId(req.params.id)
    const existing = await prisma.contract.findUnique({ where: { id: contractId } })

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: req.body,
      include: { competition: { include: { sport: true } } }
    })

    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'contract.update',
      entityType: 'contract',
      entityId: String(contract.id),
      oldValue: existing ?? undefined,
      newValue: contract,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json(contract)
  } catch (error) {
    next(error)
  }
})

export default router
