import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiFootballAdapter } from '../src/import/adapters/ApiFootballAdapter.js'
import { TheSportsDbAdapter } from '../src/import/adapters/TheSportsDbAdapter.js'
import { createImportAdapter, getImportSourceRuntimeStatus } from '../src/import/adapters/index.js'

describe('Import adapters', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('creates the api_football adapter from source config', () => {
    const adapter = createImportAdapter({
      code: 'api_football',
      configJson: {
        api_key: 'test-key',
        base_url: 'https://example.test',
        host: 'example.test',
      },
    })

    expect(adapter).toBeInstanceOf(ApiFootballAdapter)
  })

  it('reports missing config for football_data clearly', () => {
    const status = getImportSourceRuntimeStatus({
      code: 'football_data',
      kind: 'api',
      configJson: {},
    })

    expect(status.configStatus.status).toBe('missing_config')
    expect(status.configStatus.missingConfig).toContain('api_key')
    expect(status.configStatus.canExecute).toBe(false)
  })

  it('creates the the_sports_db adapter from source config', () => {
    const adapter = createImportAdapter({
      code: 'the_sports_db',
      configJson: {
        api_key: '123',
        base_url: 'https://example.test',
      },
    })

    expect(adapter).toBeInstanceOf(TheSportsDbAdapter)
  })

  it('throws a clear error when creating football_data without required config', () => {
    expect(() =>
      createImportAdapter({
        code: 'football_data',
        configJson: {},
      })
    ).toThrow(/missing required configuration: api_key/i)
  })

  it('normalizes an api_football fixture into the canonical event shape', () => {
    const adapter = new ApiFootballAdapter({
      apiKey: 'test',
      baseUrl: 'https://example.test',
      host: 'example.test',
    })

    const result = adapter.normalizeFixture({
      id: '99',
      type: 'event',
      fetchedAt: new Date(),
      raw: {
        fixture: {
          id: 99,
          date: '2026-03-03T19:45:00+00:00',
          timezone: 'UTC',
          venue: { name: 'Jan Breydel' },
          status: { short: '1H', long: 'First Half', elapsed: 34 },
        },
        league: {
          id: 1,
          name: 'Jupiler Pro League',
          country: 'Belgium',
          season: 2026,
          round: 'Regular Season - 28',
        },
        teams: {
          home: { name: 'Club Brugge', winner: false },
          away: { name: 'Anderlecht', winner: false },
        },
        goals: {
          home: 1,
          away: 0,
        },
        score: {
          fulltime: {
            home: 1,
            away: 0,
          },
        },
      },
    })

    expect(result).toMatchObject({
      sportName: 'Football',
      competitionName: 'Jupiler Pro League',
      status: 'live',
      homeTeam: 'Club Brugge',
      awayTeam: 'Anderlecht',
      scoreHome: 1,
      scoreAway: 0,
      minute: 34,
    })
  })

  it('normalizes a the_sports_db event into the canonical event shape', () => {
    const adapter = new TheSportsDbAdapter({
      apiKey: '123',
      baseUrl: 'https://example.test',
    })

    const result = adapter.normalizeFixture({
      id: '100',
      type: 'event',
      fetchedAt: new Date(),
      raw: {
        idEvent: '100',
        strSport: 'Soccer',
        strLeague: 'Jupiler Pro League',
        strEvent: 'Club Brugge vs Anderlecht',
        strHomeTeam: 'Club Brugge',
        strAwayTeam: 'Anderlecht',
        dateEvent: '2026-03-03',
        strTime: '19:45:00',
        strStatus: 'NS',
        strVenue: 'Jan Breydel',
        intHomeScore: null,
        intAwayScore: null,
      },
    })

    expect(result).toMatchObject({
      sportName: 'Football',
      competitionName: 'Jupiler Pro League',
      status: 'scheduled',
      homeTeam: 'Club Brugge',
      awayTeam: 'Anderlecht',
      venueName: 'Jan Breydel',
    })
  })

  it('fetches api_football competitions with RapidAPI headers', async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockJsonResponse({
      response: [
        {
          league: { id: 101, name: 'Jupiler Pro League', logo: 'https://img.test/jpl.png' },
          country: { name: 'Belgium' },
          seasons: [
            { year: 2025, current: false },
            { year: 2026, current: true },
          ],
        },
      ],
    }))

    const adapter = new ApiFootballAdapter({
      apiKey: 'rapid-key',
      baseUrl: 'https://api-football.test',
      host: 'api-football.test',
    })

    const records = await adapter.fetchCompetitions({})

    expect(global.fetch).toHaveBeenCalledWith('https://api-football.test/leagues', {
      headers: {
        'x-rapidapi-key': 'rapid-key',
        'x-rapidapi-host': 'api-football.test',
      },
    })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: '101',
      type: 'competition',
      raw: {
        currentSeason: { year: 2026, current: true },
      },
    })
  })

  it('fetches api_football live updates and maps fixture timestamps', async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockJsonResponse({
      response: [
        {
          fixture: {
            id: 555,
            timestamp: 1772567100,
          },
        },
      ],
    }))

    const adapter = new ApiFootballAdapter({
      apiKey: 'rapid-key',
      baseUrl: 'https://api-football.test',
      host: 'api-football.test',
    })

    const records = await adapter.fetchLiveUpdates!({})

    expect(global.fetch).toHaveBeenCalledWith('https://api-football.test/fixtures?live=all', {
      headers: {
        'x-rapidapi-key': 'rapid-key',
        'x-rapidapi-host': 'api-football.test',
      },
    })
    expect(records[0].id).toBe('555')
    expect(records[0].sourceUpdatedAt?.toISOString()).toBe('2026-03-03T00:25:00.000Z')
  })

  it('fetches football_data teams across requested competitions', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockJsonResponse({
        teams: [
          { id: 1, name: 'Club Brugge', area: { name: 'Belgium' }, crest: 'crest-1' },
        ],
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        teams: [
          { id: 2, name: 'Anderlecht', area: { name: 'Belgium' }, crest: 'crest-2' },
        ],
      }))

    const adapter = createImportAdapter({
      code: 'football_data',
      configJson: {
        api_key: 'fd-key',
        base_url: 'https://football-data.test',
      },
    })

    const records = await adapter.fetchTeams!({
      competitionIds: ['2001', '2013'],
    })

    expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://football-data.test/competitions/2001/teams', {
      headers: { 'X-Auth-Token': 'fd-key' },
    })
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://football-data.test/competitions/2013/teams', {
      headers: { 'X-Auth-Token': 'fd-key' },
    })
    expect(records.map(record => record.id)).toEqual(['1', '2'])
  })

  it('fetches the_sports_db competitions through the configured API key path', async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockJsonResponse({
      leagues: [
        {
          idLeague: '4328',
          strLeague: 'English Premier League',
          strSport: 'Soccer',
        },
      ],
    }))

    const adapter = new TheSportsDbAdapter({
      apiKey: '123',
      baseUrl: 'https://sportsdb.test',
    })

    const records = await adapter.fetchCompetitions({})

    expect(global.fetch).toHaveBeenCalledWith('https://sportsdb.test/123/all_leagues.php')
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: '4328',
      type: 'competition',
    })
  })

  it('fetches the_sports_db events for each day in the requested window', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(mockJsonResponse({
        events: [
          {
            idEvent: '100',
            updated: '2026-03-03T09:00:00Z',
          },
        ],
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        events: [
          {
            idEvent: '101',
            updated: '2026-03-04T09:00:00Z',
          },
        ],
      }))

    const adapter = new TheSportsDbAdapter({
      apiKey: '123',
      baseUrl: 'https://sportsdb.test',
    })

    const records = await adapter.fetchFixtures({
      dateFrom: '2026-03-03',
      dateTo: '2026-03-04',
    })

    expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://sportsdb.test/123/eventsday.php?d=2026-03-03')
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://sportsdb.test/123/eventsday.php?d=2026-03-04')
    expect(records.map(record => record.id)).toEqual(['100', '101'])
    expect(records[1].sourceUpdatedAt?.toISOString()).toBe('2026-03-04T09:00:00.000Z')
  })
})

function mockJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response
}
