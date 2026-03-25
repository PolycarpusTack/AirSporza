import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type ConfirmVariant = 'danger' | 'warning' | 'default'

export interface ConfirmOptions {
  title: string
  message: string | ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// ── Variant button classes ───────────────────────────────────────────────────

const VARIANT_BTN: Record<ConfirmVariant, string> = {
  danger:  'btn btn-p !bg-danger !border-danger',
  warning: 'btn btn-p !bg-amber-600 !border-amber-600',
  default: 'btn btn-p',
}

// ── Component ────────────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm animate-scale-in rounded-lg p-6 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        <div className="mt-2 text-sm text-muted">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            className="btn"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={VARIANT_BTN[variant]}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? `${confirmLabel}...` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
  }>({
    open: false,
    options: { title: '', message: '' },
  })

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve
      setState({ open: true, options })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setState(prev => ({ ...prev, open: false }))
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const handleCancel = useCallback(() => {
    setState(prev => ({ ...prev, open: false }))
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  const dialog = (
    <ConfirmDialog
      open={state.open}
      {...state.options}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirm, dialog }
}
