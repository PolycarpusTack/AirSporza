import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { getPagination, paginationEnvelope } from '../utils/pagination.js'
import * as s from '../schemas/players.js'

const router = Router()

function toDateOnly(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

// List all players for tenant (with optional search / sport / team / managed filters)
router.get('/', validate({ query: s.playersListQuery }), async (req, res, next) => {
  try {
    const { search, sportId, teamId, managed, limit, offset } = req.query as {
      search?: string; sportId?: string; teamId?: string; managed?: string
      limit?: number; offset?: number
    }
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (search && typeof search === 'string') {
      where.fullName = { contains: search, mode: 'insensitive' }
    }
    if (sportId && typeof sportId === 'string' && !Number.isNaN(Number(sportId))) {
      where.sportId = Number(sportId)
    }
    if (teamId && typeof teamId === 'string' && !Number.isNaN(Number(teamId))) {
      // G review fix F6: roster reads are scoped to CURRENT memberships —
      // ended stints (isCurrent: false) must not show up as today's squad.
      where.teamLinks = { some: { teamId: Number(teamId), isCurrent: true } }
    }
    if (managed === 'true') where.isManaged = true

    const pagination = getPagination({ limit, offset })
    const players = await prisma.player.findMany({
      where,
      include: { sport: { select: { id: true, name: true, icon: true } } },
      orderBy: pagination ? [{ fullName: 'asc' }, { id: 'asc' }] : { fullName: 'asc' },
      ...(pagination ? { take: pagination.limit, skip: pagination.offset } : {}),
    })
    if (pagination) {
      const total = await prisma.player.count({ where })
      return res.json(paginationEnvelope(players, total, pagination))
    }
    res.json(players)
  } catch (error) {
    next(error)
  }
})

// Autocomplete — search by name prefix (for dropdowns)
router.get('/autocomplete', async (req, res, next) => {
  try {
    const q = (req.query.q as string) || ''
    const players = await prisma.player.findMany({
      where: {
        tenantId: req.tenantId,
        fullName: { startsWith: q, mode: 'insensitive' }
      },
      select: { id: true, fullName: true, shortName: true, countryCode: true, position: true, photoUrl: true },
      take: 20,
      orderBy: { fullName: 'asc' }
    })
    res.json(players)
  } catch (error) {
    next(error)
  }
})

// Get player by id
router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const player = await prisma.player.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })

    if (!player) {
      return next(createError(404, 'Player not found'))
    }

    res.json(player)
  } catch (error) {
    next(error)
  }
})

// Create player
router.post('/', authenticate, authorize('admin'), validate({ body: s.playerCreateSchema }), async (req, res, next) => {
  try {
    const { fullName, sportId, shortName, countryCode, position, jerseyNumber, birthDate, photoUrl, status, notes, isManaged, externalRefs } = req.body

    // G review fix F4: sportId must reference a sport belonging to this tenant.
    if (sportId != null) {
      const sport = await prisma.sport.findFirst({
        where: { id: sportId, tenantId: req.tenantId }
      })
      if (!sport) return next(createError(400, 'Unknown sport'))
    }

    const player = await prisma.player.create({
      data: {
        fullName,
        sportId,
        shortName,
        countryCode,
        position,
        jerseyNumber,
        birthDate: toDateOnly(birthDate),
        photoUrl,
        status,
        notes,
        isManaged: isManaged ?? false,
        externalRefs,
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(player)
  } catch (error) {
    next(error)
  }
})

// Update player
router.put('/:id', authenticate, authorize('admin'), validate({ params: s.idParam, body: s.playerUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.player.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Player not found'))

    const { fullName, sportId, shortName, countryCode, position, jerseyNumber, birthDate, photoUrl, status, notes, isManaged, externalRefs } = req.body

    // G review fix F4: sportId must reference a sport belonging to this tenant.
    if (sportId != null) {
      const sport = await prisma.sport.findFirst({
        where: { id: sportId, tenantId: req.tenantId }
      })
      if (!sport) return next(createError(400, 'Unknown sport'))
    }

    const player = await prisma.player.update({
      where: { id: existing.id },
      data: {
        fullName,
        sportId,
        shortName,
        countryCode,
        position,
        jerseyNumber,
        birthDate: birthDate === undefined ? undefined : toDateOnly(birthDate),
        photoUrl,
        status,
        notes,
        isManaged,
        externalRefs,
      }
    })

    res.json(player)
  } catch (error) {
    next(error)
  }
})

// Update editorial remarks only (manual-only field, protected from import sync).
// Editable by sports planners and admins — not gated to admin like structural edits.
router.patch('/:id/notes', authenticate, authorize('admin', 'sports'), validate({ params: s.idParam, body: s.playerNotesSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.player.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Player not found'))

    const player = await prisma.player.update({
      where: { id: existing.id },
      data: { notes: req.body.notes }
    })

    res.json(player)
  } catch (error) {
    next(error)
  }
})

// List a player's team memberships
router.get('/:id/teams', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const player = await prisma.player.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!player) return next(createError(404, 'Player not found'))

    const links = await prisma.playerTeam.findMany({
      where: { playerId: player.id, tenantId: req.tenantId },
      include: {
        team: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        competition: { select: { id: true, name: true, season: true } },
        season: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    })
    res.json(links)
  } catch (error) {
    next(error)
  }
})

// Attach a player to a team roster (or competition startlist)
router.post('/:id/teams', authenticate, authorize('admin', 'sports'), validate({ params: s.idParam, body: s.playerTeamCreateSchema }), async (req, res, next) => {
  try {
    const player = await prisma.player.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!player) return next(createError(404, 'Player not found'))

    const { teamId, competitionId, seasonId, fromDate, toDate, isCurrent } = req.body

    if (teamId != null) {
      const team = await prisma.team.findFirst({
        where: { id: teamId, tenantId: req.tenantId }
      })
      if (!team) return next(createError(404, 'Team not found'))
    }
    if (competitionId != null) {
      const competition = await prisma.competition.findFirst({
        where: { id: competitionId, tenantId: req.tenantId }
      })
      if (!competition) return next(createError(404, 'Competition not found'))
    }

    // G review fix F2: the DB unique is (playerId, teamId, seasonId) — the
    // guard must key on exactly those columns (NULL-aware, TD-9 pattern).
    // Keying on competitionId let a same player+team+season row under another
    // competition through to the DB constraint (a 500 instead of a 409).
    const existing = await prisma.playerTeam.findFirst({
      where: {
        playerId: player.id,
        teamId: teamId ?? null,
        seasonId: seasonId ?? null,
      },
    })
    if (existing) {
      return next(createError(409, 'Player already has a membership for this team and season'))
    }

    const link = await prisma.playerTeam.create({
      data: {
        tenantId: req.tenantId!,
        playerId: player.id,
        teamId: teamId ?? null,
        competitionId: competitionId ?? null,
        seasonId: seasonId ?? null,
        fromDate: toDateOnly(fromDate),
        toDate: toDateOnly(toDate),
        isCurrent: isCurrent ?? true,
        source: 'manual',
      },
      include: {
        team: { select: { id: true, name: true } },
        competition: { select: { id: true, name: true, season: true } },
      },
    })
    res.status(201).json(link)
  } catch (error) {
    next(error)
  }
})

// Remove a player's team membership
router.delete('/:id/teams/:linkId', authenticate, authorize('admin', 'sports'), async (req, res, next) => {
  try {
    const playerId = Number(req.params.id)
    const linkId = Number(req.params.linkId)
    if (Number.isNaN(playerId) || Number.isNaN(linkId)) return next(createError(400, 'Invalid id'))

    const link = await prisma.playerTeam.findFirst({
      where: { id: linkId, playerId, tenantId: req.tenantId },
    })
    if (!link) return next(createError(404, 'Membership not found'))

    await prisma.playerTeam.delete({ where: { id: link.id } })
    res.json({ message: 'Membership removed' })
  } catch (error) {
    next(error)
  }
})

// Delete player
router.delete('/:id', authenticate, authorize('admin'), validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const toDelete = await prisma.player.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Player not found'))

    await prisma.player.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Player deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
