import { BaseAdapter } from './BaseAdapter.js'
import type { FetchWindow, RawSourceRecord, NormalizedCompetition, NormalizedTeam, CanonicalImportEvent } from '../types.js'

interface FootballDataConfig {
  apiKey: string
  baseUrl: string
}

export class FootballDataAdapter extends BaseAdapter {
  sourceCode = 'football_data' as const
  rateLimitConfig = { requestsPerMinute: 10, requestsPerDay: 500 }
  supportsIncremental = true
  
  private config: FootballDataConfig
  
  constructor(config: FootballDataConfig) {
    super()
    this.config = config
  }
  
  private async request<T>(endpoint: string): Promise<T> {
    return this.fetchWithRetry(async (): Promise<T> => {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        headers: {
          'X-Auth-Token': this.config.apiKey,
        },
      })
      
      if (!response.ok) {
        throw new Error(`Football-data error: ${response.status}`)
      }
      
      return await response.json() as T
    })
  }
  
  async fetchCompetitions(_input: FetchWindow): Promise<RawSourceRecord[]> {
    const data = await this.request<{ competitions: unknown[] }>('/competitions')
    
    return (data.competitions || []).map((comp: unknown) => ({
      id: String((comp as Record<string, unknown>).id),
      type: 'competition' as const,
      raw: comp as Record<string, unknown>,
      fetchedAt: new Date(),
    }))
  }
  
  async fetchFixtures(input: FetchWindow): Promise<RawSourceRecord[]> {
    const params = new URLSearchParams()
    if (input.dateFrom) params.set('dateFrom', input.dateFrom)
    if (input.dateTo) params.set('dateTo', input.dateTo)
    if (input.competitionIds?.length) params.set('competitions', input.competitionIds.join(','))
    
    const data = await this.request<{ matches: unknown[] }>(`/matches?${params}`)
    
    return (data.matches || []).map((match: unknown) => ({
      id: String((match as Record<string, unknown>).id),
      type: 'event' as const,
      raw: match as Record<string, unknown>,
      fetchedAt: new Date(),
      sourceUpdatedAt: new Date((match as Record<string, unknown>).lastUpdated as string),
    }))
  }

  async fetchTeams(input: FetchWindow): Promise<RawSourceRecord[]> {
    const competitionIds = input.competitionIds || []
    const teamMap = new Map<string, RawSourceRecord>()

    for (const competitionId of competitionIds) {
      const data = await this.request<{ teams: unknown[] }>(`/competitions/${competitionId}/teams`)

      for (const team of data.teams || []) {
        const record = team as Record<string, unknown>
        const id = String(record.id)
        if (!id) continue

        teamMap.set(id, {
          id,
          type: 'team',
          raw: {
            ...record,
            competitionSourceId: competitionId,
          },
          fetchedAt: new Date(),
          sourceUpdatedAt: record.lastUpdated ? new Date(String(record.lastUpdated)) : undefined,
        })
      }
    }

    return Array.from(teamMap.values())
  }
  
  normalizeCompetition(raw: RawSourceRecord): NormalizedCompetition | null {
    const data = raw.raw as Record<string, unknown>
    const area = data.area as Record<string, unknown> | undefined
    
    return {
      sourceCode: 'football_data',
      sourceId: raw.id,
      name: data.name as string,
      sport: 'Football',
      country: area?.name as string | undefined,
      season: (data.currentSeason as Record<string, unknown> | undefined)?.startDate as string | undefined,
      logoUrl: data.emblem as string | undefined,
    }
  }

  normalizeTeam(raw: RawSourceRecord): NormalizedTeam | null {
    const data = raw.raw as Record<string, unknown>
    const area = data.area as Record<string, unknown> | undefined

    if (!data.id || !data.name) {
      return null
    }

    return {
      sourceCode: 'football_data',
      sourceId: raw.id,
      name: String(data.name),
      sport: 'Football',
      country: area?.name ? String(area.name) : undefined,
      logoUrl: data.crest ? String(data.crest) : undefined,
    }
  }
  
  normalizeFixture(raw: RawSourceRecord): CanonicalImportEvent | null {
    const data = raw.raw as Record<string, unknown>
    const homeTeam = data.homeTeam as Record<string, unknown>
    const awayTeam = data.awayTeam as Record<string, unknown>
    const competition = data.competition as Record<string, unknown>
    const season = data.season as Record<string, unknown>
    const score = data.score as Record<string, unknown> | undefined
    const fullTime = score?.fullTime as Record<string, unknown> | undefined
    
    const statusMap: Record<string, CanonicalImportEvent['status']> = {
      'SCHEDULED': 'scheduled',
      'LIVE': 'live',
      'IN_PLAY': 'live',
      'PAUSED': 'halftime',
      'FINISHED': 'finished',
      'POSTPONED': 'postponed',
      'CANCELLED': 'cancelled',
    }
    
    return {
      externalKeys: [{ source: 'football_data', id: raw.id }],
      sportName: 'Football',
      competitionName: competition?.name as string,
      seasonLabel: season?.startDate as string | undefined,
      stage: data.stage as string | undefined,
      status: statusMap[data.status as string] || 'scheduled',
      startsAtUtc: data.utcDate as string,
      homeTeam: homeTeam?.name as string,
      awayTeam: awayTeam?.name as string,
      venueName: (data.venue as Record<string, unknown>)?.name as string | undefined,
      scoreHome: fullTime?.home as number | undefined,
      scoreAway: fullTime?.away as number | undefined,
      metadata: { matchday: data.matchday, group: data.group },
    }
  }
  
  getCursor(response: unknown): string | null {
    const data = response as Record<string, unknown>
    if (data.matches && Array.isArray(data.matches)) {
      const lastMatch = data.matches[data.matches.length - 1]
      return lastMatch?.id ? String(lastMatch.id) : null
    }
    return null
  }
}
