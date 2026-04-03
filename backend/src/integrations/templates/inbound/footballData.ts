import type { InboundTemplate } from '../../types.js'

export const footballDataTemplate: InboundTemplate = {
  code: 'football_data',
  name: 'football-data.org',
  description: 'Free football data API (v4)',
  direction: 'INBOUND',
  auth: { scheme: 'api_key_header', headerName: 'X-Auth-Token' },
  baseUrl: 'https://api.football-data.org/v4',
  endpoints: {
    competitions: '/competitions',
    fixtures: '/matches',
    test: '/competitions?limit=1',
  },
  defaultFieldMappings: [
    { sourceField: 'homeTeam.name', targetField: 'homeTeam', required: true },
    { sourceField: 'awayTeam.name', targetField: 'awayTeam', required: true },
    { sourceField: 'utcDate', targetField: 'startsAtUtc', transform: 'date_format', transformConfig: { from: 'ISO' } },
    { sourceField: 'competition.name', targetField: 'competitionName' },
    { sourceField: 'venue', targetField: 'venueName' },
    {
      sourceField: 'status', targetField: 'status', transform: 'map_value',
      transformConfig: {
        mapping: {
          SCHEDULED: 'scheduled', LIVE: 'live', IN_PLAY: 'live',
          PAUSED: 'halftime', FINISHED: 'finished',
          POSTPONED: 'postponed', CANCELLED: 'cancelled',
        },
      },
    },
    { sourceField: 'score.fullTime.home', targetField: 'scoreHome' },
    { sourceField: 'score.fullTime.away', targetField: 'scoreAway' },
    { sourceField: 'id', targetField: 'externalId' },
  ],
  sampleResponse: {
    id: 436247, homeTeam: { name: 'RSC Anderlecht' },
    awayTeam: { name: 'Club Brugge KV' },
    utcDate: '2026-03-15T19:45:00Z',
    competition: { name: 'Jupiler Pro League' },
    status: 'SCHEDULED', venue: 'Lotto Park',
    score: { fullTime: { home: null, away: null } },
  },
  rateLimitDefaults: { requestsPerMinute: 10, requestsPerDay: 500 },
}
