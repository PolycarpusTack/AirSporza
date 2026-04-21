import type { BroadcastSlot } from '../data/types'
import type { ScheduleOperation } from './useScheduleEditor'

/**
 * Compute the inverse of a forward schedule operation, given the slot state
 * BEFORE the forward op was applied. Returns null if the inverse cannot be
 * reconstructed (e.g. UPDATE on a slot that never existed in the base state).
 *
 * Undo in the editor then becomes "dispatch the inverse and sync it to the
 * server," instead of silently trimming local state and leaving the server
 * ahead of the client. Same pattern as operational-transform undo stacks.
 *
 * The helper is a pure function so it can be unit-tested against the
 * scheduleOperations applicator without any React / network involvement.
 */
export function computeInverse(
  forward: ScheduleOperation,
  slotsBeforeOp: BroadcastSlot[],
): ScheduleOperation | null {
  switch (forward.type) {
    case 'CREATE_SLOT':
      return { type: 'DELETE_SLOT', slotId: forward.data.id }

    case 'DELETE_SLOT': {
      const before = slotsBeforeOp.find(s => s.id === forward.slotId)
      if (!before) return null
      // Full restore — CREATE_SLOT needs the planned times + channel at
      // minimum. Pass the whole prior slot so buffer/duration/metadata
      // round-trip correctly.
      return {
        type: 'CREATE_SLOT',
        data: {
          ...before,
          // CREATE_SLOT's narrowed type requires these three fields.
          id: before.id,
          channelId: before.channelId,
          plannedStartUtc: before.plannedStartUtc ?? new Date().toISOString(),
          plannedEndUtc: before.plannedEndUtc ?? new Date().toISOString(),
        },
      }
    }

    case 'UPDATE_SLOT': {
      const before = slotsBeforeOp.find(s => s.id === forward.slotId)
      if (!before) return null
      // Snapshot only the fields the forward op touched, so the inverse
      // restores exactly what changed and nothing else.
      const restored: Partial<BroadcastSlot> = {}
      const beforeAsRecord = before as unknown as Record<string, unknown>
      const restoredAsRecord = restored as Record<string, unknown>
      for (const key of Object.keys(forward.changes)) {
        restoredAsRecord[key] = beforeAsRecord[key]
      }
      return { type: 'UPDATE_SLOT', slotId: forward.slotId, changes: restored }
    }

    case 'MOVE_SLOT': {
      const before = slotsBeforeOp.find(s => s.id === forward.slotId)
      if (!before || !before.plannedStartUtc || !before.plannedEndUtc) return null
      return {
        type: 'MOVE_SLOT',
        slotId: forward.slotId,
        // Only include newChannelId on the inverse if the forward move
        // crossed channels; this keeps cross-channel and in-channel moves
        // symmetric when applied on the server.
        ...(forward.newChannelId != null && forward.newChannelId !== before.channelId
          ? { newChannelId: before.channelId }
          : {}),
        newStartUtc: before.plannedStartUtc,
        newEndUtc: before.plannedEndUtc,
      }
    }

    case 'RESIZE_SLOT': {
      const before = slotsBeforeOp.find(s => s.id === forward.slotId)
      if (!before || !before.plannedEndUtc) return null
      return { type: 'RESIZE_SLOT', slotId: forward.slotId, newEndUtc: before.plannedEndUtc }
    }

    case 'DUPLICATE_SLOT':
      // Requires newSlotId to have been supplied on the forward op, so the
      // same id undo-deletes what was duplicate-created. The editor always
      // sets it; we still guard against malformed ops.
      if (!forward.newSlotId) return null
      return { type: 'DELETE_SLOT', slotId: forward.newSlotId }

    default:
      return null
  }
}
