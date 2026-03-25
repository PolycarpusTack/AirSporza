# D1: Confirmation Dialogs — Design Spec

**Date:** 2026-03-25
**Scope:** Sub-project D1 — reusable confirmation dialog + sweep of destructive actions
**Status:** Approved

## Overview

Create a reusable `ConfirmDialog` component and `useConfirmDialog` hook, then sweep all destructive actions in the app to use them — replacing `window.confirm()` and adding missing confirmations.

## Out of Scope

- Non-destructive confirmations (save drafts, navigation guards) — these use DiscardDialog
- Undo/redo system — sub-project D territory
- Retry logic on failed actions — separate concern

---

## Section 1: ConfirmDialog Component + Hook

### ConfirmDialog

Create `src/components/ui/ConfirmDialog.tsx`:

```typescript
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string | React.ReactNode
  confirmLabel?: string      // default: "Delete"
  cancelLabel?: string       // default: "Cancel"
  variant?: 'danger' | 'warning' | 'default'
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}
```

- Uses existing `Modal` component as base layer
- `danger` variant: red confirm button (for deletes)
- `warning` variant: amber confirm button (for lock overrides, unassigns)
- `default` variant: primary button color
- `loading` disables both buttons and shows spinner on confirm
- Escape key and backdrop click trigger `onCancel`

### useConfirmDialog Hook

Create as part of the same file (or separate `src/hooks/useConfirmDialog.ts`):

```typescript
interface ConfirmOptions {
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
}

function useConfirmDialog(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  dialog: React.ReactNode  // render this in JSX
}
```

Usage pattern:
```tsx
function MyComponent() {
  const { confirm, dialog } = useConfirmDialog()

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete item?',
      message: 'This cannot be undone.',
      variant: 'danger',
    })
    if (!ok) return
    await api.delete(id)
  }

  return <>
    <button onClick={handleDelete}>Delete</button>
    {dialog}
  </>
}
```

The hook internally manages `open` state and resolves/rejects a Promise on confirm/cancel. This avoids boilerplate `useState` for dialog visibility in every consumer.

**Files to create:**
- `src/components/ui/ConfirmDialog.tsx`

---

## Section 2: Sweep — Replace window.confirm() and Add Missing Confirmations

### Replace existing window.confirm()

| File | Location | Current | Fix |
|------|----------|---------|-----|
| `src/components/planner/BulkActionBar.tsx` | Bulk delete | `window.confirm('Delete N events?')` | `await confirm({ title: 'Delete events', message: \`Delete ${ids.length} selected events? This cannot be undone.\`, variant: 'danger' })` |
| `src/hooks/useEventActions.ts` | handleCtxDelete | `window.confirm('Delete "participants"?')` | `await confirm({ title: 'Delete event', message: \`Delete "${event.participants}"?\`, variant: 'danger' })` |
| `src/hooks/useEventActions.ts` | handleCtxStatusChange + handleCtxDelete lock override | `window.confirm('This event is locked...')` | `await confirm({ title: 'Event locked', message: \`This event is locked (${lockReasonLabel(lock)}). Changes may disrupt operations. Continue?\`, variant: 'warning', confirmLabel: 'Continue' })` |
| `src/pages/AdminView.tsx` | SportsTab delete | `window.confirm(...)` or inline | `await confirm({ title: 'Delete sport', message: 'This will also delete all associated competitions and events.', variant: 'danger' })` |

### Add missing confirmations

| File | Action | Fix |
|------|--------|-----|
| `src/components/admin/CrewRosterPanel.tsx` | Delete crew member | `await confirm({ title: 'Delete crew member', message: \`Delete "${name}"?\`, variant: 'danger' })` |
| `src/pages/AdminView.tsx` CompetitionsTab | Delete competition | `await confirm({ title: 'Delete competition', message: \`Delete "${name}"?\`, variant: 'danger' })` |
| `src/pages/AdminView.tsx` EncodersTab | Delete encoder | `await confirm({ title: 'Delete encoder', message: \`Delete "${name}"?\`, variant: 'danger' })` |
| `src/pages/AdminView.tsx` UsersTab | Delete user | `await confirm({ title: 'Delete user', message: \`Remove "${email}" from the system?\`, variant: 'danger' })` |
| `src/components/sports/ResourcesTab.tsx` | Unassign resource | `await confirm({ title: 'Unassign resource', message: \`Remove this resource assignment?\`, variant: 'warning', confirmLabel: 'Unassign' })` |
| `src/components/admin/CrewTemplatesPanel.tsx` | Delete template | `await confirm({ title: 'Delete template', message: \`Delete "${name}"?\`, variant: 'danger' })` |

**Files to modify:**
- `src/components/planner/BulkActionBar.tsx`
- `src/hooks/useEventActions.ts`
- `src/pages/AdminView.tsx`
- `src/components/admin/CrewRosterPanel.tsx`
- `src/components/sports/ResourcesTab.tsx`
- `src/components/admin/CrewTemplatesPanel.tsx`

---

## No New Dependencies

Uses existing Modal component and BB design tokens.
