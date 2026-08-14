# Handoff: Planza/FM — Football-Manager-style scheduling shell for SporzaPlanner

## Overview
A concept redesign of SporzaPlanner (Planza) that unifies the legacy app and the Ops shell into one Football-Manager-style interface for broadcast sports scheduling: an action-item inbox with a global CONTINUE loop, a consequence-aware schedule board, a season calendar, drill-down sport/competition/team/athlete pages, a squad-style crew view, and a per-event Match Day ("tactics") screen.

Companion documents in this bundle:
- `IMPLEMENTATION_PLAN.md` — the structured, phased plan for building this in the existing repo.
- `html/Design Notes.dc.html` (+ `screenshots/design-notes.png`) — UX critique of the current app and an exact current-vs-concept diff per area.

## About the Design Files
The files in `html/` are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code. The task is to **recreate these designs in the existing SporzaPlanner codebase** (React 18 + TypeScript + Vite + TailwindCSS, Node/Express/Prisma backend) using its established patterns: the ops token system (`src/styles/tokens.css`, ops-tokens v3), the lazy-chunk shell pattern (ADR-012), URL-carried selection (ADR-014), and the anti-smart-ui selector convention (`src/components/ops/selectors.ts`). Do not ship the HTML.

Open `html/Planza FM.dc.html` in a browser to use the interactive prototype (needs `support.js` next to it, included). `html/Planza Baseline.dc.html` is a faithful recreation of the CURRENT UI for before/after comparison (switcher pill bottom-right).

## Fidelity
**High-fidelity.** Colors, typography, spacing and interaction patterns are final intent and reuse the repo's existing AA-audited ops tokens. Recreate pixel-perfectly using the codebase's token variables (listed below) — never hard-coded hex (ADR-013).

## Screens / Views

Screenshots: `screenshots/fm-01…08` (concept), `screenshots/baseline-01…04` (current UI recreation).

### Shell (all screens)
- **Sidebar** 216px, `--surface-shell` (#0F1316), right border 1px `--border-shell` (#212A31).
  - Brand block: 34px teal (#2FD6C3) rounded-6px square with "P", `PLANZA/FM` in IBM Plex Mono 700 12px ls 1.5px; subtitle 10.5px `--text-shell-2`.
  - Section labels: mono 9px/600, letter-spacing 2px, `--text-shell-3` (#738594): OVERVIEW, PLANNING, SPORT, RESOURCES.
  - Nav items: 12.5px/500 Plex Sans, padding 7px 8px, radius 4px; active = bg #141A1E, text `--accent-shell`, inset 2px left accent bar; hover = bg #141A1E. Right-aligned badges: mono 9.5px/700, radius 3px (red #E5484D solid for inbox count; tinted `#E5A13C22`/`#E5484D22` for unplaced/conflicts; "LIVE" badge on Match day).
  - Footer: "SEASON 2025–26" + 4px progress bar (62%, teal on #141A1E) + "W10".
- **Top bar** 52px, `--surface-shell`, bottom border: date block (mono 11px/600 "THU 5 MAR 2026" + 10px context line), LIVE pill (pulsing 6px red dot, mono 10px, 1px border), **CONTINUE button**: teal `--accent-shell` bg, `--accent-shell-fg` (#04241F) text, mono 11.5px/700 ls 1.5px, padding 9px 18px, radius 5px, glow shadow `0 4px 20px rgba(47,214,195,.25)`, embedded count chip (dark bg, teal text). Left of CONTINUE: **+ NEW** ghost button (mono 11px, 1px `--border-shell` border, teal on hover) opening the create modal.

### 1. Home (fm-01-home.png)
- Purpose: triage. 4 KPI tiles (grid 4×1fr, gap 12) — label mono 9.5px ls 1.5px `--text-shell-3`; value Space Grotesk 26px/700 (red/amber/green semantic); sub 10.5px. Tiles are buttons deep-linking to the relevant screen.
- Inbox (380px fixed) + detail pane (flex). Inbox rows: 7px kind-colored dot, kind word mono 9px/700 (CONFLICT #E5484D, RIGHTS/UNPLACED #E5A13C, CREW #4C8DF5, FEED #98A2B3), title 12.5px/600, sub 10.5px; selected = bg #141A1E + inset 2px teal bar; resolved = 45% opacity + ✓ prefix.
- Detail pane: kind badge (1px border, kind color), Space Grotesk 22px title, 13px body, actions: primary CTA (teal, deep-links with entity preselected) + "MARK RESOLVED" ghost.

### 2. Schedule board (fm-02-schedule-board.png)
- Layout: fluid table pane + fixed **320px inspector** (identical anatomy to existing `EventInspector`).
- **Unplaced tray** (top, bg #141A1E): "UNPLACED (n)" mono amber label; per-event dashed-border chips (amber; teal when selected) with slot suggestion hint; right-aligned "⚡ AUTO-SUGGEST SLOTS" (teal outline).
- **Cascade banner** (conditional): bg `rgba(229,161,60,.08)`, amber border-bottom, "⚠ CASCADE" + consequence sentence + UNDO.
- Table: sticky header row, grid `56px 1fr 118px 90px 90px 70px`, columns TIME / EVENT / CHANNEL / STATUS / RIGHTS / CREW; day header strips (bg #141A1E, mono 9.5px ls 2px) with event-count right. Rows: 12.5px/600 title + 10px competition; channel = 7px square swatch + name; STATUS/RIGHTS/CREW as mono 10px/600 colored words (existing token aliases). Conflict rows: ⚠ marker, bg `rgba(229,72,77,.05)`, inset 2px red bar. Selected: bg #141A1E, inset 2px teal bar.
- Inspector adds to the existing anatomy: NOT PLACED card (dashed amber, suggestion + "PLACE IN SUGGESTED SLOT"), CHANNEL chip row (5 channels, one-tap reassign; active = teal border/text), "ASSIGN FROM AVAILABLE CREW" (teal outline), "OPEN MATCH DAY ▸".
- **History** section under the table: numbered mono entries + "↶ UNDO LAST".

### 3. Season calendar (fm-03-season-calendar.png)
- "March 2026" Space Grotesk 22px + mono context. 7-col grid, gap 6; day cells min-height 86px, bg `--surface-shell`, 1px border (current week cells: `#2FD6C355`); out-of-month cells 28% opacity; today's number teal. Event pips: 6px channel-colored square + 9.5px label, ellipsized. Channel legend below. Cell click → schedule board.

### 4. Competitions (fm-04-competitions.png)
- Left rail 230px: sport switcher (3 icon buttons; active teal border/text) + competition list (active = bg #141A1E, teal text, inset bar; sub-line mono 9px).
- Header: competition name Space Grotesk 24px + "RIGHTS <STATUS>" bordered badge in the rights-status color; mono meta line.
- Football leagues: STANDINGS card (grid `28px 1fr 34px 34px 34px 34px 44px`; top-4 positions teal; rows are buttons → team profile) + 380px BROADCAST FIXTURES card. Cycling/tennis/cup: fixtures card full-width, relabeled RACE CALENDAR / FIXTURES. Fixture rows: date mono 9.5px (66px), title, channel swatch+name, status badge word (READY blue, APPROVED green, DRAFT gray, UNPLACED amber, RIGHTS? red).

### 5. Team profile (fm-05-team-profile.png)
- Header: 64px initials crest (team-color 1px border, `<color>22` bg), name Space Grotesk 26px, mono meta, RIGHTS badge right.
- 3 columns `300px 1fr 1fr`: PROFILE facts (k/v: mono 10px key, 11.5px/600 value) + KEY PEOPLE (teal names, click → athlete); UPCOMING BROADCASTS + PAST BROADCASTS (viewer numbers mono teal); RIGHTS & CONTRACT (per-deal status + until line) + AVG REACH bar chart (64px tall, `#2FD6C333` bars with 2px teal top border).

### 6. Athlete profile (fm-06-athlete-profile.png)
- Header: 64px circular initials (teal border), name Space Grotesk 26px, mono meta, sport emoji right.
- 3 columns `300px 1fr 1fr`: BIO facts + prose paragraph; CAREER (years mono 78px / team / note) + HONOURS (amber ★ rows); NEXT ON AIR + RELATED ACROSS SPORTS.

### 7. Crew (fm-07-crew.png)
- Table grid `1fr 120px 200px 90px 110px`: NAME/ROLE, SPORTS (emoji), **M T W T F S S availability strip** (7× 16px squares: assigned = `#2BB67333` bg + green border + ●; available = #141A1E + #212A31 border; conflict = `#E5484D33` + red border + "!"; unavailable = dashed gray), ASSIGNED count, STATUS word (OK green / CONFLICT red / AVAILABLE gray / LIMITED amber). Conflict rows tinted `rgba(229,72,77,.05)`. Legend below.

### 8b. Create modal (fm-09-create-modal.png)
- Global creation for TRANSMISSION / TEAM / ATHLETE / COMPETITION (kind tabs, mono 9.5px; active = solid teal). Entry points: top-bar + NEW (defaults to transmission), "+ NEW TEAM" / "+ NEW ATHLETE" dashed chips on the profile screens, "+ NEW" beside the COMPETITIONS rail label.
- 540px panel, centered, scrim `rgba(9,11,13,.74)`, radius 8px; field labels mono 9px ls 1.5px `--text-shell-3`; text inputs bg #141A1E, 1px border (teal on focus), 12.5px; choice fields as chip rows (sport, day-of-week, channel incl. "Unplaced", rights status). CANCEL ghost + CREATE teal.
- On create: transmission → schedule board with the new event selected (DRAFT; unplaced ones land in the tray with a suggestion); team/athlete → its new profile page (rights MISSING until a contract is linked); competition → the competitions screen. Maps to the existing `DynamicEventForm` and `RegistryCreateModal` capabilities.

### 8. Match day (fm-08-match-day.png)
- Header: LIVE badge + title Space Grotesk 22px + mono meta.
- 3 columns `320px 1fr 280px`: **RUNDOWN** (segment rows: 3px left border color-coded — studio blue #4C8DF5, live red #E5484D, post gray; time mono 42px, label + source line, duration); **CREW FORMATION** tactics board (380px, green-tinted gradient `#0C1A16→#0A1512`, pitch lines `#1C3A32`: halfway line, center circle, two boxes; positions = 34px circles, absolutely placed — filled green `#2BB67333`, unfilled amber "OPEN ⚠", neutral gray, director blue — with name tags on `#090B0Dcc`); **RESOURCES** checklist (CONFIRMED green / HOLD amber) + DISTRIBUTION (channel swatch + role note).

## Interactions & Behavior
- **CONTINUE**: cursor over unresolved inbox items — jumps to the item's target screen with the entity preselected (schedule+event, competition, crew); toast announces the item; empty queue → "ALL CLEAR" toast.
- **Inbox**: select row → detail; CTA deep-links; MARK RESOLVED dims the row; contextual actions elsewhere auto-resolve their item (e.g. fixing Friday's crew conflict resolves inbox item 1; assigning the tennis commentator resolves item 4).
- **Schedule**: row click selects (inspector updates); channel chip click reassigns and pushes a history entry; specific moves trigger the cascade banner (e.g. CL match → Eén displaces the news window); PLACE / AUTO-SUGGEST place unplaced events on their suggested channel+slot; UNDO pops the last history entry and clears the cascade.
- **Cross-navigation**: standings row → team; key people → athlete; KPI tiles and inbox CTAs → target screens; "OPEN MATCH DAY" → match day. Team and athlete screens carry switcher chip rows listing all records (created ones included).
- **Creation**: + NEW opens the create modal (see 8b); created records are immediately navigable and flow into the schedule/tray, profile pages and competition rail.
- Toast: bottom-center, #141A1E bg, teal border/text, mono 10.5px, ~2.6s, slide-up 250ms ease-out. Hovers: nav rows bg #141A1E; buttons brightness(1.1) or teal border.

## State Management
- `screen` (8 values), `sport`, `compId`, `teamId`, `athId`, `selEventId`, `inboxSel` — all URL-carriable (extend the ops `?event/?day` pattern, ADR-014).
- `resolved: inboxId[]`, per-event overrides `{channel, crew, placed}`, `history: {label, prevState}[]` (undo = restore prev), `cascade: string|null`, `toast`.
- Data: events (with `placed`, `suggestion`), inbox items (kind, target route, resolve linkage), competitions/standings/fixtures, team & athlete records, crew with per-day availability. See `IMPLEMENTATION_PLAN.md` for how each maps to existing models.

## Design Tokens
All from the repo's `src/styles/tokens.css` (ops set) — use the vars, not hex:
- Surfaces: `--bg-shell` #090B0D · `--surface-shell` #0F1316 · `--surface-shell-2` #141A1E · `--border-shell` #212A31 (row hairlines may use #1A2126, a half-step between bg and border — consider adding as `--border-shell-soft`).
- Text: `--text-shell` #D9E4EB · `--text-shell-2` #7E8E9A · `--text-shell-3` #738594 (one new mid-tone #9FB0BB used for nav idle text).
- Accent: `--accent-shell` #2FD6C3 · `--accent-shell-fg` #04241F.
- Status words: `--status-draft` #98A2B3 · `--status-ready` #4C8DF5 · `--status-approved` #2BB673; rights/crew via the existing aliases (`--rights-*`, `--crew-*`); alerts `--alert-danger` #E5484D · `--alert-warning` #E5A13C · `--alert-negotiation` #E07B39.
- Channels: `--channel-een` #E4572E · `--channel-canvas` #4C8DF5 · `--channel-vrtmax` #2BB673; NEW: Radio 1 #B48EF5, Sporza app #2FD6C3 (add as `--channel-radio1`, `--channel-sporza-app`).
- Type: IBM Plex Sans (body), IBM Plex Mono (labels/numbers/status words), Space Grotesk 500–700 (display: entity names, KPI numbers, month titles). Scale: 9/9.5/10/10.5/11/11.5/12.5/13.5px labels+body; 22/24/26px display.
- Radius: 3–6px (chips 3–4, cards/panels 6); spacing on a 2px grid (padding 14–20px in cards, 9–11px rows); tinted fills = base color at hex alpha `22`/`33`.

## Assets
None. No images; sport glyphs are emoji (matching the current app's `sport.icon` data); crest/avatar placeholders are initials on tinted squares/circles. All charts/pitch graphics are plain CSS.

## Files
- `html/Planza FM.dc.html` — the interactive concept (all 8 screens + interactions). Primary reference.
- `html/Planza Baseline.dc.html` — recreation of the current UI (legacy Planner, legacy Sports, Ops Schedule, Ops Rundown).
- `html/Design Notes.dc.html` — critique + per-area current-vs-concept diff.
- `html/support.js` — runtime needed to open the `.dc.html` files locally; not part of the design.
- `screenshots/` — one PNG per screen, named `fm-NN-*` and `baseline-NN-*`.

## Data caveat
All demo content (standings, players, crew names, viewer numbers) is fictional/illustrative. Wire to the seeded database records during implementation.
