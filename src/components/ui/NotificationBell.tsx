import { useState, useEffect, useRef } from 'react'
import { notificationsApi, type AppNotification } from '../../services/notifications'

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    notificationsApi.list().then(setItems).catch(() => {}) // intentional: background poll
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = items.filter(n => !n.isRead).length

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      setItems(prev => prev.map(n => ({ ...n, isRead: true })))
    } catch {
      // silently fail — non-critical UX action
    }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="btn btn-g relative">
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-8 w-80 bg-surface border border-surface-2 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center px-3 py-2 border-b border-surface-2">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-muted underline">Mark all read</button>
            )}
          </div>
          {items.length === 0 && (
            <div className="text-xs text-muted p-4 text-center">No notifications</div>
          )}
          {items.map(n => (
            <div key={n.id} className={`px-3 py-2 border-b border-surface-2 ${n.isRead ? 'opacity-60' : ''}`}>
              <div className="text-sm font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-muted mt-0.5">{n.body}</div>}
              <div className="text-xs text-muted mt-0.5">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
