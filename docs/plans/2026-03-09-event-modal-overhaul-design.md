# Event Modal Overhaul — Design

**Date:** 2026-03-09
**Status:** Approved

## Problem

The DynamicEventForm is a 520-line monolith mixing form state, validation, conflict checking, field rendering, and batch logic. The UX is a flat wall of fields with no visual grouping, no save feedback, no dirty-state protection, and no distinction between quick creation and detailed editing.

## Design Decisions

### 1. Create vs Edit Modes

**Create mode (minimal):** Shows only essential fields — Sport, Competition, Participants, Date (BE), Time (BE), Linear Channel. A "Show all fields" link expands to the full form. Link-from-import and Repeat section remain below the fields.

**Edit mode (full):** Always shows all visible fields organized in collapsible sections, all expanded by default.

### 2. Visual Grouping — Collapsible Sections

Fields grouped into five sections:

| Section | Fields |
|---------|--------|
| **Core** | Sport, Competition, Phase, Category, Participants, Content |
| **Scheduling** | Date/Time BE, Date/Time Origin, Duration, Livestream Date/Time |
| **Broadcast** | Linear Channel, Radio Channel, On-demand, Linear Start Time, isLive, isDelayedLive |
| **Reference** | Video Ref, Winner, Score, Complex |
| **Custom Fields** | Config-driven fields + API custom fields (unified) |

On create: only Core is shown initially. On edit: all sections visible and expanded.

Static field-to-section map:

```ts
const FIELD_SECTIONS: Record<string, string> = {
  sport: 'core', competition: 'core', phase: 'core',
  category: 'core', participants: 'core', content: 'core',
  startDateBE: 'scheduling', startTimeBE: 'scheduling',
  startDateOrigin: 'scheduling', startTimeOrigin: 'scheduling',
  duration: 'scheduling', livestreamDate: 'scheduling', livestreamTime: 'scheduling',
  linearChannel: 'broadcast', radioChannel: 'broadcast',
  onDemandChannel: 'broadcast', linearStartTime: 'broadcast',
  isLive: 'broadcast', isDelayedLive: 'broadcast',
  videoRef: 'reference', winner: 'reference',
  score: 'reference', complex: 'reference',
}
```

Unknown/custom fields default to "Custom Fields". Field ordering within each section respects the existing `field.order` value.

### 3. Dirty-State Guard

Track whether any field differs from its initial value. If the form is dirty and the user tries to close (Escape, backdrop click, Cancel), show a lightweight confirmation dialog: "Discard unsaved changes?" with **Discard** and **Keep Editing** buttons. Clean forms close immediately.

### 4. Save Button Feedback

Three visual states:

- **Idle:** "Create Event" / "Save Changes" (primary button)
- **Saving:** spinner icon + "Saving..." + button disabled
- **Result (success):** green "Saved!" — auto-closes modal after 600ms
- **Result (failure):** red "Save failed — try again" — stays visible, button re-enables

### 5. Component Decomposition

```
src/components/forms/
  DynamicEventForm.tsx              — orchestrator (~150 lines): mode, sections, layout
  hooks/
    useEventForm.ts                 — form state, init, update, dirty tracking
    useEventValidation.ts           — validate(), errors, mandatory + API required fields
    useConflictCheck.ts             — preflight check, result state, confirm-on-warnings
  fields/
    EventFieldRenderer.tsx          — renderField logic for all field types
    FieldSection.tsx                — collapsible section wrapper (title, chevron, children)
  ConflictBanner.tsx                — errors/warnings display with confirm prompt
  SaveFooter.tsx                    — save button states, required-fields count, cancel
  DiscardDialog.tsx                 — "discard changes?" confirmation
```

#### useEventForm.ts

Manages `form` state (`Record<string, string | boolean>`), `customValues`, `initForm()`, `update()`, and dirty tracking. Exposes `isDirty` boolean computed by comparing current state to initial snapshot.

#### useEventValidation.ts

Owns `validate()`, `errors`, `mandatoryErrors`. Combines eventFields.required checks, sportId/competitionId validation, duration format validation, API custom field required enforcement (including checkbox 'true'/'false' handling), and mandatory field enforcement.

#### useConflictCheck.ts

Owns `conflicts` state, `runCheck()` (calls conflictsApi.check), confirm-on-warnings logic (first hit blocks, second hit proceeds). Exposes `conflicts`, `checkAndProceed()`.

#### EventFieldRenderer.tsx

Pure rendering component. Takes a FieldConfig, current value, error state, and onChange callback. Contains the field-type branching logic: custom dropdown → channel FK → system dropdown → checkbox → textarea → duration → generic input.

#### FieldSection.tsx

Generic collapsible section: title, field count badge, chevron toggle, children slot. Accepts `defaultOpen` prop.

#### ConflictBanner.tsx

Renders conflict errors (red) and warnings (amber) with the "click Save again to proceed" prompt. Takes `conflicts: ConflictResult | null`.

#### SaveFooter.tsx

Renders the modal footer: required-fields count, Cancel button, Save button with loading/success/error states. Accepts `onSave`, `onCancel`, `saveState`, `requiredCount`, `readOnly`.

#### DiscardDialog.tsx

Small confirmation overlay: "You have unsaved changes. Discard?" with Discard and Keep Editing buttons.

### 6. Unchanged Components

These existing components are reused as-is, slotted into the new layout:

- `LinkFromImport.tsx` — shown above the form in create mode
- `RepeatSection.tsx` — shown below fields in create mode (no edit, no multiDay)
- `ChannelSelect.tsx` — used by EventFieldRenderer for channel FK fields
- `DynamicForm.tsx` — used for API custom fields rendering

### 7. Unchanged Backend

- Conflict check endpoint (POST /events/conflicts) — already fixed with FK field support
- Batch create (POST /events/batch) — unchanged
- Single create/update — unchanged
- Field configuration, mandatory fields — unchanged

### 8. Essential Fields (Create Mode)

The minimal create set:

| Field ID | Label |
|----------|-------|
| sport | Sport |
| competition | Competition |
| participants | Participants |
| startDateBE | Start Date (BE) |
| startTimeBE | Start Time (BE) |
| linearChannel | Linear Channel |

"Show all fields" expands to the full sectioned layout. Once expanded, sections can be individually collapsed.

## Bug Fixes Carried Forward

These fixes from the current session are preserved:

1. Conflict preflight schema accepts FK channel IDs (backend)
2. Modal stays open on save failure (await + throw pattern)
3. API custom fields required enforcement (including checkbox)
4. Custom dropdown options no longer clash with system keys
5. LinkFromImport converts UTC to Europe/Brussels timezone
6. Batch save rethrows on failure to keep modal open
