import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { ContractStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { writeOutboxEvent } from '../services/outbox.js'
import * as s from '../schemas/contracts.js'
import * as rw from '../schemas/rightsWindows.js'
import { windowsOverlap, overlapConflictMessage } from '../services/rightsWindows/overlap.js'
import type { RightsWindowCreateInput, RightsWindowUpdateInput } from '../schemas/rightsWindows.js'

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

// =============================================================================
// RD-2-T2 (ADR-015) — Rights Windows: children of Contract. Mounted under the
// contracts router so they inherit authenticate + setTenantContext + limiter.
// Storage works regardless of the `rightsWindows` flag — that flag gates
// validation-code EMISSION in RD-3, not persistence. No new validation codes here.
// =============================================================================

/**
 * Load a contract only if it belongs to the request tenant (else null → 404).
 * tenantId is REQUIRED: passing `undefined` to a Prisma where drops the filter and
 * matches ANY tenant — callers must resolve+assert tenantId before calling.
 */
async function loadTenantContract(contractId: number, tenantId: string) {
  return prisma.contract.findFirst({ where: { id: contractId, tenantId } })
}

/** Project a validated body onto the RightsWindow row shape (no id/tenant/contract). */
function toRightsWindowRow(body: RightsWindowCreateInput | RightsWindowUpdateInput) {
  return {
    category: body.category,
    exclusivity: body.exclusivity,
    territory: body.territory,
    platforms: body.platforms,
    windowStartUtc: body.windowStartUtc ?? null,
    windowEndUtc: body.windowEndUtc ?? null,
    maxRuns: body.maxRuns ?? null,
    holdbackHoursMin: body.holdbackHoursMin ?? null,
  }
}

router.get(
  '/:contractId/rights-windows',
  authenticate,
  validate({ params: rw.contractIdParam }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) return next(createError(401, 'Tenant context required'))
      const contractId = Number(req.params.contractId)
      const contract = await loadTenantContract(contractId, tenantId)
      if (!contract) return next(createError(404, 'Contract not found'))

      const windows = await prisma.rightsWindow.findMany({
        where: { contractId, tenantId },
        orderBy: { createdAt: 'asc' },
      })
      res.json(windows)
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/:contractId/rights-windows',
  authenticate,
  authorize('contracts', 'admin'),
  validate({ params: rw.contractIdParam, body: rw.rightsWindowCreateSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) return next(createError(401, 'Tenant context required'))
      const contractId = Number(req.params.contractId)
      const contract = await loadTenantContract(contractId, tenantId)
      if (!contract) return next(createError(404, 'Contract not found'))

      const body = req.body as RightsWindowCreateInput

      // Idempotent create: a re-POST of an id that already exists on THIS
      // contract+tenant echoes the existing row (200), never a duplicate/409.
      // Scoped by tenantId+contractId so a client id under another
      // contract/tenant can never be echoed back (cross-tenant read leak).
      if (body.id) {
        const dup = await prisma.rightsWindow.findFirst({
          where: { id: body.id, contractId, tenantId },
        })
        if (dup) return res.status(200).json(dup)
      }

      const siblings = await prisma.rightsWindow.findMany({
        where: { contractId, tenantId },
      })
      const conflict = siblings.find(w => windowsOverlap(w, body))
      if (conflict) return next(createError(409, overlapConflictMessage(conflict, body)))

      const user = req.user as { id: string }
      const created = await prisma.rightsWindow.create({
        data: {
          id: body.id ?? randomUUID(),
          contractId,
          tenantId,
          ...toRightsWindowRow(body),
        },
      })

      await writeAuditLog({
        userId: user.id,
        action: 'rightsWindow.create',
        entityType: 'rightsWindow',
        entityId: created.id,
        newValue: created,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tenantId,
      })

      res.status(201).json(created)
    } catch (error) {
      next(error)
    }
  }
)

router.put(
  '/:contractId/rights-windows/:windowId',
  authenticate,
  authorize('contracts', 'admin'),
  validate({ params: rw.windowIdParam, body: rw.rightsWindowUpdateSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) return next(createError(401, 'Tenant context required'))
      const contractId = Number(req.params.contractId)
      const windowId = String(req.params.windowId)
      const contract = await loadTenantContract(contractId, tenantId)
      if (!contract) return next(createError(404, 'Contract not found'))

      const existing = await prisma.rightsWindow.findFirst({
        where: { id: windowId, contractId, tenantId },
      })
      if (!existing) return next(createError(404, 'Rights window not found'))

      const body = req.body as RightsWindowUpdateInput

      // Overlap check excludes the window being replaced (self is not a conflict).
      const siblings = await prisma.rightsWindow.findMany({
        where: { contractId, tenantId, id: { not: windowId } },
      })
      const conflict = siblings.find(w => windowsOverlap(w, body))
      if (conflict) return next(createError(409, overlapConflictMessage(conflict, body)))

      const user = req.user as { id: string }
      const updated = await prisma.rightsWindow.update({
        where: { id: windowId },
        data: toRightsWindowRow(body),
      })

      await writeAuditLog({
        userId: user.id,
        action: 'rightsWindow.update',
        entityType: 'rightsWindow',
        entityId: windowId,
        oldValue: existing,
        newValue: updated,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tenantId,
      })

      res.json(updated)
    } catch (error) {
      next(error)
    }
  }
)

router.delete(
  '/:contractId/rights-windows/:windowId',
  authenticate,
  authorize('contracts', 'admin'),
  validate({ params: rw.windowIdParam }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) return next(createError(401, 'Tenant context required'))
      const contractId = Number(req.params.contractId)
      const windowId = String(req.params.windowId)
      const contract = await loadTenantContract(contractId, tenantId)
      if (!contract) return next(createError(404, 'Contract not found'))

      const existing = await prisma.rightsWindow.findFirst({
        where: { id: windowId, contractId, tenantId },
      })
      if (!existing) return next(createError(404, 'Rights window not found'))

      await prisma.rightsWindow.delete({ where: { id: windowId } })

      const user = req.user as { id: string }
      await writeAuditLog({
        userId: user.id,
        action: 'rightsWindow.delete',
        entityType: 'rightsWindow',
        entityId: windowId,
        oldValue: existing,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tenantId,
      })

      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

export default router
