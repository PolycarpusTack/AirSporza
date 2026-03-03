import { useState } from 'react'
import { Modal, Toggle, Btn, Grip } from '../ui'
import type { DashboardWidget } from '../../data/types'

interface DashboardCustomizerProps {
  widgets: DashboardWidget[]
  setWidgets: (widgets: DashboardWidget[]) => void
  onClose: () => void
  viewName: string
}

export function DashboardCustomizer({ widgets, setWidgets, onClose, viewName }: DashboardCustomizerProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const sorted = [...widgets].sort((a, b) => a.order - b.order)

  const moveWidget = (from: number, to: number) => {
    const r = [...sorted]
    const [moved] = r.splice(from, 1)
    r.splice(to, 0, moved)
    setWidgets(r.map((w, i) => ({ ...w, order: i })))
  }

  const toggleWidget = (id: string) => {
    setWidgets(widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.classList.add("drag-over")
  }
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove("drag-over")
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.currentTarget.classList.remove("drag-over")
    if (dragIdx !== null) moveWidget(dragIdx, idx)
    setDragIdx(null)
  }

  return (
    <Modal onClose={onClose} title={`Customize ${viewName} Dashboard`} width="max-w-md">
      <div className="p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted">Drag to reorder sections. Toggle visibility to show/hide widgets in your dashboard.</p>
        <div className="space-y-2">
          {sorted.map((widget, idx) => (
            <div
              key={widget.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, idx)}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 transition-all ${widget.visible ? "border-border bg-surface shadow-sm" : "border-border/60 bg-surface-2 opacity-60"}`}
            >
              <Grip />
              <div className="flex-1">
                <span className="text-sm font-semibold">{widget.label}</span>
              </div>
              <Toggle active={widget.visible} onChange={() => toggleWidget(widget.id)} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-6 py-3">
        <Btn variant="primary" onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  )
}
