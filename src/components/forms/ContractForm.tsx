import { useState, useEffect } from 'react'
import { contractsApi, competitionsApi } from '../../services'
import { Toggle } from '../ui/Toggle'
import type { Contract, ContractStatus } from '../../data/types'

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
    geoRestriction: contract?.geoRestriction ?? '',
    fee: contract?.fee ?? '',
    notes: contract?.notes ?? '',
  })

  useEffect(() => {
    competitionsApi.list().then(data => setCompetitions(data as CompetitionOption[])).catch(() => {})
  }, [])

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
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

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Rights</div>
            <Toggle active={form.linearRights} onChange={v => set('linearRights', v)} label="Linear Rights" />
            <Toggle active={form.maxRights} onChange={v => set('maxRights', v)} label="VRT MAX Rights" />
            <Toggle active={form.radioRights} onChange={v => set('radioRights', v)} label="Radio Rights" />
            <Toggle active={form.sublicensing} onChange={v => set('sublicensing', v)} label="Sublicensing Allowed" />
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
