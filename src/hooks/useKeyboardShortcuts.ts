import { useEffect } from 'react'

interface Shortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  label: string
  action: () => void
}

export const SHORTCUTS: Omit<Shortcut, 'action'>[] = [
  { key: 'n', label: 'New Event' },
  { key: 'k', ctrl: true, label: 'Search' },
  { key: '?', shift: true, label: 'Show Shortcuts' },
  { key: '1', label: 'Go to Planning' },
  { key: '2', label: 'Go to Sports' },
  { key: '3', label: 'Go to Contracts' },
  { key: 'Escape', label: 'Close modal / deselect' },
]

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      for (const s of shortcuts) {
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey
        if (e.key === s.key && ctrlMatch && shiftMatch) {
          e.preventDefault()
          s.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
