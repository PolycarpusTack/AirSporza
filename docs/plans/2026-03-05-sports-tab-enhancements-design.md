# Sports Tab Enhancements Design

**Goal:** Transform the Sports tab from a read-only viewer into a full crew and resource management workspace with templates, conflict detection, and visual scheduling.

**Scope:** Crew workflow (templates, conflicts, roster, enhanced tab) + Resource management (assignment from both sides, timeline views) + polish woven throughout.

---

## 1. Crew Templates

### Plan-Type Default Templates
- Each plan type (Main Feed, Highlights, etc.) has a default crew template.
- When a tech plan is created, crew fields auto-fill from the matching template.
- Users can override any field per-plan.
- Templates managed in Admin (new sub-tab).

### Custom User Templates
- Users save any crew configuration as a named template.
- Visibility: **Private** (creator only) or **Shared** (everyone).
- "Save as template" button on TechPlanCard in edit mode.
- "Apply template" dropdown on TechPlanCard: plan-type defaults first, then shared, then private.
- Template management: rename, delete, toggle visibility.

### Data Model
```
CrewTemplate {
  id: number
  name: string
  planType: string | null       -- null = custom, set = plan-type default
  crewData: JSON                -- same shape as TechPlan.crew
  createdById: string | null    -- null = system-level default
  isShared: boolean
  createdAt, updatedAt
}
```

### UX Flow
1. Create tech plan -> auto-fill from plan-type default template
2. "Apply template" dropdown -> categorized list -> fills crew fields (confirm if overwriting)
3. "Save as template" -> name + private/shared toggle -> saves current crew config

---

## 2. Crew Conflict Detection

### Conflict Definition
- Same person name in crew fields across two or more tech plans with overlapping event times.
- Overlap calculated from start time + duration (default 3h if duration missing).

### Warning Badges
- Inline orange warning icon next to crew field when conflict detected.
- Tooltip: "Also assigned to [Event] as [Role] at [Time]".
- Non-blocking: user can save anyway.
- Runs client-side against realtimePlans + events in memory.

### Conflict Dashboard
- Accessible from Crew tab toggle: "Assignments" | "Conflicts".
- Grouped by person: shows conflicting events with roles, times, severity (full/partial overlap).
- Filterable by date range and sport.
- Links to relevant tech plan cards.

---

## 3. Crew Roster (Hybrid)

### Auto-Extraction
- Scan all existing TechPlan crew data, extract unique names per role.
- Build initial roster automatically, zero setup.

### CrewMember Entity
```
CrewMember {
  id: number
  name: string
  roles: JSON (string[])        -- roles seen in assignments
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt, updatedAt
}
```

### Autocomplete
- Crew fields get autocomplete suggestions from roster.
- Still accepts free text (new entries auto-added to roster).
- Debounced, keyboard navigable, shows role history.

### Admin Tools
- Roster management panel: rename, merge duplicates, deactivate.

---

## 4. Enhanced Crew Tab

### Table View (default)
- All crew fields shown (horizontal scroll on small screens).
- Inline editing: click cell to edit.
- Conflict badges per cell (orange dot for time overlaps).
- Search bar: filter by person, event, plan type.
- Sortable column headers (asc/desc toggle).
- Bulk actions: checkbox selection, "Apply template" to multiple plans.

### Matrix View (toggle)
- Rows: crew members (from roster).
- Columns: events grouped by date, sorted chronologically.
- Cells: role(s) for that person + event. Empty = not assigned.
- Color: green = single, orange = conflict, grey = unassigned.
- Click cell to assign/unassign via popover with role selection.
- Sticky first column for horizontal scroll.
- Filter by role, sport, date range.

### Toggle UX
- Two-button toggle: "Table" | "Matrix".
- Shared filter/search state across views.

---

## 5. Resource Assignment

### From Events Tab (per-plan)
- Collapsible "Resources" section at bottom of TechPlanCard.
- Shows assigned resources with quantity and notes.
- "Add Resource" dropdown: available resources with capacity status.
- Remove via X button with confirmation.
- Over-capacity warning inline (non-blocking).

### From Resources Tab (per-resource)
- "Assign" button per row -> modal with unassigned tech plans grouped by event.
- "Unassign" button per assignment in expanded list.
- Over-allocated badge (red) on row.
- Real-time count updates.

---

## 6. Resource Timeline

### Views
- Toggle: "Table" | "Timeline" on Resources tab.
- **Weekly**: horizontal = days, rows = resources, bars = event durations.
- **Daily**: horizontal = hours (same scale as PlannerView), rows = resources.
- Toggle daily/weekly via two-button toggle.

### Navigation
- Prev/next week or day, jump to today.
- Reuse PlannerView week nav pattern.

### Visual Design
- Bar color by sport (reuse hexToChannelColor).
- Red overlay on over-capacity bars.
- Capacity line: dashed horizontal line per resource at max capacity.
- Click bar for tooltip: event, plan type, quantity, time.

---

## 7. Unified Conflict Dashboard

- Tabbed: "Crew Conflicts" | "Resource Conflicts".
- Crew: grouped by person, shows overlapping events/roles/times.
- Resources: grouped by resource, shows over-allocations with capacity vs. allocated.
- Filterable by date range and sport.
- Links to relevant plans for resolution.
- Green checkmark "No conflicts" empty state.

---

## 8. Polish (woven throughout)

### Error Feedback
- Crew edit failures: toast notification (not silent catch).
- Encoder swap 409: show which plan/event holds the lock.
- Resource assign/unassign: success/error feedback inline.
- Template save/apply: confirmation toast.

### Validation
- Required crew fields: red border + "Required" on save attempt.
- Template apply: confirmation if overwriting non-empty fields.
- Resource assignment: capacity warning.

### Empty States
- Crew table: "No plans yet" with action link.
- Matrix: "No crew members found" with explanation.
- Timeline: "No resources configured" with admin link.
- Conflict dashboard: green checkmark.

### Autocomplete Polish
- Debounced, role history, keyboard navigation.
- Resource dropdown: capacity inline, grouped by type.

---

## New Entities Summary

| Entity | Purpose |
|--------|---------|
| `CrewTemplate` | Plan-type defaults + user custom templates |
| `CrewMember` | Auto-extracted roster for autocomplete + matrix |

---

## Implementation Order

| Phase | Features | Foundation |
|-------|----------|------------|
| 1 | CrewMember roster + autocomplete | Enables conflict detection + matrix |
| 2 | Crew templates (plan-type defaults + custom) | Depends on roster for autocomplete |
| 3 | Crew conflict detection + dashboard | Uses roster for identity matching |
| 4 | Enhanced Crew tab (table + matrix) | Uses roster, conflicts, templates |
| 5 | Resource assignment (both entry points) | Independent of crew work |
| 6 | Resource timeline (daily/weekly) | Depends on assignment data |
| 7 | Conflict dashboard unification | Merges crew + resource conflicts |
