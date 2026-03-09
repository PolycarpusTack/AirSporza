import { useState, useEffect, useCallback } from 'react'
import { ScheduleGrid } from '../components/schedule/ScheduleGrid'
import { DraftToolbar } from '../components/schedule/DraftToolbar'
import { schedulesApi } from '../services/schedules'
import { useToast } from '../components/Toast'
import type { Channel, BroadcastSlot, ScheduleDraft } from '../data/types'
import { CascadeDashboard } from '../components/schedule/CascadeDashboard'
import { ChevronLeft, ChevronRight, Grid2X2, Activity } from 'lucide-react'

export function ScheduleView() {
  const toast = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [slots, setSlots] = useState<BroadcastSlot[]>([])
  const [, setDrafts] = useState<ScheduleDraft[]>([])
  const [activeDraft, setActiveDraft] = useState<ScheduleDraft | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [selectedSlot, setSelectedSlot] = useState<BroadcastSlot | null>(null)
  const [activeTab, setActiveTab] = useState<'grid' | 'cascade'>('grid')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ch, sl, dr] = await Promise.all([
        schedulesApi.listChannels(),
        schedulesApi.listSlots({ date }),
        schedulesApi.listDrafts(),
      ])
      setChannels(ch)
      setSlots(sl)
      setDrafts(dr)
      if (dr.length && !activeDraft) {
        setActiveDraft(dr.find(d => d.status !== 'PUBLISHED') || dr[0])
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load schedule data')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { fetchData() }, [fetchData])

  const prevDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    setDate(d.toISOString().slice(0, 10))
  }

  const nextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    setDate(d.toISOString().slice(0, 10))
  }

  const today = () => setDate(new Date().toISOString().slice(0, 10))

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-head">Schedule</h1>
          <p className="text-xs text-text-3 mt-0.5">Broadcast schedule grid — channels x time</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="btn btn-s p-1.5"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={today} className="btn btn-s text-xs px-3">Today</button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input text-sm px-2 py-1"
          />
          <button onClick={nextDay} className="btn btn-s p-1.5"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Draft Toolbar */}
      <DraftToolbar
        draft={activeDraft}
        onPublished={fetchData}
        onValidated={(results) => {
          if (results.length === 0) toast.success('All clear')
        }}
      />

      {/* View tabs */}
      <div className="flex gap-1 border border-border rounded-lg p-0.5 bg-surface-2 w-fit">
        <button
          onClick={() => setActiveTab('grid')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTab === 'grid' ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text-2'
          }`}
        >
          <Grid2X2 className="w-3.5 h-3.5" /> Grid
        </button>
        <button
          onClick={() => setActiveTab('cascade')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTab === 'cascade' ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text-2'
          }`}
        >
          <Activity className="w-3.5 h-3.5" /> Cascade
        </button>
      </div>

      {/* Grid / Cascade */}
      {activeTab === 'grid' ? (
        loading ? (
          <div className="h-96 bg-surface-2 rounded-xl animate-pulse" />
        ) : channels.length === 0 ? (
          <div className="text-center py-20 text-text-3">
            <p className="text-sm">No channels configured yet.</p>
            <p className="text-xs mt-1">Add channels in Settings &rarr; Organisation</p>
          </div>
        ) : (
          <ScheduleGrid
            channels={channels}
            slots={slots}
            date={date}
            onSlotClick={setSelectedSlot}
          />
        )
      ) : (
        <CascadeDashboard
          date={date}
          onDateChange={setDate}
        />
      )}

      {/* Selected slot detail panel */}
      {selectedSlot && (
        <div className="fixed right-0 top-14 bottom-0 w-80 bg-surface border-l border-border p-4 shadow-xl overflow-y-auto z-30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Slot Detail</h3>
            <button onClick={() => setSelectedSlot(null)} className="text-text-3 hover:text-text text-xs">Close</button>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-text-3 text-xs">Event</span>
              <p className="font-medium">{selectedSlot.event?.participants || 'Unlinked'}</p>
            </div>
            <div>
              <span className="text-text-3 text-xs">Status</span>
              <p>{selectedSlot.status}</p>
            </div>
            <div>
              <span className="text-text-3 text-xs">Mode</span>
              <p>{selectedSlot.schedulingMode}</p>
            </div>
            <div>
              <span className="text-text-3 text-xs">Planned</span>
              <p className="font-mono text-xs">
                {selectedSlot.plannedStartUtc ? new Date(selectedSlot.plannedStartUtc).toLocaleTimeString() : '--'} – {selectedSlot.plannedEndUtc ? new Date(selectedSlot.plannedEndUtc).toLocaleTimeString() : '--'}
              </p>
            </div>
            {selectedSlot.estimatedStartUtc && (
              <div>
                <span className="text-text-3 text-xs">Estimated</span>
                <p className="font-mono text-xs">
                  {new Date(selectedSlot.estimatedStartUtc).toLocaleTimeString()} – {selectedSlot.estimatedEndUtc ? new Date(selectedSlot.estimatedEndUtc).toLocaleTimeString() : '--'}
                </p>
              </div>
            )}
            <div>
              <span className="text-text-3 text-xs">Overrun Strategy</span>
              <p>{selectedSlot.overrunStrategy}</p>
            </div>
            <div>
              <span className="text-text-3 text-xs">Buffer</span>
              <p>{selectedSlot.bufferBeforeMin}min before / {selectedSlot.bufferAfterMin}min after</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
