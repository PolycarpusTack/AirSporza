import { useState } from 'react'
import { ChannelSelect } from '../ui/ChannelSelect'
import type { EventStatus, Sport, Competition } from '../../data/types'

interface BulkActionBarProps {
  count: number
  onDelete: () => void
  onStatusChange: (status: EventStatus) => void
  onReschedule: (shiftDays: number) => void
  onAssignChannel: (channelId: number) => void
  onAssignSport: (sportId: number) => void
  onAssignCompetition: (competitionId: number) => void
  sports: Sport[]
  competitions: Competition[]
  loading: boolean
}

const EVENT_STATUSES: EventStatus[] = [
  'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled',
]

export function BulkActionBar({
  count,
  onDelete,
  onStatusChange,
  onReschedule,
  onAssignChannel,
  onAssignSport,
  onAssignCompetition,
  sports,
  competitions,
  loading,
}: BulkActionBarProps) {
  const [shiftDays, setShiftDays] = useState(1)
  const [pendingChannelId, setPendingChannelId] = useState<number | null>(null)

  if (count === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface border-t z-40 p-3 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-semibold text-text-2 mr-2">
        {count} selected
      </span>

      {/* Delete */}
      <button
        className="btn btn-sm"
        style={{ color: 'var(--color-danger)' }}
        disabled={loading}
        onClick={() => {
          if (window.confirm(`Delete ${count} event(s)? This cannot be undone.`)) {
            onDelete()
          }
        }}
      >
        Delete
      </button>

      {/* Status change */}
      <select
        className="inp text-sm py-1 px-2"
        disabled={loading}
        defaultValue=""
        onChange={e => {
          if (e.target.value) onStatusChange(e.target.value as EventStatus)
          e.target.value = ''
        }}
      >
        <option value="" disabled>Set status...</option>
        {EVENT_STATUSES.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Reschedule */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="inp text-sm py-1 px-2 w-16"
          value={shiftDays}
          onChange={e => setShiftDays(Number(e.target.value))}
          disabled={loading}
        />
        <span className="text-sm text-text-3">days</span>
        <button
          className="btn btn-g btn-sm"
          disabled={loading}
          onClick={() => onReschedule(shiftDays)}
        >
          Shift
        </button>
      </div>

      {/* Assign channel */}
      <div className="flex items-center gap-1">
        <ChannelSelect
          value={pendingChannelId}
          onChange={(id) => {
            setPendingChannelId(id)
            if (id != null) onAssignChannel(id)
          }}
          type="linear"
          placeholder="Channel..."
          className="text-sm py-1 px-2"
          disabled={loading}
        />
      </div>

      {/* Assign sport */}
      <select
        className="inp text-sm py-1 px-2"
        disabled={loading}
        defaultValue=""
        onChange={e => {
          if (e.target.value) onAssignSport(Number(e.target.value))
          e.target.value = ''
        }}
      >
        <option value="" disabled>Sport...</option>
        {sports.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* Assign competition */}
      <select
        className="inp text-sm py-1 px-2"
        disabled={loading}
        defaultValue=""
        onChange={e => {
          if (e.target.value) onAssignCompetition(Number(e.target.value))
          e.target.value = ''
        }}
      >
        <option value="" disabled>Competition...</option>
        {competitions.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}
