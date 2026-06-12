const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const buildWindowUsage = (
  limit: number | null,
  used: number,
  resetAt: Date | null
) => ({
  limit,
  used,
  remaining: limit == null ? null : Math.max(limit - used, 0),
  resetAt,
})

export const buildRateLimitStatus = (source: {
  rateLimitPerMinute: number | null
  rateLimitPerDay: number | null
  rateLimits?: {
    requestsThisMinute: number
    requestsThisDay: number
    minuteWindowStart: Date
    dayWindowStart: Date
    lastRequestAt: Date | null
  } | null
}) => {
  const now = Date.now()
  const state = source.rateLimits
  const minuteWindowActive = state ? now - state.minuteWindowStart.getTime() < MINUTE_MS : false
  const dayWindowActive = state ? now - state.dayWindowStart.getTime() < DAY_MS : false
  const minuteUsed = state && minuteWindowActive ? state.requestsThisMinute : 0
  const dayUsed = state && dayWindowActive ? state.requestsThisDay : 0

  return {
    minute: buildWindowUsage(
      source.rateLimitPerMinute,
      minuteUsed,
      source.rateLimitPerMinute == null
        ? null
        : new Date((state?.minuteWindowStart.getTime() ?? now) + MINUTE_MS)
    ),
    day: buildWindowUsage(
      source.rateLimitPerDay,
      dayUsed,
      source.rateLimitPerDay == null
        ? null
        : new Date((state?.dayWindowStart.getTime() ?? now) + DAY_MS)
    ),
    lastRequestAt: state?.lastRequestAt ?? null,
  }
}
