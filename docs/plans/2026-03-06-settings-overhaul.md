# Settings & Admin Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Settings Modal and Admin panel from a partially-stubbed flat-tab layout into a fully wired, role-aware, sidebar-navigated settings system with real data, notification center, user preferences, and power-user features.

**Architecture:** Three phases: (1) Wire existing backend models to the UI — audit logs, notifications, user management, system stats. (2) Restructure Admin into sidebar navigation, separate user preferences from admin settings, add notification preference matrix. (3) Add power-user features — keyboard shortcuts, auto-fill rules, workflow automation toggles.

**Tech Stack:** React + TypeScript + Vite frontend, Express + Prisma + PostgreSQL backend, BB design tokens CSS, Lucide icons.

---

## Phase 1: Fix What's Broken

### Task 1: System-Wide Audit Log Endpoint

**Context:** The backend has `GET /api/audit/:entityType/:entityId` which only returns logs for a specific entity. The AdminView shows hardcoded mock audit entries. We need a system-wide query endpoint.

**Files:**
- Modify: `backend/src/routes/audit.ts`
- Modify: `src/services/audit.ts`

**Step 1: Add system-wide audit endpoint**

In `backend/src/routes/audit.ts`, add before the existing `GET /:entityType/:entityId` route:

```typescript
// System-wide audit log with filters
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { action, userId, entityType, from, to, limit = '50', offset = '0' } = req.query as Record<string, string>

    const where: Record<string, unknown> = {}
    if (action) where.action = { contains: action }
    if (userId) where.userId = userId
    if (entityType) where.entityType = entityType
    if (from || to) {
      where.createdAt = {}
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.auditLog.count({ where }),
    ])

    res.json({ logs, total })
  } catch (error) {
    next(error)
  }
})
```

**Step 2: Add frontend service method**

In `src/services/audit.ts`, add:

```typescript
export interface AuditFilters {
  action?: string
  userId?: string
  entityType?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

// Add to auditApi object:
listAll: (filters?: AuditFilters): Promise<{ logs: AuditEntry[]; total: number }> => {
  const params = new URLSearchParams()
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.append(k, String(v))
    })
  }
  const query = params.toString()
  return api.get(`/audit${query ? `?${query}` : ''}`)
},
```

**Step 3: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: zero errors

**Step 4: Commit**

```bash
git add backend/src/routes/audit.ts src/services/audit.ts
git commit -m "feat: add system-wide audit log endpoint with filters"
```

---

### Task 2: User Management Endpoint

**Context:** No `/api/users` endpoint exists. The AdminView hardcodes 4 users. The User model exists in Prisma with id, email, name, avatar, role.

**Files:**
- Create: `backend/src/routes/users.ts`
- Modify: `backend/src/index.ts` (register route)
- Modify: `src/services/index.ts` (export)
- Create: `src/services/users.ts`

**Step 1: Create users route**

Create `backend/src/routes/users.ts`:

```typescript
import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

// List all users
router.get('/', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { events: true, techPlans: true }
        }
      }
    })
    res.json(users)
  } catch (error) {
    next(error)
  }
})

// Update user role
const updateRoleSchema = Joi.object({
  role: Joi.string().valid('planner', 'sports', 'contracts', 'admin').required(),
})

router.put('/:id/role', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = updateRoleSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: value.role },
      select: { id: true, email: true, name: true, role: true }
    })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// Delete user (soft: only if no events/techPlans)
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const userId = req.params.id
    const counts = await prisma.user.findUnique({
      where: { id: userId },
      select: { _count: { select: { events: true, techPlans: true } } }
    })
    if (!counts) return next(createError(404, 'User not found'))
    if ((counts._count.events + counts._count.techPlans) > 0) {
      return next(createError(400, 'Cannot delete user with existing events or tech plans'))
    }
    await prisma.user.delete({ where: { id: userId } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
```

**Step 2: Register route in backend/src/index.ts**

Find where other routes are imported and registered. Add:

```typescript
import usersRouter from './routes/users.js'
// ... in the route registration section:
app.use('/api/users', usersRouter)
```

**Step 3: Create frontend service**

Create `src/services/users.ts`:

```typescript
import { api } from '../utils/api'

export interface UserRecord {
  id: string
  email: string
  name: string | null
  avatar: string | null
  role: 'planner' | 'sports' | 'contracts' | 'admin'
  createdAt: string
  updatedAt: string
  _count: { events: number; techPlans: number }
}

export const usersApi = {
  list: (): Promise<UserRecord[]> => api.get('/users'),
  updateRole: (id: string, role: string): Promise<UserRecord> =>
    api.put(`/users/${id}/role`, { role }),
  delete: (id: string): Promise<{ ok: boolean }> =>
    api.delete(`/users/${id}`),
}
```

**Step 4: Export from services index**

In `src/services/index.ts`, add:

```typescript
export { usersApi, type UserRecord } from './users'
```

**Step 5: Verify**

Run: `npx tsc --noEmit` (from project root)
Run: `cd backend && npx tsc --noEmit`
Expected: zero errors

**Step 6: Commit**

```bash
git add backend/src/routes/users.ts backend/src/index.ts src/services/users.ts src/services/index.ts
git commit -m "feat: add user management API endpoints + frontend service"
```

---

### Task 3: Admin Stats Endpoint

**Context:** AdminView shows hardcoded stats (12 users, 8 sessions, 2.4 GB, 14.2K calls). We need a real endpoint.

**Files:**
- Modify: `backend/src/routes/settings.ts`
- Modify: `src/services/settings.ts`

**Step 1: Add stats endpoint**

In `backend/src/routes/settings.ts`, add:

```typescript
// Admin stats
router.get('/stats', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const [userCount, eventCount, techPlanCount, crewMemberCount, notificationCount] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.techPlan.count(),
      prisma.crewMember.count(),
      prisma.notification.count({ where: { isRead: false } }),
    ])
    res.json({
      users: userCount,
      events: eventCount,
      techPlans: techPlanCount,
      crewMembers: crewMemberCount,
      unreadNotifications: notificationCount,
    })
  } catch (error) {
    next(error)
  }
})
```

**Step 2: Add frontend method**

In `src/services/settings.ts`, add to `settingsApi`:

```typescript
export interface AdminStats {
  users: number
  events: number
  techPlans: number
  crewMembers: number
  unreadNotifications: number
}

getStats: (): Promise<AdminStats> => api.get('/settings/stats'),
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit && cd backend && npx tsc --noEmit
git add backend/src/routes/settings.ts src/services/settings.ts
git commit -m "feat: add admin stats endpoint"
```

---

### Task 4: Wire Real Data into AdminView

**Context:** Replace the 3 hardcoded sections in `src/pages/AdminView.tsx` with real API data.

**Files:**
- Modify: `src/pages/AdminView.tsx`

**Step 1: Replace hardcoded stats**

Remove the static `stats` array (lines ~520-525). Add state + fetch:

```typescript
import { usersApi, type UserRecord } from '../services'
import { settingsApi, type AdminStats } from '../services/settings'
import { auditApi, type AuditEntry, type AuditFilters } from '../services/audit'

// Inside AdminView component:
const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
const [userList, setUserList] = useState<UserRecord[]>([])
const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
const [auditTotal, setAuditTotal] = useState(0)

useEffect(() => {
  settingsApi.getStats().then(setAdminStats).catch(() => {})
  usersApi.list().then(setUserList).catch(() => {})
  auditApi.listAll({ limit: 20 }).then(r => {
    setAuditLogs(r.logs)
    setAuditTotal(r.total)
  }).catch(() => {})
}, [])
```

**Step 2: Update stats cards**

Replace the static stats grid with:

```tsx
{showStatus && adminStats && (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
    <div className="card p-4">
      <Users className="w-5 h-5 text-primary mb-2" />
      <div className="statv">{adminStats.users}</div>
      <div className="statl">Users</div>
    </div>
    <div className="card p-4">
      <Activity className="w-5 h-5 text-success mb-2" />
      <div className="statv">{adminStats.events}</div>
      <div className="statl">Events</div>
    </div>
    <div className="card p-4">
      <Database className="w-5 h-5 text-info mb-2" />
      <div className="statv">{adminStats.techPlans}</div>
      <div className="statl">Tech Plans</div>
    </div>
    <div className="card p-4">
      <RefreshCw className="w-5 h-5 text-warning mb-2" />
      <div className="statv">{adminStats.crewMembers}</div>
      <div className="statl">Crew Members</div>
    </div>
  </div>
)}
```

**Step 3: Update user management table**

Replace the hardcoded `users` array with `userList`. Update the table to use `UserRecord` fields. Add role change dropdown:

```tsx
{showUsers && (
  <div className="card animate-fade-in">
    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
      <h4 className="font-bold">User Management</h4>
      <span className="text-xs text-muted">{userList.length} users</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Email</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Role</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Events</th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {userList.map(u => (
            <tr key={u.id} className="hover:bg-surface-2 transition">
              <td className="px-4 py-3 font-medium">{u.name || '—'}</td>
              <td className="px-4 py-3 text-muted">{u.email}</td>
              <td className="px-4 py-3">
                <select
                  className="inp text-xs px-2 py-1"
                  value={u.role}
                  onChange={async (e) => {
                    const updated = await usersApi.updateRole(u.id, e.target.value)
                    setUserList(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x))
                  }}
                >
                  <option value="planner">planner</option>
                  <option value="sports">sports</option>
                  <option value="contracts">contracts</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td className="px-4 py-3 text-muted">{u._count.events}</td>
              <td className="px-4 py-3 text-right">
                {u._count.events === 0 && u._count.techPlans === 0 && (
                  <button
                    className="text-xs text-danger hover:underline"
                    onClick={async () => {
                      await usersApi.delete(u.id)
                      setUserList(prev => prev.filter(x => x.id !== u.id))
                    }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

**Step 4: Update audit log section**

Replace hardcoded `auditLogs` with real data:

```tsx
{showAudit && (
  <div className="card animate-fade-in">
    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
      <h4 className="font-bold">Audit Log</h4>
      <span className="text-xs text-muted">{auditTotal} total entries</span>
    </div>
    <div className="divide-y divide-border">
      {auditLogs.length === 0 && (
        <div className="px-4 py-6 text-sm text-muted text-center">No audit entries yet.</div>
      )}
      {auditLogs.map(log => (
        <div key={log.id} className="px-4 py-3 hover:bg-surface-2 transition">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">{log.action}</span>
              <span className="text-text-3 mx-2">—</span>
              <span className="text-text-2">{log.entityType} #{log.entityId}</span>
            </div>
            <span className="text-xs text-text-3">
              {new Date(log.createdAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
          {log.userId && <div className="text-xs text-text-3 mt-1">by {log.userId}</div>}
        </div>
      ))}
    </div>
  </div>
)}
```

**Step 5: Verify + Commit**

```bash
npx tsc --noEmit
git add src/pages/AdminView.tsx
git commit -m "feat: wire real data into AdminView (stats, users, audit)"
```

---

### Task 5: Notification Bell in Header

**Context:** Notification model, routes, and frontend service all exist. No UI. Add a bell icon with unread badge in the Header, plus a dropdown showing recent notifications.

**Files:**
- Create: `src/components/layout/NotificationCenter.tsx`
- Modify: `src/components/layout/Header.tsx`

**Step 1: Create NotificationCenter component**

Create `src/components/layout/NotificationCenter.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { notificationsApi, type AppNotification } from '../../services/notifications'

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.isRead).length

  useEffect(() => {
    notificationsApi.list().then(setNotifications).catch(() => {})
  }, [])

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      notificationsApi.list().then(setNotifications).catch(() => {})
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
    await notificationsApi.markRead(id).catch(() => {})
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
  }

  const markAllRead = async () => {
    await notificationsApi.markAllRead().catch(() => {})
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
```

**Step 2: Add to Header**

In `src/components/layout/Header.tsx`, import and place between search and settings:

```typescript
import { NotificationCenter } from './NotificationCenter'
```

In the header right section (after search, before settings gear), add:

```tsx
<NotificationCenter />
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/layout/NotificationCenter.tsx src/components/layout/Header.tsx
git commit -m "feat: add notification bell with dropdown in header"
```

---

### Task 6: Inline Settings Modal

**Context:** The Settings Modal tabs 1-3 (Event Fields, Crew Fields, Dashboard) just close the modal and open a sub-modal. This is unnecessary indirection. Inline the editors directly.

**Files:**
- Modify: `src/components/settings/SettingsModal.tsx`

**Step 1: Inline editors**

Replace the redirect buttons with the actual components:

```tsx
import { useState, useEffect } from 'react'
import { Modal } from '../ui'
import { IntegrationsPanel } from './IntegrationsPanel'
import { FieldConfigurator } from '../admin/FieldConfigurator'
import { DashboardCustomizer } from '../forms'

type SettingsTab = 'event' | 'crew' | 'dashboard' | 'integrations'

interface SettingsModalProps {
  onClose: () => void
  defaultTab?: SettingsTab
  defaultIntegrationScope?: 'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'
  userRole?: string
}

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'event', label: 'Event Fields' },
  { id: 'crew', label: 'Crew Fields' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'integrations', label: 'Integrations' },
]

export function SettingsModal({
  onClose,
  defaultTab = 'event',
  defaultIntegrationScope = 'events',
  userRole,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab)
  const isAdmin = userRole === 'admin'

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  return (
    <Modal title="Settings" onClose={onClose} width="max-w-6xl">
      <div className="border-b border-border px-6 pt-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-sm border px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'border-border border-b-surface bg-surface text-foreground'
                  : 'border-transparent bg-transparent text-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-h-[70vh] overflow-auto">
        {activeTab === 'event' && (
          isAdmin
            ? <FieldConfigurator section="event" />
            : <div className="text-sm text-muted">Only admins can edit event field configuration.</div>
        )}

        {activeTab === 'crew' && (
          isAdmin
            ? <FieldConfigurator section="crew" />
            : <div className="text-sm text-muted">Only admins can edit crew field configuration.</div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardCustomizer />
        )}

        {activeTab === 'integrations' && (
          <IntegrationsPanel userRole={userRole} defaultScope={defaultIntegrationScope} />
        )}
      </div>
    </Modal>
  )
}
```

> **Note:** Check if `FieldConfigurator` accepts a `section` prop. If not, check how it currently determines which section to show and adapt accordingly. Also check `DashboardCustomizer` props — it may need `widgets` and `onUpdate` from AppProvider context.

**Step 2: Update App.tsx**

Remove the `onOpenEventFields`, `onOpenCrewFields`, `onOpenDashboard` props from `SettingsModal` usage in App.tsx since they're no longer needed.

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/settings/SettingsModal.tsx src/App.tsx
git commit -m "feat: inline field editors into Settings Modal (remove redirect pattern)"
```

---

## Phase 2: Restructure & Enhance

### Task 7: Admin Sidebar Navigation

**Context:** AdminView has 9 flat tabs (Fields, Sports, Competitions, Encoders, CSV, Publish, Org, Crew Roster, Crew Templates). Research says 9 tabs is past the breaking point. Replace with a grouped left sidebar.

**Files:**
- Modify: `src/pages/AdminView.tsx`

**Step 1: Define sidebar groups**

Replace the flat `tabs` array with grouped structure:

```typescript
interface AdminGroup {
  label: string
  items: { id: AdminTab; label: string; icon?: React.ReactNode }[]
}

const sidebarGroups: AdminGroup[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'org', label: 'Organisation' },
      { id: 'sports', label: 'Sports' },
      { id: 'competitions', label: 'Competitions' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { id: 'fields', label: 'Field Configuration' },
      { id: 'crew-roster', label: 'Crew Roster' },
      { id: 'crew-templates', label: 'Crew Templates' },
      { id: 'encoders', label: 'Encoders' },
    ],
  },
  {
    label: 'Data',
    items: [
      { id: 'csv', label: 'CSV Import' },
      { id: 'publish', label: 'Publish & Webhooks' },
    ],
  },
]
```

**Step 2: Replace tab bar with sidebar layout**

Replace the tab bar rendering with a two-column layout:

```tsx
<div className={isControlled ? '' : 'card animate-fade-in'}>
  {!isControlled && (
    <div className="flex min-h-[500px]">
      {/* Sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-border bg-surface-2/50 p-3 space-y-4">
        {sidebarGroups.map(group => (
          <div key={group.label}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted px-2 mb-1">
              {group.label}
            </div>
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition ${
                  activeTab === item.id
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-text-2 hover:bg-surface-2 hover:text-text'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        {activeTab === 'fields' && <FieldConfigurator />}
        {activeTab === 'sports' && <SportsTab sports={sports} setSports={setSports} />}
        {activeTab === 'competitions' && <CompetitionsTab sports={sports} />}
        {activeTab === 'encoders' && <EncodersTab />}
        {activeTab === 'csv' && <CsvImportTab sports={sports} />}
        {activeTab === 'publish' && <PublishPanel />}
        {activeTab === 'org' && <OrgConfigPanel />}
        {activeTab === 'crew-roster' && <CrewRosterPanel />}
        {activeTab === 'crew-templates' && <CrewTemplatesPanel />}
      </div>
    </div>
  )}

  {isControlled && (
    <div>
      {activeTab === 'fields' && <FieldConfigurator />}
      {/* ... same content panel options ... */}
    </div>
  )}
</div>
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/pages/AdminView.tsx
git commit -m "feat: restructure AdminView with grouped sidebar navigation"
```

---

### Task 8: User Preferences Modal

**Context:** Users currently have no way to set personal preferences. Add a "Preferences" modal accessible from the avatar/profile menu in the Header.

**Files:**
- Create: `src/components/settings/UserPreferencesModal.tsx`
- Create: `src/hooks/usePreferences.ts`
- Modify: `src/components/layout/Header.tsx`

**Step 1: Create preferences hook with localStorage**

Create `src/hooks/usePreferences.ts`:

```typescript
import { useState, useCallback } from 'react'

export interface UserPreferences {
  defaultView: 'planner' | 'sports' | 'contracts' | 'admin'
  defaultSportFilter: number | null
  defaultChannelFilter: string
  dateFormat: 'en-GB' | 'en-US' | 'nl-BE'
  compactMode: boolean
  showWeekNumbers: boolean
}

const DEFAULTS: UserPreferences = {
  defaultView: 'planner',
  defaultSportFilter: null,
  defaultChannelFilter: 'all',
  dateFormat: 'en-GB',
  compactMode: false,
  showWeekNumbers: false,
}

const STORAGE_KEY = 'planza_user_preferences'

function load(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(load)

  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setPrefs(DEFAULTS)
  }, [])

  return { prefs, update, reset }
}
```

**Step 2: Create UserPreferencesModal**

Create `src/components/settings/UserPreferencesModal.tsx`:

```tsx
import { Modal } from '../ui'
import { usePreferences } from '../../hooks/usePreferences'
import { useApp } from '../../context/AppProvider'

interface Props {
  onClose: () => void
}

export function UserPreferencesModal({ onClose }: Props) {
  const { prefs, update, reset } = usePreferences()
  const { sports } = useApp()

  return (
    <Modal title="Preferences" onClose={onClose} width="max-w-lg">
      <div className="p-6 space-y-5">

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Default View on Login</label>
          <select
            className="inp w-full"
            value={prefs.defaultView}
            onChange={e => update({ defaultView: e.target.value as UserPreferences['defaultView'] })}
          >
            <option value="planner">Planning</option>
            <option value="sports">Sports Workspace</option>
            <option value="contracts">Contracts</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Default Sport Filter</label>
          <select
            className="inp w-full"
            value={prefs.defaultSportFilter ?? ''}
            onChange={e => update({ defaultSportFilter: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">All Sports</option>
            {sports.map(s => (
              <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">Date Format</label>
          <select
            className="inp w-full"
            value={prefs.dateFormat}
            onChange={e => update({ dateFormat: e.target.value as UserPreferences['dateFormat'] })}
          >
            <option value="en-GB">DD/MM/YYYY (European)</option>
            <option value="en-US">MM/DD/YYYY (US)</option>
            <option value="nl-BE">DD-MM-YYYY (Belgian)</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Compact Mode</div>
            <div className="text-xs text-muted">Reduce spacing in calendar and list views</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.compactMode}
            onChange={e => update({ compactMode: e.target.checked })}
            className="w-4 h-4"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Show Week Numbers</div>
            <div className="text-xs text-muted">Display ISO week numbers in the calendar header</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.showWeekNumbers}
            onChange={e => update({ showWeekNumbers: e.target.checked })}
            className="w-4 h-4"
          />
        </div>

        <div className="pt-4 border-t border-border flex justify-between">
          <button onClick={reset} className="text-xs text-danger hover:underline">
            Reset to defaults
          </button>
          <button onClick={onClose} className="btn btn-p btn-sm">Done</button>
        </div>
      </div>
    </Modal>
  )
}
```

**Step 3: Wire into Header**

In `Header.tsx`, add a "Preferences" item in the user avatar dropdown menu. Add state for `showPreferences` and render `<UserPreferencesModal>` when open.

**Step 4: Verify + Commit**

```bash
npx tsc --noEmit
git add src/hooks/usePreferences.ts src/components/settings/UserPreferencesModal.tsx src/components/layout/Header.tsx
git commit -m "feat: add user preferences modal (default view, sport, date format, compact mode)"
```

---

### Task 9: Notification Preferences

**Context:** Users should control what notifications they receive. Start with a simple matrix stored in localStorage (can be moved to backend later).

**Files:**
- Create: `src/components/settings/NotificationPreferences.tsx`
- Modify: `src/components/settings/UserPreferencesModal.tsx`

**Step 1: Create notification preferences component**

Create `src/components/settings/NotificationPreferences.tsx`:

```tsx
import { useState } from 'react'

interface NotifCategory {
  id: string
  label: string
  description: string
}

const CATEGORIES: NotifCategory[] = [
  { id: 'crew_conflict', label: 'Crew Conflicts', description: 'When a crew member is double-booked' },
  { id: 'event_change', label: 'Event Changes', description: 'When events are created, moved, or cancelled' },
  { id: 'tech_plan', label: 'Tech Plan Updates', description: 'When tech plans are modified' },
  { id: 'encoder_alert', label: 'Encoder Alerts', description: 'Encoder lock conflicts and availability' },
  { id: 'import_result', label: 'Import Results', description: 'When CSV or API imports complete' },
  { id: 'assignment', label: 'My Assignments', description: 'When you are assigned to an event or crew role' },
]

const STORAGE_KEY = 'planza_notif_prefs'

interface NotifPrefs {
  [categoryId: string]: { inApp: boolean; email: boolean }
}

function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadNotifPrefs)

  const toggle = (catId: string, channel: 'inApp' | 'email') => {
    setPrefs(prev => {
      const current = prev[catId] ?? { inApp: true, email: false }
      const next = { ...prev, [catId]: { ...current, [channel]: !current[channel] } }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const getVal = (catId: string, channel: 'inApp' | 'email') => {
    return prefs[catId]?.[channel] ?? (channel === 'inApp')
  }

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Notification Preferences</div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted">Category</th>
              <th className="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted w-20">In-App</th>
              <th className="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted w-20">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {CATEGORIES.map(cat => (
              <tr key={cat.id} className="hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <div className="font-medium">{cat.label}</div>
                  <div className="text-xs text-muted">{cat.description}</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={getVal(cat.id, 'inApp')}
                    onChange={() => toggle(cat.id, 'inApp')}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={getVal(cat.id, 'email')}
                    onChange={() => toggle(cat.id, 'email')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted mt-2">Email notifications require SMTP configuration by an admin.</div>
    </div>
  )
}
```

**Step 2: Add to UserPreferencesModal**

Add a "Notifications" section inside the modal, below the existing preferences:

```tsx
import { NotificationPreferences } from './NotificationPreferences'

// Inside the modal, before the footer:
<div className="pt-4 border-t border-border">
  <NotificationPreferences />
</div>
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/settings/NotificationPreferences.tsx src/components/settings/UserPreferencesModal.tsx
git commit -m "feat: add notification preferences matrix (in-app + email toggles)"
```

---

### Task 10: System-Wide Audit Log Viewer

**Context:** AdminView shows basic audit entries. Enhance with filters (action, user, entity type, date range) and export.

**Files:**
- Create: `src/components/admin/AuditLogViewer.tsx`
- Modify: `src/pages/AdminView.tsx`

**Step 1: Create AuditLogViewer**

Create `src/components/admin/AuditLogViewer.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { auditApi, type AuditEntry, type AuditFilters } from '../../services/audit'
import { Badge } from '../ui'

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<AuditFilters>({ limit: 50 })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetch = async () => {
    setLoading(true)
    try {
      const result = await auditApi.listAll(filters)
      setLogs(result.logs)
      setTotal(result.total)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetch() }, [filters])

  const updateFilter = (patch: Partial<AuditFilters>) => {
    setFilters(prev => ({ ...prev, ...patch, offset: 0 }))
  }

  const exportCsv = () => {
    const header = 'Timestamp,Action,Entity Type,Entity ID,User ID\n'
    const rows = logs.map(l =>
      `${l.createdAt},${l.action},${l.entityType},${l.entityId},${l.userId ?? ''}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-muted mb-1">Entity Type</label>
          <select
            className="inp text-sm px-2 py-1"
            value={filters.entityType ?? ''}
            onChange={e => updateFilter({ entityType: e.target.value || undefined })}
          >
            <option value="">All</option>
            <option value="event">Event</option>
            <option value="techPlan">Tech Plan</option>
            <option value="contract">Contract</option>
            <option value="encoder">Encoder</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Action</label>
          <input
            className="inp text-sm px-2 py-1 w-40"
            placeholder="e.g. event.create"
            value={filters.action ?? ''}
            onChange={e => updateFilter({ action: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">From</label>
          <input
            type="date"
            className="inp text-sm px-2 py-1"
            value={filters.from ?? ''}
            onChange={e => updateFilter({ from: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">To</label>
          <input
            type="date"
            className="inp text-sm px-2 py-1"
            value={filters.to ?? ''}
            onChange={e => updateFilter({ to: e.target.value || undefined })}
          />
        </div>
        <button onClick={exportCsv} className="btn btn-g btn-sm flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      <div className="text-xs text-muted">{total} entries{loading ? ' (loading...)' : ''}</div>

      {/* Log entries */}
      <div className="card divide-y divide-border/50 overflow-hidden">
        {logs.length === 0 && !loading && (
          <div className="px-4 py-8 text-sm text-muted text-center">No audit entries match your filters.</div>
        )}
        {logs.map(log => (
          <div
            key={log.id}
            className="px-4 py-3 hover:bg-surface-2 transition cursor-pointer"
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="default">{log.entityType}</Badge>
                <span className="font-medium text-sm">{log.action}</span>
                <span className="text-xs text-text-3">#{log.entityId}</span>
              </div>
              <span className="text-xs text-text-3">
                {new Date(log.createdAt).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
            {log.userId && <div className="text-xs text-muted mt-1">by {log.userId}</div>}
            {expandedId === log.id && (log.oldValue || log.newValue) && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {log.oldValue && (
                  <div>
                    <div className="text-xs font-bold text-muted mb-1">Before</div>
                    <pre className="text-xs bg-surface-2 rounded p-2 overflow-auto max-h-40">
                      {JSON.stringify(log.oldValue, null, 2)}
                    </pre>
                  </div>
                )}
                {log.newValue && (
                  <div>
                    <div className="text-xs font-bold text-muted mb-1">After</div>
                    <pre className="text-xs bg-surface-2 rounded p-2 overflow-auto max-h-40">
                      {JSON.stringify(log.newValue, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > (filters.limit ?? 50) && (
        <div className="flex gap-2 justify-center">
          <button
            className="btn btn-g btn-sm"
            disabled={(filters.offset ?? 0) === 0}
            onClick={() => updateFilter({ offset: Math.max(0, (filters.offset ?? 0) - (filters.limit ?? 50)) })}
          >
            Previous
          </button>
          <span className="text-xs text-muted self-center">
            {(filters.offset ?? 0) + 1}–{Math.min((filters.offset ?? 0) + (filters.limit ?? 50), total)} of {total}
          </span>
          <button
            className="btn btn-g btn-sm"
            disabled={(filters.offset ?? 0) + (filters.limit ?? 50) >= total}
            onClick={() => updateFilter({ offset: (filters.offset ?? 0) + (filters.limit ?? 50) })}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add audit-log as an AdminTab**

In `AdminView.tsx`, add `'audit-log'` to the `AdminTab` type and to the Data sidebar group:

```typescript
export type AdminTab = 'fields' | 'sports' | 'competitions' | 'encoders' | 'csv' | 'publish' | 'org' | 'crew-roster' | 'crew-templates' | 'audit-log'
```

Add to the Data group in `sidebarGroups`:
```typescript
{ id: 'audit-log', label: 'Audit Log' },
```

Add the render:
```tsx
{activeTab === 'audit-log' && <AuditLogViewer />}
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/admin/AuditLogViewer.tsx src/pages/AdminView.tsx
git commit -m "feat: add filterable audit log viewer with pagination and CSV export"
```

---

## Phase 3: Power Features

### Task 11: Keyboard Shortcuts

**Context:** Add global keyboard shortcuts for common actions + a help modal showing all shortcuts.

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Create: `src/components/ui/ShortcutHelpModal.tsx`
- Modify: `src/App.tsx`

**Step 1: Create shortcuts hook**

Create `src/hooks/useKeyboardShortcuts.ts`:

```typescript
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
  { key: 't', label: 'Go to Today' },
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
```

**Step 2: Create help modal**

Create `src/components/ui/ShortcutHelpModal.tsx`:

```tsx
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
```

**Step 3: Wire into App.tsx**

In `App.tsx`, inside `AppContent`:

```typescript
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ShortcutHelpModal } from './components/ui/ShortcutHelpModal'

// Inside AppContent component:
const [showShortcutHelp, setShowShortcutHelp] = useState(false)

useKeyboardShortcuts([
  { key: 'n', label: 'New Event', action: () => setShowEventForm(true) },
  { key: 'k', ctrl: true, label: 'Search', action: () => {
    document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
  }},
  { key: '?', shift: true, label: 'Show Shortcuts', action: () => setShowShortcutHelp(true) },
  { key: '1', label: 'Go to Planning', action: () => navigate('/planner') },
  { key: '2', label: 'Go to Sports', action: () => navigate('/sports') },
  { key: '3', label: 'Go to Contracts', action: () => navigate('/contracts') },
  { key: 'Escape', label: 'Close', action: () => {
    setShowEventForm(false)
    setShowSettings(false)
    setShowShortcutHelp(false)
  }},
])

// In render, add:
{showShortcutHelp && <ShortcutHelpModal onClose={() => setShowShortcutHelp(false)} />}
```

Also add `data-search-input` attribute to the search input in `Header.tsx`.

**Step 4: Verify + Commit**

```bash
npx tsc --noEmit
git add src/hooks/useKeyboardShortcuts.ts src/components/ui/ShortcutHelpModal.tsx src/App.tsx src/components/layout/Header.tsx
git commit -m "feat: add global keyboard shortcuts with help modal (Shift+?)"
```

---

### Task 12: Auto-Fill Rules

**Context:** Let admins configure default values that auto-populate when creating events. Store in AppSetting as a global setting.

**Files:**
- Create: `src/components/admin/AutoFillRulesPanel.tsx`
- Modify: `src/pages/AdminView.tsx` (add tab)
- Modify: `backend/src/routes/settings.ts` (add endpoints)
- Modify: `src/services/settings.ts` (add methods)

**Step 1: Add backend endpoints**

In `backend/src/routes/settings.ts`, add:

```typescript
// Get auto-fill rules
router.get('/autofill', authenticate, async (_req, res, next) => {
  try {
    const setting = await prisma.appSetting.findFirst({
      where: { key: 'autofill_rules', scopeKind: 'global' }
    })
    res.json(setting?.value ?? { rules: [] })
  } catch (error) {
    next(error)
  }
})

// Update auto-fill rules
router.put('/autofill', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rules } = req.body
    const setting = await prisma.appSetting.upsert({
      where: { key_scopeKind_scopeId: { key: 'autofill_rules', scopeKind: 'global', scopeId: 'global' } },
      create: { key: 'autofill_rules', scopeKind: 'global', scopeId: 'global', value: { rules } },
      update: { value: { rules } },
    })
    res.json(setting.value)
  } catch (error) {
    next(error)
  }
})
```

**Step 2: Add frontend service methods**

In `src/services/settings.ts`, add:

```typescript
export interface AutoFillRule {
  id: string
  trigger: 'sport' | 'competition' | 'planType'
  triggerValue: string
  field: string
  value: string
  label: string
}

// Add to settingsApi:
getAutoFillRules: (): Promise<{ rules: AutoFillRule[] }> =>
  api.get('/settings/autofill'),

updateAutoFillRules: (rules: AutoFillRule[]): Promise<{ rules: AutoFillRule[] }> =>
  api.put('/settings/autofill', { rules }),
```

**Step 3: Create AutoFillRulesPanel**

Create `src/components/admin/AutoFillRulesPanel.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { settingsApi, type AutoFillRule } from '../../services/settings'
import { useApp } from '../../context/AppProvider'
import { useToast } from '../Toast'

export function AutoFillRulesPanel() {
  const [rules, setRules] = useState<AutoFillRule[]>([])
  const [loading, setLoading] = useState(true)
  const { sports, competitions, orgConfig } = useApp()
  const toast = useToast()

  useEffect(() => {
    settingsApi.getAutoFillRules()
      .then(r => setRules(r.rules))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async (updated: AutoFillRule[]) => {
    try {
      await settingsApi.updateAutoFillRules(updated)
      setRules(updated)
      toast.success('Auto-fill rules saved')
    } catch {
      toast.error('Failed to save rules')
    }
  }

  const addRule = () => {
    const newRule: AutoFillRule = {
      id: crypto.randomUUID(),
      trigger: 'sport',
      triggerValue: '',
      field: 'linearChannel',
      value: '',
      label: '',
    }
    setRules(prev => [...prev, newRule])
  }

  const updateRule = (id: string, patch: Partial<AutoFillRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const removeRule = (id: string) => {
    const updated = rules.filter(r => r.id !== id)
    save(updated)
  }

  const channels = orgConfig?.channels ?? []

  if (loading) return <div className="text-sm text-muted py-4">Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold">Auto-Fill Rules</h4>
          <p className="text-xs text-muted mt-1">When a trigger matches, the target field is auto-populated in new events.</p>
        </div>
        <button onClick={addRule} className="btn btn-p btn-sm flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Rule
        </button>
      </div>

      {rules.length === 0 && (
        <div className="text-sm text-muted text-center py-8">No auto-fill rules configured.</div>
      )}

      {rules.map(rule => (
        <div key={rule.id} className="card p-4 flex gap-3 items-end">
          <div className="flex-1 grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">When</label>
              <select
                className="inp text-sm w-full"
                value={rule.trigger}
                onChange={e => updateRule(rule.id, { trigger: e.target.value as AutoFillRule['trigger'] })}
              >
                <option value="sport">Sport is</option>
                <option value="competition">Competition is</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Equals</label>
              <select
                className="inp text-sm w-full"
                value={rule.triggerValue}
                onChange={e => updateRule(rule.id, { triggerValue: e.target.value })}
              >
                <option value="">Select...</option>
                {rule.trigger === 'sport' && sports.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.icon} {s.name}</option>
                ))}
                {rule.trigger === 'competition' && competitions.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Set field</label>
              <select
                className="inp text-sm w-full"
                value={rule.field}
                onChange={e => updateRule(rule.id, { field: e.target.value })}
              >
                <option value="linearChannel">Linear Channel</option>
                <option value="radioChannel">Radio Channel</option>
                <option value="onDemandChannel">On-Demand Channel</option>
                <option value="duration">Duration</option>
                <option value="complex">Complex</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">To value</label>
              {rule.field === 'linearChannel' ? (
                <select className="inp text-sm w-full" value={rule.value} onChange={e => updateRule(rule.id, { value: e.target.value })}>
                  <option value="">Select...</option>
                  {channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </select>
              ) : (
                <input
                  className="inp text-sm w-full"
                  value={rule.value}
                  onChange={e => updateRule(rule.id, { value: e.target.value })}
                  placeholder="Value"
                />
              )}
            </div>
          </div>
          <button onClick={() => removeRule(rule.id)} className="p-2 text-danger hover:bg-danger/10 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {rules.length > 0 && (
        <div className="flex justify-end">
          <button onClick={() => save(rules)} className="btn btn-p btn-sm">Save Rules</button>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Add to AdminView sidebar**

Add `'autofill'` to `AdminTab` type and to the Planning group:

```typescript
{ id: 'autofill', label: 'Auto-Fill Rules' },
```

Add render:
```tsx
{activeTab === 'autofill' && <AutoFillRulesPanel />}
```

**Step 5: Verify + Commit**

```bash
npx tsc --noEmit && cd backend && npx tsc --noEmit
git add backend/src/routes/settings.ts src/services/settings.ts src/components/admin/AutoFillRulesPanel.tsx src/pages/AdminView.tsx
git commit -m "feat: add auto-fill rules configuration (sport/competition → channel/duration)"
```

---

### Task 13: Workflow Automation Toggles

**Context:** Simple on/off toggles for automation behaviors. Stored as AppSetting, checked at relevant trigger points.

**Files:**
- Create: `src/components/admin/WorkflowTogglesPanel.tsx`
- Modify: `src/pages/AdminView.tsx`

**Step 1: Create WorkflowTogglesPanel**

Create `src/components/admin/WorkflowTogglesPanel.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { settingsApi } from '../../services/settings'
import { useToast } from '../Toast'
import { Toggle } from '../ui/Toggle'

interface WorkflowToggle {
  id: string
  label: string
  description: string
  enabled: boolean
}

const DEFAULT_TOGGLES: WorkflowToggle[] = [
  { id: 'auto_crew_template', label: 'Auto-apply crew template', description: 'When a tech plan is created, automatically fill crew from the plan-type default template.', enabled: true },
  { id: 'notify_tech_plan_incomplete', label: 'Incomplete tech plan reminder', description: 'Send notification when a tech plan has empty required fields 24h before the event.', enabled: false },
  { id: 'notify_crew_conflict', label: 'Crew conflict notification', description: 'Send notification when a crew assignment creates a scheduling conflict.', enabled: true },
  { id: 'notify_event_change', label: 'Event change notification', description: 'Notify assigned crew when an event date, time, or channel changes.', enabled: false },
  { id: 'auto_status_on_publish', label: 'Auto-set status on publish', description: 'Set event status to "published" when event is pushed to external feeds.', enabled: false },
]

export function WorkflowTogglesPanel() {
  const [toggles, setToggles] = useState<WorkflowToggle[]>(DEFAULT_TOGGLES)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    settingsApi.getApp('admin').then(settings => {
      const saved = (settings.orgConfig as Record<string, unknown>)?.workflowToggles as Record<string, boolean> | undefined
      if (saved) {
        setToggles(prev => prev.map(t => ({ ...t, enabled: saved[t.id] ?? t.enabled })))
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleToggle = async (id: string, enabled: boolean) => {
    setToggles(prev => prev.map(t => t.id === id ? { ...t, enabled } : t))
    try {
      const toggleMap = Object.fromEntries(
        toggles.map(t => [t.id, t.id === id ? enabled : t.enabled])
      )
      // Store in org config as workflowToggles
      const currentOrg = await settingsApi.getApp('admin').then(s => s.orgConfig ?? {})
      await settingsApi.updateOrgConfig({ ...currentOrg, workflowToggles: toggleMap })
      toast.success('Workflow updated')
    } catch {
      toast.error('Failed to save')
    }
  }

  if (loading) return <div className="text-sm text-muted py-4">Loading...</div>

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-bold">Workflow Automation</h4>
        <p className="text-xs text-muted mt-1">Toggle automated behaviors. These run server-side when triggered by user actions.</p>
      </div>

      <div className="space-y-3">
        {toggles.map(toggle => (
          <div key={toggle.id} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm">{toggle.label}</div>
              <div className="text-xs text-muted mt-0.5">{toggle.description}</div>
            </div>
            <Toggle active={toggle.enabled} onChange={v => handleToggle(toggle.id, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Add to AdminView**

Add `'workflows'` to `AdminTab` and add to the Planning sidebar group:

```typescript
{ id: 'workflows', label: 'Workflow Automation' },
```

Add render:
```tsx
{activeTab === 'workflows' && <WorkflowTogglesPanel />}
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/admin/WorkflowTogglesPanel.tsx src/pages/AdminView.tsx
git commit -m "feat: add workflow automation toggles (auto-crew, notifications, auto-status)"
```

---

## Execution Batching

**Batch A (independent, can run in parallel):**
- Task 1: Audit log endpoint
- Task 2: User management endpoint
- Task 3: Admin stats endpoint
- Task 5: Notification bell

**Batch B (depends on A):**
- Task 4: Wire real data into AdminView (needs Tasks 1-3)
- Task 6: Inline Settings Modal

**Batch C (independent):**
- Task 7: Admin sidebar navigation
- Task 8: User preferences modal
- Task 9: Notification preferences

**Batch D (depends on C):**
- Task 10: Audit log viewer (needs Task 1 + Task 7)

**Batch E (independent):**
- Task 11: Keyboard shortcuts
- Task 12: Auto-fill rules
- Task 13: Workflow automation toggles
