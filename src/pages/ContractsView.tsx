import { useState, useEffect } from 'react'
import { Badge } from '../components/ui'
import type { DashboardWidget, Contract } from '../data/types'
import { contractsApi } from '../services'
import { fmtDate, daysUntil } from '../utils'
import { useAuth } from '../hooks'
import { ContractForm } from '../components/forms/ContractForm'

// ── Expandable detail panel ───────────────────────────────────────────────────

function ContractDetailPanel({
  contract,
  canManageContracts,
  onEdit,
}: {
  contract: ContractWithRelations
  canManageContracts: boolean
  onEdit: () => void
}) {
  return (
    <div className="px-4 py-4 bg-surface-2 border-t border-border grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Validity</p>
        <p className="font-mono text-text">
          {fmtDate(contract.validFrom)} – {fmtDate(contract.validUntil)}
        </p>
      </div>
      {contract.geoRestriction && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Geo restriction</p>
          <p className="text-text-2">{contract.geoRestriction}</p>
        </div>
      )}
      {canManageContracts && contract.fee && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Fee</p>
          <p className="font-mono font-medium text-text">{contract.fee}</p>
        </div>
      )}
      {canManageContracts && contract.notes && (
        <div className="md:col-span-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Notes</p>
          <p className="text-text-2 whitespace-pre-wrap">{contract.notes}</p>
        </div>
      )}
      {canManageContracts && (
        <div className="md:col-span-3 flex gap-2 pt-1">
          <button onClick={onEdit} className="btn btn-s btn-sm">Edit contract</button>
        </div>
      )}
    </div>
  )
}

interface ContractsViewProps {
  widgets: DashboardWidget[]
}

type ContractWithRelations = Contract & {
  competition?: { name: string }
  sport?: { icon: string; name: string }
}

const statusConf: Record<string, { l: string; i: string; color: string; textColor: string }> = {
  valid:    { l: 'Valid',        i: '🟢', color: 'rgba(16,185,129,0.12)',  textColor: '#10B981' },
  expiring: { l: 'Expiring',     i: '🟡', color: 'rgba(245,158,11,0.12)',  textColor: '#F59E0B' },
  draft:    { l: 'Negotiation',  i: '🟠', color: 'rgba(251,146,60,0.12)',  textColor: '#FB923C' },
  none:     { l: 'No Contract',  i: '🔴', color: 'rgba(239,68,68,0.12)',   textColor: '#EF4444' },
}

export function ContractsView({ widgets }: ContractsViewProps) {
  const { user } = useAuth()
  const [data, setData] = useState<ContractWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editContract, setEditContract] = useState<ContractWithRelations | null>(null)

  const canManageContracts = user?.role === 'admin' || user?.role === 'contracts'

  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  const showSummary = visWidgets.some(w => w.id === 'statusSummary')
  const showTable   = visWidgets.some(w => w.id === 'contractTable')
  const showAlerts  = visWidgets.some(w => w.id === 'expiryAlerts')
  const showMatrix  = visWidgets.some(w => w.id === 'rightsMatrix')

  useEffect(() => {
    setLoading(true)
    contractsApi.list()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? data : data.filter(c => c.status === filter)

  const expiringContracts = data.filter(c => {
    const d = daysUntil(c.validUntil)
    return d > 0 && d <= 30
  }).sort((a, b) => daysUntil(a.validUntil) - daysUntil(b.validUntil))

  const handleSaved = (saved: Contract) => {
    setData(prev => {
      const idx = prev.findIndex(c => c.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...prev[idx], ...saved }
        return next
      }
      return [...prev, saved as ContractWithRelations]
    })
    setShowForm(false)
    setEditContract(null)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-4 bg-surface-2 rounded w-1/3 mb-2" />
            <div className="h-3 bg-surface-2 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Add button */}
      {canManageContracts && (
        <div className="flex justify-end">
          <button
            onClick={() => { setEditContract(null); setShowForm(true) }}
            className="btn btn-p btn-sm"
          >
            + Add Contract
          </button>
        </div>
      )}

      {/* ── STATUS PIPELINE ─── */}
      <div
        className="grid grid-cols-4 gap-px animate-fade-in overflow-hidden rounded-lg"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {Object.entries(statusConf).map(([k, v]) => {
          const count = data.filter(c => c.status === k).length
          const isActive = filter === k
          return (
            <button
              key={k}
              onClick={() => setFilter(isActive ? 'all' : k)}
              className="flex items-center gap-3 p-4 text-left transition-colors"
              style={{
                background: isActive ? v.color : 'var(--surface)',
              }}
            >
              <span className="text-xl">{v.i}</span>
              <div>
                <div
                  className="text-2xl font-bold font-head leading-none"
                  style={{ color: isActive ? v.textColor : undefined }}
                >
                  {count}
                </div>
                <div
                  className="text-xs font-mono uppercase tracking-wide mt-0.5"
                  style={{ color: isActive ? v.textColor : 'var(--text-muted, #7A8BA6)' }}
                >
                  {v.l}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Legacy widgets */}
      {showSummary && false /* pipeline replaces summary */ && (
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
                {data.map(c => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{c.sport?.icon} {c.competition?.name}</td>
                    <td className="text-center py-2">{c.linearRights ? '✅' : '❌'}</td>
                    <td className="text-center py-2">{c.maxRights ? '✅' : '❌'}</td>
                    <td className="text-center py-2">{c.radioRights ? '✅' : '❌'}</td>
                    <td className="text-center py-2">{c.sublicensing ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showTable && (
        <div className="animate-fade-in">
          {/* Filter tabs */}
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            {[
              { id: 'all', label: `All (${data.length})` },
              ...Object.entries(statusConf).map(([k, v]) => ({
                id: k,
                label: `${v.i} ${v.l} (${data.filter(c => c.status === k).length})`,
              })),
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  filter === f.id
                    ? 'bg-brand text-brand-foreground shadow-sm'
                    : 'border border-border bg-surface text-muted hover:border-primary hover:text-primary'
                }`}
              >
                {f.label}
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
                    {canManageContracts && <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted lg:table-cell">Fee</th>}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const open = expandedRow === c.id
                    const days = daysUntil(c.validUntil)
                    return (
                      <tr key={c.id}>
                        <td colSpan={canManageContracts ? 7 : 6} className="p-0 border-b border-border/60">
                          {/* Row */}
                          <div
                            onClick={() => setExpandedRow(open ? null : c.id)}
                            className="cursor-pointer transition hover:bg-surface-2 grid items-center"
                            style={{ gridTemplateColumns: canManageContracts ? '1fr 120px 120px 110px 100px 100px 32px' : '1fr 120px 120px 110px 100px 32px' }}
                          >
                            <div className="px-4 py-3 font-medium">{c.competition?.name}</div>
                            <div className="px-4 py-3 text-muted hidden sm:block">{c.sport?.icon} {c.sport?.name}</div>
                            <div className="px-4 py-3"><Badge variant={c.status}>{statusConf[c.status]?.l}</Badge></div>
                            <div className="px-4 py-3 hidden md:block">
                              <div>{fmtDate(c.validUntil)}</div>
                              {days < 180 && days > 0 && <div className="text-xs font-medium text-warning">{days}d left</div>}
                            </div>
                            <div className="px-4 py-3 hidden lg:flex gap-1">
                              {c.linearRights && <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-success/15 text-xs font-bold text-success">L</span>}
                              {c.maxRights && <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary/10 text-xs font-bold text-primary">M</span>}
                              {c.radioRights && <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-brand/10 text-xs font-bold text-foreground">R</span>}
                            </div>
                            {canManageContracts && (
                              <div className="px-4 py-3 hidden lg:block text-muted text-xs">{c.fee ?? '—'}</div>
                            )}
                            <div className="px-4 py-3 text-center">
                              <span className={`inline-block text-xs text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>▶</span>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {open && (
                            <ContractDetailPanel
                              contract={c}
                              canManageContracts={canManageContracts}
                              onEdit={() => { setEditContract(c); setShowForm(true) }}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={canManageContracts ? 7 : 6} className="px-4 py-8 text-center text-text-3 text-sm">
                        No contracts matching this filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <ContractForm
          contract={editContract}
          onClose={() => { setShowForm(false); setEditContract(null) }}
          onSaved={handleSaved}
          canManageContracts={canManageContracts}
        />
      )}
    </div>
  )
}
