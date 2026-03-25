# D1: Confirmation Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `window.confirm()` with styled dialogs and add confirmations to all destructive actions missing them.

**Architecture:** Reusable `ConfirmDialog` component + `useConfirmDialog` hook (Promise-based), then sweep 10 files to wire confirmations.

**Tech Stack:** React, TypeScript, existing Modal/BB design tokens

**Spec:** `docs/superpowers/specs/2026-03-25-d1-confirmation-dialogs-design.md`

---

## Task 1: Create ConfirmDialog + useConfirmDialog

**Files:**
- Create: `src/components/ui/ConfirmDialog.tsx`

- [ ] **Step 1: Create the component and hook**

Follow the DiscardDialog pattern (`src/components/forms/DiscardDialog.tsx`) for styling. Use z-[60] to layer above modals.

- [ ] **Step 2: Verify TypeScript compiles**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add ConfirmDialog component and useConfirmDialog hook"
```

---

## Task 2: Sweep — Replace window.confirm() and add missing confirmations

**Files to modify:**
- `src/components/planner/BulkActionBar.tsx`
- `src/hooks/useEventActions.ts`
- `src/pages/AdminView.tsx`
- `src/components/admin/CrewRosterPanel.tsx`
- `src/components/sports/ResourcesTab.tsx`
- `src/components/admin/CrewTemplatesPanel.tsx`

- [ ] **Step 1: Wire useConfirmDialog into each file and replace/add confirmations**
- [ ] **Step 2: Verify TypeScript compiles**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: replace window.confirm with ConfirmDialog across all destructive actions"
```
