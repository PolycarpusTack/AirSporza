import { useMemo } from 'react'
import type { CascadeEstimate } from '../../data/types'

interface CourtTimelineProps {
  courtName: string
  estimates: CascadeEstimate[]
  dayStartHour?: number
}

const PIXELS_PER_HOUR = 60

export function CourtTimeline({ courtName, estimates, dayStartHour = 10 }: CourtTimelineProps) {
  const sorted = useMemo(
    () => [...estimates].sort((a, b) =>
      new Date(a.estimatedStartUtc).getTime() - new Date(b.estimatedStartUtc).getTime()
    ),
    [estimates]
  )

  const totalHours = 14 // 10:00 to midnight
  const totalHeight = totalHours * PIXELS_PER_HOUR

  return (
    <div className="flex flex-col min-w-[180px]">
      {/* Court header */}
      <div className="h-8 flex items-center justify-center border-b border-border px-2">
        <span className="text-xs font-semibold truncate">{courtName}</span>
      </div>

      {/* Timeline */}
      <div className="relative" style={{ height: totalHeight }}>
        {/* Hour gridlines */}
        {Array.from({ length: totalHours }, (_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-border/20"
            style={{ top: `${i * PIXELS_PER_HOUR}px` }}
          />
        ))}

        {/* Estimate blocks */}
        {sorted.map((est) => {
          const startHour = getHourOffset(est.estimatedStartUtc, dayStartHour)
          const durationHours = ((est.estDurationShortMin + est.estDurationLongMin) / 2) / 60
          const top = startHour * PIXELS_PER_HOUR
          const height = Math.max(durationHours * PIXELS_PER_HOUR, 20)

          // Confidence whiskers
          const earliestOffset = getHourOffset(est.earliestStartUtc, dayStartHour) * PIXELS_PER_HOUR
          const latestOffset = getHourOffset(est.latestStartUtc, dayStartHour) * PIXELS_PER_HOUR

          const confidenceColor = est.confidenceScore >= 0.8 ? 'bg-green-500' :
            est.confidenceScore >= 0.5 ? 'bg-amber-500' : 'bg-red-500'

          return (
            <div key={est.id} className="absolute left-2 right-2">
              {/* Whisker line (earliest to latest) */}
              <div
                className="absolute left-1/2 w-px bg-text-3/30"
                style={{
                  top: `${earliestOffset}px`,
                  height: `${latestOffset - earliestOffset}px`,
                }}
              />

              {/* Main block */}
              <div
                className="absolute left-0 right-0 rounded-md border border-border bg-surface-2 px-1.5 py-1 overflow-hidden"
                style={{ top: `${top}px`, height: `${height}px` }}
              >
                <div className="text-[10px] font-medium truncate">
                  Match {est.eventId}
                </div>
                <div className="text-[9px] text-text-3 font-mono">
                  {formatTimeShort(est.estimatedStartUtc)}
                </div>
                {height > 40 && (
                  <div className="mt-1 flex items-center gap-1">
                    <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${confidenceColor}`}
                        style={{ width: `${est.confidenceScore * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-text-3">{Math.round(est.confidenceScore * 100)}%</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getHourOffset(utcStr: string, dayStartHour: number): number {
  const d = new Date(utcStr)
  return d.getUTCHours() + d.getUTCMinutes() / 60 - dayStartHour
}

function formatTimeShort(utcStr: string): string {
  const d = new Date(utcStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
