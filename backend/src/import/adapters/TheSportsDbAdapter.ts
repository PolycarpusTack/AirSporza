import { BaseAdapter } from './BaseAdapter.js'
import type { FetchWindow, RawSourceRecord, NormalizedCompetition, CanonicalImportEvent } from '../types.js'

interface TheSportsDbConfig {
  apiKey: string
  baseUrl: string
}

type SportsDbEnvelope<T> = {
  leagues?: T[]
  events?: T[]
}

const SPORT_NAME_MAP: Record<string, string> = {
  Soccer: 'Football',
  Tennis: 'Tennis',
  Cycling: 'Cycling',
  Athletics: 'Athletics',
  Swimming: 'Swimming',
  Motorsport: 'Formula 1',
  'Formula 1': 'Formula 1',
}

export class TheSportsDbAdapter extends BaseAdapter {
  sourceCode = 'the_sports_db' as const
  rateLimitConfig = { requestsPerMinute: 30, requestsPerDay: 5000 }
  supportsIncremental = true

  private config: TheSportsDbConfig

  constructor(config: TheSportsDbConfig) {
    super()
    this.config = config
  }

  private async request<T>(endpoint: string): Promise<SportsDbEnvelope<T>> {
    return this.fetchWithRetry(async () => {
      const response = await fetch(`${this.config.baseUrl}/${this.config.apiKey}/${endpoint}`)
      if (!response.ok) {
        throw new Error(`TheSportsDB error: ${response.status}`)
      }
      return await response.json() as SportsDbEnvelope<T>
    })
  }

  async fetchCompetitions(_input: FetchWindow): Promise<RawSourceRecord[]> {
    const data = await this.request<Record<string, unknown>>('all_leagues.php')
    return (data.leagues || []).map((league) => ({
      id: String(league.idLeague),
      type: 'competition' as const,
      raw: league,
      fetchedAt: new Date(),
    }))
  }

  async fetchFixtures(input: FetchWindow): Promise<RawSourceRecord[]> {
    const dates = enumerateDates(input.dateFrom, input.dateTo)
    const records: RawSourceRecord[] = []

    for (const date of dates) {
      const data = await this.request<Record<string, unknown>>(`eventsday.php?d=${date}`)
      for (const event of data.events || []) {
        records.push({
          id: String(event.idEvent),
          type: 'event',
          raw: event,
          fetchedAt: new Date(),
          sourceUpdatedAt: event.updated ? new Date(String(event.updated)) : undefined,
        })
      }
    }

    return records
  }

  normalizeCompetition(raw: RawSourceRecord): NormalizedCompetition | null {
    const data = raw.raw as Record<string, unknown>
    const sport = mapSportName(data.strSport)
    if (!data.idLeague || !data.strLeague || !sport) {
      return null
    }

    return {
      sourceCode: 'the_sports_db',
      sourceId: String(data.idLeague),
      name: String(data.strLeague),
      sport,
      country: data.strCountry ? String(data.strCountry) : undefined,
      season: data.strCurrentSeason ? String(data.strCurrentSeason) : undefined,
      logoUrl: data.strBadge ? String(data.strBadge) : undefined,
    }
  }

  normalizeFixture(raw: RawSourceRecord): CanonicalImportEvent | null {
    const data = raw.raw as Record<string, unknown>
    const sport = mapSportName(data.strSport)
    const startsAtUtc = toIsoDateTime(data.dateEvent, data.strTime)

    if (!data.idEvent || !sport || !data.strLeague || !startsAtUtc) {
      return null
    }

    const homeTeam = data.strHomeTeam ? String(data.strHomeTeam) : undefined
    const awayTeam = data.strAwayTeam ? String(data.strAwayTeam) : undefined
    const participantsText = data.strEvent ? String(data.strEvent) : undefined

    return {
      externalKeys: [{ source: 'the_sports_db', id: String(data.idEvent) }],
      sportName: sport,
      competitionName: String(data.strLeague),
      seasonLabel: data.strSeason ? String(data.strSeason) : undefined,
      stage: data.strRound ? String(data.strRound) : undefined,
      status: mapEventStatus(data.strStatus),
      startsAtUtc,
      sourceTimezone: data.strTimezone ? String(data.strTimezone) : undefined,
      homeTeam,
      awayTeam,
      participantsText,
      venueName: data.strVenue ? String(data.strVenue) : undefined,
      country: data.strCountry ? String(data.strCountry) : undefined,
      scoreHome: toNumber(data.intHomeScore),
      scoreAway: toNumber(data.intAwayScore),
      winner: data.strResult ? String(data.strResult) : undefined,
      metadata: {
        filename: data.strFilename || null,
        eventAlternate: data.strEventAlternate || null,
      },
    }
  }
}

function mapSportName(value: unknown) {
  if (!value) return null
  const normalized = SPORT_NAME_MAP[String(value)]
  return normalized || null
}

function mapEventStatus(value: unknown): CanonicalImportEvent['status'] {
  const status = String(value || '').toUpperCase()
  if (['FT', 'AOT'].includes(status)) return 'finished'
  if (['HT'].includes(status)) return 'halftime'
  if (['CANC', 'ABD'].includes(status)) return 'cancelled'
  if (['PST', 'POST'].includes(status)) return 'postponed'
  if (status && !['NS'].includes(status)) return 'live'
  return 'scheduled'
}

function toIsoDateTime(date: unknown, time: unknown) {
  if (!date || !time) return null
  const timeValue = String(time).slice(0, 5)
  return `${String(date)}T${timeValue}:00Z`
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

function enumerateDates(dateFrom?: string, dateTo?: string) {
  const start = new Date(dateFrom || new Date().toISOString().slice(0, 10))
  const end = new Date(dateTo || dateFrom || new Date().toISOString().slice(0, 10))
  const dates: string[] = []

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [new Date().toISOString().slice(0, 10)]
  }

  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}
