# Ops Token Map — design token → CSS variable (A-1-T1)

Source of truth: `docs/design_handoff_planza_ops/README.md` §Design Tokens.
Governing decision: ADR-013 — `src/styles/tokens.css` is the single token source; light values
live under `[data-theme="light"]` overriding the same var names; no `--ops-*` second token
system; components never hard-code hex.

Naming rationale: the ops palette is a *different dark* than the legacy palette, so no existing
var could be repurposed (story AC-4). New vars extend the existing naming families
(`--bg`/`--surface`/`--border`/`--text`, numbered-depth suffixes, `-fg` for on-color text) using
the Domain Glossary term **Shell** ("Ops Shell", backlog §4) as the scope word. All nine
theme-flipping vars carry the `-shell` scope word — including `--accent-shell` /
`--accent-shell-fg`, because "accent" alone already means something else in the codebase
(`Btn variant="accent"` renders the amber `--primary`, and `department.accent` is a third,
per-department meaning; `--primary-accent` is an unrelated legacy shade — all untouched).

## Theme variables (dark = `:root` default, light under `[data-theme="light"]`)

| Design token | CSS var | Dark | Light | Use | Notes |
|---|---|---|---|---|---|
| `--bg` | `--bg-shell` | `#090B0D` | `#EDF1F2` | app background | **Collision disposition 1:** `--bg` already exists (`#0B0F19`, consumed by `src/App.tsx:124`, `src/styles/index.css:20,25`) — not changed or repurposed |
| `--pn` | `--surface-shell` | `#0F1316` | `#FFFFFF` | panel / chrome / inspector background | New hue family vs legacy `--surface #111827` (disposition 3) |
| `--p2` | `--surface-shell-2` | `#141A1E` | `#F0F4F5` | inset surfaces, hover rows, inputs | Numbered-depth suffix mirrors legacy `--surface-2` |
| `--ln` | `--border-shell` | `#212A31` | `#D6DEE1` | all ops borders / dividers | Legacy `--border` untouched |
| `--tx` | `--text-shell` | `#D9E4EB` | `#111A1F` | primary text | |
| `--t2` | `--text-shell-2` | `#7E8E9A` | `#54646D` | secondary text | **Collision disposition 2:** `--t2` exists as a type-scale SIZE (`1.75rem`, `src/styles/index.css:302,329,408`) — name not taken; `--text-2` also exists with a legacy value, so the `--text-N` pattern is extended with the shell scope word instead |
| `--t3` | `--text-shell-3` | `#4E5B66` | `#8697A0` | tertiary text / column headers | Same disposition as `--t2` (`--t3: 2.25rem` is a size) |
| `--ac` | `--accent-shell` | `#2FD6C3` | `#0D9488` | accent (active tab, primary button, matrix ●) | Design teal ≠ legacy `--primary #F59E0B` amber (disposition 3); `-shell` scope word required — "accent" alone collides with `Btn variant="accent"` (amber) and `department.accent` |
| `--af` | `--accent-shell-fg` | `#04241F` | `#FFFFFF` | text on accent | `-fg` suffix mirrors `--primary-fg`, `--brand-fg` |

## Fixed semantic colors (identical in both themes — defined once at `:root`, NOT overridden in the light block)

### Editorial Status (glossary: Editorial Status)

| Design | CSS var | Value | Chip bg var | Chip bg value |
|---|---|---|---|---|
| draft | `--status-draft` | `#98A2B3` | `--status-draft-bg` | `#98A2B322` |
| ready | `--status-ready` | `#4C8DF5` | `--status-ready-bg` | `#4C8DF522` |
| approved | `--status-approved` | `#2BB673` | `--status-approved-bg` | `#2BB67322` |

### Alerts

| Design | CSS var | Value |
|---|---|---|
| live / conflict / danger | `--alert-danger` | `#E5484D` |
| warning / expiring | `--alert-warning` | `#E5A13C` |
| negotiation | `--alert-negotiation` | `#E07B39` |

Note: legacy `--danger #F87171` / `--warning #F59E0B` differ in value — untouched; the `--alert-*`
family is the ops set.

### Channels

| Design | CSS var | Value |
|---|---|---|
| Eén | `--channel-een` | `#E4572E` |
| Canvas | `--channel-canvas` | `#4C8DF5` |
| VRT MAX | `--channel-vrtmax` | `#2BB673` |

### Registry Kinds (glossary: Kind)

| Design | CSS var | Value | Chip bg var | Chip bg value |
|---|---|---|---|---|
| sport | `--kind-sport` | `#4C8DF5` | `--kind-sport-bg` | `#4C8DF522` |
| competition | `--kind-competition` | `#E5A13C` | `--kind-competition-bg` | `#E5A13C22` |
| team | `--kind-team` | `#2FD6C3` | `--kind-team-bg` | `#2FD6C322` |
| player | `--kind-player` | `#2BB673` | `--kind-player-bg` | `#2BB67322` |
| performer | `--kind-performer` | `#B48EF5` | `--kind-performer-bg` | `#B48EF522` |
| staff | `--kind-staff` | `#E4572E` | `--kind-staff-bg` | `#E4572E22` |

Chip backgrounds: design says "kind/status color at ~13% alpha (hex + `22`/`26`)". The `22`
alpha suffix (13.3%) is used uniformly here; the design's `22`/`26` variation is treated as
prototype noise, not intent. **Bounded assumption — flag at A-1-T3 contrast audit if any chip
fails AA.** Chip bg vars stay fixed in light theme (alpha over white per design).

## Deliberately NOT tokens (component-level derivations, still no hard-coded hex)

- Rundown block bg = channel color at 15% alpha → `color-mix(in srgb, var(--channel-*) 15%, transparent)` (B-story concern).
- Inspector conflict callout bg = 10% red → `color-mix` on `--alert-danger`.
- IBM Plex fonts: `--font-display` / `--font-mono` already exist (AS-6 confirmed) — not re-added.

## Light-block scope rule (AC-4)

`[data-theme="light"]` overrides **only** the nine theme vars above. It must never declare a
legacy var (`--bg`, `--surface*`, `--text*`, `--border*`, `--primary*`, `--t2`, `--t3`, …) or a
fixed semantic var. Naming rule: **every var overridden by `[data-theme]` carries the `-shell`
scope word** — and only those vars do. A user toggling light inside `/ops` therefore never restyles legacy screens,
which do not consume shell vars. AC-1's "`--bg #090B0D` family" reads as "the ops background
token (`--bg-shell`) resolves to `#090B0D` on ops surfaces" — AC-4 wins over the literal name.

Contract: `docs/governance/contracts/ops-tokens.md` (ops-tokens v1). Enforced by
`src/styles/tokens.opsTheme.test.ts`.
