import { Router } from 'express'
import { prisma } from '../../db/prisma.js'
import { authenticate } from '../../middleware/auth.js'
import { getOffsetPagination, paginationEnvelope } from '../../utils/pagination.js'

const router = Router()

// Search unlinked import records (for "Link from Import" in event form)
router.get('/records/unlinked', authenticate, async (req, res, next) => {
  try {
    const { search, entityType, limit } = req.query
    const take = Math.min(Number(limit) || 20, 50)

    const where: any = {
      entityType: entityType || 'event',
      validationStatus: { in: ['valid', 'pending'] },
      isSuperseded: false,
      // Unlinked: no approved merge candidate
      mergeCandidates: {
        none: { status: 'approved' },
      },
    }

    if (search) {
      const q = String(search)
      where.OR = [
        { normalizedJson: { path: ['participantsText'], string_contains: q } },
        { normalizedJson: { path: ['homeTeam'], string_contains: q } },
        { normalizedJson: { path: ['awayTeam'], string_contains: q } },
        { normalizedJson: { path: ['competitionName'], string_contains: q } },
        { sourceRecordId: { contains: q } },
      ]
    }

    where.tenantId = req.tenantId
    const pagination = getOffsetPagination(req.query.offset, take)
    const records = await prisma.importRecord.findMany({
      where,
      orderBy: pagination ? [{ createdAt: 'desc' }, { id: 'asc' }] : { createdAt: 'desc' },
      take,
      ...(pagination ? { skip: pagination.offset } : {}),
      select: {
        id: true,
        sourceRecordId: true,
        entityType: true,
        normalizedJson: true,
        validationStatus: true,
        createdAt: true,
        source: { select: { code: true, name: true } },
      },
    })

    if (pagination) {
      const total = await prisma.importRecord.count({ where })
      return res.json(paginationEnvelope(records, total, pagination))
    }
    res.json(records)
  } catch (error) {
    next(error)
  }
})

export default router
