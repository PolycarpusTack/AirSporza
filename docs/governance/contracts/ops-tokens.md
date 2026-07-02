# CONTRACT SNAPSHOT: ops-tokens

Version: 1 · Date: 2026-07-02 · Task: A-1-T1 (input contract for A-1-T2, A-2-T1, all ops screens)

## Public interface

CSS custom properties declared in `src/styles/tokens.css` (single token source, ADR-013).
Dark values are `:root` defaults (no `data-theme` attribute needed). Setting
`data-theme="light"` on `<html>` (owner: `useOpsTheme`, A-1-T2) switches ONLY the shell theme
vars; everything else is theme-invariant. Components consume `var(--…)` — never hex.

### Shell theme vars (dark / light)

| Var | Dark | Light | Use |
|---|---|---|---|
| `--bg-shell` | `#090B0D` | `#EDF1F2` | app background |
| `--surface-shell` | `#0F1316` | `#FFFFFF` | panel / chrome / inspector bg |
| `--surface-shell-2` | `#141A1E` | `#F0F4F5` | inset surfaces, hover rows, inputs |
| `--border-shell` | `#212A31` | `#D6DEE1` | all ops borders / dividers |
| `--text-shell` | `#D9E4EB` | `#111A1F` | primary text |
| `--text-shell-2` | `#7E8E9A` | `#54646D` | secondary text |
| `--text-shell-3` | `#4E5B66` | `#8697A0` | tertiary text / column headers |
| `--accent-shell` | `#2FD6C3` | `#0D9488` | active tab, primary button, matrix ● |
| `--accent-shell-fg` | `#04241F` | `#FFFFFF` | text on accent |

Naming rule: every var overridden by `[data-theme="light"]` carries the `-shell` scope word,
and only those vars do. (Do not use legacy "accent" surfaces for ops: `Btn variant="accent"`
renders the amber `--primary`, not `--accent-shell`.)

### Theme-invariant vars (same value both themes)

| Family | Vars |
|---|---|
| Editorial Status | `--status-draft #98A2B3` · `--status-ready #4C8DF5` · `--status-approved #2BB673` (+ `-bg` chip variants at alpha `22`) |
| Alerts | `--alert-danger #E5484D` · `--alert-warning #E5A13C` · `--alert-negotiation #E07B39` |
| Channels | `--channel-een #E4572E` · `--channel-canvas #4C8DF5` · `--channel-vrtmax #2BB673` |
| Registry Kinds | `--kind-sport #4C8DF5` · `--kind-competition #E5A13C` · `--kind-team #2FD6C3` · `--kind-player #2BB673` · `--kind-performer #B48EF5` · `--kind-staff #E4572E` (+ `-bg` chip variants at alpha `22`) |

Chip `-bg` variants = base color + `22` alpha (~13%), 8-digit hex, not overridden in light.

**Rights Status → var mapping** (glossary: Rights Status; consumed by A-3 selectors):
`EXPIRING` → `--alert-warning` · `NEGOTIATION` → `--alert-negotiation` · `MISSING` → `--alert-danger`
(`VALID` renders green `#2BB673` per the design — same hue as `--status-approved`; confirm the
var choice at A-3/B-3). Guard: Rights Status colors live in `--alert-*` — the `--status-*`
family is **Editorial Status only** (draft/ready/approved); never add rights states to it.

## Guarantees (normative, enforced by `src/styles/tokens.opsTheme.test.ts`)

1. No `data-theme` attribute → every shell var resolves to its dark value (story AC-1).
2. `data-theme="light"` on `<html>` → shell vars resolve to light values.
3. The `[data-theme="light"]` block declares exactly the nine shell vars — no legacy var
   (`--bg`, `--surface*`, `--text*`, `--border*`, `--primary*`, `--t2`, `--t3`, …) is ever
   overridden; legacy screens are theme-toggle-inert (story AC-4).
4. Legacy var values unchanged: `--bg #0B0F19`, `--t2 1.75rem`, `--t3 2.25rem` etc. remain as
   before A-1-T1. The design's `--bg`/`--t2`/`--t3` names were NOT taken (collisions — see
   `docs/ops-token-map.md` for the full design-token → var mapping and dispositions).

## Depends on

Nothing at runtime. `tokens.css` must be in the bundle (already imported globally).
Fonts `--font-display`/`--font-mono` (IBM Plex) pre-exist — not part of this contract.

## Domain terms used

Ops Shell, Ops Theme, Editorial Status, Kind (backlog §4 glossary).
