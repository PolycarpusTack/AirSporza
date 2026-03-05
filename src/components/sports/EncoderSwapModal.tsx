import { useState, useEffect, useCallback } from 'react'
import { Btn } from '../ui'
import type { TechPlan, Encoder } from '../../data/types'
import { techPlansApi } from '../../services'
import { ApiError } from '../../utils/api'

function LockCountdown({ ttlMs, onExpire }: { ttlMs: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(Math.ceil(ttlMs / 1000))

  useEffect(() => {
    if (remaining <= 0) {
      onExpire()
      return
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onExpire])

  return <span className="ml-1 font-mono">({remaining}s)</span>
}

interface EncoderSwapModalProps {
  planId: number
  encoders: Encoder[]
  currentEncoderName: string | undefined
  onSwapComplete: (planId: number, updatedPlan: TechPlan) => void
  onClose: () => void
}

export function EncoderSwapModal({ planId, encoders, currentEncoderName, onSwapComplete, onClose }: EncoderSwapModalProps) {
  const [error, setError] = useState<string | null>(null)
  const [lockTtl, setLockTtl] = useState<number | null>(null)

  const handleSwap = useCallback(async (encoderName: string) => {
    setError(null)
    setLockTtl(null)
    try {
      const updated = await techPlansApi.swapEncoder(planId, encoderName)
      onSwapComplete(planId, updated)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(e.message)
        setLockTtl(30000)
      } else {
        setError('Encoder swap failed')
      }
    }
  }, [planId, onSwapComplete])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-sm animate-scale-in rounded-lg p-5 shadow-md" onClick={e => e.stopPropagation()}>
        <h4 className="font-bold text-lg mb-1">Quick Encoder Swap</h4>
        <p className="meta mb-4">Change propagates immediately via WebSocket.</p>

        {error && (
          <div className="mb-4 rounded-md bg-danger/10 border border-danger/25 px-4 py-2 text-sm text-danger">
            {error}
            {lockTtl && (
              <LockCountdown ttlMs={lockTtl} onExpire={() => { setError(null); setLockTtl(null) }} />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {encoders.map(enc => {
            const inUse = enc.inUse !== null && enc.inUse !== undefined
            const cur = currentEncoderName === enc.name
            return (
              <button
                key={enc.id}
                onClick={() => !inUse && handleSwap(enc.name)}
                disabled={inUse && !cur}
                className={`rounded-md border p-3 text-sm font-mono font-semibold transition ${
                  cur
                    ? 'border-primary bg-primary/10 text-text'
                    : inUse
                      ? 'cursor-not-allowed border-border bg-surface-2 text-text-3'
                      : 'border-border bg-surface text-text hover:border-primary hover:text-primary'
                }`}
              >
                {enc.name}
                {cur && <span className="mt-0.5 block text-xs font-sans text-primary">Current</span>}
                {inUse && !cur && <span className="block text-xs font-sans mt-0.5">In use</span>}
                {!enc.isActive && <span className="block text-xs font-sans mt-0.5 text-warning">Offline</span>}
              </button>
            )
          })}
        </div>
        <Btn variant="default" className="w-full mt-4" onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  )
}
