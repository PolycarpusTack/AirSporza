import type { InboundTemplate } from '../../types.js'

export const apiFootballTemplate: InboundTemplate = {
  code: 'api_football',
  name: 'API-Football',
  description: 'RapidAPI football data (v3)',
  direction: 'INBOUND',
  auth: { scheme: 'api_key_header', headerName: 'x-rapidapi-key' },
  baseUrl: 'https://v3.football.api-sports.io',
  endpoints: {
    competitions: '/leagues',
    fixtures: '/fixtures',
    test: '/status',
  },
  defaultFieldMappings: [
    { sourceField: 'teams.home.name', targetField: 'homeTeam', required: true },
    { sourceField: 'teams.away.name', targetField: 'awayTeam', required: true },
    { sourceField: 'fixture.date', targetField: 'startsAtUtc', transform: 'date_format', transformConfig: { from: 'ISO' } },
    { sourceField: 'league.name', targetField: 'competitionName' },
    { sourceField: 'fixture.venue.name', targetField: 'venueName' },
    {
      sourceField: 'fixture.status.short', targetField: 'status', transform: 'map_value',
      transformConfig: {
        mapping: {
          NS: 'scheduled', '1H': 'live', '2H': 'live', HT: 'halftime',
          FT: 'finished', AET: 'finished', PEN: 'finished',
          PST: 'postponed', CANC: 'cancelled', SUSP: 'suspended',
        },
      },
    },
    { sourceField: 'goals.home', targetField: 'scoreHome' },
    { sourceField: 'goals.away', targetField: 'scoreAway' },
    { sourceField: 'fixture.id', targetField: 'externalId' },
  ],
  sampleResponse: {
    fixture: { id: 868123, date: '2026-03-15T19:45:00+00:00', venue: { name: 'Lotto Park' }, status: { short: 'NS' } },
    league: { name: 'Jupiler Pro League' },
    teams: { home: { name: 'RSC Anderlecht' }, away: { name: 'Club Brugge KV' } },
    goals: { home: null, away: null },
  },
  rateLimitDefaults: { requestsPerMinute: 30, requestsPerDay: 100 },
}
