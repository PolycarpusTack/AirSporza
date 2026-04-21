import { prisma } from '../db/prisma.js'
import type { Contract, EventStatus } from '@prisma/client'
import { checkRights } from './rightsChecker.js'

export type ConflictWarning = { type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan' | 'resource_conflict' | 'platform_not_covered' | 'contract_expiring'; message: string }
export type ConflictError   = { type: 'encoder_locked' | 'rights_violation' | 'territory_blocked' | 'max_runs_exceeded'; message: string }

type EventDraft = {
  id?: number
  competitionId: number
  channelId?: number | null
  radioChannelId?: number | null
  onDemandChannelId?: number | null
  // Legacy string fields (still accepted for backwards compat)
  linearChannel?: string
  onDemandChannel?: string
  radioChannel?: string
  startDateBE: string
  startTimeBE: string
  status?: EventStatus
  tenantId?: string
}

function timeToMin(t: string): number {
  const parts = t.split(':').map(Number)
  const h = Number.isFinite(parts[0]) ? parts[0] : 0
  const m = Number.isFinite(parts[1]) ? parts[1] : 0
  return h * 60 + m
}

export async function detectConflicts(draft: EventDraft): Promise<{ warnings: ConflictWarning[]; errors: ConflictError[] }> {
  const warnings: ConflictWarning[] = []
  const errors: ConflictError[]     = []

  const dayStart = new Date(draft.startDateBE.slice(0, 10))
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(draft.startDateBE.slice(0, 10))
  dayEnd.setUTCHours(23, 59, 59, 999)

  // 1. Channel overlap (FK-based, falls back to legacy string)
  const channelId = draft.channelId
  if (channelId) {
    const sameDay = await prisma.event.findMany({
      where: {
        ...(draft.tenantId ? { tenantId: draft.tenantId } : {}),
        channelId,
        startDateBE: { gte: dayStart, lte: dayEnd },
        ...(draft.id ? { NOT: { id: draft.id } } : {}),
      },
      select: { id: true, startTimeBE: true, durationMin: true, participants: true },
    })
    const draftMin = timeToMin(draft.startTimeBE)
    const draftDuration = (draft as any).durationMin as number | null | undefined
    for (const ev of sameDay) {
      const evMin = timeToMin(ev.startTimeBE)
      if (draftDuration && ev.durationMin) {
        // Real overlap check using actual durations
        const draftEnd = draftMin + draftDuration
        const evEnd = evMin + ev.durationMin
        if (draftMin < evEnd && evMin < draftEnd) {
          warnings.push({
            type: 'channel_overlap',
            message: `Channel already has "${ev.participants ?? 'an event'}" with overlapping time`,
          })
        }
      } else if (Math.abs(evMin - draftMin) < 30) {
        warnings.push({
          type: 'channel_overlap',
          message: `Channel already has "${ev.participants ?? 'an event'}" within 30 min`,
        })
      }
    }
  } else if (draft.linearChannel) {
    // Legacy fallback
    const sameDay = await prisma.event.findMany({
      where: {
        ...(draft.tenantId ? { tenantId: draft.tenantId } : {}),
        linearChannel: draft.linearChannel,
        startDateBE: { gte: dayStart, lte: dayEnd },
        ...(draft.id ? { NOT: { id: draft.id } } : {}),
      },
      select: { id: true, startTimeBE: true, durationMin: true, participants: true },
    })
    const draftMin = timeToMin(draft.startTimeBE)
    const draftDuration = (draft as any).durationMin as number | null | undefined
    for (const ev of sameDay) {
      const evMin = timeToMin(ev.startTimeBE)
      if (draftDuration && ev.durationMin) {
        const draftEnd = draftMin + draftDuration
        const evEnd = evMin + ev.durationMin
        if (draftMin < evEnd && evMin < draftEnd) {
          warnings.push({
            type: 'channel_overlap',
            message: `Channel ${draft.linearChannel} already has "${ev.participants ?? 'an event'}" with overlapping time`,
          })
        }
      } else if (Math.abs(evMin - draftMin) < 30) {
        warnings.push({
          type: 'channel_overlap',
          message: `Channel ${draft.linearChannel} already has "${ev.participants ?? 'an event'}" within 30 min`,
        })
      }
    }
  }

  // 2. Rights checking via unified rightsChecker
  const contracts = await prisma.contract.findMany({
    where: {
      ...(draft.tenantId ? { tenantId: draft.tenantId } : {}),
      competitionId: draft.competitionId,
      status: { in: ['valid', 'expiring'] },
      validFrom: { lte: dayEnd },
      validUntil: { gte: dayStart },
    },
  })

  // Resolve channel types for rights checking.
  // Scope by tenantId so a caller passing a foreign channelId can't read
  // another tenant's channel metadata (cross-tenant leak).
  const allChannelIds = [draft.channelId, draft.radioChannelId, draft.onDemandChannelId].filter((id): id is number => id != null)
  let channelTypes: string[] = []
  if (allChannelIds.length > 0) {
    const channels = await prisma.channel.findMany({
      where: {
        ...(draft.tenantId ? { tenantId: draft.tenantId } : {}),
        id: { in: allChannelIds },
      },
      select: { types: true },
    })
    channelTypes = channels.flatMap(c => c.types)
  }

  // Build start UTC from date + time for window check
  const startUtc = draft.startDateBE && draft.startTimeBE
    ? new Date(`${draft.startDateBE.slice(0, 10)}T${draft.startTimeBE}:00Z`)
    : null

  const rightsResults = checkRights(
    {
      channelId: draft.channelId ?? allChannelIds[0] ?? null,
      channelTypes,
      startUtc,
    },
    contracts,
  )

  // Map unified results to conflict warnings/errors
  for (const r of rightsResults) {
    if (r.severity === 'ERROR') {
      if (r.code === 'NO_VALID_CONTRACT') {
        warnings.push({ type: 'rights_window', message: r.message })
      } else if (r.code === 'TERRITORY_BLOCKED') {
        errors.push({ type: 'territory_blocked', message: r.message })
      } else if (r.code === 'MAX_RUNS_EXCEEDED') {
        errors.push({ type: 'max_runs_exceeded', message: r.message })
      } else {
        errors.push({ type: 'rights_violation', message: r.message })
      }
    } else {
      if (r.code === 'PLATFORM_NOT_COVERED') {
        warnings.push({ type: 'platform_not_covered', message: r.message })
      } else if (r.code === 'CONTRACT_EXPIRING') {
        warnings.push({ type: 'contract_expiring', message: r.message })
      } else {
        warnings.push({ type: 'rights_window', message: r.message })
      }
    }
  }

  // 3. Missing tech plan (only warn for approved/published events that already exist)
  if (draft.id && (draft.status === 'approved' || draft.status === 'published')) {
    const plan = await prisma.techPlan.findFirst({ where: { eventId: draft.id } })
    if (!plan) {
      warnings.push({ type: 'missing_tech_plan', message: 'No tech plan assigned for this event' })
    }
  }

  // 4. Resource double-booking
  if (draft.id) {
    const assignments = await prisma.resourceAssignment.findMany({
      where: { techPlan: { eventId: draft.id } },
      include: { resource: true },
    })
    if (assignments.length > 0) {
      const resourceIds = assignments.map(a => a.resourceId)
      const overlappingAll = await prisma.resourceAssignment.findMany({
        where: {
          resourceId: { in: resourceIds },
          techPlan: {
            eventId: { not: draft.id },
            event: { startDateBE: { gte: dayStart, lte: dayEnd } },
          },
        },
        select: { resourceId: true },
      })
      const conflictedIds = new Set(overlappingAll.map(o => o.resourceId))
      for (const a of assignments) {
        if (conflictedIds.has(a.resourceId)) {
          warnings.push({
            type: 'resource_conflict',
            message: `Resource "${a.resource.name}" is also assigned to another event on this day`,
          })
        }
      }
    }
  }

  return { warnings, errors }
}

/**
 * Batched variant for {@link detectConflicts}.
 *
 * Collapses the per-event 4-5 sequential queries from {@link detectConflicts}
 * into ~5 total queries for the entire batch, loading overlap candidates,
 * contracts, channel types, tech plans, and resource assignments once and
 * then running the conflict checks in-memory per event.
 *
 * Output preserves input order and matches `detectConflicts` one-for-one.
 */
export async function detectConflictsBulk(
  drafts: EventDraft[],
  tenantId?: string,
): Promise<{ id: number | undefined; warnings: ConflictWarning[]; errors: ConflictError[] }[]> {
  if (drafts.length === 0) return []

  const tenantClause = tenantId ? { tenantId } : {}

  // ── Batch 1: pre-compute per-draft dayStart/dayEnd + unique axes
  const draftDays = drafts.map(d => {
    const day = d.startDateBE.slice(0, 10)
    const dayStart = new Date(day)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(day)
    dayEnd.setUTCHours(23, 59, 59, 999)
    return { draft: d, day, dayStart, dayEnd }
  })

  const rangeStart = new Date(Math.min(...draftDays.map(d => d.dayStart.getTime())))
  const rangeEnd = new Date(Math.max(...draftDays.map(d => d.dayEnd.getTime())))
  const channelIds = [...new Set(drafts.map(d => d.channelId).filter((x): x is number => x != null))]
  const legacyChannels = [...new Set(drafts.map(d => d.linearChannel).filter((x): x is string => !!x))]
  const allChannelIds = [...new Set(drafts.flatMap(d => [d.channelId, d.radioChannelId, d.onDemandChannelId]).filter((x): x is number => x != null))]
  const competitionIds = [...new Set(drafts.map(d => d.competitionId))]
  const existingIds = drafts.map(d => d.id).filter((x): x is number => x != null)

  // ── Batch 2: load overlap candidates across the entire date range
  const [overlapCandidates, legacyOverlapCandidates, contracts, channelRecords, techPlans, assignments] = await Promise.all([
    channelIds.length > 0
      ? prisma.event.findMany({
          where: {
            ...tenantClause,
            channelId: { in: channelIds },
            startDateBE: { gte: rangeStart, lte: rangeEnd },
          },
          select: { id: true, channelId: true, startDateBE: true, startTimeBE: true, durationMin: true, participants: true },
        })
      : Promise.resolve([]),
    legacyChannels.length > 0
      ? prisma.event.findMany({
          where: {
            ...tenantClause,
            linearChannel: { in: legacyChannels },
            startDateBE: { gte: rangeStart, lte: rangeEnd },
          },
          select: { id: true, linearChannel: true, startDateBE: true, startTimeBE: true, durationMin: true, participants: true },
        })
      : Promise.resolve([]),
    prisma.contract.findMany({
      where: {
        ...tenantClause,
        competitionId: { in: competitionIds },
        status: { in: ['valid', 'expiring'] },
        validFrom: { lte: rangeEnd },
        validUntil: { gte: rangeStart },
      },
    }),
    allChannelIds.length > 0
      ? prisma.channel.findMany({
          where: { ...tenantClause, id: { in: allChannelIds } },
          select: { id: true, types: true },
        })
      : Promise.resolve([]),
    existingIds.length > 0
      ? prisma.techPlan.findMany({
          where: { eventId: { in: existingIds } },
          select: { id: true, eventId: true },
        })
      : Promise.resolve([]),
    // Load ALL resource assignments for events in the same date range — not
    // just the batch — so we can detect conflicts against events outside the
    // batch (matches single-call detectConflicts semantics).
    existingIds.length > 0
      ? prisma.resourceAssignment.findMany({
          where: {
            ...tenantClause,
            techPlan: {
              event: {
                startDateBE: { gte: rangeStart, lte: rangeEnd },
              },
            },
          },
          select: {
            resourceId: true,
            techPlan: { select: { eventId: true, event: { select: { startDateBE: true } } } },
            resource: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ])

  // ── Build in-memory indexes
  const overlapByChannelDate = new Map<string, typeof overlapCandidates>()
  for (const ev of overlapCandidates) {
    const dayKey = ev.startDateBE.toISOString().slice(0, 10)
    const key = `${ev.channelId}:${dayKey}`
    const arr = overlapByChannelDate.get(key) ?? []
    arr.push(ev)
    overlapByChannelDate.set(key, arr)
  }

  const legacyOverlapByNameDate = new Map<string, typeof legacyOverlapCandidates>()
  for (const ev of legacyOverlapCandidates) {
    if (!ev.linearChannel) continue
    const dayKey = ev.startDateBE.toISOString().slice(0, 10)
    const key = `${ev.linearChannel}:${dayKey}`
    const arr = legacyOverlapByNameDate.get(key) ?? []
    arr.push(ev)
    legacyOverlapByNameDate.set(key, arr)
  }

  const contractsByCompetition = new Map<number, Contract[]>()
  for (const c of contracts) {
    const arr = contractsByCompetition.get(c.competitionId) ?? []
    arr.push(c)
    contractsByCompetition.set(c.competitionId, arr)
  }

  const channelTypesById = new Map<number, string[]>()
  for (const c of channelRecords) channelTypesById.set(c.id, c.types)

  const planEventIds = new Set(techPlans.map(p => p.eventId))

  // For resource conflict: resourceId -> set of eventIds-on-same-day
  const assignmentsByEvent = new Map<number, { resourceId: number; resourceName: string }[]>()
  for (const a of assignments) {
    if (!a.techPlan?.eventId) continue
    const arr = assignmentsByEvent.get(a.techPlan.eventId) ?? []
    arr.push({ resourceId: a.resourceId, resourceName: a.resource.name })
    assignmentsByEvent.set(a.techPlan.eventId, arr)
  }
  // Build: resourceId -> Map<dayKey, Set<eventId>>
  const resourceDayBookings = new Map<number, Map<string, Set<number>>>()
  for (const a of assignments) {
    if (!a.techPlan?.event?.startDateBE || !a.techPlan.eventId) continue
    const dayKey = a.techPlan.event.startDateBE.toISOString().slice(0, 10)
    const byDay = resourceDayBookings.get(a.resourceId) ?? new Map()
    const set = byDay.get(dayKey) ?? new Set()
    set.add(a.techPlan.eventId)
    byDay.set(dayKey, set)
    resourceDayBookings.set(a.resourceId, byDay)
  }

  // ── Run per-draft conflict checks against the pre-loaded indexes
  return draftDays.map(({ draft, day, dayStart, dayEnd }) => {
    const warnings: ConflictWarning[] = []
    const errors: ConflictError[] = []

    // 1. Channel overlap
    const draftMin = timeToMin(draft.startTimeBE)
    const draftDuration = (draft as any).durationMin as number | null | undefined

    const checkOverlap = (ev: { id: number; startTimeBE: string; durationMin: number | null; participants: string | null }, channelLabel?: string) => {
      if (draft.id && ev.id === draft.id) return
      const evMin = timeToMin(ev.startTimeBE)
      const labelPrefix = channelLabel ? `Channel ${channelLabel} already has` : 'Channel already has'
      if (draftDuration && ev.durationMin) {
        const draftEnd = draftMin + draftDuration
        const evEnd = evMin + ev.durationMin
        if (draftMin < evEnd && evMin < draftEnd) {
          warnings.push({
            type: 'channel_overlap',
            message: `${labelPrefix} "${ev.participants ?? 'an event'}" with overlapping time`,
          })
        }
      } else if (Math.abs(evMin - draftMin) < 30) {
        warnings.push({
          type: 'channel_overlap',
          message: `${labelPrefix} "${ev.participants ?? 'an event'}" within 30 min`,
        })
      }
    }

    if (draft.channelId) {
      const candidates = overlapByChannelDate.get(`${draft.channelId}:${day}`) ?? []
      for (const ev of candidates) checkOverlap(ev)
    } else if (draft.linearChannel) {
      const candidates = legacyOverlapByNameDate.get(`${draft.linearChannel}:${day}`) ?? []
      for (const ev of candidates) checkOverlap(ev, draft.linearChannel)
    }

    // 2. Rights
    const relevantContracts = contractsByCompetition.get(draft.competitionId) ?? []
    const applicableContracts = relevantContracts.filter(c => {
      const validFromOk = !c.validFrom || c.validFrom <= dayEnd
      const validUntilOk = !c.validUntil || c.validUntil >= dayStart
      return validFromOk && validUntilOk
    })
    const contextualIds = [draft.channelId, draft.radioChannelId, draft.onDemandChannelId].filter((id): id is number => id != null)
    const channelTypes = [...new Set(contextualIds.flatMap(id => channelTypesById.get(id) ?? []))]
    const startUtc = draft.startDateBE && draft.startTimeBE
      ? new Date(`${draft.startDateBE.slice(0, 10)}T${draft.startTimeBE}:00Z`)
      : null

    const rightsResults = checkRights(
      {
        channelId: draft.channelId ?? contextualIds[0] ?? null,
        channelTypes,
        startUtc,
      },
      applicableContracts,
    )
    for (const r of rightsResults) {
      if (r.severity === 'ERROR') {
        if (r.code === 'NO_VALID_CONTRACT') {
          warnings.push({ type: 'rights_window', message: r.message })
        } else if (r.code === 'TERRITORY_BLOCKED') {
          errors.push({ type: 'territory_blocked', message: r.message })
        } else if (r.code === 'MAX_RUNS_EXCEEDED') {
          errors.push({ type: 'max_runs_exceeded', message: r.message })
        } else {
          errors.push({ type: 'rights_violation', message: r.message })
        }
      } else {
        if (r.code === 'PLATFORM_NOT_COVERED') {
          warnings.push({ type: 'platform_not_covered', message: r.message })
        } else if (r.code === 'CONTRACT_EXPIRING') {
          warnings.push({ type: 'contract_expiring', message: r.message })
        } else {
          warnings.push({ type: 'rights_window', message: r.message })
        }
      }
    }

    // 3. Missing tech plan
    if (draft.id && (draft.status === 'approved' || draft.status === 'published')) {
      if (!planEventIds.has(draft.id)) {
        warnings.push({ type: 'missing_tech_plan', message: 'No tech plan assigned for this event' })
      }
    }

    // 4. Resource double-booking
    if (draft.id) {
      const draftAssignments = assignmentsByEvent.get(draft.id) ?? []
      const seenResourceIds = new Set<number>()
      for (const a of draftAssignments) {
        if (seenResourceIds.has(a.resourceId)) continue
        seenResourceIds.add(a.resourceId)
        const byDay = resourceDayBookings.get(a.resourceId)
        const sameDayBookings = byDay?.get(day)
        if (sameDayBookings && [...sameDayBookings].some(id => id !== draft.id)) {
          warnings.push({
            type: 'resource_conflict',
            message: `Resource "${a.resourceName}" is also assigned to another event on this day`,
          })
        }
      }
    }

    return { id: draft.id, warnings, errors }
  })
}
