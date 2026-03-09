import { useState, useEffect, useRef } from 'react'
import { Zap, ArrowRight, Clock, X } from 'lucide-react'
import { channelSwitchesApi } from '../../services/channelSwitches'
import { useToast } from '../Toast'
import type { Alert } from '../../data/types'

interface SwitchConfirmModalProps {
  alert: Alert
  onClose: () => void
  onConfirmed?: () => void
}

const REASON_CODES = [
  { value: 'PLANNED_HANDOFF', label: 'Planned handoff' },
  { value: 'OVERRUN_SWITCH', label: 'Overrun switch' },
  { value: 'MATCH_EXTENDED', label: 'Match extended (ET/penalties)' },
  { value: 'EDITORIAL_DECISION', label: 'Editorial decision' },
  { value: 'EMERGENCY', label: 'Emergency' },
]

const CONFIRMATION_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

export function SwitchConfirmModal({ alert, onClose, onConfirmed }: SwitchConfirmModalProps) {
  const toast = useToast()
  const [reasonCode, setReasonCode] = useState('PLANNED_HANDOFF')
  const [reasonText, setReasonText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [remainingMs, setRemainingMs] = useState(CONFIRMATION_WINDOW_MS)
  const startRef = useRef(Date.now())

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      const remaining = Math.max(0, CONFIRMATION_WINDOW_MS - elapsed)
      setRemainingMs(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        toast.warning('Confirmation window expired')
        onClose()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [onClose, toast])

  // Audio notification on mount
  useEffect(() => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    } catch {
      // Audio not available -- ignore
    }
  }, [])

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      // The alert.data should contain a switchId or we use slotId to find pending switch
      const switches = await channelSwitchesApi.list({
        fromSlotId: alert.slotId,
        executionStatus: 'PENDING',
      })
      const pending = switches[0]
      if (!pending) {
        toast.error('No pending switch found for this slot')
        return
      }
      await channelSwitchesApi.confirm(pending.id)
      toast.success('Channel switch confirmed')
      onConfirmed?.()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm switch')
    } finally {
      setConfirming(false)
    }
  }

  const remainingSec = Math.ceil(remainingMs / 1000)
  const remainingMin = Math.floor(remainingSec / 60)
  const remainingSecStr = String(remainingSec % 60).padStart(2, '0')
  const progressPct = (remainingMs / CONFIRMATION_WINDOW_MS) * 100

  const switchData = alert.data || {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-red-500/5">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-400" />
            <h2 className="font-semibold text-sm font-head">Channel Switch Required</h2>
          </div>
          <button onClick={onClose} className="text-text-3 hover:text-text p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Match info */}
          <p className="text-sm">{alert.message}</p>

          {/* From -> To */}
          <div className="flex items-center gap-3 p-3 bg-surface-2 rounded-lg">
            <div className="text-center flex-1">
              <span className="text-[10px] text-text-3 block">From</span>
              <span className="text-sm font-medium">Slot {alert.slotId.slice(0, 8)}</span>
            </div>
            <ArrowRight className="w-5 h-5 text-text-3" />
            <div className="text-center flex-1">
              <span className="text-[10px] text-text-3 block">Strategy</span>
              <span className="text-sm font-medium">{String(switchData.switchStrategy || 'SWITCH')}</span>
            </div>
          </div>

          {/* Countdown */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-text-2">
                <Clock className="w-3.5 h-3.5" />
                Confirmation deadline
              </div>
              <span className={`text-sm font-mono font-bold ${remainingMs < 120000 ? 'text-red-400' : 'text-text'}`}>
                {remainingMin}:{remainingSecStr}
              </span>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  progressPct < 20 ? 'bg-red-500' : progressPct < 50 ? 'bg-amber-500' : 'bg-primary'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs text-text-3 block mb-1">Reason</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="input w-full text-sm"
            >
              {REASON_CODES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-text-3 block mb-1">Notes (optional)</label>
            <textarea
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              className="input w-full text-sm h-16 resize-none"
              placeholder="Additional context..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="btn btn-s px-4">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="btn btn-p px-4 flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            {confirming ? 'Confirming...' : 'Confirm Switch'}
          </button>
        </div>
      </div>
    </div>
  )
}
