import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { notificationsApi, type AppNotification } from '../../services/notifications'

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.isRead).length

  useEffect(() => {
    notificationsApi.list().then(setNotifications).catch(() => {}) // intentional: background poll
  }, [])

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      notificationsApi.list().then(setNotifications).catch(() => {}) // intentional: background poll
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id).catch(() => {}) // intentional: background poll
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
  }

  const markAllRead = async () => {
    await notificationsApi.markAllRead().catch(() => {}) // intentional: background poll
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-md hover:bg-surface-2 transition text-text-2 hover:text-text"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-auto bg-surface border border-border rounded-lg shadow-lg z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-bold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted text-center">No notifications</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.isRead && markRead(n.id)}
                className={`px-4 py-3 border-b border-border/50 cursor-pointer hover:bg-surface-2 transition ${
                  !n.isRead ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                  <div className={!n.isRead ? '' : 'ml-4'}>
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-text-3 mt-0.5">{n.body}</div>}
                    <div className="text-xs text-muted mt-1">
                      {new Date(n.createdAt).toLocaleString('en-GB', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
