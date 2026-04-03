import type { InboundTemplate } from '../../types.js'

export const theSportsDbTemplate: InboundTemplate = {
  code: 'the_sports_db',
  name: 'TheSportsDB',
  description: 'Free open-source sports data API',
  direction: 'INBOUND',
  auth: { scheme: 'api_key_query', queryParam: 'api_key' },
  baseUrl: 'https://www.thesportsdb.com/api/v1/json',
  endpoints: {
    competitions: '/all_leagues.php',
    fixtures: '/eventsround.php',
    test: '/all_sports.php',
  },
  defaultFieldMappings: [
    { sourceField: 'strHomeTeam', targetField: 'homeTeam', required: true },
    { sourceField: 'strAwayTeam', targetField: 'awayTeam', required: true },
    {
      sourceField: 'participants', targetField: 'participants', transform: 'string_concat',
      transformConfig: { fields: ['strHomeTeam', 'strAwayTeam'], separator: ' vs ' },
    },
    { sourceField: 'dateEvent', targetField: 'startsAtUtc', transform: 'date_format', transformConfig: { from: 'ISO' } },
    { sourceField: 'strLeague', targetField: 'competitionName' },
    { sourceField: 'strVenue', targetField: 'venueName' },
    { sourceField: 'intHomeScore', targetField: 'scoreHome' },
    { sourceField: 'intAwayScore', targetField: 'scoreAway' },
    { sourceField: 'idEvent', targetField: 'externalId' },
  ],
  sampleResponse: {
    idEvent: '1032723', strHomeTeam: 'RSC Anderlecht', strAwayTeam: 'Club Brugge KV',
    dateEvent: '2026-03-15', strLeague: 'Jupiler Pro League',
    strVenue: 'Lotto Park', intHomeScore: null, intAwayScore: null,
  },
  rateLimitDefaults: { requestsPerMinute: 5, requestsPerDay: 500 },
}
