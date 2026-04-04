import { useState, useEffect } from 'react'
import { X, Trash2, Save } from 'lucide-react'
import type { BroadcastSlot, SchedulingMode, OverrunStrategy } from '../../data/types'
import type { ScheduleOperation, ValidationResult } from '../../hooks/useScheduleEditor'

interface SlotEditorPanelProps {
  slot: BroadcastSlot
  validations: ValidationResult[]
  onDispatch: (op: ScheduleOperation) => void
  onDelete: (slotId: string) => void
  onClose: () => void
}

const SCHEDULING_MODES: SchedulingMode[] = ['FIXED', 'FLOATING', 'WINDOW']
const OVERRUN_STRATEGIES: OverrunStrategy[] = ['EXTEND', 'CONDITIONAL_SWITCH', 'HARD_CUT', 'SPLIT_SCREEN']

function toTimeString(utc?: string): string {
  if (!utc) return '00:00'
  const d = new Date(utc)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function durationMin(start?: string, end?: string): number {
  if (!start || !end) return 60
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)
}

export function SlotEditorPanel({ slot, validations, onDispatch, onDelete, onClose }: SlotEditorPanelProps) {
  const [startTime, setStartTime] = useState(toTimeString(slot.plannedStartUtc))
  const [duration, setDuration] = useState(durationMin(slot.plannedStartUtc, slot.plannedEndUtc))
  const [mode, setMode] = useState<SchedulingMode>(slot.schedulingMode)
  const [overrunStrategy, setOverrunStrategy] = useState<OverrunStrategy>(slot.overrunStrategy)
  const [bufferBefore, setBufferBefore] = useState(slot.bufferBeforeMin)
  const [bufferAfter, setBufferAfter] = useState(slot.bufferAfterMin)

  // Sync local state when slot changes
  useEffect(() => {
    setStartTime(toTimeString(slot.plannedStartUtc))
    setDuration(durationMin(slot.plannedStartUtc, slot.plannedEndUtc))
    setMode(slot.schedulingMode)
    setOverrunStrategy(slot.overrunStrategy)
    setBufferBefore(slot.bufferBeforeMin)
    setBufferAfter(slot.bufferAfterMin)
  }, [slot.id, slot.plannedStartUtc, slot.plannedEndUtc, slot.schedulingMode, slot.overrunStrategy, slot.bufferBeforeMin, slot.bufferAfterMin])

  const handleSave = () => {
    // Compute new start/end UTC from date portion of existing start + time + duration
    const baseDate = slot.plannedStartUtc
      ? slot.plannedStartUtc.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const [hh, mm] = startTime.split(':').map(Number)
    const newStart = new Date(Date.UTC(
      Number(baseDate.slice(0, 4)),
      Number(baseDate.slice(5, 7)) - 1,
      Number(baseDate.slice(8, 10)),
      hh,
      mm,
    ))
    const newEnd = new Date(newStart.getTime() + duration * 60_000)

    onDispatch({
      type: 'UPDATE_SLOT',
      slotId: slot.id,
      changes: {
        plannedStartUtc: newStart.toISOString(),
        plannedEndUtc: newEnd.toISOString(),
        schedulingMode: mode,
        overrunStrategy,
        bufferBeforeMin: bufferBefore,
        bufferAfterMin: bufferAfter,
        expectedDurationMin: duration,
      },
    })
  }

  const errors = validations.filter(v => v.severity === 'ERROR')
  const warnings = validations.filter(v => v.severity === 'WARNING')

  return (
    <div className="fixed right-0 top-14 bottom-0 w-72 bg-surface border-l border-border shadow-xl overflow-y-auto z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Edit Slot</h3>
        <button onClick={onClose} className="text-text-3 hover:text-text p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Event name (read-only) */}
        <div>
          <label className="block text-xs text-text-3 mb-1">Event</label>
          <div className="text-sm font-medium truncate">
            {slot.event?.participants ?? `Event #${slot.eventId ?? '—'}`}
          </div>
        </div>

        {/* Start Time (UTC) */}
        <div>
          <label className="block text-xs text-text-3 mb-1">Start Time (UTC)</label>
          <input
            type="time"
            className="input w-full text-xs"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs text-text-3 mb-1">Duration (min)</label>
          <input
            type="number"
            className="input w-full text-xs"
            min={30}
            step={5}
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
          />
        </div>

        {/* Mode */}
        <div>
          <label className="block text-xs text-text-3 mb-1">Mode</label>
          <select
            className="input w-full text-xs"
            value={mode}
            onChange={e => setMode(e.target.value as SchedulingMode)}
          >
            {SCHEDULING_MODES.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Overrun Strategy */}
        <div>
          <label className="block text-xs text-text-3 mb-1">Overrun Strategy</label>
          <select
            className="input w-full text-xs"
            value={overrunStrategy}
            onChange={e => setOverrunStrategy(e.target.value as OverrunStrategy)}
          >
            {OVERRUN_STRATEGIES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Buffer Before / After */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-text-3 mb-1">Buffer Before</label>
            <input
              type="number"
              className="input w-full text-xs"
              min={0}
              step={5}
              value={bufferBefore}
              onChange={e => setBufferBefore(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-text-3 mb-1">Buffer After</label>
            <input
              type="number"
              className="input w-full text-xs"
              min={0}
              step={5}
              value={bufferAfter}
              onChange={e => setBufferAfter(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Validations */}
        {errors.length > 0 && (
          <div className="space-y-1">
            {errors.map((v, i) => (
              <div key={i} className="bg-danger-bg border border-danger-dim rounded px-2 py-1.5 text-xs text-danger">
                <span className="font-semibold">{v.code}</span>: {v.message}
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((v, i) => (
              <div key={i} className="bg-warning-bg border border-warning-dim rounded px-2 py-1.5 text-xs text-warning">
                <span className="font-semibold">{v.code}</span>: {v.message}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} className="btn btn-p btn-sm flex-1 flex items-center justify-center gap-1.5 text-xs">
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
          <button
            onClick={() => onDelete(slot.id)}
            className="btn btn-sm flex items-center justify-center gap-1.5 text-xs border border-danger-dim bg-danger-bg text-danger hover:bg-danger/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
