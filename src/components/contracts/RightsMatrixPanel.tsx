import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Ban } from 'lucide-react'
import { rightsApi, type RightsMatrixRow } from '../../services/rights'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'

const SEVERITY_STYLES: Record<RightsMatrixRow['severity'], { bg: string; text: string; icon: React.ReactNode }> = {
  ok: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  warning: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  error: {
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
}

const PLATFORM_LABELS: Record<string, string> = {
  linear: 'Linear',
  'on-demand': 'On-Demand',
  ott: 'OTT',
  radio: 'Radio',
  svod: 'SVOD',
  avod: 'AVOD',
  fast: 'FAST',
}

function formatDaysToExpiry(days: number | null): { text: string; urgent: boolean } {
  if (days == null) return { text: '—', urgent: false }
  if (days < 0) return { text: `expired ${Math.abs(days)}d ago`, urgent: true }
  if (days === 0) return { text: 'expires today', urgent: true }
  if (days === 1) return { text: '1 day', urgent: true }
  if (days <= 30) return { text: `${days} days`, urgent: true }
  if (days < 365) return { text: `${days} days`, urgent: false }
  return { text: `${Math.floor(days / 365)}y ${days % 365}d`, urgent: false }
}

function RunsBar({ used, max }: { used: number; max: number | null }) {
  if (max == null) {
    return <span className="text-xs text-text-3">{used} · unlimited</span>
  }
  const pct = Math.min(100, Math.round((used / max) * 100))
  const over = used >= max
  const near = used >= max - 1
  const barColour = over ? 'bg-red-500' : near ? 'bg-amber-400' : 'bg-emerald-500'

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full ${barColour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono whitespace-nowrap ${over ? 'text-red-500' : near ? 'text-amber-500' : 'text-text-2'}`}>
        {used}/{max}
      </span>
    </div>
  )
}

export function RightsMatrixPanel() {
  const toast = useToast()
  const [rows, setRows] = useState<RightsMatrixRow[] | null>(null)

  useEffect(() => {
    rightsApi.matrix()
      .then(setRows)
      .catch(err => handleApiError(err, 'Failed to load rights matrix', toast))
  }, [])

  if (rows === null) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-3 bg-surface-2 rounded w-1/4 mb-3" />
        <div className="h-3 bg-surface-2 rounded w-3/4 mb-2" />
        <div className="h-3 bg-surface-2 rounded w-2/3" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-text-3 text-sm">
        No contracts configured yet.
      </div>
    )
  }

  // Group by severity for the summary strip up top.
  const errorCount = rows.filter(r => r.severity === 'error').length
  const warningCount = rows.filter(r => r.severity === 'warning').length
  const okCount = rows.filter(r => r.severity === 'ok').length

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center gap-4 text-xs">
        <span className="font-semibold text-text-2">{rows.length} contracts</span>
        <span className="text-text-3">·</span>
        <span className="flex items-center gap-1 text-emerald-500">
          <CheckCircle2 className="w-3 h-3" /> {okCount} clear
        </span>
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="w-3 h-3" /> {warningCount} warning
          </span>
        )}
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <AlertCircle className="w-3 h-3" /> {errorCount} blocked
          </span>
        )}
      </div>

      {/* Matrix table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted">Competition</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted">Platforms</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted">Territory</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted">Live Runs</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted">Expires</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map(r => {
                const sev = SEVERITY_STYLES[r.severity]
                const expiry = formatDaysToExpiry(r.daysUntilExpiry)
                return (
                  <tr key={r.contractId} className="hover:bg-surface-2/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-text">{r.competitionName}</div>
                      {r.seasonName && (
                        <div className="text-[11px] text-text-3 mt-0.5">{r.seasonName}</div>
                      )}
                      {r.blackoutCount > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-500 mt-0.5">
                          <Ban className="w-3 h-3" />
                          {r.blackoutCount} blackout{r.blackoutCount > 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {r.platforms.length > 0 ? r.platforms.map(p => (
                          <span
                            key={p}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-2"
                          >
                            {PLATFORM_LABELS[p] ?? p}
                          </span>
                        )) : (
                          <span className="text-xs text-text-3">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.territory.length > 0 ? (
                        <span className="text-xs font-mono text-text-2">{r.territory.join(', ')}</span>
                      ) : (
                        <span className="text-xs text-text-3">any</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <RunsBar used={r.runsUsed} max={r.maxLiveRuns} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs ${expiry.urgent ? 'text-red-500 font-medium' : 'text-text-3'}`}>
                        {expiry.text}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${sev.bg} ${sev.text}`}>
                        {sev.icon}
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
