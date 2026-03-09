/**
 * Pluggable duration estimator interface.
 * V1 uses sport-specific heuristics; future versions
 * can use ML models or historical data.
 */
export interface DurationEstimator {
  shortDuration(event: CascadeEvent): number  // minutes
  longDuration(event: CascadeEvent): number   // minutes
  remainingDuration(event: CascadeEvent, liveScore: LiveScore | null): number
}

export interface CascadeEvent {
  id: number
  sportMetadata: Record<string, any>
  sport?: { name: string } | null
  status?: string
  actualStartUtc?: Date | string | null
  actualEndUtc?: Date | string | null
  startDateBE: Date | string
}

export interface LiveScore {
  elapsedMin?: number
  sets?: number
  period?: string
}

/** V1: simple heuristics based on sport and metadata */
export const heuristicEstimator: DurationEstimator = {
  shortDuration(event: CascadeEvent): number {
    const meta = event.sportMetadata || {}
    const sport = (event.sport?.name ?? '').toLowerCase()

    if (sport === 'tennis' || sport.includes('tennis')) {
      return meta.match_format === 'BEST_OF_5' ? 105 : 65
    }
    if (sport === 'cycling' || sport.includes('cycling')) {
      const km = meta.distance_km || 150
      const speed = meta.stage_profile === 'mountain' ? 40 : 45
      return Math.round((km / speed) * 60)
    }
    if (sport === 'formula 1' || sport.includes('f1')) {
      const laps = meta.circuit_laps || 60
      return Math.round((laps * 85) / 60)
    }
    // Default: football
    return 95
  },

  longDuration(event: CascadeEvent): number {
    const meta = event.sportMetadata || {}
    const sport = (event.sport?.name ?? '').toLowerCase()

    if (sport === 'tennis' || sport.includes('tennis')) {
      return meta.match_format === 'BEST_OF_5' ? 330 : 210
    }
    if (sport === 'cycling' || sport.includes('cycling')) {
      const km = meta.distance_km || 150
      const speed = meta.stage_profile === 'mountain' ? 32 : 36
      return Math.round((km / speed) * 60)
    }
    if (sport === 'formula 1' || sport.includes('f1')) {
      const laps = meta.circuit_laps || 60
      return Math.round((laps * 105) / 60)
    }
    // Default: football with ET + penalties
    return 140
  },

  remainingDuration(event: CascadeEvent, liveScore: LiveScore | null): number {
    const elapsed = liveScore?.elapsedMin || 0
    const total = (this.shortDuration(event) + this.longDuration(event)) / 2
    return Math.max(0, total - elapsed)
  },
}
