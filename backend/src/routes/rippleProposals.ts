/**
 * SV-2-T3 — read-only Ripple Proposal surface (Contract Snapshot `ripple v1`):
 *
 *   GET /api/ripple-proposals       — ADR-009 pagination (limit + opaque
 *                                     base64url cursor); filters status/eventId
 *   GET /api/ripple-proposals/:id   — single proposal
 *
 * Tenant-scoped from the auth context ONLY (req.tenantId — never client
 * input); a cross-tenant/unknown id is a 404 (no existence leak).
 *
 * BOUNDARY (ADR-019 Open assumption 2): NO accept/reject mutations and no
 * review UX ship here — SV-3 owns them, and must not freeze the review UX
 * before the ops-stakeholder taste-test. SV-3 EXTENDS `ripple v1` with the
 * mutations; this read shape stays stable.
 *
 * TD-28 guard: the status filter validates against the PRISMA `RippleStatus`
 * enum — never a hand-authored zod enum (the drift class of TD-28).
 */
import { Router } from 'express'
import { RippleStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

// ADR-009 pagination constants (parity with rights.ts /check-slots).
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/ripple-proposals?[status=][&eventId=][&limit=][&cursor=]
 * Review-queue list, newest first (createdAt desc, id desc — id tiebreak keeps
 * the cursor stable across equal timestamps).
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    let status: RippleStatus | undefined
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined
    if (statusRaw !== undefined) {
      if (!(Object.values(RippleStatus) as string[]).includes(statusRaw)) {
        throw createError(400, `status must be one of ${Object.values(RippleStatus).join(', ')}`)
      }
      status = statusRaw as RippleStatus
    }

    let eventId: number | undefined
    if (req.query.eventId !== undefined) {
      eventId = Number(req.query.eventId)
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throw createError(400, 'eventId must be a positive integer')
      }
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

    // Opaque cursor = base64url(proposal uuid). A corrupt cursor is a client
    // error (400), never a Prisma uuid-syntax 500 (slot-rights v1 posture).
    // Buffer.from never throws on garbage base64url — the uuid regex on the
    // decoded bytes is the real guard.
    let cursorId: string | undefined
    const cursorRaw = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
    if (cursorRaw) {
      const decoded = Buffer.from(cursorRaw, 'base64url').toString()
      if (!UUID_RE.test(decoded)) throw createError(400, 'invalid cursor')
      cursorId = decoded
    }

    const rows = await prisma.rippleProposal.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(status !== undefined ? { status } : {}),
        ...(eventId !== undefined ? { eventId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // fetch one extra to detect hasMore
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })

    const hasMore = rows.length > limit
    if (hasMore) rows.pop()
    // After pop(), hasMore guarantees ≥1 remaining row.
    const nextCursor = hasMore
      ? Buffer.from(rows[rows.length - 1].id).toString('base64url')
      : null

    res.json({ proposals: rows, nextCursor, hasMore })
  } catch (error) { next(error) }
})

/** GET /api/ripple-proposals/:id — single proposal (tenant-scoped, 404 on miss). */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : ''
    if (!UUID_RE.test(id)) throw createError(400, 'invalid proposal id')

    const proposal = await prisma.rippleProposal.findFirst({
      where: { id, tenantId: req.tenantId! },
    })
    if (!proposal) throw createError(404, 'Ripple proposal not found')

    res.json(proposal)
  } catch (error) { next(error) }
})

export default router
