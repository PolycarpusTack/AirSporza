import { Pencil, Copy, Clock, Trash2 } from 'lucide-react'

interface SlotContextMenuProps {
  x: number
  y: number
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onCopyTime: () => void
}

const items = [
  { label: 'Edit', icon: Pencil, action: 'onEdit' as const, className: '' },
  { label: 'Duplicate', icon: Copy, action: 'onDuplicate' as const, className: '' },
  { label: 'Copy Time', icon: Clock, action: 'onCopyTime' as const, className: '' },
  { label: 'Delete', icon: Trash2, action: 'onDelete' as const, className: 'text-danger' },
]

export function SlotContextMenu({ x, y, onEdit, onDelete, onDuplicate, onCopyTime }: SlotContextMenuProps) {
  const handlers: Record<string, () => void> = { onEdit, onDelete, onDuplicate, onCopyTime }

  return (
    <div
      className="fixed z-50 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      {items.map(item => (
        <button
          key={item.label}
          onClick={handlers[item.action]}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-2 ${item.className}`}
        >
          <item.icon className="w-3.5 h-3.5" />
          {item.label}
        </button>
      ))}
    </div>
  )
}
