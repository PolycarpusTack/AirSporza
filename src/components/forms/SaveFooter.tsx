import { Loader2, Check, AlertCircle } from 'lucide-react'
import { Btn } from '../ui'

export type SaveState = 'idle' | 'saving' | 'success' | 'error'

interface SaveFooterProps {
  onSave: () => void
  onCancel: () => void
  saveState: SaveState
  requiredCount: number
  readOnly?: boolean
  isEdit?: boolean
}

export function SaveFooter({
  onSave,
  onCancel,
  saveState,
  requiredCount,
  readOnly,
  isEdit,
}: SaveFooterProps) {
  const buttonContent = () => {
    switch (saveState) {
      case 'saving':
        return (
          <>
            <Loader2 size={16} className="animate-spin" />
            Saving...
          </>
        )
      case 'success':
        return (
          <>
            <Check size={16} />
            Saved!
          </>
        )
      case 'error':
        return (
          <>
            <AlertCircle size={16} />
            Save failed — try again
          </>
        )
      default:
        return isEdit ? 'Save Changes' : 'Create Event'
    }
  }

  const saveClassName = () => {
    if (saveState === 'success') return '!bg-green-600 !border-green-600'
    if (saveState === 'error') return '!bg-danger !border-danger'
    return ''
  }

  return (
    <div className="border-t border-border px-6 pt-4 pb-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {readOnly ? 'Read-only' : `${requiredCount} required fields`}
        </span>
        <div className="flex items-center gap-2">
          <Btn variant="default" onClick={onCancel}>
            {readOnly ? 'Close' : 'Cancel'}
          </Btn>
          {!readOnly && (
            <Btn
              variant="primary"
              onClick={onSave}
              disabled={saveState === 'saving' || saveState === 'success'}
              className={saveClassName()}
            >
              {buttonContent()}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}
