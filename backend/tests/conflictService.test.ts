import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectConflicts } from '../src/services/conflictService.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    event: { findMany: vi.fn() },
    contract: { findMany: vi.fn() },
    channel: { findMany: vi.fn() },
    techPlan: { findFirst: vi.fn() },
    resourceAssignment: { findMany: vi.fn() },
    $disconnect: vi.fn(),
  },
}))

const mockPrisma = prisma as unknown as {
  event: { findMany: ReturnType<typeof vi.fn> }
  contract: { findMany: ReturnType<typeof vi.fn> }
  channel: { findMany: ReturnType<typeof vi.fn> }
  techPlan: { findFirst: ReturnType<typeof vi.fn> }
  resourceAssignment: { findMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Ensure resourceAssignment always returns [] by default after clearAllMocks
  mockPrisma.resourceAssignment.findMany.mockResolvedValue([])
})

// Helper: set default "clean" mocks
function mockClean(overrides?: {
  events?: any[]
  contracts?: any[]
  channels?: any[]
  techPlan?: any
}) {
  mockPrisma.event.findMany.mockResolvedValue(overrides?.events ?? [])
  mockPrisma.contract.findMany.mockResolvedValue(overrides?.contracts ?? [
    { id: 1, status: 'valid', platforms: ['linear', 'on-demand', 'radio'], territory: [], maxLiveRuns: null, windowStartUtc: null, windowEndUtc: null, validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01') },
  ])
  mockPrisma.channel.findMany.mockResolvedValue(overrides?.channels ?? [
    { types: ['linear'] },
  ])
  // Use 'techPlan' in overrides to distinguish "not provided" from "explicitly null"
  mockPrisma.techPlan.findFirst.mockResolvedValue(
    overrides && 'techPlan' in overrides ? overrides.techPlan : { id: 1 }
  )
  mockPrisma.resourceAssignment.findMany.mockResolvedValue([])
}

describe('detectConflicts', () => {
  // Base draft using FK-based channelId
  const base = {
    id: undefined as number | undefined,
    competitionId: 10,
    channelId: 1,
    startDateBE: '2026-04-01',
    startTimeBE: '20:00',
    status: 'ready' as const,
  }

  it('returns channel overlap warning when another event is within 30 min', async () => {
    mockClean({
      events: [{ id: 99, startTimeBE: '20:15', durationMin: null, participants: 'X vs Y' }],
    })

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'channel_overlap')).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns channel overlap via duration-based overlap check', async () => {
    mockClean({
      events: [{ id: 99, startTimeBE: '19:30', durationMin: 90, participants: 'X vs Y' }],
    })

    // Draft starts at 20:00, existing starts at 19:30 and runs 90min (until 21:00) — overlap
    const result = await detectConflicts({ ...base, durationMin: 60 } as any)
    expect(result.warnings.some(w => w.type === 'channel_overlap')).toBe(true)
  })

  it('returns rights_window warning when no contracts exist', async () => {
    mockClean({ contracts: [] })

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'rights_window')).toBe(true)
  })

  it('returns rights_window warning when no valid contracts', async () => {
    mockClean({
      contracts: [{ id: 1, status: 'draft', platforms: [], territory: [], maxLiveRuns: null, windowStartUtc: null, windowEndUtc: null }],
    })

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'rights_window')).toBe(true)
  })

  it('returns missing_tech_plan warning for approved event with no plan', async () => {
    mockClean({ techPlan: null })

    const result = await detectConflicts({ ...base, id: 5, status: 'approved' })
    expect(result.warnings.some(w => w.type === 'missing_tech_plan')).toBe(true)
  })

  it('returns no warnings for a clean event', async () => {
    mockClean()

    const result = await detectConflicts(base)
    expect(result.warnings).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it('returns platform_not_covered warning when channel type not in contract platforms', async () => {
    mockClean({
      contracts: [{ id: 1, status: 'valid', platforms: ['radio'], territory: [], maxLiveRuns: null, windowStartUtc: null, windowEndUtc: null, validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01') }],
      channels: [{ types: ['linear'] }],
    })

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'platform_not_covered')).toBe(true)
  })

  it('returns contract_expiring warning when contract status is expiring', async () => {
    mockClean({
      contracts: [{ id: 1, status: 'expiring', platforms: ['linear'], territory: [], maxLiveRuns: null, windowStartUtc: null, windowEndUtc: null, validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01') }],
    })

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'contract_expiring')).toBe(true)
  })

  // Legacy string-based channel fallback
  it('falls back to legacy linearChannel string for overlap check', async () => {
    mockClean({
      events: [{ id: 99, startTimeBE: '20:15', durationMin: null, participants: 'X vs Y' }],
    })

    const result = await detectConflicts({
      ...base,
      channelId: undefined,
      linearChannel: 'VRT MAX',
    })
    expect(result.warnings.some(w => w.type === 'channel_overlap')).toBe(true)
  })
})

describe('bulk conflict check (multiple detectConflicts calls)', () => {
  it('maps event ids to their warning arrays', async () => {
    // First call: event 1 has channel overlap
    mockPrisma.event.findMany.mockResolvedValueOnce([
      { id: 99, startTimeBE: '20:15', durationMin: null, participants: 'X vs Y' },
    ])
    mockPrisma.contract.findMany.mockResolvedValueOnce([
      { id: 1, status: 'valid', platforms: ['linear'], territory: [], maxLiveRuns: null, windowStartUtc: null, windowEndUtc: null, validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01') },
    ])
    mockPrisma.channel.findMany.mockResolvedValueOnce([{ types: ['linear'] }])
    mockPrisma.techPlan.findFirst.mockResolvedValueOnce({ id: 1 })
    mockPrisma.resourceAssignment.findMany.mockResolvedValueOnce([])

    const r1 = await detectConflicts({
      id: 1,
      competitionId: 10,
      channelId: 1,
      startDateBE: '2026-04-01',
      startTimeBE: '20:00',
    })

    // Second call: event 2 is clean
    mockPrisma.event.findMany.mockResolvedValueOnce([])
    mockPrisma.contract.findMany.mockResolvedValueOnce([
      { id: 1, status: 'valid', platforms: ['linear'], territory: [], maxLiveRuns: null, windowStartUtc: null, windowEndUtc: null, validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01') },
    ])
    mockPrisma.channel.findMany.mockResolvedValueOnce([{ types: ['linear'] }])
    mockPrisma.techPlan.findFirst.mockResolvedValueOnce({ id: 1 })
    mockPrisma.resourceAssignment.findMany.mockResolvedValueOnce([])

    const r2 = await detectConflicts({
      id: 2,
      competitionId: 10,
      channelId: 1,
      startDateBE: '2026-04-01',
      startTimeBE: '14:00',
    })

    expect(r1.warnings.some(w => w.type === 'channel_overlap')).toBe(true)
    expect(r2.warnings).toHaveLength(0)
  })
})
