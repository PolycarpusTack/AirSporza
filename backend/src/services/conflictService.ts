import { prisma } from '../db/prisma.js'
import type { EventStatus } from '@prisma/client'

export type ConflictWarning = { type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan' | 'resource_conflict'; message: string }
export type ConflictError   = { type: 'encoder_locked' | 'rights_violation'; message: string }

type EventDraft = {
  id?: number
  competitionId: number
  linearChannel?: string
  onDemandChannel?: string
  radioChannel?: string
  startDateBE: string
  startTimeBE: string
  status?: EventStatus
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

  // 1. Channel overlap
  if (draft.linearChannel) {
    const sameDay = await prisma.event.findMany({
      where: {
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

  // 2. Rights window
  const contract = await prisma.contract.findFirst({
    where: {
      competitionId: draft.competitionId,
      status: { in: ['valid', 'expiring'] },
      validFrom: { lte: dayEnd },
      validUntil: { gte: dayStart },
    },
    select: { id: true, linearRights: true, maxRights: true, radioRights: true },
  })
  if (!contract) {
    warnings.push({
      type: 'rights_window',
      message: 'No active contract covers this competition on this date',
    })
  }

  // 3. Missing tech plan (only warn for approved/published events that already exist)
  if (draft.id && (draft.status === 'approved' || draft.status === 'published')) {
    const plan = await prisma.techPlan.findFirst({ where: { eventId: draft.id } })
    if (!plan) {
      warnings.push({ type: 'missing_tech_plan', message: 'No tech plan assigned for this event' })
    }
  }

  // 5. Resource double-booking
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

  // 4. Rights violations (hard errors per channel type)
  if (contract) {
    if (draft.linearChannel && !contract.linearRights) {
      errors.push({ type: 'rights_violation', message: `Contract does not grant linear rights for ${draft.linearChannel}` })
    }
    if (draft.onDemandChannel && !contract.maxRights) {
      errors.push({ type: 'rights_violation', message: `Contract does not grant on-demand rights for ${draft.onDemandChannel}` })
    }
    if (draft.radioChannel && !contract.radioRights) {
      errors.push({ type: 'rights_violation', message: `Contract does not grant radio rights for ${draft.radioChannel}` })
    }
  }

  return { warnings, errors }
}
