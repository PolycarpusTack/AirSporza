import React from 'react'
import { HOUR_LABELS, PX_PER_HOUR, CAL_HEIGHT } from '../../utils/calendarLayout'

export const TimeGutter = React.memo(function TimeGutter() {
  return (
    <div
      className="bg-surface-2/50 relative"
      style={{ height: CAL_HEIGHT }}
    >
      {HOUR_LABELS.map((label, i) => (
        <div
          key={label}
          className="absolute right-1 text-right"
          style={{ top: i * PX_PER_HOUR, lineHeight: '1' }}
        >
          <span className="text-xs text-text-3 font-mono">{label.replace(':00', '')}</span>
        </div>
      ))}
    </div>
  )
})
