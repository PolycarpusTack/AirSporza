import { useEffect, useRef } from 'react'

interface ModalProps {
  children: React.ReactNode
  onClose: () => void
  title: string
  width?: string
}

export function Modal({ children, onClose, title, width = "max-w-2xl" }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={`card w-full ${width} my-8 animate-scale-in overflow-hidden rounded-lg shadow-lg`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-sm p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
