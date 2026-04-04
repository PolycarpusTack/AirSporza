import { v4 as uuidv4 } from 'uuid'

export interface SlotState {
  id: string
  channelId: number
  eventId?: number
  schedulingMode: string
  plannedStartUtc: string
  plannedEndUtc: string
  estimatedStartUtc?: string
  estimatedEndUtc?: string
  bufferBeforeMin: number
  bufferAfterMin: number
  expectedDurationMin?: number
  overrunStrategy: string
  conditionalTriggerUtc?: string
  conditionalTargetChannelId?: number
  anchorType: string
  contentSegment: string
  status: string
  sportMetadata: Record<string, unknown>
}

export type ScheduleOperation =
  | { type: 'CREATE_SLOT'; data: SlotState }
  | { type: 'UPDATE_SLOT'; slotId: string; changes: Partial<SlotState> }
  | { type: 'MOVE_SLOT'; slotId: string; newChannelId?: number; newStartUtc: string; newEndUtc: string }
  | { type: 'RESIZE_SLOT'; slotId: string; newEndUtc: string }
  | { type: 'DELETE_SLOT'; slotId: string }
  | { type: 'DUPLICATE_SLOT'; sourceSlotId: string; newChannelId: number; newStartUtc: string }

function applySingle(slots: SlotState[], op: ScheduleOperation): SlotState[] {
  switch (op.type) {
    case 'CREATE_SLOT':
      return [...slots, op.data]

    case 'UPDATE_SLOT':
      return slots.map((s) =>
        s.id === op.slotId ? { ...s, ...op.changes } : s,
      )

    case 'MOVE_SLOT':
      return slots.map((s) =>
        s.id === op.slotId
          ? {
              ...s,
              ...(op.newChannelId !== undefined && { channelId: op.newChannelId }),
              plannedStartUtc: op.newStartUtc,
              plannedEndUtc: op.newEndUtc,
            }
          : s,
      )

    case 'RESIZE_SLOT':
      return slots.map((s) =>
        s.id === op.slotId ? { ...s, plannedEndUtc: op.newEndUtc } : s,
      )

    case 'DELETE_SLOT':
      return slots.filter((s) => s.id !== op.slotId)

    case 'DUPLICATE_SLOT': {
      const source = slots.find((s) => s.id === op.sourceSlotId)
      if (!source) return slots
      const sourceDurationMs =
        new Date(source.plannedEndUtc).getTime() -
        new Date(source.plannedStartUtc).getTime()
      const newEndUtc = new Date(
        new Date(op.newStartUtc).getTime() + sourceDurationMs,
      ).toISOString()
      return [
        ...slots,
        {
          ...source,
          id: uuidv4(),
          channelId: op.newChannelId,
          plannedStartUtc: op.newStartUtc,
          plannedEndUtc: newEndUtc,
        },
      ]
    }

    default:
      return slots
  }
}

export function applyOperations(
  baseSlots: SlotState[],
  operations: ScheduleOperation[],
): SlotState[] {
  return operations.reduce(applySingle, baseSlots)
}
