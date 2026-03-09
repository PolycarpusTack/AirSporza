import { Router } from 'express'
import Joi from 'joi'
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

const contractSchema = Joi.object({
  competitionId:        Joi.number().integer().min(1).required(),
  status:               Joi.string().valid(...Object.values(ContractStatus)).required(),
  validFrom:            Joi.string().isoDate().optional().allow(null),
  validUntil:           Joi.string().isoDate().optional().allow(null),
  // Legacy boolean rights (still accepted, auto-populate platforms[])
  linearRights:         Joi.boolean().optional(),
  maxRights:            Joi.boolean().optional(),
  radioRights:          Joi.boolean().optional(),
  sublicensing:         Joi.boolean().optional(),
  // Enriched rights fields
  seasonId:             Joi.number().integer().min(1).optional().allow(null),
  territory:            Joi.array().items(Joi.string()).optional(),
  platforms:            Joi.array().items(Joi.string().valid('linear', 'on-demand', 'radio', 'fast', 'pop-up')).optional(),
  coverageType:         Joi.string().valid('LIVE', 'DELAYED', 'HIGHLIGHTS').optional(),
  maxLiveRuns:          Joi.number().integer().min(0).optional().allow(null),
  maxPickRunsPerRound:  Joi.number().integer().min(0).optional().allow(null),
  windowStartUtc:       Joi.string().isoDate().optional().allow(null),
  windowEndUtc:         Joi.string().isoDate().optional().allow(null),
  tapeDelayHoursMin:    Joi.number().integer().min(0).optional().allow(null),
  geoRestriction:       Joi.string().allow('').optional().allow(null),
  fee:                  Joi.string().allow('').optional().allow(null),
  notes:                Joi.string().allow('').optional().allow(null),
})

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

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const contract = await prisma.contract.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId },
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

router.post('/', authenticate, authorize('contracts', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = contractSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    enrichPlatforms(value)

    const contract = await prisma.contract.create({
      data: { ...value, tenantId: req.tenantId! },
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
      tenantId: req.tenantId,
    })

    res.status(201).json(contract)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('contracts', 'admin'), async (req, res, next) => {
  try {
    const contractId = parseId(req.params.id)
    const existing = await prisma.contract.findFirst({ where: { id: contractId, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Contract not found'))

    const { error, value } = contractSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    enrichPlatforms(value)

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: value,
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
      tenantId: req.tenantId,
    })

    res.json(contract)
  } catch (error) {
    next(error)
  }
})

export default router
