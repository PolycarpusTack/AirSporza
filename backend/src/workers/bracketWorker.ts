import { createWorker } from '../services/queue.js'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'
import { setTenantRLS } from '../utils/setTenantRLS.js'

/**
 * Progress knockout brackets after a fixture completes.
 * Checks if the completed event is part of a knockout stage,
 * finds the bracket position, determines winner, and updates
 * the next round's event participants if both sides are resolved.
 */
export const bracketWorker = createWorker(
  'bracket',
  async (job) => {
    const { eventId, _tenantId: tenantId } = job.data
    if (tenantId) await setTenantRLS(tenantId)
    logger.info(`Bracket progression triggered for event=${eventId}`)

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { stage: true },
    })

    if (!event || !event.stageId) {
      logger.warn(`Event ${eventId} has no stage — skipping bracket`)
      return { skipped: true }
    }

    const stage = event.stage!
    if (stage.stageType !== 'KNOCKOUT') {
      logger.info(`Stage ${stage.id} is ${stage.stageType} — not knockout`)
      return { skipped: true }
    }

    const meta = (event.sportMetadata as any) || {}
    const bracketPos = meta.bracket_position as number | undefined
    if (!bracketPos) {
      logger.warn(`Event ${eventId} has no bracket_position — skipping`)
      return { skipped: true }
    }

    // Determine winner
    let advanceWinner = event.winner
    if (!advanceWinner) {
      logger.warn(`Event ${eventId} completed but no winner set`)
      return { skipped: true }
    }

    // Check for two-legged tie
    const tieId = meta.tie_id as string | undefined
    if (tieId) {
      // Find both legs of this tie
      const legs = await prisma.event.findMany({
        where: {
          tenantId,
          stageId: stage.id,
          sportMetadata: { path: ['tie_id'], equals: tieId },
        },
        orderBy: { id: 'asc' },
      })

      const allCompleted = legs.every(l => l.status === 'completed')
      if (!allCompleted) {
        logger.info(`Tie ${tieId}: not all legs completed yet`)
        return { waiting: true, tieId }
      }

      // Compute aggregate
      let homeAgg = 0
      let awayAgg = 0
      for (const leg of legs) {
        const legMeta = (leg.sportMetadata as any) || {}
        homeAgg += (legMeta.home_goals || 0)
        awayAgg += (legMeta.away_goals || 0)
      }

      // Away goals rule or the winner from final leg
      const tieWinner = homeAgg > awayAgg
        ? meta.home_team_name
        : awayAgg > homeAgg
          ? meta.away_team_name
          : advanceWinner // Fallback to the last match winner (penalties/ET)

      logger.info(`Tie ${tieId} resolved: ${tieWinner} (agg ${homeAgg}-${awayAgg})`)
      advanceWinner = tieWinner
    }

    // Find next round event
    // Convention: bracket_position N feeds into bracket_position ceil(N/2) in next round
    const nextBracketPos = Math.ceil(bracketPos / 2)
    const nextRound = await prisma.round.findFirst({
      where: {
        stageId: stage.id,
        roundNumber: { gt: (meta.round_number || 1) },
      },
      orderBy: { roundNumber: 'asc' },
    })

    if (!nextRound) {
      logger.info(`No next round — this was the final`)
      return { final: true, winner: advanceWinner }
    }

    // Find the next round event with matching bracket position
    const nextEvent = await prisma.event.findFirst({
      where: {
        tenantId,
        stageId: stage.id,
        roundId: nextRound.id,
        sportMetadata: { path: ['bracket_position'], equals: nextBracketPos },
      },
    })

    if (!nextEvent) {
      logger.info(`No event found for next bracket position ${nextBracketPos}`)
      return { nextBracketPos, noEvent: true }
    }

    // Update next event: set the winner into the appropriate slot (home or away)
    const isHomeSlot = bracketPos % 2 === 1 // odd positions are home
    const nextMeta = (nextEvent.sportMetadata as any) || {}
    const participantParts = (nextEvent.participants || 'TBD vs TBD').split(' vs ')

    const updatedMeta = {
      ...nextMeta,
      [isHomeSlot ? 'home_team_name' : 'away_team_name']: advanceWinner,
    }
    const updatedParticipants = isHomeSlot
      ? `${advanceWinner} vs ${participantParts[1] || 'TBD'}`
      : `${participantParts[0] || 'TBD'} vs ${advanceWinner}`

    await prisma.event.update({
      where: { id: nextEvent.id },
      data: {
        participants: updatedParticipants,
        sportMetadata: updatedMeta,
      },
    })

    logger.info(`Bracket advanced: ${advanceWinner} → event ${nextEvent.id} (pos ${nextBracketPos})`)
    return { nextEventId: nextEvent.id, winner: advanceWinner, bracketPosition: nextBracketPos }
  },
  { concurrency: 2 }
)
