import type { SourceCode } from './types.js'

export type SupportedImportScope = 'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'

export type SourceCapabilities = {
  hasAdapter: boolean
  supportedScopes: SupportedImportScope[]
  note?: string
}

const SOURCE_CAPABILITIES: Record<SourceCode, SourceCapabilities> = {
  football_data: {
    hasAdapter: true,
    supportedScopes: ['competitions', 'teams', 'fixtures'],
    note: 'Football competitions, teams, and fixtures',
  },
  api_football: {
    hasAdapter: true,
    supportedScopes: ['competitions', 'fixtures', 'live'],
    note: 'Football competitions, fixtures, and live updates',
  },
  the_sports_db: {
    hasAdapter: true,
    supportedScopes: ['competitions', 'events'],
    note: 'Multi-sport competition and event ingest',
  },
  statsbomb_open: {
    hasAdapter: false,
    supportedScopes: ['events'],
    note: 'File-based enrichment adapter not implemented yet',
  },
}

export function getSourceCapabilities(sourceCode: SourceCode): SourceCapabilities {
  return SOURCE_CAPABILITIES[sourceCode]
}
