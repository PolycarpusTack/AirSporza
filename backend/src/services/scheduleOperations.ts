import { v4 as uuidv4 } from 'uuid'
import type { Prisma } from '@prisma/client'

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
  | { type: 'DUPLICATE_SLOT'; sourceSlotId: string; newChannelId: number; newStartUtc: string; newSlotId?: string }

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
          // Prefer the id the client chose, so its local state and any later
          // undo (which needs to DELETE_SLOT on this exact id) match the
          // server. Fall back to uuidv4 when the op wasn't minted by a
          // modern client.
          id: op.newSlotId ?? uuidv4(),
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

/**
 * Execute operations against real BroadcastSlots in a Prisma transaction.
 * Called during draft publish to materialize pending edits.
 */
export async function executeOperations(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operations: ScheduleOperation[],
): Promise<{ created: number; updated: number; deleted: number }> {
  let created = 0, updated = 0, deleted = 0

  for (const op of operations) {
    switch (op.type) {
      case 'CREATE_SLOT': {
        await tx.broadcastSlot.create({
          data: {
            tenantId,
            channelId: op.data.channelId,
            eventId: op.data.eventId ?? null,
            schedulingMode: op.data.schedulingMode as any,
            plannedStartUtc: new Date(op.data.plannedStartUtc),
            plannedEndUtc: new Date(op.data.plannedEndUtc),
            bufferBeforeMin: op.data.bufferBeforeMin ?? 15,
            bufferAfterMin: op.data.bufferAfterMin ?? 10,
            expectedDurationMin: op.data.expectedDurationMin ?? null,
            overrunStrategy: (op.data.overrunStrategy as any) ?? 'EXTEND',
            anchorType: (op.data.anchorType as any) ?? 'FIXED_TIME',
            contentSegment: (op.data.contentSegment as any) ?? 'FULL',
            status: 'PLANNED' as any,
            sportMetadata: (op.data.sportMetadata ?? {}) as any,
          },
        })
        created++
        break
      }
      case 'UPDATE_SLOT': {
        const data: Record<string, unknown> = {}
        const c = op.changes
        if (c.channelId !== undefined) data.channelId = c.channelId
        if (c.plannedStartUtc !== undefined) data.plannedStartUtc = new Date(c.plannedStartUtc)
        if (c.plannedEndUtc !== undefined) data.plannedEndUtc = new Date(c.plannedEndUtc)
        if (c.schedulingMode !== undefined) data.schedulingMode = c.schedulingMode
        if (c.overrunStrategy !== undefined) data.overrunStrategy = c.overrunStrategy
        if (c.bufferBeforeMin !== undefined) data.bufferBeforeMin = c.bufferBeforeMin
        if (c.bufferAfterMin !== undefined) data.bufferAfterMin = c.bufferAfterMin
        if (c.expectedDurationMin !== undefined) data.expectedDurationMin = c.expectedDurationMin
        if (c.eventId !== undefined) data.eventId = c.eventId
        if (Object.keys(data).length > 0) {
          await tx.broadcastSlot.update({ where: { id: op.slotId }, data })
          updated++
        }
        break
      }
      case 'MOVE_SLOT': {
        const moveData: Record<string, unknown> = {
          plannedStartUtc: new Date(op.newStartUtc),
          plannedEndUtc: new Date(op.newEndUtc),
        }
        if (op.newChannelId !== undefined) moveData.channelId = op.newChannelId
        await tx.broadcastSlot.update({ where: { id: op.slotId }, data: moveData })
        updated++
        break
      }
      case 'RESIZE_SLOT': {
        await tx.broadcastSlot.update({
          where: { id: op.slotId },
          data: { plannedEndUtc: new Date(op.newEndUtc) },
        })
        updated++
        break
      }
      case 'DELETE_SLOT': {
        await tx.broadcastSlot.delete({ where: { id: op.slotId } }).catch(() => {
          // Slot may have been a draft-only slot (not yet in DB) — skip
        })
        deleted++
        break
      }
      case 'DUPLICATE_SLOT': {
        const source = await tx.broadcastSlot.findUnique({ where: { id: op.sourceSlotId } })
        if (source) {
          const dur = source.plannedEndUtc!.getTime() - source.plannedStartUtc!.getTime()
          await tx.broadcastSlot.create({
            data: {
              // Honor client-chosen id so in-editor undo (which references
              // newSlotId) and the eventually-published slot refer to the
              // same row.
              ...(op.newSlotId ? { id: op.newSlotId } : {}),
              tenantId,
              channelId: op.newChannelId,
              eventId: source.eventId,
              schedulingMode: source.schedulingMode,
              plannedStartUtc: new Date(op.newStartUtc),
              plannedEndUtc: new Date(new Date(op.newStartUtc).getTime() + dur),
              bufferBeforeMin: source.bufferBeforeMin,
              bufferAfterMin: source.bufferAfterMin,
              expectedDurationMin: source.expectedDurationMin,
              overrunStrategy: source.overrunStrategy,
              anchorType: source.anchorType,
              contentSegment: source.contentSegment,
              status: 'PLANNED' as any,
              sportMetadata: source.sportMetadata ?? {},
            },
          })
          created++
        }
        break
      }
    }
  }

  return { created, updated, deleted }
}
