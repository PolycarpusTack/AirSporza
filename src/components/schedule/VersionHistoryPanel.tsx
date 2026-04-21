import { useEffect, useState } from 'react'
import { History, AlertTriangle, CheckCircle2, Zap } from 'lucide-react'
import { schedulesApi } from '../../services/schedules'
import type { ScheduleVersion, BroadcastSlot, Channel } from '../../data/types'
import { Btn } from '../ui'
import { useToast } from '../Toast'

interface Props {
  channelId?: number
  channels: Channel[]
}

type VersionWithSlots = ScheduleVersion & { broadcastSlots?: BroadcastSlot[] }

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function VersionHistoryPanel({ channelId, channels }: Props) {
  const toast = useToast()
  const [versions, setVersions] = useState<ScheduleVersion[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VersionWithSlots | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    let cancelled = false
    setVersions(null)
    setSelectedId(null)
    setDetail(null)
    schedulesApi.listVersions(channelId != null ? { channelId } : undefined)
      .then(data => { if (!cancelled) setVersions(data) })
      .catch(err => {
        if (!cancelled) toast.error((err as Error).message || 'Failed to load versions')
      })
    return () => { cancelled = true }
  }, [channelId])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let cancelled = false
    setLoadingDetail(true)
    schedulesApi.getVersion(selectedId)
      .then(data => { if (!cancelled) setDetail(data) })
      .catch(err => {
        if (!cancelled) toast.error((err as Error).message || 'Failed to load version snapshot')
      })
      .finally(() => { if (!cancelled) setLoadingDetail(false) })
    return () => { cancelled = true }
  }, [selectedId])

  if (versions === null) {
    return <div className="text-sm text-text-3 p-4">Loading versions…</div>
  }
  if (versions.length === 0) {
    return (
      <div className="text-center py-16 text-text-3 text-sm">
        <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
        No published schedules yet for this channel.
      </div>
    )
  }

  const channelById = new Map(channels.map(c => [c.id, c]))

  return (
    <div className="flex gap-4 h-[calc(100vh-240px)]">
      {/* Version timeline */}
      <div className="w-80 flex-shrink-0 overflow-y-auto border border-border rounded-xl bg-surface">
        <div className="sticky top-0 bg-surface border-b border-border px-3 py-2 flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Published Versions</span>
          <span className="text-[11px] text-text-3 ml-auto">{versions.length}</span>
        </div>
        <ul className="divide-y divide-border/60">
          {versions.map(v => {
            const channel = channelById.get(v.channelId)
            const isSelected = v.id === selectedId
            const warnings = v.acknowledgedWarnings?.length ?? 0
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">v{v.versionNumber}</span>
                    {v.isEmergency && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-semibold">
                        <Zap className="w-3 h-3" /> EMERGENCY
                      </span>
                    )}
                    {warnings > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                        <AlertTriangle className="w-3 h-3" /> {warnings}
                      </span>
                    )}
                    {v.isEmergency === false && warnings === 0 && (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    )}
                  </div>
                  <div className="text-xs text-text-2 mt-1 flex items-center gap-1">
                    {channel && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: channel.color }}
                      />
                    )}
                    {channel?.name ?? 'All channels'}
                  </div>
                  <div className="text-[11px] text-text-3 mt-0.5">
                    {formatTimestamp(v.publishedAt)}
                  </div>
                  <div className="text-[11px] text-text-3 truncate">
                    by {v.publishedBy}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Snapshot detail */}
      <div className="flex-1 min-w-0 border border-border rounded-xl bg-surface overflow-hidden flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-text-3 text-sm">
            Select a version to view its snapshot.
          </div>
        ) : loadingDetail ? (
          <div className="flex-1 flex items-center justify-center text-text-3 text-sm">
            Loading snapshot…
          </div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center text-text-3 text-sm">
            Could not load version detail.
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-2.5 flex items-center gap-3">
              <div>
                <div className="text-sm font-semibold">
                  Version {detail.versionNumber}
                  {detail.isEmergency && <span className="text-red-500 ml-2 text-xs">EMERGENCY</span>}
                </div>
                <div className="text-[11px] text-text-3">
                  {formatTimestamp(detail.publishedAt)} · {detail.publishedBy}
                </div>
              </div>
              <div className="ml-auto">
                <Btn
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Rollback / restore to draft — coming soon"
                >
                  Restore to new draft
                </Btn>
              </div>
            </div>

            {detail.acknowledgedWarnings && detail.acknowledgedWarnings.length > 0 && (
              <div className="px-4 py-2 border-b border-border bg-amber-500/5">
                <div className="text-xs text-amber-500 font-semibold mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Acknowledged warnings at publish time
                </div>
                <ul className="text-[11px] text-text-2 space-y-0.5">
                  {detail.acknowledgedWarnings.slice(0, 5).map((w, idx) => (
                    <li key={idx}>
                      <span className="font-mono bg-surface-2 px-1 rounded mr-1">{w.code}</span>
                      {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface border-b border-border">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-text-3">
                    <th className="px-4 py-2">Start (UTC)</th>
                    <th className="px-4 py-2">End (UTC)</th>
                    <th className="px-4 py-2">Channel</th>
                    <th className="px-4 py-2">Event</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(detail.broadcastSlots ?? []).map(slot => {
                    const channel = channelById.get(slot.channelId)
                    return (
                      <tr key={slot.id} className="hover:bg-surface-2/40">
                        <td className="px-4 py-1.5 font-mono text-xs">
                          {slot.plannedStartUtc ? new Date(slot.plannedStartUtc).toISOString().slice(11, 16) : '—'}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-xs">
                          {slot.plannedEndUtc ? new Date(slot.plannedEndUtc).toISOString().slice(11, 16) : '—'}
                        </td>
                        <td className="px-4 py-1.5">
                          {channel && (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: channel.color }} />
                              {channel.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-1.5 truncate max-w-xs">
                          {slot.event?.participants ?? (slot.eventId ? `#${slot.eventId}` : '—')}
                        </td>
                        <td className="px-4 py-1.5 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-surface-2 text-text-3">{slot.status}</span>
                        </td>
                      </tr>
                    )
                  })}
                  {(!detail.broadcastSlots || detail.broadcastSlots.length === 0) && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-text-3 text-sm">
                        No slots in this version.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
