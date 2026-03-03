import { useState, useMemo } from 'react'
import { Badge } from '../components/ui'
import type { DashboardWidget, Contract } from '../data/types'
import { SPORTS, COMPETITIONS, CONTRACTS } from '../data'
import { fmtDate, daysUntil } from '../utils'

interface ContractsViewProps {
  widgets: DashboardWidget[]
}

const statusConf: Record<string, { l: string; i: string }> = {
  valid: { l: "Valid", i: "🟢" },
  expiring: { l: "Expiring", i: "🟡" },
  draft: { l: "Negotiation", i: "🟠" },
  none: { l: "No Contract", i: "🔴" }
}

export function ContractsView({ widgets }: ContractsViewProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [filter, setFilter] = useState("all")
  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)

  const data = useMemo(() => CONTRACTS.map(c => ({
    ...c,
    competition: COMPETITIONS.find(comp => comp.id === c.competitionId),
    sport: SPORTS.find(s => s.id === COMPETITIONS.find(comp => comp.id === c.competitionId)?.sportId),
  })), [])

  const filtered = filter === "all" ? data : data.filter(c => c.status === filter)

  const showSummary = visWidgets.some(w => w.id === "statusSummary")
  const showTable = visWidgets.some(w => w.id === "contractTable")
  const showAlerts = visWidgets.some(w => w.id === "expiryAlerts")
  const showMatrix = visWidgets.some(w => w.id === "rightsMatrix")

  const expiringContracts = data.filter(c => {
    const d = daysUntil(c.validUntil)
    return d > 0 && d < 365
  }).sort((a, b) => daysUntil(a.validUntil) - daysUntil(b.validUntil))

  return (
    <div className="space-y-6">
      {showSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
          {Object.entries(statusConf).map(([k, v]) => (
            <div key={k} className="card p-4">
              <div className="text-2xl mb-1">{v.i}</div>
              <div className="score text-foreground">{data.filter(c => c.status === k).length}</div>
              <div className="text-xs text-muted">{v.l}</div>
            </div>
          ))}
        </div>
      )}

      {showAlerts && expiringContracts.length > 0 && (
        <div className="animate-fade-in rounded-md border border-warning/25 bg-warning/10 p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-warning">Expiry Alerts</h4>
          <div className="space-y-2">
            {expiringContracts.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{c.sport?.icon} {c.competition?.name}</span>
                <span className="font-mono text-xs text-warning">{daysUntil(c.validUntil)} days - {fmtDate(c.validUntil)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showMatrix && (
        <div className="card animate-fade-in p-4">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Rights Matrix</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="text-left pb-2">Competition</th>
                  <th className="text-center pb-2">Linear</th>
                  <th className="text-center pb-2">VRT MAX</th>
                  <th className="text-center pb-2">Radio</th>
                  <th className="text-center pb-2">Sublicense</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c: Contract & { competition?: { name: string }; sport?: { icon: string } }) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{c.sport?.icon} {c.competition?.name}</td>
                    <td className="text-center py-2">{c.linearRights ? "✅" : "❌"}</td>
                    <td className="text-center py-2">{c.maxRights ? "✅" : "❌"}</td>
                    <td className="text-center py-2">{c.radioRights ? "✅" : "❌"}</td>
                    <td className="text-center py-2">{c.sublicensing ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showTable && (
        <div className="animate-fade-in">
          <div className="flex gap-2 mb-4 flex-wrap">
            {["all", "valid", "expiring", "draft", "none"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  filter === f
                    ? 'bg-brand text-brand-foreground shadow-sm'
                    : 'border border-border bg-surface text-muted hover:border-primary hover:text-primary'
                }`}
              >
                {f === "all" ? "All" : statusConf[f]?.l || f}
              </button>
            ))}
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Competition</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted sm:table-cell">Sport</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted md:table-cell">Expiry</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted lg:table-cell">Rights</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((c: Contract & { competition?: { name: string }; sport?: { icon: string; name: string } }) => {
                    const open = expandedRow === c.id
                    const days = daysUntil(c.validUntil)
                    return (
                      <tr key={c.id} onClick={() => setExpandedRow(open ? null : c.id)} className="cursor-pointer transition hover:bg-surface-2">
                        <td className="px-4 py-3"><span className="font-medium">{c.competition?.name}</span></td>
                        <td className="hidden px-4 py-3 text-muted sm:table-cell">{c.sport?.icon} {c.sport?.name}</td>
                        <td className="px-4 py-3"><Badge variant={c.status}>{statusConf[c.status]?.l}</Badge></td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div>{fmtDate(c.validUntil)}</div>
                          {days < 180 && days > 0 && <div className="text-xs font-medium text-warning">{days}d left</div>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex gap-1">
                            {c.linearRights && <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-success/15 text-xs font-bold text-success">L</span>}
                            {c.maxRights && <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary/10 text-xs font-bold text-primary">M</span>}
                            {c.radioRights && <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-brand/10 text-xs font-bold text-foreground">R</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className={`inline-block text-xs text-muted transition-transform ${open ? "rotate-90" : ""}`}>▶</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
