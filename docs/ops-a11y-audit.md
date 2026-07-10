# Ops A11y + Light-Theme Audit — Keyboard, Contrast (both themes), Focus (E-2-T1)

**v1 · 2026-07-10 · Hat: VERIFICATION (analysis only — no production code changed).**
Scope: the 5 built ops screens (`ScheduleScreen`, `RundownScreen`, `RightsScreen`,
`RegistryScreen`, `SyncScreen`) + shared `src/components/ops/*` they render
(`EventInspector`, `RecordInspector`, `RegistryCreateModal`, `OpsShell`). Format mirrors
`docs/ops-contrast-audit.md` (A-1-T3/T4); that audit and `docs/ops-token-map.md` are the
source of the token VALUES used here — this doc does not re-derive them, it re-points them
at pairs the original audit did not cover (see §2 method note) and adds the keyboard/focus
dimensions.

## Method

- **Keyboard**: every `onClick` in the 5 screens + shared components was enumerated
  (10 in the screens, 9 in shared components — full list below) and classified as native
  (`<button>`/`NavLink`, keyboard-operable by the UA) or div-based (needs `role="button"`
  + `tabIndex={0}` + `onKeyDown` handling Enter/Space to be operable).
- **Contrast**: WCAG 2.1 relative luminance, same formula as `ops-contrast-audit.md`
  (sRGB linearize, `L = 0.2126R+0.7152G+0.0722B`, ratio `(L₁+0.05)/(L₂+0.05)`, truncated to
  2 decimals, alpha tints composited over their true backdrop first). Thresholds: 4.5:1
  text, 3:1 large text/non-text. Values verified with a small Node script
  (`hexToRgb`/`composite`/`lum`/`ratio`, standard WCAG formula) against the CURRENT
  `src/styles/tokens.css` (labelled "ops-tokens v3" in that file's comment vs "v2" in the
  existing audit doc — a documentation-currency drift, not a value drift; the dark/light
  hex values match `ops-contrast-audit.md` v2 exactly, re-verified as a sanity check, e.g.
  dark/light `--alert-danger` on `--surface-shell` recomputed at 4.76 / 5.10, identical to
  the published table).
  - **Method gap found in the existing v2 audit**: it audited status/alert words and kind
    chips against `--surface-shell` / `--surface-shell-2` as the assumed backdrop. Reading
    the actual screen JSX shows **none of the 5 screen root containers set an explicit
    background**, and several row/cell wrappers are `background: 'transparent'` in their
    unselected state — the true rendered backdrop for that content is `--bg-shell`
    (painted once, by `OpsShell`'s wrapping `<div style={{background: 'var(--bg-shell)')}}>`,
    `src/components/ops/OpsShell.tsx:173-179`). This audit adds the `--bg-shell` pairs the
    v2 audit is missing (§3.1) — this is where the two new FAILs below come from.
- **Focus**: checked every interactive element for a visible `:focus`/`:focus-visible`
  indicator in both themes — either the UA default (undisturbed) or an ops-authored rule.
  `src/components/ops/ops.css` was read in full: it contains only the `ops-live-pulse`
  keyframe and `.ops-live-dot`; **no `:focus`/`:focus-visible` rule exists anywhere in the
  ops CSS or inline styles**, so every ops interactive element relies entirely on the
  browser default ring, EXCEPT one place that actively suppresses it (§4).
- Everything not explicitly listed as FAIL below is a verified PASS; nothing was guessed —
  where a value could not be found in code it is stated as "not found" (none arose).

## 1. Summary verdict per screen

| Screen | Keyboard | Contrast | Focus |
|---|---|---|---|
| ScheduleScreen | PASS (clickable row already has role/tabIndex/onKeyDown) | **FAIL — light theme only** (RIGHTS=NEGOTIATION / CREW=CONFLICT words on unselected rows, §3.1) | PASS (no outline override; UA default shows) |
| RundownScreen | PASS (clickable block already has role/tabIndex/onKeyDown) | PASS (all pairs checked pass, both themes) | **FAIL** — the block's own inline style sets `outline-style: none` whenever unselected/non-conflicted, permanently suppressing the focus ring regardless of keyboard focus (§4) |
| RightsScreen | PASS (no clickable elements beyond native controls; matrix rows are not interactive) | **FAIL — light theme only** (MATRIX STATUS = MISSING / NEGOTIATION words, every such row, §3.1) | PASS (no interactive row elements to check beyond N/A) |
| RegistryScreen | **FAIL** — 1 clickable `<div>` (table row) has no `role`/`tabIndex`/`onKeyDown` | PASS (all pairs checked pass, both themes, incl. the newly-checked bg-shell backdrop for chips) | N/A for the broken row (not focusable at all yet); all native controls PASS |
| SyncScreen | PASS (job cards / merge cards are NOT `onClick` — only their native buttons are interactive) | PASS (confidence-band words + changed-diff-cell word on `--surface-shell-2`, both themes) | PASS (native buttons only; no outline override) |

**Headline counts**: 1 clickable-`<div>` missing keyboard support (Registry table row);
2 clickable-`<div>` locations already correct (Schedule row, Rundown block) — **3 total
occurrences of the same shape, meeting Rule of Three** (extraction basis for E-2-T2).
2 contrast FAILs, both **light theme only**, both newly found (not in the existing v2
audit because it didn't check the `--bg-shell` backdrop these words actually render on).
1 focus FAIL (Rundown block, both themes — the bug is unconditional, not theme-specific).

## 2. Keyboard operability

### 2.1 Full `onClick` inventory (screens + shared components)

| Location | Element | Keyboard status |
|---|---|---|
| `src/pages/ops/RegistryScreen.tsx:298-309` (onClick `:301`) | `RegistryTableRow` — clickable `<div>`, selects a registry record | **FAIL — no `role`, no `tabIndex`, no `onKeyDown`.** Mouse-only. |
| `src/pages/ops/ScheduleScreen.tsx:285-302` (onClick `:291`) | `ScheduleRow` — clickable `<div>`, selects an event | PASS — `role="button"` (`:289`) + `tabIndex={0}` (`:290`) + `onKeyDown` handling Enter/Space (`:292-294`) |
| `src/pages/ops/RundownScreen.tsx:276-306` (onClick `:284`) | timeline block — clickable `<div>`, selects an event | PASS (keyboard) — `role="button"` (`:281`) + `tabIndex={0}` (`:282`) + `onKeyDown` handling Enter/Space (`:285-287`); **but see §4 — its focus ring is actively suppressed** |
| `src/pages/ops/ScheduleScreen.tsx:141-166` (onClick `:145`) | sport filter — native `<button type="button">` | PASS (native) |
| `src/pages/ops/RegistryScreen.tsx:166-185` (onClick `:169`) | `+ NEW` — native `<button type="button">` | PASS (native) |
| `src/pages/ops/RegistryScreen.tsx:203-229` (onClick `:207`) | facet rail item — native `<button type="button">` | PASS (native) |
| `src/pages/ops/RundownScreen.tsx:156-186` (onClick `:161`) | day pill — native `<button type="button">` | PASS (native) |
| `src/pages/ops/SyncScreen.tsx:233-253` / `:254-275` (onClick `:236`/`:257`) | KEEP SEPARATE / APPROVE MERGE — native `<button type="button">` | PASS (native) |
| `src/components/ops/EventInspector.tsx:406-424` (onClick `:408`) | `+ PLAN` — native `<button type="button">` | PASS (native) |
| `src/components/ops/OpsShell.tsx:106-113` (onClick `:109`) | theme toggle — native `<button type="button">` | PASS (native); `NavLink` tabs (`:129`) are native `<a>` | 
| `src/components/ops/RecordInspector.tsx:287-311` / `:346-386` (onClick `:292`/`:349`/`:368`) | remark ghost / cancel / save — native `<button type="button">` | PASS (native) |
| `src/components/ops/RecordInspector.tsx:427-456` (onClick `:432`) | linked-record hop — native `<button type="button">` | PASS (native) |
| `src/components/ops/RegistryCreateModal.tsx:162-171` / `:178-200` / `:293-311` / `:312-332` | close (X) / kind chips / cancel / create — native `<button>` | PASS (native) |
| `src/components/ops/RegistryCreateModal.tsx:126-140` (onClick `:128`) | modal backdrop — closes on outside click | Supplementary only (not a primary affordance): the modal already exposes a keyboard-reachable close (X, `:162`) and CANCEL (`:293`) button, so 2.1.1 Keyboard is met without this handler needing keyboard support itself. **Note (not a FAIL, a gap worth flagging)**: the dialog (`role="dialog" aria-modal="true"`, `:143-144`) has no `onKeyDown` for Escape and no focus trap/initial-focus management beyond the NAME input's `autoFocus` (`:215`) — good practice for a dialog, not scored here since it's outside the "clickable div" scope this task defines. |

### 2.2 Shared-pattern count → E-2-T2 basis

The clickable-row/block shape (`<div onClick=... role="button" tabIndex={0} onKeyDown=...>`
selecting a record) occurs **3 times**: `ScheduleRow`, the Rundown timeline block, and the
Registry table row. Two of the three already carry the identical 4-attribute boilerplate
(near character-for-character the same `onKeyDown` predicate); the third (Registry) has
none of it. This is the Rule-of-Three trigger: extract a shared primitive (e.g. a
`useClickableRow(onSelect)` prop-spread helper or a `<ClickableRow>` wrapper) that all
three consume, fixing Registry and de-duplicating Schedule/Rundown in the same move.

## 3. Contrast — WCAG AA, both themes

### 3.1 NEW pairs (not covered by `ops-contrast-audit.md` v2) — the `--bg-shell` backdrop

Reason these are new: `ops-contrast-audit.md` v2 audited status/alert words and kind chips
only against `--surface-shell` / `--surface-shell-2`. But `RightsScreen`'s matrix rows
never receive an elevated background (no selection state on that screen at all — every
row is transparent, full stop), and `ScheduleScreen`'s table rows are `transparent` unless
selected (the common case is unselected). Both cascade up to `OpsShell`'s `--bg-shell`.
`RegistryScreen`'s kind-chip TYPE column has the same unselected-row transparency, so its
chip tint composites over `--bg-shell` too when the row isn't selected.

**Status/alert words directly on `--bg-shell`** (RightsScreen `ops-rights-status`,
`src/pages/ops/RightsScreen.tsx:239-244`; ScheduleScreen RIGHTS/CREW cells on unselected
rows, `src/pages/ops/ScheduleScreen.tsx:326-327`):

| Foreground | Background | Theme | Ratio | Verdict | Where it renders |
|---|---|---|---|---|---|
| `--status-draft` (#98A2B3) | `--bg-shell` (#090B0D) | dark | 7.65 | PASS | editorial word (Schedule) |
| `--status-ready` (#4C8DF5) | `--bg-shell` (#090B0D) | dark | 6.04 | PASS | editorial word (Schedule) |
| `--status-approved` (#2BB673) | `--bg-shell` (#090B0D) | dark | 7.54 | PASS | editorial word / RIGHTS=VALID / CREW=OK |
| `--alert-danger` (#E5484D) | `--bg-shell` (#090B0D) | dark | 5.03 | PASS | RIGHTS=MISSING / CREW=CONFLICT |
| `--alert-warning` (#E5A13C) | `--bg-shell` (#090B0D) | dark | 8.91 | PASS | RIGHTS=EXPIRING / CREW=OPEN |
| `--alert-negotiation` (#E07B39) | `--bg-shell` (#090B0D) | dark | 6.62 | PASS | RIGHTS=NEGOTIATION |
| `--status-draft` (#5C687D) | `--bg-shell` (#EDF1F2) | light | 4.94 | PASS | editorial word (Schedule) |
| `--status-ready` (#0C5CDC) | `--bg-shell` (#EDF1F2) | light | 5.15 | PASS | editorial word (Schedule) |
| `--status-approved` (#1C744A) | `--bg-shell` (#EDF1F2) | light | 5.06 | PASS | editorial word / RIGHTS=VALID / CREW=OK |
| **`--alert-danger` (#D71F24)** | **`--bg-shell` (#EDF1F2)** | **light** | **4.49** | **FAIL** | **RIGHTS=MISSING (RightsScreen, every row) / CREW=CONFLICT (Schedule, unselected rows)** |
| `--alert-warning` (#976214) | `--bg-shell` (#EDF1F2) | light | 4.53 | PASS | RIGHTS=EXPIRING / CREW=OPEN |
| **`--alert-negotiation` (#AE551B)** | **`--bg-shell` (#EDF1F2)** | **light** | **4.48** | **FAIL** | **RIGHTS=NEGOTIATION (RightsScreen, every row) / same word on Schedule** |

**Kind-chip tint composited over `--bg-shell`** (RegistryScreen TYPE column, unselected
rows, `src/pages/ops/RegistryScreen.tsx:317-334`; `RecordInspector` uses the identical
map but its aside has an explicit `--surface-shell` bg, so it is NOT affected — already
covered by v2 table 4):

| Kind | Composited color | Theme | Ratio | Verdict |
|---|---|---|---|---|
| sport / staff / competition / team / player / performer | `#121C2C` / `#271714` / `#261F13` / `#0E2625` / `#0E221B` / `#201C2C` | dark (all 6) | 5.24 – 8.71 | PASS |
| sport / staff / competition / team / player / performer | `#D8E4F2` / `#ECDFDB` / `#ECE6DA` / `#D4EDEC` / `#D3E9E1` / `#E5E4F2` | light (all 6) | 4.51 – 4.55 | PASS (tight but clears 4.5:1 — closest margins of the whole audit) |

### 3.2 NEW pairs — SyncScreen confidence bands / diff cells on `--surface-shell-2`

Reason these are new: `MergeCardView`'s card background is explicitly `--surface-shell-2`
(`src/pages/ops/SyncScreen.tsx:140`), a backdrop v2 didn't check these two colors against.

| Foreground | Background | Theme | Ratio | Verdict | Where it renders |
|---|---|---|---|---|---|
| `--status-approved` (#2BB673) | `--surface-shell-2` (#141A1E) | dark | 6.72 | PASS | green confidence band, `:173` |
| `--alert-warning` (#E5A13C) | `--surface-shell-2` (#141A1E) | dark | 7.93 | PASS | amber confidence band `:173` / changed-diff-cell text `:198` |
| `--status-approved` (#1C744A) | `--surface-shell-2` (#F0F4F5) | light | 5.20 | PASS | green confidence band |
| `--alert-warning` (#976214) | `--surface-shell-2` (#F0F4F5) | light | 4.65 | PASS | amber confidence band / changed-diff-cell text (matches the 4.66 figure already recorded as this token's binding constraint in `docs/ops-token-map.md`, confirming the derivation) |

### 3.3 Everything covered by the existing v2 audit

Text hierarchy, accent (active tab), chip-on-own-tint (surface-shell/-2 backdrops), and
channel colors — all 93 pairs in `docs/ops-contrast-audit.md` — carry forward unchanged;
spot-checked 2 rows against current `tokens.css` as a drift check (both matched exactly,
see §Method). Not re-printed here to avoid duplicating that document.

### 3.4 Contrast summary

**2 FAILs, both light theme, both newly found** (not previously known): `--alert-danger`
and `--alert-negotiation` as plain words directly on `--bg-shell` — 4.49 and 4.48 against
the 4.5:1 threshold, i.e. failing by a hair (0.01–0.02). They surface specifically on
**RightsScreen's matrix STATUS word for every MISSING/NEGOTIATION row** (that screen has
no elevated-background state at all) and on **ScheduleScreen's RIGHTS/CREW words for
unselected rows** showing those same two states (the common case, since only one row can
be selected at a time). Dark theme is unaffected (5.03 / 6.62). Both are **final-intent
colors already through one designer sign-off round (A-1-T4)** — per that round's own rule
("never propose silently shifting a final-intent color"), this is an **architect/designer
gate**, not a fix E-2-T2 should make unilaterally.

## 4. Visible focus

- **No ops-authored `:focus`/`:focus-visible` rule exists** in `src/components/ops/ops.css`
  or anywhere else in the ops styles (confirmed by reading the file in full — it contains
  only the live-pulse keyframe). All native `<button>`/`<input>`/`<select>`/`NavLink`
  elements across the 5 screens therefore rely entirely on the **browser default** focus
  ring. Nothing in the ops stylesheet or Tailwind's `@tailwind base` layer strips it (the
  `outline: none` rules that DO exist, `src/styles/index.css:367,439`, are scoped to the
  legacy `.inp`/`.field-input` classes, which no ops component uses) — **PASS** for every
  native control.
- **`ScheduleRow`** (`src/pages/ops/ScheduleScreen.tsx:285-302`): sets no `outline*`
  property at all, so the browser default ring is undisturbed when the row is
  keyboard-focused — **PASS**.
- **Rundown timeline block** (`src/pages/ops/RundownScreen.tsx:288-306`) — **FAIL**:
  ```
  outlineWidth: '1px',
  outlineStyle: outlineColor ? 'solid' : 'none',
  ...(outlineColor ? { outlineColor } : {}),
  ```
  `outlineColor` here is a **selection/conflict state** value (accent when selected, danger
  when crew-conflicted, `null` otherwise) — it is not conditioned on focus at all. Because
  this is an inline style, it has higher specificity than any `:focus-visible` UA/author
  rule short of `!important`, so:
  - An **unselected, non-conflicted** block that receives keyboard focus gets
    `outline-style: none` baked into its `style` attribute regardless of focus state — the
    browser's default focus ring is suppressed outright. A keyboard user tabbing through
    the Rundown timeline gets **zero visual feedback** for where focus is on most blocks
    (most blocks are neither selected nor conflicted at any given time).
  - Even a **selected or conflicted** block shows the identical 1px outline whether or not
    it currently has focus — the outline is a permanent state indicator, not a focus
    indicator, so there is no way to tell a focused selected block from an unfocused one
    either.
  - Net effect: this is a genuine WCAG 2.4.7 (Focus Visible) failure, present in **both
    themes** (the bug is structural, not color-dependent), and worse than "no design token
    for it" — the code actively erases the UA default that would otherwise have worked for
    free.
- **Registry table row**: not yet focusable at all (§2), so focus-visibility is moot until
  E-2-T2 adds `tabIndex`; once it does, it inherits the browser default automatically (the
  row sets no `outline*` property today) — no extra fix needed there beyond the keyboard fix.

## 5. AC-4 designer-decision notes (accrued, not part of this task's scope to resolve)

| Note | Where flagged in code | Proposed disposition |
|---|---|---|
| `--registry-*` STATUS token family (borrows `--status-approved`/`--alert-warning`/`--text-shell-3` today) | `RegistryScreen.tsx` header comment, `RecordInspector.tsx` header comment | designer-gate — naming/token-family decision, not presentational-only |
| Channel color vars for Ketnet/VRT MAX Sport/Radio 1; Rundown unmapped/UNASSIGNED lanes | `RundownScreen.tsx` pin 7 comment (`FALLBACK_LANE_COLOR`) | designer-gate — needs real channel hex values assigned first |
| Sport-icon/federation + per-kind create fields | `RegistryCreateModal.tsx` (icon/federation fields) | designer-gate — data-model/UX scope, not styling |
| Provenance SOURCE-code-vs-full-name (`SYNCED FROM TSDB` vs "THE SPORTS DB") | `RecordInspector.tsx` header comment | implement-if-decided — purely a copy/label choice once the designer picks a rendering; no token/contrast impact |
| `N PLAYERS` vs design's `12 PEOPLE` (AS-5) | `RegistryScreen.tsx` pin 5 comment | already resolved as a deliberate display-honesty deviation — no action needed, listed for completeness |
| Copy: `MAX` / `NIGHTLY SYNC · 02:00 CET` / season-label | `RightsScreen.tsx` (`PLATFORM_HEADERS.MAX`), `SyncScreen.tsx:329` | implement-if-decided — copy-only, no styling/contrast dependency |
| `reasonCodes` + a merge-confirm step | Not yet in code (backlog item referenced by the task prompt, no current implementation found in `SyncScreen.tsx`) | designer-gate — new UX flow (a confirm step before an irreversible merge decision), not a presentational tweak |

## 6. The split — (A) E-2-T2 can just apply vs (B) designer/architect gate

### (A) Non-design fixes — E-2-T2 can implement directly

1. **Registry table row keyboard operability** — add `role="button"`, `tabIndex={0}`, and
   an `onKeyDown` handling Enter/Space to `RegistryTableRow`
   (`src/pages/ops/RegistryScreen.tsx:298-309`), matching the existing `ScheduleRow` /
   Rundown-block pattern exactly (no visual change, no token change).
2. **Extract the shared clickable-row primitive** (Rule of Three met — 3 occurrences,
   §2.2) — one primitive consumed by `ScheduleRow`, the Rundown block, and the
   now-fixed Registry row. Pure refactor of existing, already-passing behavior in two of
   the three call sites.
3. **Fix the Rundown block's focus-visibility bug** (§4) — stop unconditionally setting
   `outline-style: none`; give focus its own indicator independent of the
   selection/conflict outline (e.g. a `:focus-visible` box-shadow ring layered on top, or
   only suppressing the default outline when the block already shows its OWN outline, and
   restoring the default otherwise). This is a code-correctness fix (the current code's own
   stated intent — an outline that reflects selection/conflict — is not contradicted by
   also making focus visible); no new color decision is needed if the fix reuses
   `--accent-shell` (already the "selected" outline color) as the focus indicator too.

### (B) Designer/architect-decision gates

1. **The 2 new contrast FAILs** (§3.4): `--alert-danger` and `--alert-negotiation` words on
   `--bg-shell`, light theme only, 4.49 and 4.48 vs the 4.5:1 threshold. Both are
   final-intent colors from the A-1-T4 sign-off round — per that round's own rule, E-2-T2
   must not silently nudge them again. Options for the architect: widen the light values
   further (breaks the "minimal lightness delta" mandate a second time), or give
   `RightsScreen`'s matrix rows / `ScheduleScreen`'s table rows an explicit
   `--surface-shell` background (a layout decision, not a token decision, and would change
   the visual design of two screens — also a gate).
2. **All seven AC-4 designer notes in §5** (registry status-token family, channel vars,
   sport-icon/federation fields, provenance code-vs-name, copy strings, reasonCodes +
   merge-confirm step) — carried forward from earlier stories, none resolved by this audit,
   dispositions proposed above.
3. **Rundown block color-mix channel-tint background** (previously flagged as a scope gap
   in `docs/ops-token-map.md`'s own "Deliberately NOT tokens" section) — the block's text
   sits on a 15%-alpha channel tint that was never brought into the token contrast audit;
   still open, re-flagged here rather than newly computed (out of this task's explicit
   pair list, and channel colors are themselves still mid-flight per note 2 above).

## What could not be verified

Nothing was guessed. Every token value quoted above was read directly from
`src/styles/tokens.css` (current file, both `:root` and `[data-theme="light"]` blocks) and
cross-checked against `docs/ops-token-map.md` / `docs/ops-contrast-audit.md`; every
keyboard/focus claim was verified by reading the actual component source, not inferred.
The one soft gap: the "`reasonCodes` + a merge-confirm step" AC-4 note (§5) has no
corresponding code yet in `SyncScreen.tsx` — it is carried in this audit purely because
the task brief named it as an accrued note to enumerate, not because it was found in code.

---

## E-2-T3 — Resolution (2026-07-10, architect-decided)

**Contrast fails → FIXED (nudge to real AA).** Both light-theme status colors were
final-intent (A-1-T4 sign-off), so the architect decided a minimal darkening rather than
a silent shift (audit-honesty). Verified with the WCAG relative-luminance formula against
light `--bg-shell` `#EDF1F2`:

| Token (light) | Before | Ratio | After | Ratio | Verdict |
|---|---|---|---|---|---|
| `--alert-danger` | `#D71F24` | 4.49 | **`#D31F24`** | **4.63** | ✅ AA |
| `--alert-negotiation` | `#AE551B` | 4.48 | **`#A9551B`** | **4.61** | ✅ AA |

Same hue, single-channel (R) −4/−5 darkening; **dark theme untouched** (already passed
5.03 / 6.62). Applied to `src/styles/tokens.css` `[data-theme="light"]` only.

**Designer-polish notes (7, AC-4) → DEFERRED** to a dedicated designer session (architect
decision): `--registry-*` STATUS token family · channel color vars (Ketnet / VRT MAX Sport
/ Radio 1) · sport-icon/federation + per-kind create fields · provenance SOURCE-code-vs-full
-name · copy (`MAX` / `NIGHTLY SYNC · 02:00 CET` / season-label) · `N PLAYERS` vs `12 PEOPLE`
(already resolved — AS-5 honesty) · `reasonCodes` + a merge-confirm step (no code yet). None
block the cutover; tracked open for E-4 debt servicing / a designer pass.

**Story E-2 status: COMPLETE** — T1 audit, T2 remediation (Registry keyboard + Rundown
focus + shared `getRowActivationProps`), T3 contrast fix + designer-note dispositions.
