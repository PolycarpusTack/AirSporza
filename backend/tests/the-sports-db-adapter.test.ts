import { describe, it, expect, vi, afterEach } from 'vitest'
import { TheSportsDbAdapter } from '../src/import/adapters/TheSportsDbAdapter.js'
import type { RawSourceRecord } from '../src/import/types.js'

const adapter = new TheSportsDbAdapter({ apiKey: 'test', baseUrl: 'https://x/api/v1/json' })

function teamRecord(raw: Record<string, unknown>): RawSourceRecord {
  return { id: String(raw.idTeam ?? 'x'), type: 'team', raw, fetchedAt: new Date() }
}

function playerRecord(raw: Record<string, unknown>): RawSourceRecord {
  return { id: String(raw.idPlayer ?? 'x'), type: 'player', raw, fetchedAt: new Date() }
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

describe('TheSportsDbAdapter.normalizePlayer', () => {
  it('maps a soccer player to a NormalizedPlayer (Soccer -> Football)', () => {
    const result = adapter.normalizePlayer(playerRecord({
      idPlayer: '34145937',
      idTeam: '133612',
      strPlayer: 'Hans Vanaken',
      strSport: 'Soccer',
      strNationality: 'Belgium',
      strPosition: 'Midfielder',
      dateBorn: '1992-08-24',
      strThumb: 'https://example.com/thumb.png',
      strCutout: 'https://example.com/cutout.png',
    }))
    expect(result).not.toBeNull()
    expect(result!.sourceCode).toBe('the_sports_db')
    expect(result!.sourceId).toBe('34145937')
    expect(result!.name).toBe('Hans Vanaken')
    expect(result!.sport).toBe('Football')
    expect(result!.nationality).toBe('Belgium')
    expect(result!.position).toBe('Midfielder')
    expect(result!.birthDate).toBe('1992-08-24')
    expect(result!.photoUrl).toBe('https://example.com/cutout.png')
    expect(result!.teamSourceId).toBe('133612')
  })

  it('falls back to strThumb when no cutout exists and tolerates missing optionals', () => {
    const result = adapter.normalizePlayer(playerRecord({
      idPlayer: '1', strPlayer: 'A Player', strSport: 'Tennis', strThumb: 'https://example.com/t.png',
    }))
    expect(result).not.toBeNull()
    expect(result!.photoUrl).toBe('https://example.com/t.png')
    expect(result!.position).toBeUndefined()
    expect(result!.birthDate).toBeUndefined()
    expect(result!.teamSourceId).toBeUndefined()
  })

  it('drops malformed birth dates instead of failing', () => {
    const result = adapter.normalizePlayer(playerRecord({
      idPlayer: '1', strPlayer: 'A Player', strSport: 'Soccer', dateBorn: 'unknown',
    }))
    expect(result!.birthDate).toBeUndefined()
  })

  it('returns null when the sport is not in the supported map', () => {
    expect(adapter.normalizePlayer(playerRecord({
      idPlayer: '1', strPlayer: 'Darts Person', strSport: 'Darts',
    }))).toBeNull()
  })

  it('returns null when required identity fields are missing', () => {
    expect(adapter.normalizePlayer(playerRecord({ strSport: 'Soccer' }))).toBeNull()
  })
})

describe('TheSportsDbAdapter.fetchPlayers', () => {
  it('queries lookup_all_players per team id and parses the player envelope', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ player: [{ idPlayer: '10', strPlayer: 'A', strSport: 'Soccer' }, { idPlayer: '11', strPlayer: 'B', strSport: 'Soccer' }] }),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    const records = await adapter.fetchPlayers({ teamIds: ['133612'] })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ id: '10', type: 'player' })
    const calledUrl = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('lookup_all_players.php?id=133612')
  })

  it('returns an empty list when no team ids are supplied', async () => {
    const records = await adapter.fetchPlayers({ teamIds: [] })
    expect(records).toEqual([])
  })
})
