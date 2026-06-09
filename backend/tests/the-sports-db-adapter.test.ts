import { describe, it, expect, vi, afterEach } from 'vitest'
import { TheSportsDbAdapter } from '../src/import/adapters/TheSportsDbAdapter.js'
import type { RawSourceRecord } from '../src/import/types.js'

const adapter = new TheSportsDbAdapter({ apiKey: 'test', baseUrl: 'https://x/api/v1/json' })

function teamRecord(raw: Record<string, unknown>): RawSourceRecord {
  return { id: String(raw.idTeam ?? 'x'), type: 'team', raw, fetchedAt: new Date() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TheSportsDbAdapter.normalizeTeam', () => {
  it('maps a soccer team to a NormalizedTeam (Soccer -> Football)', () => {
    const result = adapter.normalizeTeam(teamRecord({
      idTeam: '133612',
      strTeam: 'Club Brugge KV',
      strSport: 'Soccer',
      strCountry: 'Belgium',
      strBadge: 'https://example.com/badge.png',
    }))
    expect(result).not.toBeNull()
    expect(result!.sourceCode).toBe('the_sports_db')
    expect(result!.sourceId).toBe('133612')
    expect(result!.name).toBe('Club Brugge KV')
    expect(result!.sport).toBe('Football')
    expect(result!.country).toBe('Belgium')
    expect(result!.logoUrl).toBe('https://example.com/badge.png')
  })

  it('returns null when the sport is not in the supported map', () => {
    const result = adapter.normalizeTeam(teamRecord({
      idTeam: '1', strTeam: 'Some Club', strSport: 'Darts',
    }))
    expect(result).toBeNull()
  })

  it('returns null when required identity fields are missing', () => {
    expect(adapter.normalizeTeam(teamRecord({ strSport: 'Soccer' }))).toBeNull()
  })
})

describe('TheSportsDbAdapter.fetchTeams', () => {
  it('queries lookup_all_teams per competition id and parses the teams envelope', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ teams: [{ idTeam: '1', strTeam: 'A', strSport: 'Soccer' }, { idTeam: '2', strTeam: 'B', strSport: 'Soccer' }] }),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    const records = await adapter.fetchTeams({ competitionIds: ['4328'] })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ id: '1', type: 'team' })
    const calledUrl = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('lookup_all_teams.php?id=4328')
  })

  it('returns an empty list when no competition ids are supplied', async () => {
    const records = await adapter.fetchTeams({ competitionIds: [] })
    expect(records).toEqual([])
  })
})
