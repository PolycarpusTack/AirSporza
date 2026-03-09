import { logger } from '../../utils/logger.js'

export interface Alert {
  code: string
  severity: 'INFO' | 'WARNING' | 'ACTION' | 'URGENT' | 'OPPORTUNITY'
  slotId: string
  message: string
  data?: Record<string, unknown>
}

interface SlotForAlert {
  id: string
  status: string
  plannedEndUtc?: Date | string | null
  estimatedEndUtc?: Date | string | null
  conditionalTriggerUtc?: Date | string | null
  overrunStrategy?: string
  earliestStartUtc?: Date | string | null
  latestStartUtc?: Date | string | null
}

/**
 * Evaluate broadcast slots and generate alerts for overruns,
 * trigger thresholds, and wide cascade windows.
 */
export function evaluateAlerts(slots: SlotForAlert[], now = new Date()): Alert[] {
  const alerts: Alert[] = []

  for (const slot of slots) {
    if (slot.status !== 'LIVE' && slot.status !== 'PLANNED') continue

    const planned = slot.plannedEndUtc ? new Date(slot.plannedEndUtc).getTime() : null
    const estimated = slot.estimatedEndUtc ? new Date(slot.estimatedEndUtc).getTime() : null

    // Overrun alerts
    if (planned && estimated) {
      const overrunMin = (estimated - planned) / 60000
      if (overrunMin >= 30) {
        alerts.push({
          code: 'OVERRUN_ELEVATED',
          severity: 'WARNING',
          slotId: slot.id,
          message: `Estimated end ${Math.round(overrunMin)}min past slot end`,
        })
      } else if (overrunMin >= 20) {
        alerts.push({
          code: 'OVERRUN_WARNING',
          severity: 'INFO',
          slotId: slot.id,
          message: `Estimated end ${Math.round(overrunMin)}min past slot end`,
        })
      }
    }

    // Conditional trigger alerts
    if (slot.conditionalTriggerUtc && slot.status === 'LIVE') {
      const trigger = new Date(slot.conditionalTriggerUtc).getTime()
      if (now.getTime() >= trigger) {
        alerts.push({
          code: 'TRIGGER_THRESHOLD_MET',
          severity: 'ACTION',
          slotId: slot.id,
          message: 'Match still live at conditional trigger time — confirm or cancel switch',
          data: {
            triggerUtc: slot.conditionalTriggerUtc,
            switchStrategy: slot.overrunStrategy,
          },
        })
      }
    }

    // Wide cascade window alert
    if (slot.earliestStartUtc && slot.latestStartUtc) {
      const earliest = new Date(slot.earliestStartUtc).getTime()
      const latest = new Date(slot.latestStartUtc).getTime()
      const windowMin = (latest - earliest) / 60000
      if (windowMin >= 60) {
        alerts.push({
          code: 'WIDE_CASCADE_WINDOW',
          severity: 'INFO',
          slotId: slot.id,
          message: `Cascade window is ${Math.round(windowMin)}min wide — confidence may be low`,
        })
      }
    }
  }

  return alerts
}
