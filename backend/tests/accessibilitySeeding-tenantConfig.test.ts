/**
 * RC-5-T2 — the TD-31 seeding service reads the T888 exclusion set via the tenant
 * loader (single choke point: wiring it HERE covers all five event-creation sites).
 * Fake tx, no DB. Mechanism only — never asserts any exclusion is legally correct.
 *
 * Pins: fallback parity (no config row → seeded rows byte-identical to the
 * constants-derived defaults), per-tenant override (excluded sport → T888
 * NOT_REQUIRED), and that the config is read for the EVENT's tenant inside the
 * SAME tx (tenantId from the owning row, never caller-supplied — TD-31 lesson).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedDefaultAccessibilityDeliverables } from '../src/services/accessibility/seeding.js'
import { buildDefaultAccessibilityDeliverables } from '../src/config/accessibility.js'

const TENANT_A = '00000000-0000-0000-0000-0000000000aa'
const TENANT_B = '00000000-0000-0000-0000-0000000000bb'

const findUnique = vi.fn()
const createMany = vi.fn().mockResolvedValue({ count: 3 })
const tx = {
  tenantAccessibilityConfig: { findUnique },
  accessibilityDeliverable: { createMany },
} as unknown as Parameters<typeof seedDefaultAccessibilityDeliverables>[0]

const event = { id: 42, sportId: 5, tenantId: TENANT_A }

function configRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    tenantId: TENANT_A,
    t888ExcludedSportIds: null,
    kpiTargetPctByType: null,
    unplannedLeadTimeDays: null,
    updatedBy: null,
    createdAt: new Date('2026-07-23T00:00:00.000Z'),
    updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  }
}

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue(null)
  createMany.mockClear()
})

describe('RC-5-T2 seeding service — tenant exclusion set via the loader', () => {
  it('no config row → seeded rows are BYTE-IDENTICAL to the constants-derived defaults', async () => {
    await seedDefaultAccessibilityDeliverables(tx, event)
    expect(createMany).toHaveBeenCalledWith({
      data: buildDefaultAccessibilityDeliverables(event).map(d => ({ ...d, eventId: event.id, tenantId: TENANT_A })),
      skipDuplicates: true,
    })
  })

  it('reads the config on the SAME tx, for the EVENT\'s tenant (owning row, never a caller value)', async () => {
    await seedDefaultAccessibilityDeliverables(tx, event)
    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: TENANT_A } })

    findUnique.mockClear()
    await seedDefaultAccessibilityDeliverables(tx, { ...event, tenantId: TENANT_B })
    expect(findUnique.mock.calls[0][0]).toEqual({ where: { tenantId: TENANT_B } })
  })

  it('tenant row excluding the event\'s sport → T888 seeds NOT_REQUIRED (override respected)', async () => {
    findUnique.mockResolvedValue(configRow({ t888ExcludedSportIds: [event.sportId] }))
    await seedDefaultAccessibilityDeliverables(tx, event)
    const data = createMany.mock.calls[0][0].data as Array<{ type: string; status: string }>
    expect(data.find(d => d.type === 'T888')!.status).toBe('NOT_REQUIRED')
    // AD/VGT defaulting is RC-2's concern — pinned in its own suites, not re-asserted here.
  })

  it('tenant row excluding a DIFFERENT sport → T888 stays REQUIRED (mechanism, not value)', async () => {
    findUnique.mockResolvedValue(configRow({ t888ExcludedSportIds: [event.sportId + 1] }))
    await seedDefaultAccessibilityDeliverables(tx, event)
    const data = createMany.mock.calls[0][0].data as Array<{ type: string; status: string }>
    expect(data.find(d => d.type === 'T888')!.status).toBe('REQUIRED')
  })
})
