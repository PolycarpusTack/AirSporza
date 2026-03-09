import { useState, useEffect } from 'react'
import { contractsApi, competitionsApi } from '../../services'
import { Toggle } from '../ui/Toggle'
import type { Contract, ContractStatus, CoverageType } from '../../data/types'

const PLATFORM_OPTIONS = ['linear', 'on-demand', 'radio', 'fast', 'pop-up'] as const
const COVERAGE_OPTIONS: CoverageType[] = ['LIVE', 'DELAYED', 'HIGHLIGHTS']

interface ContractFormProps {
  contract?: (Contract & { competition?: { name: string }; sport?: { icon: string; name: string } }) | null
  onClose: () => void
  onSaved: (contract: Contract) => void
  canManageContracts: boolean
}

interface CompetitionOption {
  id: number
  name: string
  sport: { icon: string; name: string }
}

export function ContractForm({ contract, onClose, onSaved, canManageContracts }: ContractFormProps) {
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    competitionId: contract?.competitionId ?? 0,
    status: (contract?.status ?? 'draft') as ContractStatus,
    validFrom: contract?.validFrom ? String(contract.validFrom).slice(0, 10) : '',
    validUntil: contract?.validUntil ? String(contract.validUntil).slice(0, 10) : '',
    linearRights: contract?.linearRights ?? false,
    maxRights: contract?.maxRights ?? false,
    radioRights: contract?.radioRights ?? false,
    sublicensing: contract?.sublicensing ?? false,
    platforms: contract?.platforms ?? [],
    territory: contract?.territory?.join(', ') ?? '',
    coverageType: (contract?.coverageType ?? 'LIVE') as CoverageType,
    maxLiveRuns: contract?.maxLiveRuns ?? '',
    maxPickRunsPerRound: contract?.maxPickRunsPerRound ?? '',
    windowStartUtc: contract?.windowStartUtc ? String(contract.windowStartUtc).slice(0, 16) : '',
    windowEndUtc: contract?.windowEndUtc ? String(contract.windowEndUtc).slice(0, 16) : '',
    tapeDelayHoursMin: contract?.tapeDelayHoursMin ?? '',
    geoRestriction: contract?.geoRestriction ?? '',
    fee: contract?.fee ?? '',
    notes: contract?.notes ?? '',
  })

  useEffect(() => {
    competitionsApi.list().then(data => setCompetitions(data as CompetitionOption[])).catch(() => {})
  }, [])

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const togglePlatform = (platform: string) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        territory: form.territory ? form.territory.split(',').map(s => s.trim()).filter(Boolean) : [],
        maxLiveRuns: form.maxLiveRuns !== '' ? Number(form.maxLiveRuns) : null,
        maxPickRunsPerRound: form.maxPickRunsPerRound !== '' ? Number(form.maxPickRunsPerRound) : null,
        tapeDelayHoursMin: form.tapeDelayHoursMin !== '' ? Number(form.tapeDelayHoursMin) : null,
        windowStartUtc: form.windowStartUtc || null,
        windowEndUtc: form.windowEndUtc || null,
        fee: canManageContracts ? form.fee : undefined,
        notes: canManageContracts ? form.notes : undefined,
      }
      const saved = contract?.id
        ? await contractsApi.update(contract.id, payload)
        : await contractsApi.create(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg animate-scale-in rounded-lg shadow-lg overflow-y-auto"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-lg">{contract?.id ? 'Edit Contract' : 'Add Contract'}</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-md bg-danger/10 border border-danger/25 px-4 py-2 text-sm text-danger">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Competition</label>
            <select
              className="inp w-full"
              value={form.competitionId}
              onChange={e => set('competitionId', Number(e.target.value))}
              required
            >
              <option value={0} disabled>Select competition…</option>
              {competitions.map(c => (
                <option key={c.id} value={c.id}>{c.sport?.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Status</label>
            <select className="inp w-full" value={form.status} onChange={e => set('status', e.target.value as ContractStatus)}>
              <option value="valid">Valid</option>
              <option value="expiring">Expiring</option>
              <option value="draft">Negotiation</option>
              <option value="none">No Contract</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Valid From</label>
              <input type="date" className="inp w-full" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Valid Until</label>
              <input type="date" className="inp w-full" value={form.validUntil} onChange={e => set('validUntil', e.target.value)} />
            </div>
          </div>

          {/* Platform chips */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Platforms</div>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                    form.platforms.includes(p)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border bg-surface text-text-3 hover:text-text-2'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Legacy rights toggles */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Legacy Rights</div>
            <Toggle active={form.linearRights} onChange={v => set('linearRights', v)} label="Linear Rights" />
            <Toggle active={form.maxRights} onChange={v => set('maxRights', v)} label="VRT MAX Rights" />
            <Toggle active={form.radioRights} onChange={v => set('radioRights', v)} label="Radio Rights" />
            <Toggle active={form.sublicensing} onChange={v => set('sublicensing', v)} label="Sublicensing Allowed" />
          </div>

          {/* Coverage & Run Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Coverage Type</label>
              <select className="inp w-full" value={form.coverageType} onChange={e => set('coverageType', e.target.value as CoverageType)}>
                {COVERAGE_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Max Live Runs</label>
              <input type="number" className="inp w-full" min={0} value={form.maxLiveRuns} onChange={e => set('maxLiveRuns', e.target.value)} placeholder="Unlimited" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Max Picks/Round</label>
              <input type="number" className="inp w-full" min={0} value={form.maxPickRunsPerRound} onChange={e => set('maxPickRunsPerRound', e.target.value)} placeholder="Unlimited" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Tape Delay (min hrs)</label>
              <input type="number" className="inp w-full" min={0} value={form.tapeDelayHoursMin} onChange={e => set('tapeDelayHoursMin', e.target.value)} placeholder="N/A" />
            </div>
          </div>

          {/* Rights Window */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Window Start</label>
              <input type="datetime-local" className="inp w-full" value={form.windowStartUtc} onChange={e => set('windowStartUtc', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Window End</label>
              <input type="datetime-local" className="inp w-full" value={form.windowEndUtc} onChange={e => set('windowEndUtc', e.target.value)} />
            </div>
          </div>

          {/* Territory */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Territory</label>
            <input type="text" className="inp w-full" value={form.territory} onChange={e => set('territory', e.target.value)} placeholder="e.g. Belgium, Netherlands (comma-separated)" />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Geo Restriction</label>
            <input type="text" className="inp w-full" value={form.geoRestriction} onChange={e => set('geoRestriction', e.target.value)} placeholder="e.g. Belgium only" />
          </div>

          {canManageContracts && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Fee</label>
                <input type="text" className="inp w-full" value={form.fee} onChange={e => set('fee', e.target.value)} placeholder="e.g. €2.4M/year" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Notes</label>
                <textarea className="inp w-full" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes…" />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-s">Cancel</button>
            <button type="submit" className="btn btn-p" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
