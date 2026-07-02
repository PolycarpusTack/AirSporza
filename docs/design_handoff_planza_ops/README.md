# Handoff: Planza "Ops" Redesign

## Overview
A redesign of Planza (SporzaPlanner — VRT sports planning tool) in a dense, mission-control "Ops" visual language. It covers five screens in one app shell:

1. **SCHEDULE** — week schedule as a dense table where every event row shows channel, editorial status, rights clearance and crew health in one glance.
2. **PLANNER** — per-channel day rundown: horizontal timeline lanes (Eén / Canvas / VRT MAX) with positioned event blocks.
3. **RIGHTS** — contract health stat tiles + a rights matrix (competitions × platforms) replacing the contract list.
4. **REGISTRY** — a sports CMS: sports, competitions, teams, players, performers and staff as one browsable/searchable repository with a record inspector and a create flow.
5. **SYNC** — import pipeline health (nightly jobs) + a merge-review queue for deduplication candidates.

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs inside the existing Planza codebase** (React 18 + TypeScript + Vite + TailwindCSS, tokens as CSS variables in `tailwind.config.ts`), using its established patterns:

- Pages live in `src/pages/` (`PlannerView.tsx`, `SportsWorkspace.tsx`, `ContractsView.tsx`, …), components in `src/components/<domain>/`, shared UI in `src/components/ui/`.
- Data comes from `src/services/*` APIs with socket-driven updates via `AppProvider`; types in `src/data/types.ts`.
- The REGISTRY screen implements the UI side of `docs/teams-players-repository-plan.md` (operational `Team`, `Player`, `TeamCompetition`, `PlayerTeam`, provenance / `shouldApplyImportedField`).
- The SYNC screen is a UI for the existing import infrastructure (`backend/src/import/*`: jobs, dead-letters, `DeduplicationService` merge candidates).

## Fidelity
**High-fidelity.** Colors, typography, spacing and interactions are final intent. Recreate pixel-perfectly, but map colors onto Planza's existing CSS-variable token system (extend `--surface/--text/--border` tokens rather than hard-coding hex in components).

## Files
- `Planza App.dc.html` — **primary reference**: the full app, all five screens, dark + light themes. Open in a browser; all navigation/interactions work.
- `screenshots/` — one PNG per screen in both themes: `01` SCHEDULE · `02` PLANNER · `03` RIGHTS · `04` REGISTRY · `05` SYNC, as `NN-dark.png` / `NN-light.png`. Captured at a desktop viewport; the live HTML file remains the source of truth for exact values.
- `Planza Redesign.dc.html` — the exploration canvas (3 visual directions + registry variants + unified app). Useful for context on rejected alternatives (1a control-room, 1b editorial light) and the profile-page registry variant (2b).

Both files render a `<x-dc>` template with inline styles; every style value you need can be read directly from the markup.

## Design Tokens

### Theme (CSS variables, dark is default)
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#090B0D` | `#EDF1F2` | app background |
| `--pn` | `#0F1316` | `#FFFFFF` | panel / chrome / inspector background |
| `--p2` | `#141A1E` | `#F0F4F5` | inset surfaces, hover rows, inputs |
| `--ln` | `#212A31` | `#D6DEE1` | all borders / dividers |
| `--tx` | `#D9E4EB` | `#111A1F` | primary text |
| `--t2` | `#7E8E9A` | `#54646D` | secondary text |
| `--t3` | `#4E5B66` | `#8697A0` | tertiary text / column headers |
| `--ac` | `#2FD6C3` | `#0D9488` | accent (active tab, primary button, matrix ●) |
| `--af` | `#04241F` | `#FFFFFF` | text on accent |

### Fixed semantic colors (same in both themes)
- Status: draft `#98A2B3` · ready `#4C8DF5` · approved `#2BB673`
- Alerts: live/conflict/danger `#E5484D` · warning/expiring `#E5A13C` · negotiation `#E07B39`
- Channels: Eén `#E4572E` · Canvas `#4C8DF5` · VRT MAX `#2BB673`
- Registry kinds: sport `#4C8DF5` · competition `#E5A13C` · team `#2FD6C3` · player `#2BB673` · performer `#B48EF5` · staff `#E4572E`
- Chip backgrounds = kind/status color at ~13% alpha (hex + `22`/`26`)

### Typography
- **IBM Plex Sans** (400/500/600) — body, names, titles.
- **IBM Plex Mono** (400–700) — all "system" text: brand, tabs, times, column headers, section labels, counters, badges, buttons.
- Scale: section labels `9–9.5px / 600 / letter-spacing 1.5–2px / uppercase`; column headers `9px mono 600`; table primary text `12.5px / 600`; secondary `10–11px`; inspector titles `15px / 600`; stat numbers `24px mono 700`; base body `13px`.
- Radius: 4px (buttons, inputs, chips, blocks) / 6px (cards, panels) / 8px (modals, merge cards). Borders 1px `var(--ln)`.

### Layout constants
- Top chrome: 48px, `--pn` bg, 1px bottom border. Brand `PLANZA/OPS` (mono 700 13px, ls 2px, `/OPS` in accent).
- Tabs: mono 600 10.5px ls 1px, 6×12px padding, radius 4; active = accent bg + `--af` text; inactive = transparent + `--t2`. SYNC tab shows pending count: `SYNC [3]`.
- Three-pane screens: left rail 190px · fluid center · right inspector 320px, separated by 1px borders; inspector on `--pn`.
- Selected row: `--p2` background + `inset 2px 0 0 var(--ac)` box-shadow; hover: `--p2`.

## Screens

### 1. SCHEDULE
- **Left rail (190px)**: "FILTER" label + sport facet buttons (icon, name, count right-aligned, mono 11px). Active: `--p2` bg + accent border.
- **Center table**: sticky header row `TIME | EVENT | CHANNEL | STATUS | RIGHTS | CREW` (grid `64px 1fr 110px 96px 104px 76px`, gap 10px, padding 9–10px 16px). Day-group header rows: `--p2` bg, mono 9.5px ls 2px (e.g. `MON 2 MARCH`). Event rows: time (mono 600 11px); event = sport emoji + title (12.5px 600) with competition below (10px `--t3`); channel = 7px square swatch + name; STATUS/RIGHTS/CREW = colored mono 10.5px words (`APPROVED`, `EXPIRING`, `CONFLICT`, …).
- **Inspector (320px)**: INSPECTOR label; LIVE/DELAYED bordered badge + status word; title 15px/600; mono meta lines (competition; `WED 4 MAR · 21:00 · 150 min · Canvas`); red conflict callout (1px `#E5484D` border, 10% red bg, radius 6) when crew conflict; then bordered-top sections RIGHTS (dot + status + "until …"), CREW (5 roles: dot color ok `#2BB673` / open `#E5A13C` / conflict `#E5484D`, name 11.5px 600, role mono `--t3`, status word right), TECH PLANS (chips + dashed `+ PLAN` ghost button).
- Rights/crew values derive from the event's competition contract and crew assignments — see State.

### 2. PLANNER (day rundown)
- Day pill row: 7 buttons `MON 2 … SUN 8` (mono 11px, event count at 60% opacity); active = accent bg. Right: `WED 4 MARCH 2026` label.
- Time axis 05:00–24:00; tick labels every 2h from 06:00 (mono 9.5px `--t3`), offset left 112px (lane label column width).
- One lane per channel: label (8px swatch + mono 600 11px) + 64px track (`--pn` bg, 1px border, radius 6). Event blocks positioned absolutely: `left = (startMin − 300) / 1140`, `width = max(duration, 80min) / 1140`; block = channel color at 15% alpha bg + 3px solid channel-color left border, radius 4, padding 6×10; line 1 = `21:00 · 150 min` (mono 9.5px), line 2 = title (12px 600, ellipsis). Selected block: 1px accent outline; conflicted: 1px `#E5484D` outline.
- Legend row below (mono 10px `--t3`): status dots + conflict outline sample + hint text.
- Clicking a block selects the event (shared selection with SCHEDULE inspector).

### 3. RIGHTS
- 4 stat tiles (grid, gap 10): number mono 700 24px in semantic color, label mono 9.5px ls 1.5px (`VALID CONTRACTS`, `EXPIRING SOON`, `IN NEGOTIATION`, `MISSING RIGHTS`).
- Matrix: header `COMPETITION | LINEAR | MAX | RADIO | ON-DEM | STATUS | VALIDITY` (grid `260px repeat(4, 90px) 130px 1fr`). Rows: competition (emoji + name 12.5px 600 + note 10px `--t3`); platform cells `●` in accent (has right) or `·` in `--t3`; status colored mono word; validity = `Until 30 Jun 2027` + 3px progress bar (red <15%, amber <50%, green otherwise; width = remaining term %).

### 4. REGISTRY (sports CMS)
- Toolbar under chrome: search input (280px, `--p2` bg, mono 11px, filters name/sport/detail live), counters (`6 SPORTS · 6 COMPETITIONS · 6 TEAMS · 12 PEOPLE`), accent `+ NEW` button.
- **Left rail**: "BROWSE" facets — All records / Sports / Competitions / Teams / Players / Performers / Staff with counts.
- **Center table**: `NAME | TYPE | SPORT | LINKED | SOURCE | STATUS` (grid `1fr 110px 110px 150px 84px 78px`). TYPE = kind chip (mono 600 8.5px uppercase, kind color on 13%-alpha bg). LINKED = human summary (`2 competitions`, `5 linked records`, or the person's team name). SOURCE = mono `--t3`: `MANUAL / TSDB / API-FB / FB-DATA`. STATUS = `ACTIVE` green / `INJURED` amber.
- **Inspector**: RECORD label; 44px icon tile (1px border, `--p2`); name + kind chip; provenance line mono 9.5px `--t3` (`SYNCED FROM THE SPORTS DB · LAST SYNC 2H AGO` or `MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE`); attribute rows (76px mono key + value); **LINKED** — clickable related-record rows (icon, name, kind label) that navigate the inspector (sport→competitions, competition→teams, team→roster+staff+competitions, person→team); **REMARKS · MANUAL** — bordered note box, only when a manual remark exists; dashed `+ ADD REMARK` ghost button.
- **Create modal**: centered 430px card over `rgba(0,0,0,.55)` backdrop. Kind chips (radio behavior), name input, note `CREATED RECORDS ARE SOURCE: MANUAL · PROTECTED FROM SYNC OVERWRITE`, CANCEL + accent CREATE. Create appends the record, clears filters, selects it in the inspector. Empty name = no-op.

### 5. SYNC
- `NIGHTLY SYNC · 02:00 CET` label; 3 job cards (status dot green/red, source name mono 600 11px, meta line `02:00 · OK · 214 RECORDS` / `02:30 · 3 DEAD-LETTERS`).
- `MERGE REVIEW · DEDUPLICATION CANDIDATES`: one card per candidate (max-width 960px). Header: kind chip, incoming name, `→ MATCHES →` (mono `--t3`), existing name, confidence `92% MATCH` (green ≥90, amber below), `VIA TSDB`. Diff table: `FIELD | INCOMING | CURRENT` (grid `110px 1fr 1fr`), header row on `--p2`; incoming values that differ from current are amber. Footer: `KEEP SEPARATE` (ghost) + `APPROVE MERGE` (accent); after a decision the buttons are replaced by a right-aligned mono status: `✓ MERGED INTO REGISTRY` (green) or `KEPT AS SEPARATE RECORDS` (`--t2`). Tab badge = pending count.

## Interactions & Behavior
- Tab switching (5 tabs); theme toggle button in chrome (`☀ LIGHT` / `☾ DARK`) swaps the CSS-variable palette; per-user persistence recommended.
- Row/block/card click = select → inspector updates. Selection is shared between SCHEDULE and PLANNER.
- Hover: rows/blocks get `--p2` bg; bordered cards get accent border.
- Search filters as-you-type; facet + search compose.
- Registry linked-record rows navigate the inspector (entity hopping).
- Merge decisions are immediate, per-candidate, and update the SYNC tab badge.
- LIVE badge dot in chrome pulses (opacity 1→0.3, 1.4s ease infinite).
- No routing was designed beyond tabs; deep-linking tab + selection into the URL is recommended (existing app already syncs planner state to URL).

## State Management
Prototype state (maps to React state / existing providers):
- `theme: 'dark' | 'light'`
- `tab: 'schedule' | 'planner' | 'rights' | 'registry' | 'sync'`
- Schedule/planner: `selectedEventId`, `sportFilter`, `selectedDay`
- Registry: `regSelectedId`, `regFacet ('all' | kind)`, `regQuery`, create-modal state (`open`, `newType`, `newName`)
- Sync: `decided: Record<candidateId, 'merged' | 'kept'>`
- Derived (compute, don't store): rights status per event (from its competition's contract), crew health per event (from conflict detection — `utils/crewConflicts.ts` already exists), linked records per registry entity, pending-merge count.
- Data sources: events/competitions/contracts from existing `services/*`; registry from the planned `teamsApi`/`playersApi`; merge candidates from the import layer's `MergeCandidate` flow.

## Assets
- No image assets. Sport/entity icons are emoji placeholders (⚽ 🚴 🏃 🏎️ 🎾 🏀 🏆 🛡️ 👤 ⭐) — replace with the codebase's icon set (lucide) or real federation/team logos from TheSportsDB once licensing is confirmed (see repository plan §1.3).
- Fonts: IBM Plex Sans + IBM Plex Mono (Google Fonts; IBM Plex is already Planza's font family).

## Out of Scope / Open Questions
- Drag-to-reschedule in PLANNER lanes (existing planner has dnd-kit; the rundown lanes should eventually support it — not specified in this design).
- Contract editing forms, tech-plan editor, crew assignment editor — existing screens/forms remain; this redesign covers browsing/monitoring surfaces.
- Registry "ADD REMARK" and "+ PLAN" buttons are visual affordances; wire to existing notes/tech-plan endpoints.
