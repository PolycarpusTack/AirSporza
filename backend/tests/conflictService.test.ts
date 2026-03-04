import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectConflicts } from '../src/services/conflictService.js'
import { prisma } from '../src/db/prisma.js'

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    event: { findMany: vi.fn() },
    contract: { findFirst: vi.fn() },
    techPlan: { findFirst: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  event: { findMany: ReturnType<typeof vi.fn> }
  contract: { findFirst: ReturnType<typeof vi.fn> }
  techPlan: { findFirst: ReturnType<typeof vi.fn> }
}

beforeEach(() => vi.clearAllMocks())

describe('detectConflicts', () => {
  const base = {
    id: undefined as number | undefined,
    competitionId: 10,
    linearChannel: 'VRT MAX',
    startDateBE: '2026-04-01',
    startTimeBE: '20:00',
    status: 'ready' as const,
  }

  it('returns channel overlap warning when another event is within 30 min', async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 99, linearChannel: 'VRT MAX', startTimeBE: '20:15', participants: 'X vs Y' }
    ])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'channel_overlap')).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns rights_window warning when no contract covers the date', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue(null)
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })

    const result = await detectConflicts(base)
    expect(result.warnings.some(w => w.type === 'rights_window')).toBe(true)
  })

  it('returns missing_tech_plan warning for approved event with no plan', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.techPlan.findFirst.mockResolvedValue(null)

    const result = await detectConflicts({ ...base, id: 5, status: 'approved' })
    expect(result.warnings.some(w => w.type === 'missing_tech_plan')).toBe(true)
  })

  it('returns no warnings for a clean event', async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.contract.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.techPlan.findFirst.mockResolvedValue({ id: 1 })

    const result = await detectConflicts(base)
    expect(result.warnings).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})
