interface TimeGutterProps {
  dayStartHour: number
  dayEndHour: number
  pxPerHour: number
}

export function TimeGutter({ dayStartHour, dayEndHour, pxPerHour }: TimeGutterProps) {
  const hours: number[] = []
  for (let h = dayStartHour; h <= dayEndHour; h++) {
    hours.push(h)
  }

  return (
    <div className="w-14 border-r border-border flex-shrink-0">
      {/* Header spacer */}
      <div className="h-10 border-b border-border" />

      {/* Hour labels */}
      <div className="relative" style={{ height: `${(dayEndHour - dayStartHour) * pxPerHour}px` }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute right-2 text-[10px] text-text-3 font-mono leading-none -translate-y-1/2"
            style={{ top: `${(h - dayStartHour) * pxPerHour}px` }}
          >
            {String(h % 24).padStart(2, '0')}:00
          </div>
        ))}
      </div>
    </div>
  )
}
