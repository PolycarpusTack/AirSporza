# "Add to Planning" Channel Assignment — Design

## Goal
Allow Sports users to assign broadcast channels to events directly from the Sports workspace, bridging the gap between technical planning and broadcast scheduling.

## Where it lives
EventDetailCard — below existing event metadata:
- Shows current channel assignments as compact badges (or "Not scheduled" if none)
- "Add to Planning" button (or "Edit Channels" if already assigned) opens a popover

## Popover contents
- Linear Channel — dropdown from orgConfig.channels
- Linear Start Time — time input
- On-demand Platform — dropdown from orgConfig.onDemandChannels
- Radio Channel — dropdown from orgConfig.radioChannels
- Save button — patches event via eventsApi.update()

## Data flow
```
SportsWorkspace passes: orgConfig, onUpdateChannels, canEdit
  -> EventDetailCard shows channel status + popover
    -> Save patches event fields: linearChannel, linearStartTime, onDemandChannel, radioChannel
    -> Optimistic update via existing handleSaveEvent in AppProvider
```

## Props
- EventDetailCard: orgConfig, onUpdateChannels callback, canEdit
- SportsWorkspace: gets orgConfig from AppProvider context, passes handleSaveEvent

## Access control
- canEdit=true (sports/admin): see badges + edit popover
- canEdit=false (planner): see badges only, no edit button
