import { EventStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { writeOutboxEvent } from '../services/outbox.js'
import type { InboundAdapter } from './base.js'
import { logger } from '../utils/logger.js'

export const liveScoreAdapter: InboundAdapter = {
  name: 'live-score',

  async processWebhook(payload: any, tenantId: string) {
    const { matchId, status, score, minute } = payload

    // Resolve external ID to internal event
    const event = await prisma.event.findFirst({
      where: { tenantId, externalRefs: { path: ['matchId'], equals: matchId } },
    })
    if (!event) {
      logger.warn(`Live score: no event found for matchId=${matchId}, tenant=${tenantId}`)
      return
    }

    // Update event and write outbox event in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: event.id },
        data: {
          sportMetadata: {
            ...(event.sportMetadata as any),
            live_score: score,
            live_minute: minute,
          },
          status: mapStatus(status) as EventStatus,
        },
      })

      await writeOutboxEvent(tx, {
        tenantId,
        eventType: status === 'COMPLETED' ? 'fixture.completed' : 'match.score_updated',
        aggregateType: 'Event',
        aggregateId: event.id.toString(),
        payload: { eventId: event.id, score, minute, status },
      })
    })

    logger.info(`Live score processed: event=${event.id}, status=${status}, score=${JSON.stringify(score)}`)
  },
}

function mapStatus(ext: string): string {
  const map: Record<string, string> = {
    NOT_STARTED: 'ready',
    IN_PROGRESS: 'live',
    HALF_TIME: 'live',
    EXTRA_TIME: 'live',
    PENALTIES: 'live',
    COMPLETED: 'completed',
    POSTPONED: 'cancelled',
  }
  return map[ext] || 'draft'
}
