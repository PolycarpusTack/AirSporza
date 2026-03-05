# Crew Roster & Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a CrewMember roster (auto-extracted from existing plans, with autocomplete on crew fields) and a CrewTemplate system (plan-type defaults + user-created custom templates with private/shared visibility).

**Architecture:** Two new Prisma models (CrewMember, CrewTemplate) with Express CRUD routes. Frontend gets a reusable Autocomplete component wired into TechPlanCard crew fields, plus template apply/save UI. Admin gets roster management (merge/rename) and template management panels. Toast feedback throughout.

**Tech Stack:** Prisma, Express, Joi, React, TypeScript, existing BB design tokens, lucide-react icons.

**Design doc:** `docs/plans/2026-03-05-sports-tab-enhancements-design.md`

---

## Phase 1: CrewMember Roster + Autocomplete

### Task 1: CrewMember Prisma model + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_crew_member/migration.sql`

**Step 1: Add CrewMember model to schema**

Add to `backend/prisma/schema.prisma`:

```prisma
model CrewMember {
  id        Int      @id @default(autoincrement())
  name      String
  roles     Json     @default("[]")   // string[] — roles seen in assignments
  email     String?
  phone     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([name])
  @@map("crew_members")
}
```

**Step 2: Generate migration**

```bash
cd /mnt/c/Projects/Planza/backend && npx prisma migrate dev --name add_crew_member
```

**Step 3: Verify**

```bash
npx prisma generate
```

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add CrewMember model to Prisma schema"
```

---

### Task 2: CrewMember backend routes

**Files:**
- Create: `backend/src/routes/crewMembers.ts`
- Modify: `backend/src/index.ts` (mount route)

**Step 1: Create the route file**

```typescript
// backend/src/routes/crewMembers.ts
import { Router, Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth'
import { createError } from '../middleware/errorHandler'

const prisma = new PrismaClient()
const router = Router()

// GET /crew-members — list all (with optional search)
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, role, active } = req.query
    const where: any = {}
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' }
    }
    if (role) {
      where.roles = { path: '$', array_contains: String(role) }
    }
    if (active !== undefined) {
      where.isActive = active === 'true'
    }
    const members = await prisma.crewMember.findMany({
      where,
      orderBy: { name: 'asc' },
    })
    res.json(members)
  } catch (err) { next(err) }
})

// GET /crew-members/autocomplete?q=...&role=... — lightweight search for autocomplete
router.get('/autocomplete', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || '')
    if (q.length < 1) return res.json([])
    const members = await prisma.crewMember.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true, name: true, roles: true },
      take: 10,
      orderBy: { name: 'asc' },
    })
    res.json(members)
  } catch (err) { next(err) }
})

// POST /crew-members — create
const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  roles: Joi.array().items(Joi.string()).default([]),
  email: Joi.string().email().allow(null, '').default(null),
  phone: Joi.string().allow(null, '').default(null),
  isActive: Joi.boolean().default(true),
})

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) throw createError(400, error.details[0].message)
    const existing = await prisma.crewMember.findUnique({ where: { name: value.name } })
    if (existing) throw createError(409, `Crew member "${value.name}" already exists`)
    const member = await prisma.crewMember.create({ data: value })
    res.status(201).json(member)
  } catch (err) { next(err) }
})

// PUT /crew-members/:id — update
const updateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  roles: Joi.array().items(Joi.string()),
  email: Joi.string().email().allow(null, ''),
  phone: Joi.string().allow(null, ''),
  isActive: Joi.boolean(),
})

router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw createError(400, 'Invalid ID')
    const { error, value } = updateSchema.validate(req.body)
    if (error) throw createError(400, error.details[0].message)
    const member = await prisma.crewMember.update({ where: { id }, data: value })
    res.json(member)
  } catch (err) { next(err) }
})

// POST /crew-members/extract — scan all tech plans and build roster
router.post('/extract', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await prisma.techPlan.findMany({ select: { crew: true } })
    const nameRoleMap = new Map<string, Set<string>>()

    for (const plan of plans) {
      const crew = plan.crew as Record<string, unknown>
      if (!crew || typeof crew !== 'object') continue
      for (const [role, value] of Object.entries(crew)) {
        if (typeof value === 'string' && value.trim()) {
          const name = value.trim()
          if (!nameRoleMap.has(name)) nameRoleMap.set(name, new Set())
          nameRoleMap.get(name)!.add(role)
        }
      }
    }

    let created = 0
    let updated = 0
    for (const [name, roles] of nameRoleMap) {
      const rolesArr = Array.from(roles)
      const existing = await prisma.crewMember.findUnique({ where: { name } })
      if (existing) {
        const existingRoles = (existing.roles as string[]) || []
        const merged = Array.from(new Set([...existingRoles, ...rolesArr]))
        if (merged.length > existingRoles.length) {
          await prisma.crewMember.update({ where: { name }, data: { roles: merged } })
          updated++
        }
      } else {
        await prisma.crewMember.create({ data: { name, roles: rolesArr } })
        created++
      }
    }

    res.json({ created, updated, total: nameRoleMap.size })
  } catch (err) { next(err) }
})

// POST /crew-members/merge — merge two crew members
const mergeSchema = Joi.object({
  sourceId: Joi.number().integer().required(),
  targetId: Joi.number().integer().required(),
})

router.post('/merge', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = mergeSchema.validate(req.body)
    if (error) throw createError(400, error.details[0].message)
    const { sourceId, targetId } = value
    if (sourceId === targetId) throw createError(400, 'Cannot merge a member with itself')

    const [source, target] = await Promise.all([
      prisma.crewMember.findUnique({ where: { id: sourceId } }),
      prisma.crewMember.findUnique({ where: { id: targetId } }),
    ])
    if (!source) throw createError(404, 'Source crew member not found')
    if (!target) throw createError(404, 'Target crew member not found')

    // Merge roles
    const mergedRoles = Array.from(new Set([
      ...((target.roles as string[]) || []),
      ...((source.roles as string[]) || []),
    ]))

    // Update all tech plans that reference the source name
    const plans = await prisma.techPlan.findMany()
    let planUpdates = 0
    for (const plan of plans) {
      const crew = plan.crew as Record<string, unknown>
      if (!crew) continue
      let changed = false
      const updated: Record<string, unknown> = { ...crew }
      for (const [role, val] of Object.entries(crew)) {
        if (val === source.name) {
          updated[role] = target.name
          changed = true
        }
      }
      if (changed) {
        await prisma.techPlan.update({ where: { id: plan.id }, data: { crew: updated } })
        planUpdates++
      }
    }

    // Update target roles, delete source
    await prisma.crewMember.update({ where: { id: targetId }, data: { roles: mergedRoles } })
    await prisma.crewMember.delete({ where: { id: sourceId } })

    res.json({ merged: true, targetId, planUpdates })
  } catch (err) { next(err) }
})

// DELETE /crew-members/:id
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw createError(400, 'Invalid ID')
    await prisma.crewMember.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
```

**Step 2: Mount in index.ts**

In `backend/src/index.ts`, add:

```typescript
import crewMembersRouter from './routes/crewMembers'
```

And mount alongside other routes:

```typescript
app.use('/api/crew-members', crewMembersRouter)
```

**Step 3: Verify backend compiles**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add backend/src/routes/crewMembers.ts backend/src/index.ts
git commit -m "feat: add CrewMember CRUD routes with extract and merge"
```

---

### Task 3: CrewMember frontend service

**Files:**
- Create: `src/services/crewMembers.ts`
- Modify: `src/services/index.ts` (add to barrel)
- Create: `src/data/types.ts` (add CrewMember type)

**Step 1: Add CrewMember type**

In `src/data/types.ts`, add:

```typescript
export interface CrewMember {
  id: number
  name: string
  roles: string[]
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}
```

**Step 2: Create the service**

```typescript
// src/services/crewMembers.ts
import { api } from '../utils/api'
import type { CrewMember } from '../data/types'

export const crewMembersApi = {
  list: (params?: { search?: string; role?: string; active?: boolean }) =>
    api.get<CrewMember[]>('/crew-members', params),

  autocomplete: (q: string, role?: string) =>
    api.get<Pick<CrewMember, 'id' | 'name' | 'roles'>[]>('/crew-members/autocomplete', { q, role }),

  create: (data: { name: string; roles?: string[]; email?: string; phone?: string }) =>
    api.post<CrewMember>('/crew-members', data),

  update: (id: number, data: Partial<Pick<CrewMember, 'name' | 'roles' | 'email' | 'phone' | 'isActive'>>) =>
    api.put<CrewMember>(`/crew-members/${id}`, data),

  extract: () =>
    api.post<{ created: number; updated: number; total: number }>('/crew-members/extract', {}),

  merge: (sourceId: number, targetId: number) =>
    api.post<{ merged: boolean; targetId: number; planUpdates: number }>('/crew-members/merge', { sourceId, targetId }),

  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/crew-members/${id}`),
}
```

**Step 3: Add to barrel export**

In `src/services/index.ts`, add:

```typescript
export { crewMembersApi } from './crewMembers'
```

**Step 4: Verify**

```bash
cd /mnt/c/Projects/Planza && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/data/types.ts src/services/crewMembers.ts src/services/index.ts
git commit -m "feat: add CrewMember frontend type and service"
```

---

### Task 4: CrewAutocomplete component

**Files:**
- Create: `src/components/ui/Autocomplete.tsx`
- Modify: `src/components/ui/index.ts` (add to barrel)

**Step 1: Create the Autocomplete component**

A reusable autocomplete input. Debounced search, keyboard navigation, accepts free text.

```tsx
// src/components/ui/Autocomplete.tsx
import { useState, useRef, useEffect, useCallback } from 'react'

interface AutocompleteOption {
  id: number
  label: string
  subtitle?: string
}

interface AutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSearch: (query: string) => Promise<AutocompleteOption[]>
  placeholder?: string
  className?: string
  debounceMs?: number
}

export function Autocomplete({
  value,
  onChange,
  onSearch,
  placeholder,
  className = '',
  debounceMs = 200,
}: AutocompleteProps) {
  const [options, setOptions] = useState<AutocompleteOption[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (q.length < 1) {
        setOptions([])
        setOpen(false)
        return
      }
      timerRef.current = setTimeout(async () => {
        try {
          const results = await onSearch(q)
          setOptions(results)
          setOpen(results.length > 0)
          setActiveIdx(-1)
        } catch {
          setOptions([])
          setOpen(false)
        }
      }, debounceMs)
    },
    [onSearch, debounceMs],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(v)
    search(v)
  }

  const select = (opt: AutocompleteOption) => {
    onChange(opt.label)
    setOpen(false)
    setOptions([])
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      select(options[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Cleanup timer
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (options.length > 0) setOpen(true) }}
        placeholder={placeholder}
        className={`field-input px-2 py-1 ${className}`}
        autoComplete="off"
      />
      {open && (
        <div
          ref={listRef}
          className="absolute z-30 mt-1 w-full rounded-md border border-border bg-surface shadow-md max-h-48 overflow-y-auto"
        >
          {options.map((opt, i) => (
            <button
              key={opt.id}
              onMouseDown={(e) => { e.preventDefault(); select(opt) }}
              className={`w-full px-3 py-2 text-left text-sm transition ${
                i === activeIdx ? 'bg-primary/10 text-text' : 'text-text-2 hover:bg-surface-2'
              }`}
            >
              <div className="font-medium">{opt.label}</div>
              {opt.subtitle && <div className="text-xs text-text-3">{opt.subtitle}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add to UI barrel**

In `src/components/ui/index.ts`, add:

```typescript
export { Autocomplete } from './Autocomplete'
```

**Step 3: Verify**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/ui/Autocomplete.tsx src/components/ui/index.ts
git commit -m "feat: add reusable Autocomplete component with keyboard nav"
```

---

### Task 5: Wire autocomplete into TechPlanCard crew fields

**Files:**
- Modify: `src/components/sports/TechPlanCard.tsx`

**Step 1: Add autocomplete to crew field inputs**

Replace the plain `<input>` for crew fields in edit mode with the Autocomplete component. Only applies to text-type crew fields (not checkbox).

Import at top of TechPlanCard.tsx:

```typescript
import { Autocomplete } from '../ui'
import { crewMembersApi } from '../../services'
```

Replace the edit-mode `<input>` block (the one inside the `isEditing` ternary for crew fields) with:

```tsx
{isEditing ? (
  <Autocomplete
    value={(plan.crew[field.id] as string) || ""}
    onChange={val => onCrewEdit(field.id, val)}
    onSearch={async (q) => {
      const results = await crewMembersApi.autocomplete(q, field.id)
      return results.map(r => ({
        id: r.id,
        label: r.name,
        subtitle: (r.roles as string[]).filter(role => role !== field.id).join(', ') || undefined,
      }))
    }}
    placeholder={field.label}
  />
) : (
```

The subtitle shows what other roles this person has filled (excluding the current field role).

**Step 2: Auto-add new names to roster**

In `SportsWorkspace.tsx`, update the `handleCrewEdit` callback to also upsert to the roster when a name is typed. After the existing API call:

```typescript
// After the techPlansApi.update call succeeds, ensure crew member exists in roster
if (value.trim()) {
  crewMembersApi.create({ name: value.trim(), roles: [field] }).catch(() => {
    // 409 = already exists, which is fine
  })
}
```

Add import at top:

```typescript
import { crewMembersApi } from '../services'
```

**Step 3: Verify**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/sports/TechPlanCard.tsx src/pages/SportsWorkspace.tsx
git commit -m "feat: wire crew field autocomplete into TechPlanCard"
```

---

### Task 6: Admin roster management panel

**Files:**
- Create: `src/components/admin/CrewRosterPanel.tsx`
- Modify: `src/pages/AdminView.tsx` (add tab)

**Step 1: Create CrewRosterPanel**

```tsx
// src/components/admin/CrewRosterPanel.tsx
import { useState, useEffect, useCallback } from 'react'
import { Search, Merge, Trash2, RefreshCw } from 'lucide-react'
import { Btn, Badge } from '../ui'
import { crewMembersApi } from '../../services'
import { useToast } from '../Toast'
import type { CrewMember } from '../../data/types'

export function CrewRosterPanel() {
  const [members, setMembers] = useState<CrewMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [mergeSource, setMergeSource] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await crewMembersApi.list({ search: search || undefined })
      setMembers(data)
    } catch {
      toast.error('Failed to load crew roster')
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  useEffect(() => { load() }, [load])

  const handleExtract = async () => {
    try {
      const result = await crewMembersApi.extract()
      toast.success(`Extracted ${result.created} new, updated ${result.updated} existing (${result.total} total)`)
      load()
    } catch {
      toast.error('Extraction failed')
    }
  }

  const handleRename = async (id: number) => {
    if (!editName.trim()) return
    try {
      await crewMembersApi.update(id, { name: editName.trim() })
      toast.success('Renamed')
      setEditingId(null)
      load()
    } catch {
      toast.error('Rename failed')
    }
  }

  const handleMerge = async (targetId: number) => {
    if (!mergeSource || mergeSource === targetId) return
    try {
      const result = await crewMembersApi.merge(mergeSource, targetId)
      toast.success(`Merged into target. ${result.planUpdates} plan(s) updated.`)
      setMergeSource(null)
      load()
    } catch {
      toast.error('Merge failed')
    }
  }

  const handleToggleActive = async (member: CrewMember) => {
    try {
      await crewMembersApi.update(member.id, { isActive: !member.isActive })
      load()
    } catch {
      toast.error('Update failed')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await crewMembersApi.delete(id)
      toast.success('Deleted')
      load()
    } catch {
      toast.error('Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-bold">Crew Roster</h3>
        <Btn variant="secondary" size="sm" onClick={handleExtract}>
          <RefreshCw className="w-4 h-4" /> Extract from Plans
        </Btn>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search crew members..."
          className="inp w-full pl-9"
        />
      </div>

      {mergeSource && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-sm">
          <strong>Merge mode:</strong> Select a target to merge "{members.find(m => m.id === mergeSource)?.name}" into.
          <button onClick={() => setMergeSource(null)} className="ml-2 text-xs underline text-text-2">Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="card p-8 text-center text-text-3 text-sm">
          No crew members found. Click "Extract from Plans" to build the roster from existing tech plans.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Roles</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-surface-2 transition">
                  <td className="px-4 py-3">
                    {editingId === m.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="field-input px-2 py-0.5 text-sm w-40"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(m.id); if (e.key === 'Escape') setEditingId(null) }}
                        />
                        <Btn variant="primary" size="xs" onClick={() => handleRename(m.id)}>Save</Btn>
                        <Btn variant="ghost" size="xs" onClick={() => setEditingId(null)}>Cancel</Btn>
                      </div>
                    ) : (
                      <span className="font-medium">{m.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(m.roles as string[]).map(r => (
                        <span key={r} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-text-2">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleActive(m)}>
                      {m.isActive
                        ? <Badge variant="success">Active</Badge>
                        : <Badge variant="none">Inactive</Badge>
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {mergeSource && mergeSource !== m.id ? (
                        <Btn variant="secondary" size="xs" onClick={() => handleMerge(m.id)}>Merge here</Btn>
                      ) : !mergeSource ? (
                        <>
                          <Btn variant="ghost" size="xs" onClick={() => { setEditingId(m.id); setEditName(m.name) }}>Rename</Btn>
                          <Btn variant="ghost" size="xs" onClick={() => setMergeSource(m.id)}>
                            <Merge className="w-3 h-3" />
                          </Btn>
                          <Btn variant="ghost" size="xs" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="w-3 h-3 text-danger" />
                          </Btn>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add to AdminView**

In `src/pages/AdminView.tsx`, add "Crew Roster" as a new tab alongside Fields/Sports/Competitions/Encoders/CSV Import. Import `CrewRosterPanel` and render when the tab is active.

Add import:
```typescript
import { CrewRosterPanel } from '../components/admin/CrewRosterPanel'
```

Add tab definition to the tabs array:
```typescript
{ id: 'crew-roster', label: 'Crew Roster' }
```

Add tab content:
```tsx
{activeTab === 'crew-roster' && <CrewRosterPanel />}
```

**Step 3: Verify**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/admin/CrewRosterPanel.tsx src/pages/AdminView.tsx
git commit -m "feat: add crew roster management panel in Admin"
```

---

## Phase 2: Crew Templates

### Task 7: CrewTemplate Prisma model + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Step 1: Add CrewTemplate model**

```prisma
model CrewTemplate {
  id          Int      @id @default(autoincrement())
  name        String
  planType    String?                    // null = custom, set = plan-type default
  crewData    Json                       // same shape as TechPlan.crew
  createdById String?  @db.VarChar(36)  // null = system-level default
  isShared    Boolean  @default(false)
  createdBy   User?    @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([planType, createdById])      // one default per plan-type per user (null = system)
  @@map("crew_templates")
}
```

Also add `crewTemplates CrewTemplate[]` to the User model's relations.

**Step 2: Generate migration**

```bash
cd /mnt/c/Projects/Planza/backend && npx prisma migrate dev --name add_crew_template
```

**Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add CrewTemplate model to Prisma schema"
```

---

### Task 8: CrewTemplate backend routes

**Files:**
- Create: `backend/src/routes/crewTemplates.ts`
- Modify: `backend/src/index.ts` (mount route)

**Step 1: Create the route file**

```typescript
// backend/src/routes/crewTemplates.ts
import { Router, Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth'
import { createError } from '../middleware/errorHandler'

const prisma = new PrismaClient()
const router = Router()

// GET /crew-templates — list templates visible to current user
// Returns: plan-type defaults (system) + shared templates + user's private templates
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id || null
    const templates = await prisma.crewTemplate.findMany({
      where: {
        OR: [
          { createdById: null },          // system defaults
          { isShared: true },             // shared by others
          ...(userId ? [{ createdById: userId }] : []),  // user's own
        ],
      },
      orderBy: [{ planType: 'asc' }, { name: 'asc' }],
    })
    res.json(templates)
  } catch (err) { next(err) }
})

// POST /crew-templates — create a new template
const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  planType: Joi.string().allow(null).default(null),
  crewData: Joi.object().required(),
  isShared: Joi.boolean().default(false),
})

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) throw createError(400, error.details[0].message)
    const userId = (req as any).user?.id || null
    const template = await prisma.crewTemplate.create({
      data: {
        ...value,
        createdById: userId,
      },
    })
    res.status(201).json(template)
  } catch (err) { next(err) }
})

// PUT /crew-templates/:id — update
const updateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  crewData: Joi.object(),
  isShared: Joi.boolean(),
})

router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw createError(400, 'Invalid ID')
    const { error, value } = updateSchema.validate(req.body)
    if (error) throw createError(400, error.details[0].message)

    const existing = await prisma.crewTemplate.findUnique({ where: { id } })
    if (!existing) throw createError(404, 'Template not found')

    // Only owner or admin can update
    const userId = (req as any).user?.id
    if (existing.createdById && existing.createdById !== userId) {
      throw createError(403, 'Cannot update another user\'s template')
    }

    const template = await prisma.crewTemplate.update({ where: { id }, data: value })
    res.json(template)
  } catch (err) { next(err) }
})

// DELETE /crew-templates/:id
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw createError(400, 'Invalid ID')

    const existing = await prisma.crewTemplate.findUnique({ where: { id } })
    if (!existing) throw createError(404, 'Template not found')

    const userId = (req as any).user?.id
    if (existing.createdById && existing.createdById !== userId) {
      throw createError(403, 'Cannot delete another user\'s template')
    }

    await prisma.crewTemplate.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// GET /crew-templates/for-plan-type/:planType — get the default template for a plan type
router.get('/for-plan-type/:planType', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.crewTemplate.findFirst({
      where: { planType: req.params.planType, createdById: null },
    })
    res.json(template)
  } catch (err) { next(err) }
})

export default router
```

**Step 2: Mount in index.ts**

```typescript
import crewTemplatesRouter from './routes/crewTemplates'
// ...
app.use('/api/crew-templates', crewTemplatesRouter)
```

**Step 3: Verify + Commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/routes/crewTemplates.ts backend/src/index.ts
git commit -m "feat: add CrewTemplate CRUD routes"
```

---

### Task 9: CrewTemplate frontend service + type

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/services/crewTemplates.ts`
- Modify: `src/services/index.ts`

**Step 1: Add CrewTemplate type**

In `src/data/types.ts`:

```typescript
export interface CrewTemplate {
  id: number
  name: string
  planType: string | null
  crewData: Record<string, unknown>
  createdById: string | null
  isShared: boolean
  createdAt?: string
  updatedAt?: string
}
```

**Step 2: Create the service**

```typescript
// src/services/crewTemplates.ts
import { api } from '../utils/api'
import type { CrewTemplate } from '../data/types'

export const crewTemplatesApi = {
  list: () =>
    api.get<CrewTemplate[]>('/crew-templates'),

  forPlanType: (planType: string) =>
    api.get<CrewTemplate | null>(`/crew-templates/for-plan-type/${encodeURIComponent(planType)}`),

  create: (data: { name: string; planType?: string | null; crewData: Record<string, unknown>; isShared?: boolean }) =>
    api.post<CrewTemplate>('/crew-templates', data),

  update: (id: number, data: Partial<Pick<CrewTemplate, 'name' | 'crewData' | 'isShared'>>) =>
    api.put<CrewTemplate>(`/crew-templates/${id}`, data),

  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/crew-templates/${id}`),
}
```

**Step 3: Add to barrel**

```typescript
export { crewTemplatesApi } from './crewTemplates'
```

**Step 4: Verify + Commit**

```bash
npx tsc --noEmit
git add src/data/types.ts src/services/crewTemplates.ts src/services/index.ts
git commit -m "feat: add CrewTemplate frontend type and service"
```

---

### Task 10: Apply template dropdown on TechPlanCard

**Files:**
- Modify: `src/components/sports/TechPlanCard.tsx`

**Step 1: Add template apply UI**

Add a "Apply template" dropdown button next to "Edit Crew" in the TechPlanCard header. When clicked, fetches available templates and shows them in a dropdown grouped by category.

Add imports:

```typescript
import { useState, useEffect } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { crewTemplatesApi } from '../../services'
import type { CrewTemplate } from '../../data/types'
```

Add to `TechPlanCardProps`:

```typescript
onApplyTemplate: (crewData: Record<string, unknown>) => void
```

Inside the component, add state and effect:

```typescript
const [templates, setTemplates] = useState<CrewTemplate[]>([])
const [showTemplates, setShowTemplates] = useState(false)

useEffect(() => {
  crewTemplatesApi.list().then(setTemplates).catch(() => {})
}, [])

const defaults = templates.filter(t => t.planType !== null)
const shared = templates.filter(t => t.planType === null && t.isShared)
const personal = templates.filter(t => t.planType === null && !t.isShared && t.createdById !== null)
```

Add a dropdown button in the header area (next to the Edit Crew button):

```tsx
<div className="relative">
  <Btn variant="ghost" size="xs" onClick={() => setShowTemplates(!showTemplates)}>
    Apply Template <ChevronDown className="w-3 h-3" />
  </Btn>
  {showTemplates && (
    <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-surface shadow-md">
      {defaults.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-bold uppercase text-text-3">Defaults</div>
          {defaults.map(t => (
            <button
              key={t.id}
              onClick={() => { onApplyTemplate(t.crewData); setShowTemplates(false) }}
              className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition"
            >
              {t.name}
            </button>
          ))}
        </>
      )}
      {shared.length > 0 && (
        <>
          <div className="border-t border-border px-3 py-1.5 text-xs font-bold uppercase text-text-3">Shared</div>
          {shared.map(t => (
            <button
              key={t.id}
              onClick={() => { onApplyTemplate(t.crewData); setShowTemplates(false) }}
              className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition"
            >
              {t.name}
            </button>
          ))}
        </>
      )}
      {personal.length > 0 && (
        <>
          <div className="border-t border-border px-3 py-1.5 text-xs font-bold uppercase text-text-3">My Templates</div>
          {personal.map(t => (
            <button
              key={t.id}
              onClick={() => { onApplyTemplate(t.crewData); setShowTemplates(false) }}
              className="w-full px-3 py-2 text-left text-sm text-text-2 hover:bg-surface-2 transition"
            >
              {t.name}
            </button>
          ))}
        </>
      )}
      {templates.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-text-3">No templates yet</div>
      )}
    </div>
  )}
</div>
```

**Step 2: Wire onApplyTemplate in SportsWorkspace**

In `SportsWorkspace.tsx`, add the callback for `TechPlanCard`:

```tsx
onApplyTemplate={(crewData) => {
  const hasExisting = Object.values(plan.crew).some(v => typeof v === 'string' && v.trim())
  if (hasExisting && !window.confirm('This will overwrite current crew fields. Continue?')) return
  handleCrewBatchApply(plan.id, crewData)
}}
```

Add `handleCrewBatchApply` in SportsWorkspace:

```typescript
const handleCrewBatchApply = useCallback(async (planId: number, crewData: Record<string, unknown>) => {
  const updated = realtimePlans.map(p => p.id === planId ? { ...p, crew: { ...p.crew as Record<string, unknown>, ...crewData } } : p)
  setRealtimePlans(updated)
  setTechPlans(updated)
  const plan = updated.find(p => p.id === planId)
  if (plan) {
    try {
      await techPlansApi.update(planId, { crew: plan.crew, eventId: plan.eventId, planType: plan.planType, isLivestream: plan.isLivestream, customFields: plan.customFields })
      toast.success('Template applied')
    } catch {
      toast.error('Failed to apply template')
    }
  }
}, [realtimePlans, setTechPlans, toast])
```

Add toast import to SportsWorkspace:

```typescript
import { useToast } from '../components/Toast'
```

And in the component body:

```typescript
const toast = useToast()
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/sports/TechPlanCard.tsx src/pages/SportsWorkspace.tsx
git commit -m "feat: add Apply Template dropdown to TechPlanCard"
```

---

### Task 11: Save as template from TechPlanCard

**Files:**
- Modify: `src/components/sports/TechPlanCard.tsx`

**Step 1: Add Save as Template button + modal**

Add to `TechPlanCardProps`:

```typescript
onSaveAsTemplate: (crewData: Record<string, unknown>) => void
```

In the edit mode footer (next to "Add Custom Field"), add:

```tsx
<Btn variant="ghost" size="xs" onClick={() => onSaveAsTemplate(plan.crew as Record<string, unknown>)}>
  Save as Template
</Btn>
```

**Step 2: Add save template modal in SportsWorkspace**

Add state:

```typescript
const [saveTemplateData, setSaveTemplateData] = useState<Record<string, unknown> | null>(null)
const [templateName, setTemplateName] = useState('')
const [templateShared, setTemplateShared] = useState(false)
```

Wire the prop on TechPlanCard:

```tsx
onSaveAsTemplate={(crewData) => { setSaveTemplateData(crewData); setTemplateName(''); setTemplateShared(false) }}
```

Add the modal JSX at the bottom of the return, next to EncoderSwapModal:

```tsx
{saveTemplateData && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.4)' }}
    onClick={() => setSaveTemplateData(null)}
  >
    <div className="card w-full max-w-sm rounded-lg p-5 shadow-md animate-scale-in" onClick={e => e.stopPropagation()}>
      <h4 className="font-bold text-lg mb-4">Save as Template</h4>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-text-2 mb-1 block">Template Name</label>
          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="e.g. Standard Football Crew"
            className="inp w-full"
            autoFocus
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={templateShared}
            onChange={e => setTemplateShared(e.target.checked)}
            className="rounded border-border"
          />
          Share with all users
        </label>
      </div>
      <div className="flex gap-2 mt-5">
        <Btn
          variant="primary"
          className="flex-1"
          onClick={async () => {
            if (!templateName.trim()) return
            try {
              await crewTemplatesApi.create({
                name: templateName.trim(),
                crewData: saveTemplateData,
                isShared: templateShared,
              })
              toast.success('Template saved')
              setSaveTemplateData(null)
            } catch {
              toast.error('Failed to save template')
            }
          }}
        >
          Save
        </Btn>
        <Btn variant="default" className="flex-1" onClick={() => setSaveTemplateData(null)}>Cancel</Btn>
      </div>
    </div>
  </div>
)}
```

Add import for crewTemplatesApi in SportsWorkspace:

```typescript
import { crewTemplatesApi } from '../services'
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/sports/TechPlanCard.tsx src/pages/SportsWorkspace.tsx
git commit -m "feat: add Save as Template from TechPlanCard edit mode"
```

---

### Task 12: Template management in Admin

**Files:**
- Create: `src/components/admin/CrewTemplatesPanel.tsx`
- Modify: `src/pages/AdminView.tsx`

**Step 1: Create CrewTemplatesPanel**

```tsx
// src/components/admin/CrewTemplatesPanel.tsx
import { useState, useEffect, useCallback } from 'react'
import { Trash2, Globe, Lock } from 'lucide-react'
import { Btn, Badge } from '../ui'
import { crewTemplatesApi } from '../../services'
import { useToast } from '../Toast'
import type { CrewTemplate } from '../../data/types'

export function CrewTemplatesPanel() {
  const [templates, setTemplates] = useState<CrewTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await crewTemplatesApi.list())
    } catch {
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleToggleShared = async (t: CrewTemplate) => {
    try {
      await crewTemplatesApi.update(t.id, { isShared: !t.isShared })
      toast.success(t.isShared ? 'Made private' : 'Shared with all')
      load()
    } catch {
      toast.error('Update failed')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await crewTemplatesApi.delete(id)
      toast.success('Deleted')
      load()
    } catch {
      toast.error('Delete failed')
    }
  }

  const defaults = templates.filter(t => t.planType !== null)
  const custom = templates.filter(t => t.planType === null)

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold">Crew Templates</h3>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-2 mb-3">Plan-Type Defaults</h4>
        {defaults.length === 0 ? (
          <div className="card p-6 text-center text-text-3 text-sm">No plan-type defaults configured yet.</div>
        ) : (
          <div className="grid gap-3">
            {defaults.map(t => (
              <div key={t.id} className="card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-text-2">Plan type: <span className="font-mono">{t.planType}</span></div>
                  <div className="text-xs text-text-3 mt-1">
                    Fields: {Object.entries(t.crewData).filter(([, v]) => v).map(([k]) => k).join(', ') || 'empty'}
                  </div>
                </div>
                <Btn variant="ghost" size="xs" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-danger" />
                </Btn>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-2 mb-3">Custom Templates</h4>
        {custom.length === 0 ? (
          <div className="card p-6 text-center text-text-3 text-sm">No custom templates yet. Users can save templates from the Sports tab.</div>
        ) : (
          <div className="grid gap-3">
            {custom.map(t => (
              <div key={t.id} className="card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {t.name}
                    {t.isShared
                      ? <Badge variant="success"><Globe className="w-3 h-3 mr-0.5" /> Shared</Badge>
                      : <Badge variant="none"><Lock className="w-3 h-3 mr-0.5" /> Private</Badge>
                    }
                  </div>
                  <div className="text-xs text-text-3 mt-1">
                    Fields: {Object.entries(t.crewData).filter(([, v]) => v).map(([k]) => k).join(', ') || 'empty'}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Btn variant="ghost" size="xs" onClick={() => handleToggleShared(t)}>
                    {t.isShared ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                  </Btn>
                  <Btn variant="ghost" size="xs" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Add tab to AdminView**

Add import:
```typescript
import { CrewTemplatesPanel } from '../components/admin/CrewTemplatesPanel'
```

Add tab:
```typescript
{ id: 'crew-templates', label: 'Crew Templates' }
```

Add content:
```tsx
{activeTab === 'crew-templates' && <CrewTemplatesPanel />}
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
git add src/components/admin/CrewTemplatesPanel.tsx src/pages/AdminView.tsx
git commit -m "feat: add crew template management panel in Admin"
```

---

### Task 13: Auto-fill crew from template on plan creation

**Files:**
- Modify: `src/components/forms/DynamicEventForm.tsx` (or wherever tech plans are created)
- Modify: Backend `POST /tech-plans` route

**Step 1: Backend — auto-fill on create**

In `backend/src/routes/techPlans.ts`, in the POST / handler, after validating the request body but before creating the plan, check for a plan-type default template:

```typescript
// After Joi validation, before prisma.techPlan.create
let crew = value.crew || {}
if (Object.keys(crew).length === 0 && value.planType) {
  const defaultTemplate = await prisma.crewTemplate.findFirst({
    where: { planType: value.planType, createdById: null },
  })
  if (defaultTemplate) {
    crew = defaultTemplate.crewData as Record<string, unknown>
  }
}
```

Update the create call to use the potentially-enriched `crew`:

```typescript
const plan = await prisma.techPlan.create({
  data: { ...value, crew },
})
```

**Step 2: Verify + Commit**

```bash
cd /mnt/c/Projects/Planza/backend && npx tsc --noEmit
git add backend/src/routes/techPlans.ts
git commit -m "feat: auto-fill crew from plan-type default template on plan creation"
```

---

## Implementation Order

| Task | Description | Depends on | Parallel? |
|------|-------------|------------|-----------|
| 1 | CrewMember Prisma model | — | Yes (with 7) |
| 2 | CrewMember backend routes | 1 | |
| 3 | CrewMember frontend service | 1 | Yes (with 2) |
| 4 | Autocomplete component | — | Yes (with 1,2,3) |
| 5 | Wire autocomplete into TechPlanCard | 2, 3, 4 | |
| 6 | Admin roster panel | 3 | |
| 7 | CrewTemplate Prisma model | — | Yes (with 1) |
| 8 | CrewTemplate backend routes | 7 | |
| 9 | CrewTemplate frontend service | 7 | Yes (with 8) |
| 10 | Apply template dropdown | 8, 9 | |
| 11 | Save as template | 9 | Yes (with 10) |
| 12 | Admin templates panel | 9 | Yes (with 10, 11) |
| 13 | Auto-fill on plan creation | 7, 8 | Yes (with 10, 11, 12) |

**Parallel batches:**
- Batch A: Tasks 1, 4, 7 (all independent)
- Batch B: Tasks 2, 3, 8, 9 (backend + frontend services)
- Batch C: Tasks 5, 6, 10, 11, 12, 13 (UI wiring)
