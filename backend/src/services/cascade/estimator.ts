/**
 * Pluggable duration estimator interface.
 * V1 uses sport-specific heuristics; future versions
 * can use ML models or historical data.
 */
export interface DurationEstimator {
  /** Lower-bound duration estimate in minutes (used for earliest cascade bound). */
  shortDuration(event: CascadeEvent): number
  /** Upper-bound duration estimate in minutes (used for latest cascade bound). */
  longDuration(event: CascadeEvent): number
  /**
   * Return shortMin/longMin plus an inputsUsed trail explaining which
   * branch drove the result. For live events, pass `context.elapsedMin`
   * and the returned bounds represent REMAINING time, not total. This
   * replaces the older standalone {@link DurationEstimator.remainingDuration}
   * by folding live-adjustment into the primary estimate call.
   */
  estimate(event: CascadeEvent, context?: EstimatorContext): DurationEstimate
}

export interface CascadeEvent {
  id: number
  sportMetadata: Record<string, unknown>
  sport?: { name: string } | null
  phase?: string | null
  status?: string
  actualStartUtc?: Date | string | null
  actualEndUtc?: Date | string | null
  startDateBE: Date | string
  durationMin?: number | null
}

export interface EstimatorContext {
  /** Minutes elapsed since the match actually started (for status='live'). */
  elapsedMin?: number
}

export interface DurationEstimate {
  shortMin: number
  longMin: number
  /** Provenance record persisted to CascadeEstimate.inputsUsed. */
  inputsUsed: Record<string, unknown>
}

/** V1: simple heuristics based on sport and metadata, with durationMin override */
export const heuristicEstimator: DurationEstimator = {
  shortDuration(event: CascadeEvent): number {
    // If event has an explicit duration, use it with 10% under padding
    if (event.durationMin != null) return Math.round(event.durationMin * 0.9)

    const meta = (event.sportMetadata || {}) as Record<string, unknown>
    const sport = (event.sport?.name ?? '').toLowerCase()

    if (sport === 'tennis' || sport.includes('tennis')) {
      return meta.match_format === 'BEST_OF_5' ? 105 : 65
    }
    if (sport === 'cycling' || sport.includes('cycling')) {
      const km = Number(meta.distance_km) || 150
      const speed = meta.stage_profile === 'mountain' ? 40 : 45
      return Math.round((km / speed) * 60)
    }
    if (sport === 'formula 1' || sport.includes('f1')) {
      const laps = Number(meta.circuit_laps) || 60
      return Math.round((laps * 85) / 60)
    }
    if (sport.includes('athletics')) {
      // Athletics sessions are multi-discipline. Finals run longer.
      const phase = (event.phase ?? '').toLowerCase()
      return phase.includes('final') ? 180 : 120
    }
    if (sport.includes('swimming')) {
      const phase = (event.phase ?? '').toLowerCase()
      return phase.includes('final') ? 90 : 60
    }
    // Default: football
    return 95
  },

  longDuration(event: CascadeEvent): number {
    // If event has an explicit duration, use it with 20% over padding
    if (event.durationMin != null) return Math.round(event.durationMin * 1.2)

    const meta = (event.sportMetadata || {}) as Record<string, unknown>
    const sport = (event.sport?.name ?? '').toLowerCase()

    if (sport === 'tennis' || sport.includes('tennis')) {
      return meta.match_format === 'BEST_OF_5' ? 330 : 210
    }
    if (sport === 'cycling' || sport.includes('cycling')) {
      const km = Number(meta.distance_km) || 150
      const speed = meta.stage_profile === 'mountain' ? 32 : 36
      return Math.round((km / speed) * 60)
    }
    if (sport === 'formula 1' || sport.includes('f1')) {
      const laps = Number(meta.circuit_laps) || 60
      return Math.round((laps * 105) / 60)
    }
    if (sport.includes('athletics')) {
      const phase = (event.phase ?? '').toLowerCase()
      return phase.includes('final') ? 300 : 180
    }
    if (sport.includes('swimming')) {
      const phase = (event.phase ?? '').toLowerCase()
      return phase.includes('final') ? 150 : 90
    }
    // Default: football with ET + penalties
    return 140
  },

  estimate(event: CascadeEvent, context?: EstimatorContext): DurationEstimate {
    const baseShort = this.shortDuration(event)
    const baseLong = this.longDuration(event)
    const sport = (event.sport?.name ?? '').toLowerCase() || 'default'

    // Provenance — the code path that produced these numbers. Written to
    // CascadeEstimate.inputsUsed so operators can explain estimates after the
    // fact without replaying the estimator.
    const inputsUsed: Record<string, unknown> =
      event.durationMin != null
        ? { source: 'override:durationMin', durationMin: event.durationMin }
        : { source: `heuristic:${sport}` }

    if (event.durationMin == null) {
      const meta = (event.sportMetadata || {}) as Record<string, unknown>
      // Mirror the fields each sport branch actually reads so the inputsUsed
      // record is self-documenting.
      if (sport.includes('tennis')) inputsUsed.match_format = meta.match_format ?? null
      if (sport.includes('cycling')) {
        inputsUsed.distance_km = meta.distance_km ?? null
        inputsUsed.stage_profile = meta.stage_profile ?? null
      }
      if (sport.includes('f1')) inputsUsed.circuit_laps = meta.circuit_laps ?? null
      if (sport.includes('athletics') || sport.includes('swimming')) {
        inputsUsed.phase = event.phase ?? null
      }
    }

    const elapsed = context?.elapsedMin ?? 0
    if (elapsed > 0) {
      // Live-remaining: decay both bounds by elapsed minutes. Clamp to zero
      // to avoid negative durations when a match runs past longMin.
      inputsUsed.live_remaining = true
      inputsUsed.elapsed_min = Math.round(elapsed)
      return {
        shortMin: Math.max(0, baseShort - Math.round(elapsed)),
        longMin: Math.max(0, baseLong - Math.round(elapsed)),
        inputsUsed,
      }
    }

    return { shortMin: baseShort, longMin: baseLong, inputsUsed }
  },
}
