import { describe, it, expect } from 'vitest'
import { applyOperations, SlotState, ScheduleOperation } from '../src/services/scheduleOperations.js'

function makeSlot(overrides: Partial<SlotState> = {}): SlotState {
  return {
    id: 'slot-1',
    channelId: 1,
    schedulingMode: 'FIXED',
    plannedStartUtc: '2026-04-03T14:00:00.000Z',
    plannedEndUtc: '2026-04-03T16:00:00.000Z',
    bufferBeforeMin: 5,
    bufferAfterMin: 10,
    overrunStrategy: 'EXTEND',
    anchorType: 'FIXED_TIME',
    contentSegment: 'MAIN',
    status: 'DRAFT',
    sportMetadata: {},
    ...overrides,
  }
}

describe('applyOperations', () => {
  it('CREATE_SLOT adds a slot', () => {
    const newSlot = makeSlot({ id: 'slot-new' })
    const result = applyOperations([], [{ type: 'CREATE_SLOT', data: newSlot }])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(newSlot)
  })

  it('MOVE_SLOT updates channel and times', () => {
    const base = [makeSlot()]
    const result = applyOperations(base, [
      {
        type: 'MOVE_SLOT',
        slotId: 'slot-1',
        newChannelId: 5,
        newStartUtc: '2026-04-03T18:00:00.000Z',
        newEndUtc: '2026-04-03T20:00:00.000Z',
      },
    ])
    expect(result[0].channelId).toBe(5)
    expect(result[0].plannedStartUtc).toBe('2026-04-03T18:00:00.000Z')
    expect(result[0].plannedEndUtc).toBe('2026-04-03T20:00:00.000Z')
    // unchanged fields preserved
    expect(result[0].bufferBeforeMin).toBe(5)
  })

  it('RESIZE_SLOT updates end time only', () => {
    const base = [makeSlot()]
    const result = applyOperations(base, [
      { type: 'RESIZE_SLOT', slotId: 'slot-1', newEndUtc: '2026-04-03T17:30:00.000Z' },
    ])
    expect(result[0].plannedEndUtc).toBe('2026-04-03T17:30:00.000Z')
    expect(result[0].plannedStartUtc).toBe('2026-04-03T14:00:00.000Z')
  })

  it('DELETE_SLOT removes a slot', () => {
    const base = [makeSlot(), makeSlot({ id: 'slot-2', channelId: 2 })]
    const result = applyOperations(base, [{ type: 'DELETE_SLOT', slotId: 'slot-1' }])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('slot-2')
  })

  it('UPDATE_SLOT merges changes and preserves unchanged fields', () => {
    const base = [makeSlot({ eventId: 42, expectedDurationMin: 120 })]
    const result = applyOperations(base, [
      { type: 'UPDATE_SLOT', slotId: 'slot-1', changes: { status: 'CONFIRMED', bufferAfterMin: 15 } },
    ])
    expect(result[0].status).toBe('CONFIRMED')
    expect(result[0].bufferAfterMin).toBe(15)
    // unchanged
    expect(result[0].eventId).toBe(42)
    expect(result[0].expectedDurationMin).toBe(120)
    expect(result[0].schedulingMode).toBe('FIXED')
  })

  it('DUPLICATE_SLOT copies with new id and position', () => {
    const base = [makeSlot({ expectedDurationMin: 120 })]
    const result = applyOperations(base, [
      {
        type: 'DUPLICATE_SLOT',
        sourceSlotId: 'slot-1',
        newChannelId: 3,
        newStartUtc: '2026-04-04T10:00:00.000Z',
      },
    ])
    expect(result).toHaveLength(2)
    const dup = result[1]
    // new id (uuid format)
    expect(dup.id).not.toBe('slot-1')
    expect(dup.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    // new channel and start
    expect(dup.channelId).toBe(3)
    expect(dup.plannedStartUtc).toBe('2026-04-04T10:00:00.000Z')
    // end computed from source duration (2h)
    expect(dup.plannedEndUtc).toBe('2026-04-04T12:00:00.000Z')
    // inherited fields
    expect(dup.overrunStrategy).toBe('EXTEND')
    expect(dup.expectedDurationMin).toBe(120)
  })

  it('multiple operations applied in sequence', () => {
    const ops: ScheduleOperation[] = [
      { type: 'CREATE_SLOT', data: makeSlot({ id: 'a' }) },
      { type: 'CREATE_SLOT', data: makeSlot({ id: 'b', channelId: 2 }) },
      { type: 'DELETE_SLOT', slotId: 'a' },
      { type: 'UPDATE_SLOT', slotId: 'b', changes: { status: 'LIVE' } },
      { type: 'RESIZE_SLOT', slotId: 'b', newEndUtc: '2026-04-03T19:00:00.000Z' },
    ]
    const result = applyOperations([], ops)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b')
    expect(result[0].status).toBe('LIVE')
    expect(result[0].plannedEndUtc).toBe('2026-04-03T19:00:00.000Z')
  })
})
