import type { InboundTemplate } from '../../types.js'

export const genericRestTemplate: InboundTemplate = {
  code: 'generic_rest',
  name: 'Generic REST API',
  description: 'Connect to any REST API with custom field mapping',
  direction: 'INBOUND',
  auth: { scheme: 'bearer' },
  baseUrl: '',
  endpoints: {
    test: '/',
  },
  defaultFieldMappings: [
    { sourceField: 'home', targetField: 'homeTeam' },
    { sourceField: 'away', targetField: 'awayTeam' },
    { sourceField: 'date', targetField: 'startsAtUtc', transform: 'date_format', transformConfig: { from: 'ISO' } },
    { sourceField: 'competition', targetField: 'competitionName' },
    { sourceField: 'venue', targetField: 'venueName' },
    { sourceField: 'status', targetField: 'status' },
    { sourceField: 'id', targetField: 'externalId' },
  ],
}
