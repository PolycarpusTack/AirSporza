import { prisma } from '../db/prisma.js'
import type { EventStatus } from '@prisma/client'
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
      select: { id: true, startTimeBE: true, participants: true },
    })
    const draftMin = timeToMin(draft.startTimeBE)
    for (const ev of sameDay) {
      if (Math.abs(timeToMin(ev.startTimeBE) - draftMin) < 30) {
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
      select: { id: true, startTimeBE: true, participants: true },
    })
    const draftMin = timeToMin(draft.startTimeBE)
    for (const ev of sameDay) {
      if (Math.abs(timeToMin(ev.startTimeBE) - draftMin) < 30) {
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

  // Resolve channel types for rights checking
  const allChannelIds = [draft.channelId, draft.radioChannelId, draft.onDemandChannelId].filter((id): id is number => id != null)
  let channelTypes: string[] = []
  if (allChannelIds.length > 0) {
    const channels = await prisma.channel.findMany({
      where: { id: { in: allChannelIds } },
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
