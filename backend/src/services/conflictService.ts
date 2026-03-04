import { prisma } from '../db/prisma.js'
import type { EventStatus } from '@prisma/client'

export type ConflictWarning = { type: 'channel_overlap' | 'rights_window' | 'missing_tech_plan'; message: string }
export type ConflictError   = { type: 'encoder_locked'; message: string }

type EventDraft = {
  id?: number
  competitionId: number
  linearChannel?: string
  startDateBE: string
  startTimeBE: string
  status?: EventStatus
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export async function detectConflicts(draft: EventDraft): Promise<{ warnings: ConflictWarning[]; errors: ConflictError[] }> {
  const warnings: ConflictWarning[] = []
  const errors: ConflictError[]     = []

  const dayStart = new Date(draft.startDateBE)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(draft.startDateBE)
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
          message: `Channel ${draft.linearChannel} already has "${ev.participants}" within 30 min`,
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

  // errors: encoder_locked check reserved for Item 5 (Rights-aware Scheduling) when encoderLock model is available
  return { warnings, errors }
}
