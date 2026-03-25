import React, { useState } from 'react'
import { Tv, Radio, MonitorPlay, Clock } from 'lucide-react'
import { Badge, Btn } from '../ui'
import { ChannelSelect, useChannelLookup } from '../ui/ChannelSelect'
import type { Event, Sport, Competition } from '../../data/types'
import { fmtDate } from '../../utils'

interface ChannelUpdate {
  channelId?: number | null
  radioChannelId?: number | null
  onDemandChannelId?: number | null
  linearStartTime?: string
}

interface EventDetailCardProps {
  event: Event
  sport?: Sport
  competition?: Competition
  canEdit?: boolean
  onUpdateChannels?: (eventId: number, channels: ChannelUpdate) => void
}

export const EventDetailCard = React.memo(function EventDetailCard({ event, sport, competition, canEdit, onUpdateChannels }: EventDetailCardProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [form, setForm] = useState<ChannelUpdate>({
    channelId: event.channelId ?? null,
    radioChannelId: event.radioChannelId ?? null,
    onDemandChannelId: event.onDemandChannelId ?? null,
    linearStartTime: event.linearStartTime ?? '',
  })

  const { getChannel } = useChannelLookup()

  const linearCh = event.channel ?? getChannel(event.channelId)
  const radioCh = getChannel(event.radioChannelId)
  const onDemandCh = getChannel(event.onDemandChannelId)

  const hasChannels = linearCh || radioCh || onDemandCh

  const handleSave = () => {
    onUpdateChannels?.(event.id, form)
    setShowPicker(false)
  }

  const handleOpen = () => {
    setForm({
      channelId: event.channelId ?? null,
      radioChannelId: event.radioChannelId ?? null,
      onDemandChannelId: event.onDemandChannelId ?? null,
      linearStartTime: event.linearStartTime ?? '',
    })
    setShowPicker(true)
  }

  const channelPill = (icon: React.ReactNode, name: string | undefined, color?: string) => {
    if (name) {
      return (
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1">
          {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
          {icon}
          <span className="text-xs font-medium">{name}</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1">
        {icon}
        <span className="text-xs text-text-3">Not assigned</span>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{sport?.icon}</span>
            <h3 className="font-bold text-xl">{event.participants}</h3>
          </div>
          <div className="meta">{competition?.name} - {event.phase} - {event.complex}</div>
        </div>
        <div className="flex gap-2">
          {event.isLive && <Badge variant="live">LIVE</Badge>}
          {event.isDelayedLive && <Badge variant="warning">DELAYED</Badge>}
          {event.category && <Badge>{event.category}</Badge>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <div><div className="text-xs uppercase tracking-wide text-text-2">Date (BE)</div><div className="text-sm font-medium">{fmtDate(event.startDateBE)}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Time (BE)</div><div className="font-mono text-sm font-semibold">{event.startTimeBE}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Channel</div><div className="text-sm font-medium">{linearCh?.name || '—'}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-text-2">Radio</div><div className="text-sm font-medium">{radioCh?.name || '—'}</div></div>
      </div>

      {/* Channel assignment section */}
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-text-2">Broadcast Planning</div>
          {canEdit && onUpdateChannels && (
            <Btn variant="ghost" size="xs" onClick={handleOpen}>
              {hasChannels ? 'Edit Channels' : 'Add to Planning'}
            </Btn>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {channelPill(<Tv className="w-3 h-3 text-text-2" />, linearCh?.name, linearCh?.color)}
          {event.linearStartTime && linearCh && (
            <div className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1">
              <Clock className="w-3 h-3 text-text-3" />
              <span className="text-xs text-text-3 font-mono">{event.linearStartTime}</span>
            </div>
          )}
          {channelPill(<MonitorPlay className="w-3 h-3 text-text-2" />, onDemandCh?.name, onDemandCh?.color)}
          {channelPill(<Radio className="w-3 h-3 text-text-2" />, radioCh?.name, radioCh?.color)}
        </div>
      </div>

      {/* Channel picker popover */}
      {showPicker && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <Tv className="w-3 h-3 inline mr-1" />Linear Channel
              </label>
              <ChannelSelect
                value={form.channelId}
                onChange={(id) => setForm(f => ({ ...f, channelId: id }))}
                type="linear"
                placeholder="— None —"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <Clock className="w-3 h-3 inline mr-1" />Linear Start Time
              </label>
              <input
                type="time"
                value={form.linearStartTime}
                onChange={e => setForm(f => ({ ...f, linearStartTime: e.target.value }))}
                className="inp w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <MonitorPlay className="w-3 h-3 inline mr-1" />On-demand Platform
              </label>
              <ChannelSelect
                value={form.onDemandChannelId}
                onChange={(id) => setForm(f => ({ ...f, onDemandChannelId: id }))}
                type="on-demand"
                placeholder="— None —"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">
                <Radio className="w-3 h-3 inline mr-1" />Radio Channel
              </label>
              <ChannelSelect
                value={form.radioChannelId}
                onChange={(id) => setForm(f => ({ ...f, radioChannelId: id }))}
                type="radio"
                placeholder="— None —"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Btn size="sm" onClick={handleSave}>Save</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowPicker(false)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  )
})
