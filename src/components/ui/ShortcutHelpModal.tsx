import { Modal } from './Modal'
import { SHORTCUTS } from '../../hooks/useKeyboardShortcuts'

interface Props {
  onClose: () => void
}

function formatKey(s: typeof SHORTCUTS[number]) {
  const parts: string[] = []
  if (s.ctrl) parts.push('Ctrl')
  if (s.shift) parts.push('Shift')
  parts.push(s.key === ' ' ? 'Space' : s.key.toUpperCase())
  return parts.join(' + ')
}

export function ShortcutHelpModal({ onClose }: Props) {
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose} width="max-w-sm">
      <div className="p-4 space-y-2">
        {SHORTCUTS.map(s => (
          <div key={s.key + (s.ctrl ? 'c' : '') + (s.shift ? 's' : '')} className="flex items-center justify-between py-1.5">
            <span className="text-sm text-text-2">{s.label}</span>
            <kbd className="px-2 py-0.5 text-xs font-mono bg-surface-2 border border-border rounded">
              {formatKey(s)}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  )
}
