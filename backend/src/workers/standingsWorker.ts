import { createWorker } from '../services/queue.js'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

interface StandingsRow {
  teamId: number
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

/**
 * Recompute league/group standings after a fixture completes.
 * Reads all completed events in the stage, computes W/D/L/GD/Pts,
 * and writes the standings array back to Stage.sportMetadata.standings.
 */
export const standingsWorker = createWorker(
  'standings',
  async (job) => {
    const { eventId, _tenantId: tenantId } = job.data
    logger.info(`Standings recompute triggered for event=${eventId}`)

    // Find the event and its stage
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { stage: true },
    })

    if (!event || !event.stageId) {
      logger.warn(`Event ${eventId} has no stage — skipping standings`)
      return { skipped: true }
    }

    const stage = event.stage!
    if (stage.stageType !== 'LEAGUE' && stage.stageType !== 'GROUP') {
      logger.info(`Stage ${stage.id} is ${stage.stageType} — not a standings stage`)
      return { skipped: true }
    }

    // Get all completed events in this stage
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        stageId: stage.id,
        status: 'completed',
      },
    })

    // Build standings from results
    const teamMap = new Map<number, StandingsRow>()

    for (const ev of events) {
      const meta = (ev.sportMetadata as any) || {}
      const homeId = meta.home_team_id as number | undefined
      const awayId = meta.away_team_id as number | undefined
      const homeGoals = meta.home_goals as number | undefined
      const awayGoals = meta.away_goals as number | undefined

      if (!homeId || !awayId || homeGoals === undefined || awayGoals === undefined) continue

      if (!teamMap.has(homeId)) {
        teamMap.set(homeId, {
          teamId: homeId,
          teamName: meta.home_team_name || `Team ${homeId}`,
          played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        })
      }
      if (!teamMap.has(awayId)) {
        teamMap.set(awayId, {
          teamId: awayId,
          teamName: meta.away_team_name || `Team ${awayId}`,
          played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        })
      }

      const home = teamMap.get(homeId)!
      const away = teamMap.get(awayId)!

      home.played++
      away.played++
      home.goalsFor += homeGoals
      home.goalsAgainst += awayGoals
      away.goalsFor += awayGoals
      away.goalsAgainst += homeGoals

      if (homeGoals > awayGoals) {
        home.won++
        home.points += 3
        away.lost++
      } else if (homeGoals < awayGoals) {
        away.won++
        away.points += 3
        home.lost++
      } else {
        home.drawn++
        away.drawn++
        home.points += 1
        away.points += 1
      }
    }

    // Sort: points desc, GD desc, GF desc
    const standings = Array.from(teamMap.values())
      .map(t => ({ ...t, goalDifference: t.goalsFor - t.goalsAgainst }))
      .sort((a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor
      )

    // Write back to stage
    const existingMeta = (stage.sportMetadata as any) || {}
    await prisma.stage.update({
      where: { id: stage.id },
      data: {
        sportMetadata: { ...existingMeta, standings },
      },
    })

    logger.info(`Standings updated for stage=${stage.id}: ${standings.length} teams`)
    return { stageId: stage.id, teamCount: standings.length }
  },
  { concurrency: 2 }
)
