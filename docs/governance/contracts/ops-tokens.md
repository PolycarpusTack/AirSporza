# CONTRACT SNAPSHOT: ops-tokens

Version: 2 · Date: 2026-07-02 · Task: A-1-T4 (input contract for A-2-T1, all ops screens)

**Changelog**
- **v2 (2026-07-02, A-1-T4):** semantic sets (status/alert/channel/kind base colors) became
  THEME-AWARE — architect decision 2026-07-02 after the A-1-T3 contrast audit (39 AA failures,
  34 on light surfaces). Light values are AA-derived (pending designer sign-off — see
  `docs/ops-token-map.md`). Also: `--text-shell-3` AA-adjusted in both themes; light
  `--accent-shell-fg` now dark text; dark `--kind-staff` (+ its tint) minimally shifted.
  Chip `-bg` tints remain theme-invariant. Guarantee 3 rewritten for the new light-block set.
- v1 (2026-07-02, A-1-T1): initial — nine `-shell` theme vars + fixed semantic sets.

## Public interface

CSS custom properties declared in `src/styles/tokens.css` (single token source, ADR-013 incl.
Amendment). Dark values are `:root` defaults (no `data-theme` attribute needed). Setting
`data-theme="light"` on `<html>` (owner: `useOpsTheme` v1) switches the shell vars AND the
semantic base colors; chip `-bg` tints are theme-invariant. Components consume `var(--…)` —
never hex.

### Shell theme vars (dark / light)

| Var | Dark | Light | Use |
|---|---|---|---|
| `--bg-shell` | `#090B0D` | `#EDF1F2` | app background |
| `--surface-shell` | `#0F1316` | `#FFFFFF` | panel / chrome / inspector bg |
| `--surface-shell-2` | `#141A1E` | `#F0F4F5` | inset surfaces, hover rows, inputs |
| `--border-shell` | `#212A31` | `#D6DEE1` | all ops borders / dividers |
| `--text-shell` | `#D9E4EB` | `#111A1F` | primary text |
| `--text-shell-2` | `#7E8E9A` | `#54646D` | secondary text |
| `--text-shell-3` | `#738594` | `#5E6E77` | tertiary text / column headers (AA-derived both themes) |
| `--accent-shell` | `#2FD6C3` | `#0D9488` | active tab, primary button, matrix ● |
| `--accent-shell-fg` | `#04241F` | `#111A1F` | text on accent (light AA-derived) |

(Do not use legacy "accent" surfaces for ops: `Btn variant="accent"` renders the amber
`--primary`, not `--accent-shell`.)

### Semantic base vars (dark / light — theme-aware since v2)

| Var | Dark | Light |
|---|---|---|
| `--status-draft` | `#98A2B3` | `#5C687D` |
| `--status-ready` | `#4C8DF5` | `#0C5CDC` |
| `--status-approved` | `#2BB673` | `#1C744A` |
| `--alert-danger` | `#E5484D` | `#D71F24` |
| `--alert-warning` | `#E5A13C` | `#976214` |
| `--alert-negotiation` | `#E07B39` | `#AE551B` |
| `--channel-een` | `#E4572E` | `#C13F19` |
| `--channel-canvas` | `#4C8DF5` | `#0D63EC` |
| `--channel-vrtmax` | `#2BB673` | `#1D7B4E` |
| `--kind-sport` | `#4C8DF5` | `#0C5CDC` |
| `--kind-competition` | `#E5A13C` | `#8F5D13` |
| `--kind-team` | `#2FD6C3` | `#17756B` |
| `--kind-player` | `#2BB673` | `#1C744A` |
| `--kind-performer` | `#B48EF5` | `#7C3AEE` |
| `--kind-staff` | `#E76843` | `#B43B17` |

**Rights Status → var mapping** (glossary: Rights Status; consumed by A-3 selectors):
`EXPIRING` → `--alert-warning` · `NEGOTIATION` → `--alert-negotiation` · `MISSING` → `--alert-danger`
(`VALID` renders green per the design — same hue as `--status-approved`; confirm the var choice
at A-3/B-3). Guard: Rights Status colors live in `--alert-*` — the `--status-*` family is
**Editorial Status only** (draft/ready/approved); never add rights states to it.

### Theme-invariant vars (same value both themes)

Chip `-bg` tints = dark-tuned base @ alpha `22` (8-digit hex), NOT overridden in light:
`--status-draft-bg #98A2B322` · `--status-ready-bg #4C8DF522` · `--status-approved-bg #2BB67322` ·
`--kind-sport-bg #4C8DF522` · `--kind-competition-bg #E5A13C22` · `--kind-team-bg #2FD6C322` ·
`--kind-player-bg #2BB67322` · `--kind-performer-bg #B48EF522` · `--kind-staff-bg #E7684322`.
Light chips pair these tints with the AA-derived light base as text.

## Guarantees (normative, enforced by `src/styles/tokens.opsTheme.test.ts`)

1. No `data-theme` attribute → every themed var resolves to its dark value (story AC-1).
2. `data-theme="light"` on `<html>` → shell + semantic base vars resolve to light values.
3. The `[data-theme="light"]` block declares EXACTLY the 9 shell + 15 semantic base vars —
   never a legacy var (`--bg`, `--surface*`, `--text*`, `--border*`, `--primary*`, `--t2`,
   `--t3`, …) and never a chip `-bg` tint; legacy screens are theme-toggle-inert (story AC-4).
4. Legacy var values unchanged: `--bg #0B0F19`, `--t2 1.75rem`, `--t3 2.25rem` etc. remain as
   before A-1 (see `docs/ops-token-map.md` for collision dispositions).
5. Both themes are WCAG AA clean for every audited pair: `docs/ops-contrast-audit.md` v2 —
   93 pairs, 0 FAIL (4.5:1 small text, 3:1 non-text). Derived values pending designer sign-off;
   a sign-off change requires re-running the audit and bumping this contract.

## Depends on

Nothing at runtime. `tokens.css` must be in the bundle (already imported globally).
Fonts `--font-display`/`--font-mono` (IBM Plex) pre-exist — not part of this contract.

## Domain terms used

Ops Shell, Ops Theme, Editorial Status, Rights Status, Kind (backlog §4 glossary).
