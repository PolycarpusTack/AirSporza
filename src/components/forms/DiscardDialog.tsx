interface DiscardDialogProps {
  onDiscard: () => void
  onKeepEditing: () => void
}

export function DiscardDialog({ onDiscard, onKeepEditing }: DiscardDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onKeepEditing}
    >
      <div
        className="card w-full max-w-sm animate-scale-in rounded-lg p-6 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold tracking-tight">
          Discard unsaved changes?
        </h3>
        <p className="mt-2 text-sm text-muted">
          You have unsaved changes that will be lost if you close.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn" onClick={onKeepEditing}>
            Keep Editing
          </button>
          <button
            className="btn btn-p !bg-danger !border-danger"
            onClick={onDiscard}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
