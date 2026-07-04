# CONTRACT SNAPSHOT: EventInspector

Version: 1 · Date: 2026-07-03 · Task: A-4-T1 (input contract for B-1-T2 Rundown, A-5-T1 E2E)

**Changelog**
- **v1 amendment (2026-07-04, B-2-T1 PREP):** the meta-line date FORMATTING now
  delegates to the shared `formatOpsDayLabel` (`src/components/ops/dayLabels.ts`)
  — the pinned "component-local, do NOT extract (occurrence two)" decision
  reached its own Rule-of-Three trigger when the Rundown day pills became the
  family's THIRD consumer. Rendered output (`WED 4 MAR`, `—` fallback) is
  UNCHANGED and still pinned by this component's tests; props and all other
  pins untouched. The body's meta-line pin below is marked superseded.

## Public interface

```ts
// src/components/ops/EventInspector.tsx — SHARED 320px inspector pane.
// Props-driven, NO fetching, NO useApp inside (anti-smart-ui): the mounting
// screen resolves selection and threads data. B-1 Rundown mounts it unchanged.
export interface EventInspectorProps {
  event: Event | null                    // null → quiet empty state ("NO EVENT SELECTED")
  contracts: Contract[]
  techPlans: TechPlan[]
  conflicts: ConflictMap                 // the screen's SINGLE detectCrewConflicts pass
  conflictGroups: PersonConflictGroup[]  // SINGLE memoized groupConflictsByPerson pass (screen-side)
  crewFields: FieldConfig[]              // role-row source AND callout role-label map
  competitionName?: string               // screen resolves competitionId → name; omitted → no line
  now?: Date                             // testability seam (default new Date()); tests pass FIXTURE_NOW
}
export function EventInspector(props: EventInspectorProps): JSX.Element
```

The component renders its own panel chrome (320px, `--surface-shell` bg, 1px
`--border-shell` left border, 14px padding, own scroll) — mounting screens add
NO wrapper; it slots directly into the screen's flex row as the third child.
Root testid: `ops-inspector`; empty state: `ops-inspector-empty`.

## Screen-side obligations (normative — ScheduleScreen is the reference mount)

1. Resolve `?event=` (useOpsSelection, opaque id) → `Event | null`; unknown ids
   render silently as no selection (ops-selection v1 rule 5).
2. Compute `detectCrewConflicts(techPlans, events)` ONCE per screen (memoized)
   and `groupConflictsByPerson(techPlans, events)` ONCE (memoized) — the
   component never re-derives either.
3. Thread the screen's `now` seam through (deterministic tests).
4. Requires a react-router context (`+ PLAN` uses `useNavigate`).

## Pinned decisions (task card A-4-T1 — do not re-derive)

- **Badge rule:** LIVE/DELAYED bordered badge derives from the `isLive` /
  `isDelayedLive` booleans ONLY. Both true → **LIVE wins**. Neither → **no
  badge**, even when `event.status === 'live'` (the badge is never
  status-derived; pinned with a dedicated test). LIVE renders `--alert-danger`,
  DELAYED `--alert-warning`.
- **Editorial word:** only draft/ready/approved render, colored via the
  `--status-*` family (Editorial-only, ops-tokens guard); any other or absent
  status renders `—` (ScheduleScreen precedent).
- **Meta line format:** `WED 4 MAR · 21:00 · 150 min · <channel>` — date
  normalization via `getDateKey` (API ISO-datetime strings and local-midnight
  Date objects), formatting via the shared `formatOpsDayLabel` *(the original
  "component-local, deliberately NOT extracted — occurrence two" wording of
  this pin is SUPERSEDED by the B-2-T1 PREP amendment in the changelog above)*;
  duration via `effectiveDurationMin` (TD-24 sanctioned accessor); channel from
  the `event.channel` relation, `—` when null.
- **Conflict callout:** rendered when `filterConflictsToEvent(event,
  conflictGroups)` is non-empty; 1px `--alert-danger` border, 10%-alpha bg via
  `color-mix`, radius 6. `PersonConflictGroup` `role` fields arrive as RAW crew
  fieldIds — **the component maps them to labels via `crewFields`** (pinned at
  ops-selectors v2); unknown fieldIds fall back to the raw id. One line per
  conflict row: person, own role label, other role label, other event name + time.
- **RIGHTS:** dot + status word (ops-tokens v3 `--rights-*` aliases) from
  `deriveRightsInfo`; `validUntil: null` → NO "until" line; a **lapsed date
  still renders** (informative `until <past date>`, pinned). Format:
  `until 30 Jun 2027` (lowercase "until", design casing).
- **CREW:** rows from `deriveCrewRoles` — i.e. from `crewFields` (visible,
  non-checkbox, FieldConfig.order), **never a hard-coded role list** (pinned
  with a custom-crewFields test). Dot + name (`—` when null) + role label +
  right-aligned state word, `--crew-*` aliases.
- **TECH PLANS:** one chip per `techPlans` row with `plan.eventId === event.id`,
  labelled `planType`; dashed `+ PLAN` ghost button.
- **`/sports` limitation (accepted):** `+ PLAN` is a plain absolute
  `navigate('/sports')` — it LEAVES /ops (OpsShell v1's absolute-path rule
  governs inside /ops only). SportsWorkspace cannot preselect an event (its
  selection is component-local) and `RequireRole` may bounce non-planner roles;
  both accepted and documented in a code comment. Revisit at cutover (EPIC E).
- **"Updates without full-screen re-render" (AC):** pinned as NO
  remount/refetch/state-loss — `contractsApi.list` called exactly once across
  selection changes, `sportFilter` preserved (ScheduleScreen.test.tsx); never
  asserted via render counts.

## Enforced by

`src/components/ops/EventInspector.test.tsx` (34 tests — sections, badge rule,
meta formats incl. Date-object/ISO-datetime startDateBE, callout label mapping
+ empty-conflict-groups negative, rights until-line rules, crewFields-driven
rows, /sports navigation, panel chrome) and
`src/pages/ops/ScheduleScreen.test.tsx` §"inspector integration"
(mount, deep-link hydration, unknown-id fallback, no-refetch/no-state-loss pin).
Badge/editorial/channel permutation events are TEST-LOCAL deep-frozen
`makeEvent` builds — the fixture week itself is unchanged (only its `deepFreeze`
helper became an export).

## Depends on

**ops-selectors v2** (deriveRightsInfo / deriveCrewRoles / filterConflictsToEvent) ·
**ops-tokens v3** (`--rights-*` / `--crew-*` aliases; `--status-*` Editorial-only;
`--alert-danger`) · **ops-selection v1** (screen-side `?event=` resolution) ·
`src/utils/crewConflicts.ts` (ConflictMap, PersonConflictGroup) ·
`src/utils/dateTime.ts` (effectiveDurationMin, getDateKey) · react-router-dom v7
(useNavigate). TD-23 honored (no ui/Btn / ui/Button); TD-24 honored (no
@deprecated field reads); no hex literals.

## Domain terms used

Inspector, Screen, Rights Status, Crew Health, Editorial Status, Rundown
(backlog §4 glossary).
