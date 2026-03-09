import { useMemo } from 'react'
import { AlertTriangle, Info, Zap, Bell, X } from 'lucide-react'
import type { Alert } from '../../data/types'

interface AlertPanelProps {
  alerts: Alert[]
  onDismiss?: (code: string, slotId: string) => void
  onAction?: (alert: Alert) => void
}

const SEVERITY_ORDER = ['ACTION', 'URGENT', 'WARNING', 'INFO', 'OPPORTUNITY']

const SEVERITY_STYLES: Record<string, { bg: string; icon: typeof AlertTriangle; label: string }> = {
  ACTION: { bg: 'bg-red-500/10 border-red-500/30', icon: Zap, label: 'Action Required' },
  URGENT: { bg: 'bg-orange-500/10 border-orange-500/30', icon: AlertTriangle, label: 'Urgent' },
  WARNING: { bg: 'bg-amber-500/10 border-amber-500/30', icon: AlertTriangle, label: 'Warning' },
  INFO: { bg: 'bg-blue-500/10 border-blue-500/30', icon: Info, label: 'Info' },
  OPPORTUNITY: { bg: 'bg-green-500/10 border-green-500/30', icon: Bell, label: 'Opportunity' },
}

export function AlertPanel({ alerts, onDismiss, onAction }: AlertPanelProps) {
  const sorted = useMemo(
    () => [...alerts].sort((a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    ),
    [alerts]
  )

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-3">
        <Bell className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No active alerts</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sorted.map((alert, i) => {
        const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.INFO
        const Icon = style.icon
        return (
          <div
            key={`${alert.code}-${alert.slotId}-${i}`}
            className={`rounded-lg border p-3 ${style.bg}`}
          >
            <div className="flex items-start gap-2">
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{alert.code.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] opacity-60">{style.label}</span>
                </div>
                <p className="text-xs mt-0.5 opacity-80">{alert.message}</p>
                {alert.severity === 'ACTION' && onAction && (
                  <button
                    onClick={() => onAction(alert)}
                    className="mt-2 btn btn-p text-xs px-3 py-1"
                  >
                    Confirm Switch
                  </button>
                )}
              </div>
              {onDismiss && (
                <button
                  onClick={() => onDismiss(alert.code, alert.slotId)}
                  className="text-text-3 hover:text-text p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
