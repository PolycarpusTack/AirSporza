import { useEffect } from 'react'

interface UndoBarProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

export function UndoBar({ message, onUndo, onDismiss }: UndoBarProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed bottom-16 right-4 z-50 flex items-center gap-3 bg-surface border rounded-md shadow-md px-4 py-3">
      <span className="text-sm font-medium text-text-2">{message}</span>
      <button
        className="btn btn-g btn-sm"
        onClick={() => {
          onUndo()
          onDismiss()
        }}
      >
        Undo
      </button>
    </div>
  )
}
