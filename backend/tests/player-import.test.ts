/**
 * EPIC G (Players): provision-stage upsertPlayer (canonical -> operational
 * Player projection incl. manual-edit protection and PlayerTeam membership
 * derivation) and DeduplicationService player matching (G-4).
 *
 * G review fixes covered here:
 * - F1: name-only fingerprints no longer auto-merge — sport must match and a
 *   birthDate must verify the identity; otherwise the record goes to review.
 * - F3: getSourceTeamIds returns ALL team links (no 50-row truncation).
 * - F7: a sparse second source must not null out canonical fields, and
 *   provenance is only stamped for fields actually applied.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    sport: { findFirst: vi.fn() },
    canonicalPlayer: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    playerAlias: { findFirst: vi.fn(), upsert: vi.fn() },
    importSourceLink: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    fieldProvenance: { findMany: vi.fn(), upsert: vi.fn() },
    importSource: { findMany: vi.fn() },
    player: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    team: { findFirst: vi.fn() },
    playerTeam: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

import { prisma } from '../src/db/prisma.js'
import { upsertPlayer } from '../src/import/stages/provision.js'
import { getSourceTeamIds } from '../src/import/stages/records.js'
import { DeduplicationService } from '../src/import/services/DeduplicationService.js'
import type { NormalizedPlayer } from '../src/import/types.js'

const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const TENANT = '00000000-0000-0000-0000-000000000001'
const SOURCE = 'src-1'
const BIRTH_DATE = new Date('1992-08-24T00:00:00.000Z')

const normalized: NormalizedPlayer = {
  sourceCode: 'the_sports_db',
  sourceId: 'p-100',
  name: 'Hans Vanaken',
  sport: 'Football',
  nationality: 'Belgium',
  position: 'Midfielder',
  birthDate: '1992-08-24',
  photoUrl: 'https://example.com/cutout.png',
  teamSourceId: 't-50',
}

// PlayerAlias rows now carry their canonicalPlayer (G review fix F1 — the
// fingerprint verifies sport + birthDate against the alias's canonical).
function aliasRow(canonical: { id: string; sportId: number; birthDate: Date | null }) {
  return { id: 'a1', canonicalPlayerId: canonical.id, canonicalPlayer: canonical }
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.sport.findFirst.mockResolvedValue({ id: 5, name: 'Football' })
  // dedup: no exact link, no alias fingerprint by default
  mp.importSourceLink.findFirst.mockResolvedValue(null)
  mp.playerAlias.findFirst.mockResolvedValue(null)
  mp.canonicalPlayer.upsert.mockResolvedValue({ id: 'cp-1', primaryName: 'Hans Vanaken' })
  mp.canonicalPlayer.update.mockResolvedValue({ id: 'cp-9', primaryName: 'Hans Vanaken' })
  mp.playerAlias.upsert.mockResolvedValue({})
  mp.importSourceLink.findUnique.mockResolvedValue(null)
  mp.importSourceLink.findMany.mockResolvedValue([])
  mp.importSourceLink.upsert.mockResolvedValue({})
  mp.fieldProvenance.findMany.mockResolvedValue([])
  mp.fieldProvenance.upsert.mockResolvedValue({})
  mp.importSource.findMany.mockResolvedValue([])
  mp.player.findFirst.mockResolvedValue(null)
  mp.player.create.mockResolvedValue({ id: 11 })
  mp.player.update.mockResolvedValue({ id: 11 })
  mp.team.findFirst.mockResolvedValue(null)
  mp.playerTeam.findFirst.mockResolvedValue(null)
  mp.playerTeam.create.mockResolvedValue({})
})

describe('upsertPlayer — fresh import', () => {
  it('creates canonical + alias + source link + operational player and reports created', async () => {
    const result = await upsertPlayer(SOURCE, TENANT, normalized)

    expect(result).toEqual({ kind: 'created' })
    expect(mp.canonicalPlayer.upsert).toHaveBeenCalledTimes(1)
    const canonicalArgs = mp.canonicalPlayer.upsert.mock.calls[0][0]
    expect(canonicalArgs.where).toEqual({ sportId_primaryName: { sportId: 5, primaryName: 'Hans Vanaken' } })
    expect(canonicalArgs.create.countryCode).toBe('Belgium')

    expect(mp.playerAlias.upsert).toHaveBeenCalledTimes(1)
    expect(mp.playerAlias.upsert.mock.calls[0][0].create.normalizedAlias).toBe('hans vanaken')

    const linkArgs = mp.importSourceLink.upsert.mock.calls[0][0]
    expect(linkArgs.create.entityType).toBe('player')
    expect(linkArgs.create.entityId).toBe('cp-1')

    const playerData = mp.player.create.mock.calls[0][0].data
    expect(playerData).toMatchObject({
      tenantId: TENANT,
      sportId: 5,
      canonicalPlayerId: 'cp-1',
      fullName: 'Hans Vanaken',
      countryCode: 'Belgium',
      position: 'Midfielder',
      isManaged: false,
      externalRefs: { the_sports_db: 'p-100' },
    })
    expect(playerData.birthDate).toEqual(BIRTH_DATE)
    expect(playerData.notes).toBeUndefined()
  })

  it('reports updated when a source link already exists', async () => {
    mp.importSourceLink.findUnique.mockImplementation(async (args: { where: { sourceId_sourceRecordId_entityType: { entityType: string } } }) =>
      args.where.sourceId_sourceRecordId_entityType.entityType === 'player' ? { id: 'l1', entityId: 'cp-1' } : null
    )
    const result = await upsertPlayer(SOURCE, TENANT, normalized)
    expect(result).toEqual({ kind: 'updated' })
  })

  it('throws when the sport is unknown (record dead-letters upstream)', async () => {
    mp.sport.findFirst.mockResolvedValue(null)
    await expect(upsertPlayer(SOURCE, TENANT, normalized)).rejects.toThrow("Sport 'Football' not found.")
  })
})

describe('upsertPlayer — manual-edit protection', () => {
  it('managed player: refreshes only the canonical link and missing photo; identity and notes survive', async () => {
    mp.player.findFirst.mockResolvedValueOnce({
      id: 11,
      isManaged: true,
      fullName: 'Hans V. (edited)',
      notes: 'Protected editorial remark',
      photoUrl: 'https://manual.example/photo.png',
    })

    await upsertPlayer(SOURCE, TENANT, normalized)

    expect(mp.player.create).not.toHaveBeenCalled()
    const updateData = mp.player.update.mock.calls[0][0].data
    expect(updateData).toEqual({
      canonicalPlayerId: 'cp-1',
      photoUrl: 'https://manual.example/photo.png',
    })
    expect(updateData.fullName).toBeUndefined()
    expect(updateData.notes).toBeUndefined()
  })

  it('unmanaged player: applies imported fields but never touches notes', async () => {
    mp.player.findFirst.mockResolvedValueOnce({
      id: 11,
      isManaged: false,
      fullName: 'Hans Vanaken',
      notes: 'Keep me',
      photoUrl: null,
    })

    await upsertPlayer(SOURCE, TENANT, normalized)

    const updateData = mp.player.update.mock.calls[0][0].data
    expect(updateData.fullName).toBe('Hans Vanaken')
    expect(updateData.position).toBe('Midfielder')
    expect(updateData.photoUrl).toBe('https://example.com/cutout.png')
    expect(updateData.notes).toBeUndefined()
  })
})

describe('upsertPlayer — PlayerTeam membership derivation', () => {
  it('links the player to the operational team resolved via the team source link', async () => {
    mp.importSourceLink.findUnique.mockImplementation(async (args: { where: { sourceId_sourceRecordId_entityType: { entityType: string } } }) =>
      args.where.sourceId_sourceRecordId_entityType.entityType === 'team' ? { id: 'l2', entityId: 'ct-1' } : null
    )
    mp.team.findFirst.mockResolvedValue({ id: 7 })

    await upsertPlayer(SOURCE, TENANT, normalized)

    expect(mp.team.findFirst).toHaveBeenCalledWith({ where: { tenantId: TENANT, canonicalTeamId: 'ct-1' } })
    // isCurrent: true is load-bearing — the roster read path filters on it (F6).
    expect(mp.playerTeam.create).toHaveBeenCalledWith({
      data: { tenantId: TENANT, playerId: 11, teamId: 7, seasonId: null, isCurrent: true, source: 'the_sports_db' },
    })
  })

  it('is idempotent: an existing membership is not duplicated', async () => {
    mp.importSourceLink.findUnique.mockImplementation(async (args: { where: { sourceId_sourceRecordId_entityType: { entityType: string } } }) =>
      args.where.sourceId_sourceRecordId_entityType.entityType === 'team' ? { id: 'l2', entityId: 'ct-1' } : null
    )
    mp.team.findFirst.mockResolvedValue({ id: 7 })
    mp.playerTeam.findFirst.mockResolvedValue({ id: 99 })

    await upsertPlayer(SOURCE, TENANT, normalized)

    expect(mp.playerTeam.create).not.toHaveBeenCalled()
  })

  it('skips membership silently when the team is not imported yet', async () => {
    await upsertPlayer(SOURCE, TENANT, normalized)
    expect(mp.playerTeam.create).not.toHaveBeenCalled()
  })
})

describe('upsertPlayer — dedup integration (G review fix F1)', () => {
  it('merges (updated) when a second source matches name + sport + birthDate', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-9', sportId: 5, birthDate: BIRTH_DATE }))
    mp.canonicalPlayer.findUnique.mockResolvedValue({ id: 'cp-9', primaryName: 'Hans Vanaken' })

    const result = await upsertPlayer(SOURCE, TENANT, normalized)

    expect(result).toEqual({ kind: 'updated' })
    expect(mp.canonicalPlayer.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cp-9' } }))
    expect(mp.canonicalPlayer.upsert).not.toHaveBeenCalled()
    expect(mp.importSourceLink.upsert.mock.calls[0][0].create.entityId).toBe('cp-9')
  })

  it('same name + different sport: returns review and writes NOTHING', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-9', sportId: 6, birthDate: BIRTH_DATE }))

    const result = await upsertPlayer(SOURCE, TENANT, normalized)

    expect(result).toEqual({
      kind: 'review',
      suggestedEntityId: 'cp-9',
      confidence: 60,
      reasonCodes: ['player_name_fingerprint_unverified'],
    })
    expect(mp.canonicalPlayer.update).not.toHaveBeenCalled()
    expect(mp.canonicalPlayer.upsert).not.toHaveBeenCalled()
    expect(mp.playerAlias.upsert).not.toHaveBeenCalled()
    expect(mp.importSourceLink.upsert).not.toHaveBeenCalled()
    expect(mp.player.create).not.toHaveBeenCalled()
    expect(mp.player.update).not.toHaveBeenCalled()
    expect(mp.fieldProvenance.upsert).not.toHaveBeenCalled()
  })

  it('same name + same sport + different birthDate: returns review, nothing overwritten', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-9', sportId: 5, birthDate: new Date('1990-01-01T00:00:00.000Z') }))

    const result = await upsertPlayer(SOURCE, TENANT, normalized)

    expect(result).toMatchObject({ kind: 'review', suggestedEntityId: 'cp-9', confidence: 60 })
    expect(mp.canonicalPlayer.update).not.toHaveBeenCalled()
    expect(mp.canonicalPlayer.upsert).not.toHaveBeenCalled()
  })

  it('same name + same sport + missing birthDate: returns review (no verification possible)', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-9', sportId: 5, birthDate: null }))

    const result = await upsertPlayer(SOURCE, TENANT, normalized)

    expect(result).toMatchObject({ kind: 'review', suggestedEntityId: 'cp-9' })
    expect(mp.canonicalPlayer.update).not.toHaveBeenCalled()
  })

  it('falls back to the (sport, name) upsert when the matched canonical no longer exists', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-gone', sportId: 5, birthDate: BIRTH_DATE }))
    mp.canonicalPlayer.findUnique.mockResolvedValue(null)

    await upsertPlayer(SOURCE, TENANT, normalized)

    expect(mp.canonicalPlayer.update).not.toHaveBeenCalled()
    expect(mp.canonicalPlayer.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('upsertPlayer — sparse second source (G review fix F7)', () => {
  const sparse: NormalizedPlayer = {
    sourceCode: 'the_sports_db',
    sourceId: 'p-100',
    name: 'Hans Vanaken',
    sport: 'Football',
    // no nationality, no birthDate, no photoUrl
  }

  it('exact-link re-import without birthDate/photo keeps the canonical values (no nulling)', async () => {
    mp.importSourceLink.findFirst.mockResolvedValue({ entityId: 'cp-9' }) // exact source-link match
    mp.canonicalPlayer.findUnique.mockResolvedValue({ id: 'cp-9', primaryName: 'Hans Vanaken' })

    await upsertPlayer(SOURCE, TENANT, sparse)

    const updateArgs = mp.canonicalPlayer.update.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 'cp-9' })
    // Only the primary source pointer moves — null incoming values are omitted.
    expect(updateArgs.data).toEqual({ primarySourceId: SOURCE })
    expect('countryCode' in updateArgs.data).toBe(false)
    expect('birthDate' in updateArgs.data).toBe(false)
    expect('photoUrl' in updateArgs.data).toBe(false)

    // Provenance only stamps fields actually applied — none of the three here.
    const canonicalProvenance = mp.fieldProvenance.upsert.mock.calls
      .map((call) => call[0])
      .filter((args) => args.create.entityId === 'cp-9')
    expect(canonicalProvenance).toHaveLength(0)
  })

  it('verified merge applies only the non-null incoming fields and stamps only those', async () => {
    const withBirthDateOnly: NormalizedPlayer = { ...sparse, birthDate: '1992-08-24' }
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-9', sportId: 5, birthDate: BIRTH_DATE }))
    mp.canonicalPlayer.findUnique.mockResolvedValue({ id: 'cp-9', primaryName: 'Hans Vanaken' })

    await upsertPlayer(SOURCE, TENANT, withBirthDateOnly)

    const updateArgs = mp.canonicalPlayer.update.mock.calls[0][0]
    expect(updateArgs.data).toEqual({ primarySourceId: SOURCE, birthDate: BIRTH_DATE })

    const canonicalProvenanceFields = mp.fieldProvenance.upsert.mock.calls
      .map((call) => call[0])
      .filter((args) => args.create.entityId === 'cp-9')
      .map((args) => args.create.fieldName)
    expect(canonicalProvenanceFields).toEqual(['birthDate'])
  })

  it('the fresh-canonical CREATE path keeps the current full-field behavior', async () => {
    await upsertPlayer(SOURCE, TENANT, sparse)

    const upsertArgs = mp.canonicalPlayer.upsert.mock.calls[0][0]
    expect(upsertArgs.create).toMatchObject({ countryCode: null, birthDate: null, photoUrl: null })
  })
})

describe('DeduplicationService.findPlayerMatch (G-4, G review fix F1)', () => {
  const service = new DeduplicationService()

  it('returns the exact source-link match first (still an auto-merge)', async () => {
    mp.importSourceLink.findFirst.mockResolvedValue({ entityId: 'cp-1' })

    const result = await service.findPlayerMatch(SOURCE, 'p-100', 'hans vanaken', TENANT, 5, BIRTH_DATE)

    expect(result).toMatchObject({ matched: true, entityId: 'cp-1', confidence: 100, method: 'exact' })
    expect(mp.playerAlias.findFirst).not.toHaveBeenCalled()
  })

  it('auto-merges the alias fingerprint only when sport AND birthDate verify the identity', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-2', sportId: 5, birthDate: BIRTH_DATE }))

    const result = await service.findPlayerMatch(SOURCE, 'p-100', 'hans vanaken', TENANT, 5, BIRTH_DATE)

    expect(mp.playerAlias.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, normalizedAlias: 'hans vanaken' },
      include: { canonicalPlayer: true },
    })
    expect(result).toMatchObject({
      matched: true,
      entityId: 'cp-2',
      confidence: 95,
      method: 'fingerprint',
      reasonCodes: ['player_name_birthdate_fingerprint'],
    })
  })

  it('compares birthDates as UTC calendar dates (time-of-day noise ignored)', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-2', sportId: 5, birthDate: new Date('1992-08-24T10:30:00.000Z') }))

    const result = await service.findPlayerMatch(SOURCE, 'p-100', 'hans vanaken', TENANT, 5, BIRTH_DATE)

    expect(result).toMatchObject({ matched: true, confidence: 95 })
  })

  it('demotes a name-only fingerprint (missing birthDate) to an unverified suggestion', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-2', sportId: 5, birthDate: null }))

    const result = await service.findPlayerMatch(SOURCE, 'p-100', 'hans vanaken', TENANT, 5, BIRTH_DATE)

    expect(result).toMatchObject({
      matched: false,
      entityId: 'cp-2',
      confidence: 60,
      method: 'fingerprint',
      reasonCodes: ['player_name_fingerprint_unverified'],
    })
  })

  it('demotes a name match in a DIFFERENT sport even when birthDates agree', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-2', sportId: 9, birthDate: BIRTH_DATE }))

    const result = await service.findPlayerMatch(SOURCE, 'p-100', 'hans vanaken', TENANT, 5, BIRTH_DATE)

    expect(result).toMatchObject({ matched: false, entityId: 'cp-2', confidence: 60 })
  })

  it('demotes a conflicting birthDate to an unverified suggestion', async () => {
    mp.playerAlias.findFirst.mockResolvedValue(aliasRow({ id: 'cp-2', sportId: 5, birthDate: new Date('1990-01-01T00:00:00.000Z') }))

    const result = await service.findPlayerMatch(SOURCE, 'p-100', 'hans vanaken', TENANT, 5, BIRTH_DATE)

    expect(result).toMatchObject({ matched: false, entityId: 'cp-2', confidence: 60 })
  })

  it('returns null when nothing matches (caller creates a fresh canonical)', async () => {
    const result = await service.findPlayerMatch(SOURCE, 'p-100', 'hans vanaken', TENANT, 5, BIRTH_DATE)
    expect(result).toBeNull()
  })
})

describe('records stage — getSourceTeamIds (G review fix F3)', () => {
  it('returns ALL team links for the source, tenant-scoped, with no 50-row cap', async () => {
    mp.importSourceLink.findMany.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({ sourceRecordId: `t-${i}` }))
    )

    const ids = await getSourceTeamIds(SOURCE, TENANT)

    expect(ids).toHaveLength(60)
    expect(ids[59]).toBe('t-59')
    const args = mp.importSourceLink.findMany.mock.calls[0][0]
    expect(args.take).toBeUndefined()
    expect(args.where).toEqual({ tenantId: TENANT, sourceId: SOURCE, entityType: 'team' })
  })
})
