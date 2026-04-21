import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { contractsApi, type ContractWithRelations } from '../../../services/contracts'

function daysUntil(input?: string | Date | null): number | null {
  if (!input) return null
  const until = input instanceof Date ? input.getTime() : new Date(input).getTime()
  if (Number.isNaN(until)) return null
  const now = Date.now()
  return Math.round((until - now) / (24 * 60 * 60 * 1000))
}

function formatDays(days: number): string {
  if (days < 0) return 'expired'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export function ExpiringRightsWidget() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<ContractWithRelations[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    contractsApi.expiring(90)
      .then(data => { if (!cancelled) setContracts(data) })
      .catch(() => { if (!cancelled) setError('Could not load expiring contracts') })
    return () => { cancelled = true }
  }, [])

  if (error) return <p className="text-xs text-text-3">{error}</p>
  if (contracts === null) return <p className="text-xs text-text-3">Loading…</p>
  if (contracts.length === 0) {
    return <p className="text-xs text-text-3">No rights expire in the next 90 days.</p>
  }

  // Sort by ascending days-to-expiry so the most urgent appears first.
  const sorted = [...contracts].sort((a, b) => {
    const aDays = daysUntil(a.validUntil) ?? Number.POSITIVE_INFINITY
    const bDays = daysUntil(b.validUntil) ?? Number.POSITIVE_INFINITY
    return aDays - bDays
  })

  return (
    <ul className="space-y-1.5 mt-2">
      {sorted.slice(0, 6).map(c => {
        const days = daysUntil(c.validUntil)
        const urgent = days !== null && days <= 30
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => navigate('/contracts')}
              className="w-full text-left flex items-center gap-2 py-1 hover:bg-surface-2 rounded px-1 -mx-1"
            >
              <span className="text-sm truncate flex-1">
                {c.sport?.icon} {c.competition?.name ?? 'Unknown competition'}
              </span>
              <span className={`text-[11px] whitespace-nowrap ${urgent ? 'text-red-500' : 'text-text-3'}`}>
                {days !== null ? formatDays(days) : '—'}
              </span>
            </button>
          </li>
        )
      })}
      {sorted.length > 6 && (
        <li className="text-[11px] text-text-3 text-center pt-1">
          +{sorted.length - 6} more expiring soon
        </li>
      )}
    </ul>
  )
}
