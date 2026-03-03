export type SourceCode = 'football_data' | 'the_sports_db' | 'api_football' | 'statsbomb_open'

export type EntityType = 'sport' | 'competition' | 'team' | 'venue' | 'event'

export type ImportJobMode = 'full' | 'incremental' | 'backfill'

export type ImportJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'partial'

export type MatchMethod = 'exact' | 'fingerprint' | 'fuzzy' | 'manual'

export interface FetchWindow {
  cursor?: string
  dateFrom?: string
  dateTo?: string
  competitionIds?: string[]
  limit?: number
}

export interface RawSourceRecord {
  id: string
  type: EntityType
  raw: Record<string, unknown>
  fetchedAt: Date
  sourceUpdatedAt?: Date
}

export interface NormalizedCompetition {
  sourceCode: SourceCode
  sourceId: string
  name: string
  sport: string
  country?: string
  season?: string
  logoUrl?: string
}

export interface NormalizedTeam {
  sourceCode: SourceCode
  sourceId: string
  name: string
  sport: string
  country?: string
  logoUrl?: string
}

export interface CanonicalImportEvent {
  externalKeys: Array<{ source: SourceCode; id: string }>
  sportName: string
  competitionName: string
  seasonLabel?: string
  stage?: string
  status: 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'cancelled'
  startsAtUtc: string
  sourceTimezone?: string
  homeTeam?: string
  awayTeam?: string
  participantsText?: string
  venueName?: string
  country?: string
  scoreHome?: number
  scoreAway?: number
  winner?: string
  minute?: number
  metadata: Record<string, unknown>
}

export interface MatchResult {
  matched: boolean
  entityId?: string
  confidence: number
  method: MatchMethod
  reasonCodes: string[]
}

export const THRESHOLDS = {
  SAME_SOURCE_UPDATE: 70,
  CROSS_SOURCE_MATCH: 95,
  FUZZY_REVIEW: 75,
}

export const PROTECTED_FIELDS = [
  'linearChannel',
  'radioChannel',
  'linearStartTime',
  'livestreamDate',
  'livestreamTime',
  'customFields',
  'createdById',
]

export const FIELD_SOURCE_PRIORITY: Record<string, SourceCode[]> = {
  status: ['api_football', 'football_data', 'the_sports_db'],
  scoreHome: ['api_football', 'football_data'],
  scoreAway: ['api_football', 'football_data'],
  minute: ['api_football'],
  winner: ['api_football', 'football_data'],
  competitionName: ['football_data', 'the_sports_db'],
  venueName: ['the_sports_db', 'api_football', 'football_data'],
}
