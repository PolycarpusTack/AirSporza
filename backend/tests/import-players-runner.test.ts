/**
 * G review fix F5: importPlayers must propagate the status of the auto-run
 * teams backfill. A 'partial' backfill means dead-lettered teams whose squads
 * were never fetched — the players job must finish 'partial' with a message
 * saying the team backfill was partial, not report a clean 'completed'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    importJob: { update: vi.fn().mockResolvedValue({}) },
    importSource: { update: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('../src/utils/setTenantRLS.js', () => ({
  setTenantRLS: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/import/services/ImportSchemaService.js', () => ({
  ensureImportSchemaReady: vi.fn().mockResolvedValue(undefined),
  normalizeImportSchemaError: (e: unknown) => e,
}))

vi.mock('../src/import/services/ImportRateLimitService.js', () => ({
  acquireRateLimitSlot: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/import/adapters/index.js', () => ({
  createImportAdapter: vi.fn(),
}))

vi.mock('../src/import/stages/shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/import/stages/shared.js')>()
  return { ...actual, loadJob: vi.fn() }
})

vi.mock('../src/import/stages/progress.js', () => ({
  createProgressController: vi.fn(),
}))

vi.mock('../src/import/stages/failure.js', () => ({
  handleJobFailure: vi.fn().mockResolvedValue(undefined),
  writeSyncHistory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/import/stages/records.js', () => ({
  getSourceTeamIds: vi.fn(),
  getSourceCompetitionIds: vi.fn(),
  upsertImportRecord: vi.fn(),
  writeDeadLetter: vi.fn(),
}))

vi.mock('../src/import/stages/process.js', () => ({
  processCompetitionRecord: vi.fn(),
  processTeamRecord: vi.fn(),
  processPlayerRecord: vi.fn(),
  processEventRecord: vi.fn(),
}))

import { prisma } from '../src/db/prisma.js'
import { runImportJob } from '../src/import/services/ImportJobRunner.js'
import { createImportAdapter } from '../src/import/adapters/index.js'
import { loadJob } from '../src/import/stages/shared.js'
import { createProgressController } from '../src/import/stages/progress.js'
import { writeSyncHistory } from '../src/import/stages/failure.js'
import { getSourceCompetitionIds, getSourceTeamIds } from '../src/import/stages/records.js'
import { processPlayerRecord, processTeamRecord } from '../src/import/stages/process.js'

const mockedLoadJob = vi.mocked(loadJob)
const mockedCreateAdapter = vi.mocked(createImportAdapter)
const mockedProgress = vi.mocked(createProgressController)
const mockedTeamIds = vi.mocked(getSourceTeamIds)
const mockedCompetitionIds = vi.mocked(getSourceCompetitionIds)
const mockedProcessTeam = vi.mocked(processTeamRecord)
const mockedProcessPlayer = vi.mocked(processPlayerRecord)
const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const job = {
  id: 'job-1',
  tenantId: '00000000-0000-0000-0000-000000000001',
  sourceId: 'src-1',
  entityScope: 'players',
  statsJson: {},
  startedAt: null,
  source: { id: 'src-1', code: 'the_sports_db', rateLimitPerMinute: null, rateLimitPerDay: null },
}

const rawTeam = { id: 't-raw', type: 'team' as const, raw: {}, fetchedAt: new Date() }
const rawPlayer = { id: 'p-raw', type: 'player' as const, raw: {}, fetchedAt: new Date() }

function fakeAdapter() {
  return {
    setThrottle: vi.fn(),
    rateLimitConfig: {},
    fetchCompetitions: vi.fn(async () => []),
    fetchTeams: vi.fn(async () => [rawTeam]),
    fetchPlayers: vi.fn(async () => [rawPlayer]),
    fetchFixtures: vi.fn(async () => []),
    normalizeCompetition: vi.fn(),
    normalizeTeam: vi.fn(),
    normalizePlayer: vi.fn(),
    normalizeFixture: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mp.importJob.update.mockResolvedValue({})
  mp.importSource.update.mockResolvedValue({})
  mockedLoadJob.mockResolvedValue(job as never)
  mockedCreateAdapter.mockReturnValue(fakeAdapter() as never)
  mockedProgress.mockReturnValue({
    checkCancelled: vi.fn().mockResolvedValue(undefined),
    increment: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn(() => ({})),
  } as never)
  // No team links yet -> backfill runs; afterwards one team link exists.
  mockedTeamIds.mockResolvedValueOnce([]).mockResolvedValueOnce(['t-1'])
  mockedCompetitionIds.mockResolvedValue(['c-1'])
  mockedProcessPlayer.mockResolvedValue('completed')
})

function finalJobUpdate() {
  const calls = mp.importJob.update.mock.calls
  return calls[calls.length - 1][0]
}

describe('importPlayers — teams-backfill status propagation (G review fix F5)', () => {
  it('finishes partial when the auto-run teams backfill is partial, mentioning the backfill', async () => {
    mockedProcessTeam.mockResolvedValue('partial') // dead-lettered team -> squad never fetched

    await runImportJob('job-1')

    const final = finalJobUpdate()
    expect(final.data.status).toBe('partial')
    expect(final.data.errorLog).toContain('Team backfill was partial')
    expect(vi.mocked(writeSyncHistory)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      expect.anything(),
      'partial',
      expect.stringContaining('Team backfill was partial')
    )
  })

  it('still reports both problems when player records also skip', async () => {
    mockedProcessTeam.mockResolvedValue('partial')
    mockedProcessPlayer.mockResolvedValue('partial')

    await runImportJob('job-1')

    const final = finalJobUpdate()
    expect(final.data.status).toBe('partial')
    expect(final.data.errorLog).toContain('Team backfill was partial')
    expect(final.data.errorLog).toContain('Some player records could not be processed.')
  })

  it('finishes completed when the backfill and all player records succeed', async () => {
    mockedProcessTeam.mockResolvedValue('completed')

    await runImportJob('job-1')

    const final = finalJobUpdate()
    expect(final.data.status).toBe('completed')
    expect(final.data.errorLog).toBeNull()
  })

  it('does not run a backfill when team links already exist', async () => {
    mockedTeamIds.mockReset()
    mockedTeamIds.mockResolvedValue(['t-1'])

    await runImportJob('job-1')

    expect(mockedProcessTeam).not.toHaveBeenCalled()
    expect(finalJobUpdate().data.status).toBe('completed')
  })
})
