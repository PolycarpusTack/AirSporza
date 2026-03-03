import { BaseAdapter } from './BaseAdapter.js'
import type { FetchWindow, RawSourceRecord, NormalizedCompetition, CanonicalImportEvent } from '../types.js'

interface ApiFootballConfig {
  apiKey: string
  baseUrl: string
  host: string
}

type ApiFootballEnvelope<T> = {
  response?: T[]
  errors?: Record<string, unknown> | unknown[]
}

export class ApiFootballAdapter extends BaseAdapter {
  sourceCode = 'api_football' as const
  rateLimitConfig = { requestsPerMinute: 30, requestsPerDay: 100 }
  supportsIncremental = true

  private config: ApiFootballConfig

  constructor(config: ApiFootballConfig) {
    super()
    this.config = config
  }

  private async request<T>(endpoint: string): Promise<T[]> {
    return this.fetchWithRetry(async (): Promise<T[]> => {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        headers: {
          'x-rapidapi-key': this.config.apiKey,
          'x-rapidapi-host': this.config.host,
        },
      })

      if (!response.ok) {
        throw new Error(`API-Football error: ${response.status}`)
      }

      const data = await response.json() as ApiFootballEnvelope<T>
      if (data.errors && Object.keys(data.errors).length > 0) {
        throw new Error(`API-Football response error: ${JSON.stringify(data.errors)}`)
      }

      return data.response || []
    })
  }

  async fetchCompetitions(_input: FetchWindow): Promise<RawSourceRecord[]> {
    const leagues = await this.request<Record<string, unknown>>('/leagues')

    return leagues.map((entry) => {
      const league = (entry.league || {}) as Record<string, unknown>
      const seasons = Array.isArray(entry.seasons) ? entry.seasons : []
      const currentSeason = seasons.find(
        (season) => (season as Record<string, unknown>).current === true
      ) as Record<string, unknown> | undefined

      return {
        id: String(league.id),
        type: 'competition' as const,
        raw: {
          ...entry,
          currentSeason,
        },
        fetchedAt: new Date(),
      }
    })
  }

  async fetchFixtures(input: FetchWindow): Promise<RawSourceRecord[]> {
    const params = new URLSearchParams()
    if (input.dateFrom) params.set('from', input.dateFrom)
    if (input.dateTo) params.set('to', input.dateTo)
    if (input.competitionIds?.length) {
      params.set('league', input.competitionIds[0])
    }

    const fixtures = await this.request<Record<string, unknown>>(`/fixtures?${params.toString()}`)
    return fixtures.map(this.toFixtureRecord)
  }

  async fetchLiveUpdates(_input: FetchWindow): Promise<RawSourceRecord[]> {
    const fixtures = await this.request<Record<string, unknown>>('/fixtures?live=all')
    return fixtures.map(this.toFixtureRecord)
  }

  normalizeCompetition(raw: RawSourceRecord): NormalizedCompetition | null {
    const data = raw.raw as Record<string, unknown>
    const league = (data.league || {}) as Record<string, unknown>
    const country = (data.country || {}) as Record<string, unknown>
    const currentSeason = (data.currentSeason || {}) as Record<string, unknown>

    if (!league.id || !league.name) {
      return null
    }

    return {
      sourceCode: 'api_football',
      sourceId: String(league.id),
      name: String(league.name),
      sport: 'Football',
      country: country.name ? String(country.name) : undefined,
      season: currentSeason.year ? String(currentSeason.year) : undefined,
      logoUrl: league.logo ? String(league.logo) : undefined,
    }
  }

  normalizeFixture(raw: RawSourceRecord): CanonicalImportEvent | null {
    const data = raw.raw as Record<string, unknown>
    const fixture = (data.fixture || {}) as Record<string, unknown>
    const league = (data.league || {}) as Record<string, unknown>
    const teams = (data.teams || {}) as Record<string, unknown>
    const goals = (data.goals || {}) as Record<string, unknown>
    const score = (data.score || {}) as Record<string, unknown>
    const status = (fixture.status || {}) as Record<string, unknown>
    const home = (teams.home || {}) as Record<string, unknown>
    const away = (teams.away || {}) as Record<string, unknown>
    const fulltime = (score.fulltime || {}) as Record<string, unknown>

    if (!fixture.id || !fixture.date || !league.name) {
      return null
    }

    const short = String(status.short || '')
    const statusLabel = mapStatus(short, Boolean(status.elapsed))

    return {
      externalKeys: [{ source: 'api_football', id: String(fixture.id) }],
      sportName: 'Football',
      competitionName: String(league.name),
      seasonLabel: league.season ? String(league.season) : undefined,
      stage: league.round ? String(league.round) : undefined,
      status: statusLabel,
      startsAtUtc: String(fixture.date),
      sourceTimezone: fixture.timezone ? String(fixture.timezone) : undefined,
      homeTeam: home.name ? String(home.name) : undefined,
      awayTeam: away.name ? String(away.name) : undefined,
      venueName: (fixture.venue as Record<string, unknown> | undefined)?.name
        ? String((fixture.venue as Record<string, unknown>).name)
        : undefined,
      country: league.country ? String(league.country) : undefined,
      scoreHome: toOptionalNumber(goals.home, fulltime.home),
      scoreAway: toOptionalNumber(goals.away, fulltime.away),
      winner: resolveWinner(home, away),
      minute: status.elapsed ? Number(status.elapsed) : undefined,
      metadata: {
        referee: fixture.referee || null,
        leagueId: league.id || null,
        leagueRound: league.round || null,
        statusLong: status.long || null,
      },
    }
  }

  private toFixtureRecord = (fixtureEntry: Record<string, unknown>): RawSourceRecord => {
    const fixture = (fixtureEntry.fixture || {}) as Record<string, unknown>
    const update = fixture.timestamp
      ? new Date(Number(fixture.timestamp) * 1000)
      : undefined

    return {
      id: String(fixture.id),
      type: 'event',
      raw: fixtureEntry,
      fetchedAt: new Date(),
      sourceUpdatedAt: update,
    }
  }
}

function mapStatus(short: string, hasElapsed: boolean): CanonicalImportEvent['status'] {
  if (['1H', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'live'
  if (['HT'].includes(short)) return 'halftime'
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished'
  if (['PST', 'SUSP', 'INT'].includes(short)) return 'postponed'
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(short)) return 'cancelled'
  return hasElapsed ? 'live' : 'scheduled'
}

function toOptionalNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number') return value
  }
  return undefined
}

function resolveWinner(home: Record<string, unknown>, away: Record<string, unknown>) {
  if (home.winner === true && home.name) return String(home.name)
  if (away.winner === true && away.name) return String(away.name)
  return undefined
}
