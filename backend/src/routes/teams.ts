import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { getPagination, paginationEnvelope } from '../utils/pagination.js'
import * as s from '../schemas/teams.js'

const router = Router()

// List all teams for tenant (with optional search / sport / managed filters)
router.get('/', validate({ query: s.teamsListQuery }), async (req, res, next) => {
  try {
    const { search, sportId, competitionId, managed, limit, offset } = req.query as {
      search?: string; sportId?: string; competitionId?: string; managed?: string
      limit?: number; offset?: number
    }
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (search && typeof search === 'string') {
      where.name = { contains: search, mode: 'insensitive' }
    }
    if (sportId && typeof sportId === 'string' && !Number.isNaN(Number(sportId))) {
      where.sportId = Number(sportId)
    }
    if (competitionId && typeof competitionId === 'string' && !Number.isNaN(Number(competitionId))) {
      where.competitionLinks = { some: { competitionId: Number(competitionId) } }
    }
    if (managed === 'true') where.isManaged = true

    const pagination = getPagination({ limit, offset })
    const teams = await prisma.team.findMany({
      where,
      include: { sport: { select: { id: true, name: true, icon: true } } },
      orderBy: pagination ? [{ name: 'asc' }, { id: 'asc' }] : { name: 'asc' },
      ...(pagination ? { take: pagination.limit, skip: pagination.offset } : {}),
    })
    if (pagination) {
      const total = await prisma.team.count({ where })
      return res.json(paginationEnvelope(teams, total, pagination))
    }
    res.json(teams)
  } catch (error) {
    next(error)
  }
})

// Autocomplete — search by name prefix (for dropdowns)
router.get('/autocomplete', async (req, res, next) => {
  try {
    const q = (req.query.q as string) || ''
    const teams = await prisma.team.findMany({
      where: {
        tenantId: req.tenantId,
        name: { startsWith: q, mode: 'insensitive' }
      },
      select: { id: true, name: true, shortName: true, country: true, logoUrl: true },
      take: 20,
      orderBy: { name: 'asc' }
    })
    res.json(teams)
  } catch (error) {
    next(error)
  }
})

// Get team by id
router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const team = await prisma.team.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })

    if (!team) {
      return next(createError(404, 'Team not found'))
    }

    res.json(team)
  } catch (error) {
    next(error)
  }
})

// Create team
router.post('/', authenticate, authorize('admin'), validate({ body: s.teamCreateSchema }), async (req, res, next) => {
  try {
    const { name, shortName, country, logoUrl, sportId, notes, isManaged, externalRefs } = req.body

    // G review fix F4: sportId must reference a sport belonging to this tenant
    // (same pre-existing gap as the players routes).
    if (sportId != null) {
      const sport = await prisma.sport.findFirst({
        where: { id: sportId, tenantId: req.tenantId }
      })
      if (!sport) return next(createError(400, 'Unknown sport'))
    }

    const team = await prisma.team.create({
      data: {
        name,
        shortName,
        country,
        logoUrl,
        sportId,
        notes,
        isManaged: isManaged ?? false,
        externalRefs,
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(team)
  } catch (error) {
    next(error)
  }
})

// Update team
router.put('/:id', authenticate, authorize('admin'), validate({ params: s.idParam, body: s.teamUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.team.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Team not found'))

    const { name, shortName, country, logoUrl, sportId, notes, isManaged, externalRefs } = req.body

    // G review fix F4: sportId must reference a sport belonging to this tenant.
    if (sportId != null) {
      const sport = await prisma.sport.findFirst({
        where: { id: sportId, tenantId: req.tenantId }
      })
      if (!sport) return next(createError(400, 'Unknown sport'))
    }

    const team = await prisma.team.update({
      where: { id: existing.id },
      data: { name, shortName, country, logoUrl, sportId, notes, isManaged, externalRefs }
    })

    res.json(team)
  } catch (error) {
    next(error)
  }
})

// Update editorial remarks only (manual-only field, protected from import sync).
// Editable by sports planners and admins — not gated to admin like structural edits.
router.patch('/:id/notes', authenticate, authorize('admin', 'sports'), validate({ params: s.idParam, body: s.teamNotesSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.team.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Team not found'))

    const team = await prisma.team.update({
      where: { id: existing.id },
      data: { notes: req.body.notes }
    })

    res.json(team)
  } catch (error) {
    next(error)
  }
})

// List a team's competition memberships
router.get('/:id/competitions', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const team = await prisma.team.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!team) return next(createError(404, 'Team not found'))

    const links = await prisma.teamCompetition.findMany({
      where: { teamId: team.id, tenantId: req.tenantId },
      include: {
        competition: { select: { id: true, name: true, season: true, sportId: true } },
        season: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    })
    res.json(links)
  } catch (error) {
    next(error)
  }
})

// Assign a team to a competition
router.post('/:id/competitions', authenticate, authorize('admin', 'sports'), validate({ params: s.idParam, body: s.teamCompetitionCreateSchema }), async (req, res, next) => {
  try {
    const team = await prisma.team.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!team) return next(createError(404, 'Team not found'))

    const { competitionId, seasonId } = req.body
    const competition = await prisma.competition.findFirst({
      where: { id: competitionId, tenantId: req.tenantId }
    })
    if (!competition) return next(createError(404, 'Competition not found'))

    // Guard the null-season case the DB-level @@unique can't dedupe.
    const existing = await prisma.teamCompetition.findFirst({
      where: { teamId: team.id, competitionId, seasonId: seasonId ?? null },
    })
    if (existing) {
      return res.status(200).json(existing)
    }

    const link = await prisma.teamCompetition.create({
      data: {
        tenantId: req.tenantId!,
        teamId: team.id,
        competitionId,
        seasonId: seasonId ?? null,
        source: 'manual',
      },
      include: { competition: { select: { id: true, name: true, season: true } } },
    })
    res.status(201).json(link)
  } catch (error) {
    next(error)
  }
})

// Remove a team's competition membership
router.delete('/:id/competitions/:linkId', authenticate, authorize('admin', 'sports'), async (req, res, next) => {
  try {
    const teamId = Number(req.params.id)
    const linkId = Number(req.params.linkId)
    if (Number.isNaN(teamId) || Number.isNaN(linkId)) return next(createError(400, 'Invalid id'))

    const link = await prisma.teamCompetition.findFirst({
      where: { id: linkId, teamId, tenantId: req.tenantId },
    })
    if (!link) return next(createError(404, 'Membership not found'))

    await prisma.teamCompetition.delete({ where: { id: link.id } })
    res.json({ message: 'Membership removed' })
  } catch (error) {
    next(error)
  }
})

// Delete team
router.delete('/:id', authenticate, authorize('admin'), validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const toDelete = await prisma.team.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Team not found'))

    await prisma.team.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Team deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
