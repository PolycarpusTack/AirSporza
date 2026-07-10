# Ops Token Map — design token → CSS variable (A-1-T1, amended by A-1-T4)

Source of truth: `docs/design_handoff_planza_ops/README.md` §Design Tokens, amended by the
architect decisions of 2026-07-02 (post A-1-T3 contrast audit — see `docs/ops-contrast-audit.md`).
Governing decision: ADR-013 (incl. Amendment 2026-07-02) — `src/styles/tokens.css` is the single
token source; light values live under `[data-theme="light"]` overriding the same var names; no
`--ops-*` second token system; components never hard-code hex.

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
| `--t3` | `--text-shell-3` | `#738594` ⚠ | `#5E6E77` ⚠ | tertiary text / column headers | Same disposition as `--t2`. **⚠ AA-derived (A-1-T4, F-1)** from design `#4E5B66` / `#8697A0` — both failed 4.5:1 on every surface; pending designer sign-off |
| `--ac` | `--accent-shell` | `#2FD6C3` | `#0D9488` | accent (active tab, primary button, matrix ●) | Design teal ≠ legacy `--primary #F59E0B` amber (disposition 3); `-shell` scope word required — "accent" alone collides with `Btn variant="accent"` (amber) and `department.accent` |
| `--af` | `--accent-shell-fg` | `#04241F` | `#111A1F` ⚠ | text on accent | `-fg` suffix mirrors `--primary-fg`, `--brand-fg`. **⚠ Light value AA-derived (A-1-T4, F-2)** from design `#FFFFFF` (3.74 on teal); reuses light `--text-shell` for palette coherence (4.70); pending designer sign-off |

## Semantic colors (THEME-AWARE since A-1-T4 — architect decision 2026-07-02)

> **Amendment record:** A-1-T1 shipped these as "identical in both themes" per the design
> handoff. The A-1-T3 audit showed the fixed values fail AA systematically on light surfaces
> (34 failing pairs). The architect dropped the invariance rule on 2026-07-02: dark values stay
> design final-intent; **light values are AA-derived** and live in the `[data-theme="light"]`
> block. Chip `-bg` tints remain theme-invariant (dark-tuned base @ alpha `22` in both themes).
> **Every ⚠ light value below is derived, pending designer sign-off.**

### Derivation method (A-1-T4)

Programmatic search in **HSL space** (hue and saturation locked, lightness stepped by 0.1%
in the required direction — minimal delta) until all binding constraints clear the margin
targets **≥4.6:1 text / ≥3.1:1 non-text** (threshold + margin, architect decision 5), computed
with the WCAG 2.1 formula on the rounded hex. Binding constraints per family: word-as-text on
light `--surface-shell` AND `--surface-shell-2`; chip text on its own (unchanged) `-bg` tint
composited over both light surfaces; channels additionally as text/swatch on light `--bg-shell`.
Dark `--kind-staff` was the one dark-side derivation (chip over both dark surfaces, tint
following the candidate base). Script: A-1-T4 session scratchpad (`derive-values.mjs`,
reproducible from this table).

### Editorial Status (glossary: Editorial Status)

| Design | CSS var | Dark | Light ⚠ | Chip bg var | Chip bg value (both themes) |
|---|---|---|---|---|---|
| draft | `--status-draft` | `#98A2B3` | `#5C687D` | `--status-draft-bg` | `#98A2B322` |
| ready | `--status-ready` | `#4C8DF5` | `#0C5CDC` | `--status-ready-bg` | `#4C8DF522` |
| approved | `--status-approved` | `#2BB673` | `#1C744A` | `--status-approved-bg` | `#2BB67322` |

### Alerts

| Design | CSS var | Dark | Light ⚠ |
|---|---|---|---|
| live / conflict / danger | `--alert-danger` | `#E5484D` | `#D31F24` |
| warning / expiring | `--alert-warning` | `#E5A13C` | `#976214` |
| negotiation | `--alert-negotiation` | `#E07B39` | `#A9551B` |

Note: legacy `--danger #F87171` / `--warning #F59E0B` differ in value — untouched; the `--alert-*`
family is the ops set.

### Channels

| Design | CSS var | Dark | Light ⚠ |
|---|---|---|---|
| Eén | `--channel-een` | `#E4572E` | `#C13F19` |
| Canvas | `--channel-canvas` | `#4C8DF5` | `#0D63EC` |
| VRT MAX | `--channel-vrtmax` | `#2BB673` | `#1D7B4E` |

### Registry Kinds (glossary: Kind)

| Design | CSS var | Dark | Light ⚠ | Chip bg var | Chip bg value (both themes) |
|---|---|---|---|---|---|
| sport | `--kind-sport` | `#4C8DF5` | `#0C5CDC` | `--kind-sport-bg` | `#4C8DF522` |
| competition | `--kind-competition` | `#E5A13C` | `#8F5D13` | `--kind-competition-bg` | `#E5A13C22` |
| team | `--kind-team` | `#2FD6C3` | `#17756B` | `--kind-team-bg` | `#2FD6C322` |
| player | `--kind-player` | `#2BB673` | `#1C744A` | `--kind-player-bg` | `#2BB67322` |
| performer | `--kind-performer` | `#B48EF5` | `#7C3AEE` | `--kind-performer-bg` | `#B48EF522` |
| staff | `--kind-staff` | `#E76843` ⚠ | `#B43B17` | `--kind-staff-bg` | `#E7684322` ⚠ |

**⚠ Dark staff (A-1-T4, F-4):** design `#E4572E` failed its own chip (4.14/4.44) — minimally
lightened to `#E76843`; the tint follows the rule "tint = own dark base @ alpha 22", hence
`--kind-staff-bg` moved to `#E7684322`. Pending designer sign-off. `--channel-een` keeps the
original `#E4572E` in dark (its dark constraints all pass) — staff and Eén now differ in dark.

Chip backgrounds: design says "kind/status color at ~13% alpha (hex + `22`/`26`)". The `22`
alpha suffix (13.3%) is used uniformly; confirmed the conservative reading by the A-1-T3 audit
(two dark chips would flip to FAIL at `26`). Tints stay fixed in BOTH themes (architect
decision 3) — light chips pair the dark-tuned tint with the AA-derived light text color.

### Derived values at a glance (old → new, all pending designer sign-off)

| Var | Theme | Design value | Derived value | dL (HSL) | Binding ratio after |
|---|---|---|---|---|---|
| `--text-shell-3` | dark | `#4E5B66` | `#738594` | +16.2% | 4.60 (on `--surface-shell-2`) |
| `--text-shell-3` | light | `#8697A0` | `#5E6E77` | −15.9% | 4.64 (on `--bg-shell`) |
| `--accent-shell-fg` | light | `#FFFFFF` | `#111A1F` (= light `--text-shell`) | reuse | 4.70 (on accent) |
| `--kind-staff` (+ tint) | dark | `#E4572E` | `#E76843` | +4.6% | 4.60 (chip over `--surface-shell-2`) |
| `--status-draft` | light | `#98A2B3` | `#5C687D` | −22.3% | 4.60 (chip) |
| `--status-ready` | light | `#4C8DF5` | `#0C5CDC` | −17.3% | 4.64 (chip) |
| `--status-approved` | light | `#2BB673` | `#1C744A` | −15.9% | 4.65 (chip) |
| `--alert-danger` | light | `#E5484D` | `#D31F24` | −10.8% | 4.61 (word on `--surface-shell-2`) |
| `--alert-warning` | light | `#E5A13C` | `#976214` | −23.1% | 4.66 (word on `--surface-shell-2`) |
| `--alert-negotiation` | light | `#E07B39` | `#A9551B` | −15.6% | 4.61 (word on `--surface-shell-2`) |
| `--channel-een` | light | `#E4572E` | `#C13F19` | −10.9% | 4.62 (on `--bg-shell`) |
| `--channel-canvas` | light | `#4C8DF5` | `#0D63EC` | −14.0% | 4.60 (on `--bg-shell`) |
| `--channel-vrtmax` | light | `#2BB673` | `#1D7B4E` | −14.2% | 4.62 (on `--bg-shell`) |
| `--kind-sport` | light | `#4C8DF5` | `#0C5CDC` | −17.3% | 4.64 (chip) |
| `--kind-competition` | light | `#E5A13C` | `#8F5D13` | −24.8% | 4.63 (chip) |
| `--kind-team` | light | `#2FD6C3` | `#17756B` | −23.6% | 4.62 (chip) |
| `--kind-player` | light | `#2BB673` | `#1C744A` | −15.9% | 4.65 (chip) |
| `--kind-performer` | light | `#B48EF5` | `#7C3AEE` | −17.9% | 4.61 (chip) |
| `--kind-staff` | light | `#E4572E` | `#B43B17` | −13.8% | 4.60 (chip) |

**Character-change flags for the designer** (largest deltas, hue/sat kept but visibly darker in
light theme): `--kind-competition` (−24.8%, amber → dark ochre), `--kind-team` (−23.6%, bright
teal → deep teal), `--alert-warning` (−23.1%, amber → dark olive-brown), `--status-draft`
(−22.3%). These meet AA with minimal *lightness* delta, but the light-theme chips will read
noticeably more muted than the prototype — review candidates first.

## Deliberately NOT tokens (component-level derivations, still no hard-coded hex)

- Rundown block bg = channel color at 15% alpha → `color-mix(in srgb, var(--channel-*) 15%, transparent)` (B-story concern).
- Inspector conflict callout bg = 10% red → `color-mix` on `--alert-danger`.
- IBM Plex fonts: `--font-display` / `--font-mono` already exist (AS-6 confirmed) — not re-added.

## Light-block scope rule (AC-4, amended by A-1-T4)

`[data-theme="light"]` overrides **exactly** the nine `-shell` theme vars plus the fifteen
semantic base vars (status 3, alert 3, channel 3, kind 6). It must never declare a legacy var
(`--bg`, `--surface*`, `--text*`, `--border*`, `--primary*`, `--t2`, `--t3`, …) or a chip `-bg`
tint. Naming rule (amended): the `-shell` scope word marks the *shell* vars; since A-1-T4 the
light block also carries the semantic families (`--status-*`, `--alert-*`, `--channel-*`,
`--kind-*` base colors) — membership is now defined by the contract's light-block list
(ops-tokens v2), not by the suffix alone. A user toggling light inside `/ops` still never
restyles legacy screens, which consume none of these vars. AC-1's "`--bg #090B0D` family" reads
as "the ops background token (`--bg-shell`) resolves to `#090B0D` on ops surfaces" — AC-4 wins
over the literal name.

Contract: `docs/governance/contracts/ops-tokens.md` (**ops-tokens v2**). Enforced by
`src/styles/tokens.opsTheme.test.ts`. Audit: `docs/ops-contrast-audit.md` (v2, 0 FAIL).
