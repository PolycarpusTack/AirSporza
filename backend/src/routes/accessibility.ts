/**
 * RC-2-T2 — Accessibility deliverables per event (G11): list, setRequirement
 * (AD/VGT toggle), audited status transitions with an optimistic guard, and the
 * KPI aggregation endpoint. Storage/CRUD is flag-independent (the
 * `regulatoryCompliance` flag gates only RC-2-T3's ACCESSIBILITY_UNPLANNED check),
 * mirroring the listed-events (RC-1-T2) posture.
 *
 * State logic is PURE (services/accessibility/transitions.ts + kpi.ts) — routes only
 * guard tenancy/roles, call the pure functions, persist, and audit.
 *
 * T888 policy: its requirement comes from the RC-2-T1 config defaulting (TODO-KPI
 * exclusion set), so BOTH doors that could flip requirement per event (setRequirement
 * and a NOT_REQUIRED-touching transition) reject T888 with 400. Lifecycle steps for
 * T888 (REQUIRED → PLANNED → …) are unrestricted.
 *
 * Optimistic guard: every transition carries expectedStatus. Mismatch or illegal step
 * → 409 with { currentStatus, allowedNext } so a retry after a lost response sees the
 * real state instead of double-applying (retry-safe idempotency).
 */
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import {
  allowedNextStatuses,
  canTransitionAccessibility,
  isRequirementToggle,
  resolveRequirementChange,
  T888_REQUIREMENT_POLICY_MESSAGE,
} from '../services/accessibility/transitions.js'
import { aggregateAccessibilityKpi } from '../services/accessibility/kpi.js'
import {
  loadTenantAccessibilityConfig,
  toEffectiveAccessibilityConfig,
  overrideOf,
} from '../services/accessibility/tenantConfig.js'
import * as s from '../schemas/accessibility.js'
import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import type { AccessibilityStatus, AccessibilityType, TenantAccessibilityConfig } from '@prisma/client'

const router = Router()

/** Load an event only if it belongs to the request tenant (else null → caller 404s). */
function loadTenantEvent(req: Request, eventId: number) {
  return prisma.event.findFirst({ where: { id: eventId, tenantId: req.tenantId } })
}

/** 409 body for every rejected status change — names the way out. `error` + `message`
 * both carry the text (schedules.ts:278 precedent; the ApiClient reads `message`). */
function sendConflict(res: Response, message: string, currentStatus: AccessibilityStatus): void {
  res.status(409).json({
    error: message,
    message,
    currentStatus,
    allowedNext: allowedNextStatuses(currentStatus),
  })
}

/** Single audit path for both status-writing endpoints — owns the req.user cast. */
async function logStatusChange(
  req: Request,
  params: { id: number; action: string; oldStatus: AccessibilityStatus; newStatus: AccessibilityStatus },
): Promise<void> {
  const user = req.user as { id: string }
  await writeAuditLog({
    userId: user.id,
    action: params.action,
    entityType: 'accessibilityDeliverable',
    entityId: String(params.id),
    oldValue: { status: params.oldStatus },
    newValue: { status: params.newStatus },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    tenantId: req.tenantId,
  })
}

// GET /events/:eventId/deliverables — the event's deliverable rows (tenant-scoped).
router.get(
  '/events/:eventId/deliverables',
  authenticate,
  validate({ params: s.eventIdParam }),
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.eventId)
      const event = await loadTenantEvent(req, eventId)
      if (!event) return next(createError(404, 'Event not found'))

      const rows = await prisma.accessibilityDeliverable.findMany({
        where: { eventId, tenantId: req.tenantId },
        orderBy: { type: 'asc' },
      })
      res.json(rows)
    } catch (error) {
      next(error)
    }
  }
)

// POST /events/:eventId/requirement { type, required } — toggle REQUIRED ↔ NOT_REQUIRED
// for AD/VGT. Upserts the row when a legacy (pre-RC-2-T1) event has none. Idempotent:
// a repeat of the same toggle is a 200 no-op.
router.post(
  '/events/:eventId/requirement',
  authenticate,
  authorize('planner', 'admin'),
  validate({ params: s.eventIdParam, body: s.setRequirementSchema }),
  async (req, res, next) => {
    try {
      const eventId = Number(req.params.eventId)
      const { type, required } = req.body as { type: AccessibilityType; required: boolean }
      const user = req.user as { id: string }

      // Same guard order as the transition door: tenancy/404 first, then policy.
      const event = await loadTenantEvent(req, eventId)
      if (!event) return next(createError(404, 'Event not found'))

      const existing = await prisma.accessibilityDeliverable.findFirst({
        where: { eventId, type, tenantId: req.tenantId },
      })

      // All requirement semantics (T888 lock, legacy create, no-op, legality) live in
      // the pure state machine — the router only dispatches on the resolution.
      const change = resolveRequirementChange(type, existing?.status ?? null, required)
      switch (change.kind) {
        case 't888-locked':
          return next(createError(400, T888_REQUIREMENT_POLICY_MESSAGE))
        case 'noop':
          return res.json(existing)
        case 'illegal':
          return sendConflict(res, 'Cannot change requirement in the current status', existing!.status)
        case 'create': {
          // Legacy event without seeded rows → create at the requested requirement.
          const created = await prisma.accessibilityDeliverable.create({
            data: { tenantId: req.tenantId!, eventId, type, status: change.status, updatedBy: user.id },
          })
          await logStatusChange(req, {
            id: created.id, action: 'accessibilityDeliverable.setRequirement', oldStatus: 'NOT_REQUIRED', newStatus: change.status,
          })
          return res.json(created)
        }
        case 'update': {
          const updated = await prisma.accessibilityDeliverable.update({
            where: { id: existing!.id },
            data: { status: change.status, updatedBy: user.id },
          })
          await logStatusChange(req, {
            id: existing!.id, action: 'accessibilityDeliverable.setRequirement', oldStatus: existing!.status, newStatus: change.status,
          })
          return res.json(updated)
        }
      }
    } catch (error) {
      next(error)
    }
  }
)

// POST /deliverables/:id/transition { status, expectedStatus } — one audited lifecycle
// step, guarded by the pure state machine + the mandatory optimistic expectedStatus.
router.post(
  '/deliverables/:id/transition',
  authenticate,
  authorize('planner', 'admin'),
  validate({ params: s.deliverableIdParam, body: s.transitionSchema }),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id)
      const { status, expectedStatus } = req.body as { status: AccessibilityStatus; expectedStatus: AccessibilityStatus }
      const user = req.user as { id: string }

      const row = await prisma.accessibilityDeliverable.findFirst({ where: { id, tenantId: req.tenantId } })
      if (!row) return next(createError(404, 'Accessibility deliverable not found'))

      // Optimistic guard first: a stale caller learns the real state (retry-safe).
      if (row.status !== expectedStatus) {
        return sendConflict(res, 'Status changed since it was read', row.status)
      }
      // T888 requirement is config policy — this door answers 400 like setRequirement,
      // regardless of machine legality (both doors, one answer).
      if (row.type === 'T888' && isRequirementToggle(row.status, status)) {
        return next(createError(400, T888_REQUIREMENT_POLICY_MESSAGE))
      }
      if (!canTransitionAccessibility(row.status, status)) {
        return sendConflict(res, 'Illegal status transition', row.status)
      }

      const updated = await prisma.accessibilityDeliverable.update({
        where: { id },
        data: { status, updatedBy: user.id },
      })
      await logStatusChange(req, {
        id, action: 'accessibilityDeliverable.transition', oldStatus: row.status, newStatus: status,
      })
      res.json(updated)
    } catch (error) {
      next(error)
    }
  }
)

// GET /kpi?from&to — coverage % per deliverable type over the period (events whose
// startDateBE falls in [from, to]). Reconciles 1:1 with raw rows; targets are read via
// the per-tenant config loader (RC-5-T2 — constants as fallback; TODO-KPI provisional,
// AS-1) — never hardcoded here.
router.get('/kpi', authenticate, validate({ query: s.kpiQuery }), async (req, res, next) => {
  try {
    const { from, to } = req.query as unknown as { from: Date; to: Date }
    const config = await loadTenantAccessibilityConfig(prisma, req.tenantId!)
    const rows = await prisma.accessibilityDeliverable.findMany({
      where: {
        tenantId: req.tenantId,
        event: { startDateBE: { gte: from, lte: to } },
      },
      select: { type: true, status: true },
    })
    res.json({ from, to, byType: aggregateAccessibilityKpi(rows, config.kpiTargetPctByType) })
  } catch (error) {
    next(error)
  }
})

// ─── RC-5-T2: per-tenant accessibility configuration (admin) ─────────────────

/** GET/PUT response body: the merged EFFECTIVE config (what consumers apply) plus the
 * raw stored OVERRIDE (null = no row; NULL fields = "falls back to the constant"), so
 * an admin can tell tenant values from fallback defaults without a second source.
 * Both views come from tenantConfig.ts — ONE reader posture for the stored Json. */
function buildConfigResponse(row: TenantAccessibilityConfig | null) {
  const effective = toEffectiveAccessibilityConfig(row)
  return {
    effective: {
      t888ExcludedSportIds: [...effective.t888ExcludedSportIds].sort((a, b) => a - b),
      kpiTargetPctByType: effective.kpiTargetPctByType,
      unplannedLeadTimeDays: effective.unplannedLeadTimeDays,
    },
    override: overrideOf(row),
  }
}

// GET /config — the tenant's accessibility configuration (admin). Tenant-scoped from
// the auth context — there is deliberately NO way to address another tenant's config.
router.get('/config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const row = await prisma.tenantAccessibilityConfig.findUnique({ where: { tenantId: req.tenantId! } })
    res.json(buildConfigResponse(row))
  } catch (error) {
    next(error)
  }
})

// PUT /config — per-tenant upsert (PUT-replace semantics, retry-safe: a repeat lands
// on the same unique tenantId row). Omitted/null fields store NULL = "fall back to the
// constant". Validation (0–100 targets, non-negative lead time, unknown type keys,
// stray top-level keys incl. tenantId) lives in replaceConfigSchema. Audited.
router.put(
  '/config',
  authenticate,
  authorize('admin'),
  validate({ body: s.replaceConfigSchema }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId!
      const user = req.user as { id: string }
      const body = req.body as {
        t888ExcludedSportIds?: number[] | null
        kpiTargetPctByType?: Record<string, number | null> | null
        unplannedLeadTimeDays?: number | null
      }

      // Prisma nullable-Json posture: SQL NULL is written as Prisma.DbNull.
      const data = {
        t888ExcludedSportIds: body.t888ExcludedSportIds ?? Prisma.DbNull,
        kpiTargetPctByType: body.kpiTargetPctByType ?? Prisma.DbNull,
        unplannedLeadTimeDays: body.unplannedLeadTimeDays ?? null,
        updatedBy: user.id,
      }

      // Read-previous + upsert in ONE transaction so concurrent PUTs cannot both
      // audit the same stale oldValue. (writeAuditLog owns its prisma call and
      // does not take a tx — the audit write follows the committed state.)
      const { previous, row } = await prisma.$transaction(async tx => {
        const previous = await tx.tenantAccessibilityConfig.findUnique({ where: { tenantId } })
        const row = await tx.tenantAccessibilityConfig.upsert({
          where: { tenantId },
          create: { tenantId, ...data },
          update: data,
        })
        return { previous, row }
      })

      await writeAuditLog({
        userId: user.id,
        action: 'tenantAccessibilityConfig.update',
        entityType: 'tenantAccessibilityConfig',
        entityId: String(row.id),
        oldValue: overrideOf(previous),
        newValue: overrideOf(row),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tenantId,
      })

      res.json(buildConfigResponse(row))
    } catch (error) {
      next(error)
    }
  }
)

export default router
