# Phase 7: Unified Conflict Dashboard — Design

## Goal
Add a top-level "Conflicts" tab to SportsWorkspace that unifies crew and resource conflicts in a single tabbed view.

## Architecture
- New 5th tab in SportsWorkspace: "Conflicts" with badge count
- Two sub-tabs: Crew Conflicts (reuses existing ConflictDashboard) and Resource Conflicts (new)
- Resource conflict detection utility mirrors crew conflict approach (time-window overlap)

## Components

| Component | Action |
|-----------|--------|
| `src/utils/resourceConflicts.ts` | New: `detectResourceConflicts()` — finds over-capacity concurrent assignments |
| `src/components/sports/ResourceConflictList.tsx` | New: renders resource conflicts grouped by resource |
| `src/pages/SportsWorkspace.tsx` | Add Conflicts tab with crew/resource sub-tabs, badge count |

## Resource Conflict Detection
- Over-capacity: resource assigned to more concurrent events than capacity allows
- Uses same time-window overlap logic as crew conflicts (parseEventWindow, windowsOverlap)
- Returns `ResourceConflictGroup[]` grouped by resource name

## Data Flow
```
SportsWorkspace
  ├─ crewConflicts (existing)
  ├─ conflictGroups (existing)
  ├─ resourceConflicts (new) = detectResourceConflicts(resources, allAssignments, events)
  └─ Conflicts tab
       ├─ Crew → <ConflictDashboard groups={conflictGroups} />
       └─ Resources → <ResourceConflictList conflicts={resourceConflicts} />
```

## Tab Badge
Combined count: crew conflict persons + over-capacity resources.
