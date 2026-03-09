import { useState, useEffect, useMemo } from 'react'
import { CourtTimeline } from './CourtTimeline'
import { AlertPanel } from './AlertPanel'
import { useCascade } from '../../hooks/useCascade'
import { api } from '../../utils/api'
import type { Court, CascadeEstimate, Alert } from '../../data/types'
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react'

interface CascadeDashboardProps {
  date: string
  onDateChange: (date: string) => void
  onSwitchAction?: (alert: Alert) => void
}

export function CascadeDashboard({ date, onDateChange, onSwitchAction }: CascadeDashboardProps) {
  const [courts, setCourts] = useState<Court[]>([])
  const [selectedCourtId, setSelectedCourtId] = useState<number | undefined>()
  const { estimates, alerts, loading, dismissAlert } = useCascade(selectedCourtId, date)

  // Fetch courts
  useEffect(() => {
    api.get<Court[]>('/courts').then(setCourts).catch(() => {})
  }, [])

  // Auto-select first court
  useEffect(() => {
    if (courts.length > 0 && !selectedCourtId) {
      setSelectedCourtId(courts[0].id)
    }
  }, [courts, selectedCourtId])

  // Group estimates by court (using eventId -> court mapping from sportMetadata)
  // For now, show all estimates on the selected court timeline
  const courtEstimates = useMemo(() => {
    const map = new Map<number, CascadeEstimate[]>()
    for (const court of courts) {
      map.set(court.id, [])
    }
    // All estimates go to selected court for now
    if (selectedCourtId) {
      map.set(selectedCourtId, estimates)
    }
    return map
  }, [courts, estimates, selectedCourtId])

  const prevDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    onDateChange(d.toISOString().slice(0, 10))
  }

  const nextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    onDateChange(d.toISOString().slice(0, 10))
  }

  return (
    <div className="flex gap-4">
      {/* Main area — court timelines */}
      <div className="flex-1 min-w-0">
        {/* Controls */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold font-head">Cascade</span>
          </div>

          {/* Court chips */}
          <div className="flex gap-1">
            {courts.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCourtId(c.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedCourtId === c.id
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-surface-2 border-border text-text-2 hover:bg-surface-2/80'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <button onClick={prevDay} className="btn btn-s p-1"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="text-xs font-mono text-text-2 px-1">{date}</span>
            <button onClick={nextDay} className="btn btn-s p-1"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* Timelines */}
        {loading ? (
          <div className="h-64 bg-surface-2 rounded-xl animate-pulse" />
        ) : courts.length === 0 ? (
          <div className="text-center py-16 text-text-3 text-sm">
            No courts configured. Add courts in Settings.
          </div>
        ) : (
          <div className="flex overflow-x-auto border border-border rounded-xl bg-surface">
            {/* Time axis */}
            <div className="flex-shrink-0 w-12 border-r border-border">
              <div className="h-8" />
              {Array.from({ length: 14 }, (_, i) => (
                <div
                  key={i}
                  className="h-[60px] px-1 text-[9px] text-text-3 font-mono flex items-start pt-0.5"
                >
                  {String((10 + i) % 24).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Court columns — show selected or all */}
            {courts
              .filter(c => !selectedCourtId || c.id === selectedCourtId)
              .map(court => (
                <CourtTimeline
                  key={court.id}
                  courtName={court.name}
                  estimates={courtEstimates.get(court.id) || []}
                />
              ))}
          </div>
        )}
      </div>

      {/* Alert sidebar */}
      <div className="w-72 flex-shrink-0">
        <div className="sticky top-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold">Alerts</span>
            {alerts.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
                {alerts.length}
              </span>
            )}
          </div>
          <div className="bg-surface border border-border rounded-xl p-3 max-h-[calc(100vh-200px)] overflow-y-auto">
            <AlertPanel
              alerts={alerts}
              onDismiss={dismissAlert}
              onAction={onSwitchAction}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
