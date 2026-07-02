# Ops Contrast Audit — WCAG AA, both themes (A-1-T3)

Task: A-1-T3 · Date: 2026-07-02 · Auditor: gpm-partner (computed, not estimated)
Source of truth: committed `src/styles/tokens.css` (Contract Snapshot **ops-tokens v1**, `-shell` names) — values parsed from the file, both `:root` (dark) and `[data-theme="light"]` blocks.
Governing rule (task card): **failures are flagged, never fixed** — final-intent design colors are not adjusted here; every FAIL below is a follow-up item for the Architect.

## Method

- WCAG 2.1 relative luminance: sRGB channels linearized (`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`), `L = 0.2126R + 0.7152G + 0.0722B`; contrast ratio `(L₁+0.05)/(L₂+0.05)`.
- 8-digit hex (`22`-alpha chip backgrounds) composited over their backdrop first (sRGB alpha compositing, `a = 0x22/255 ≈ 13.3%`); the composited hex is shown in the table.
- Ratios truncated (not rounded) to 2 decimals so a fail can never round up to a pass.
- Thresholds: **4.5:1** small text · **3:1** large text (≥18pt / 14pt bold) and non-text UI (WCAG 1.4.11). **The ops type scale is 8.5–15px** (section labels 9–9.5px, status words 10.5px, chip labels 8.5px, table primary 12.5px) — nothing qualifies as "large text", so all text pairs are audited at 4.5:1. Non-text UI (matrix dots, selected-row accent bar, swatches) at 3:1.
- Statuses: PASS / FAIL / N-A (decorative). No pair was classified N-A: every audited color carries information (status, channel identity, kind) — none is purely decorative.

### 1. Text hierarchy on surfaces (small text — AA 4.5:1)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--text-shell` (#D9E4EB) | --bg-shell (#090B0D) | dark | 15.25 | 4.5:1 | PASS | primary text |
| `--text-shell` (#D9E4EB) | --surface-shell (#0F1316) | dark | 14.44 | 4.5:1 | PASS | primary text |
| `--text-shell` (#D9E4EB) | --surface-shell-2 (#141A1E) | dark | 13.58 | 4.5:1 | PASS | primary text |
| `--text-shell-2` (#7E8E9A) | --bg-shell (#090B0D) | dark | 5.84 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#7E8E9A) | --surface-shell (#0F1316) | dark | 5.53 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#7E8E9A) | --surface-shell-2 (#141A1E) | dark | 5.20 | 4.5:1 | PASS | secondary text |
| `--text-shell-3` (#4E5B66) | --bg-shell (#090B0D) | dark | 2.82 | 4.5:1 | **FAIL** | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#4E5B66) | --surface-shell (#0F1316) | dark | 2.67 | 4.5:1 | **FAIL** | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#4E5B66) | --surface-shell-2 (#141A1E) | dark | 2.51 | 4.5:1 | **FAIL** | tertiary text / column headers (9px mono) |
| `--text-shell` (#111A1F) | --bg-shell (#EDF1F2) | light | 15.49 | 4.5:1 | PASS | primary text |
| `--text-shell` (#111A1F) | --surface-shell (#FFFFFF) | light | 17.62 | 4.5:1 | PASS | primary text |
| `--text-shell` (#111A1F) | --surface-shell-2 (#F0F4F5) | light | 15.91 | 4.5:1 | PASS | primary text |
| `--text-shell-2` (#54646D) | --bg-shell (#EDF1F2) | light | 5.39 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#54646D) | --surface-shell (#FFFFFF) | light | 6.13 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#54646D) | --surface-shell-2 (#F0F4F5) | light | 5.54 | 4.5:1 | PASS | secondary text |
| `--text-shell-3` (#8697A0) | --bg-shell (#EDF1F2) | light | 2.65 | 4.5:1 | **FAIL** | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#8697A0) | --surface-shell (#FFFFFF) | light | 3.02 | 4.5:1 | **FAIL** | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#8697A0) | --surface-shell-2 (#F0F4F5) | light | 2.72 | 4.5:1 | **FAIL** | tertiary text / column headers (9px mono) |

### 2. Accent (button/tab text 4.5:1 · non-text UI 3:1)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--accent-shell-fg` (#04241F) | --accent-shell (#2FD6C3) | dark | 9.02 | 4.5:1 | PASS | text on accent (buttons, active tab — mono 10.5px) |
| `--accent-shell` (#2FD6C3) | --bg-shell (#090B0D) | dark | 10.82 | 3:1 | PASS | non-text UI (matrix dot, selected-row bar) on app bg |
| `--accent-shell` (#2FD6C3) | --surface-shell (#0F1316) | dark | 10.24 | 3:1 | PASS | non-text UI (matrix dot, accent border) on panel |
| `--accent-shell-fg` (#FFFFFF) | --accent-shell (#0D9488) | light | 3.74 | 4.5:1 | **FAIL** | text on accent (buttons, active tab — mono 10.5px) |
| `--accent-shell` (#0D9488) | --bg-shell (#EDF1F2) | light | 3.29 | 3:1 | PASS | non-text UI (matrix dot, selected-row bar) on app bg |
| `--accent-shell` (#0D9488) | --surface-shell (#FFFFFF) | light | 3.74 | 3:1 | PASS | non-text UI (matrix dot, accent border) on panel |

### 3. Status & alert words on `--surface-shell` (small text — AA 4.5:1)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--status-draft` (#98A2B3) | --surface-shell (#0F1316) | dark | 7.24 | 4.5:1 | PASS | DRAFT word (mono 10.5px 600) |
| `--status-ready` (#4C8DF5) | --surface-shell (#0F1316) | dark | 5.72 | 4.5:1 | PASS | READY word (mono 10.5px 600) |
| `--status-approved` (#2BB673) | --surface-shell (#0F1316) | dark | 7.14 | 4.5:1 | PASS | APPROVED word (mono 10.5px 600) |
| `--alert-danger` (#E5484D) | --surface-shell (#0F1316) | dark | 4.76 | 4.5:1 | PASS | CONFLICT/LIVE word (mono 10.5px 600) |
| `--alert-warning` (#E5A13C) | --surface-shell (#0F1316) | dark | 8.43 | 4.5:1 | PASS | EXPIRING word (mono 10.5px 600) |
| `--alert-negotiation` (#E07B39) | --surface-shell (#0F1316) | dark | 6.27 | 4.5:1 | PASS | NEGOTIATION word (mono 10.5px 600) |
| `--status-draft` (#98A2B3) | --surface-shell (#FFFFFF) | light | 2.57 | 4.5:1 | **FAIL** | DRAFT word (mono 10.5px 600) |
| `--status-ready` (#4C8DF5) | --surface-shell (#FFFFFF) | light | 3.26 | 4.5:1 | **FAIL** | READY word (mono 10.5px 600) |
| `--status-approved` (#2BB673) | --surface-shell (#FFFFFF) | light | 2.61 | 4.5:1 | **FAIL** | APPROVED word (mono 10.5px 600) |
| `--alert-danger` (#E5484D) | --surface-shell (#FFFFFF) | light | 3.91 | 4.5:1 | **FAIL** | CONFLICT/LIVE word (mono 10.5px 600) |
| `--alert-warning` (#E5A13C) | --surface-shell (#FFFFFF) | light | 2.21 | 4.5:1 | **FAIL** | EXPIRING word (mono 10.5px 600) |
| `--alert-negotiation` (#E07B39) | --surface-shell (#FFFFFF) | light | 2.97 | 4.5:1 | **FAIL** | NEGOTIATION word (mono 10.5px 600) |

### 4. Chip text on own `-bg` chip variant, composited (small text — AA 4.5:1)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--status-draft` (#98A2B3) | --status-draft-bg over --surface-shell → #21262B | dark | 5.92 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-draft` (#98A2B3) | --status-draft-bg over --surface-shell-2 → #262C32 | dark | 5.47 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-ready` (#4C8DF5) | --status-ready-bg over --surface-shell → #172334 | dark | 4.85 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-ready` (#4C8DF5) | --status-ready-bg over --surface-shell-2 → #1B293B | dark | 4.51 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-approved` (#2BB673) | --status-approved-bg over --surface-shell → #132922 | dark | 5.87 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-approved` (#2BB673) | --status-approved-bg over --surface-shell-2 → #172F29 | dark | 5.45 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-sport` (#4C8DF5) | --kind-sport-bg over --surface-shell → #172334 | dark | 4.85 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-sport` (#4C8DF5) | --kind-sport-bg over --surface-shell-2 → #1B293B | dark | 4.51 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-competition` (#E5A13C) | --kind-competition-bg over --surface-shell → #2C261B | dark | 6.78 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-competition` (#E5A13C) | --kind-competition-bg over --surface-shell-2 → #302C22 | dark | 6.29 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-team` (#2FD6C3) | --kind-team-bg over --surface-shell → #132D2D | dark | 8.00 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-team` (#2FD6C3) | --kind-team-bg over --surface-shell-2 → #183334 | dark | 7.38 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-player` (#2BB673) | --kind-player-bg over --surface-shell → #132922 | dark | 5.87 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-player` (#2BB673) | --kind-player-bg over --surface-shell-2 → #172F29 | dark | 5.45 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-performer` (#B48EF5) | --kind-performer-bg over --surface-shell → #252334 | dark | 5.93 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-performer` (#B48EF5) | --kind-performer-bg over --surface-shell-2 → #29293B | dark | 5.51 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-staff` (#E4572E) | --kind-staff-bg over --surface-shell → #2B1C19 | dark | 4.44 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-staff` (#E4572E) | --kind-staff-bg over --surface-shell-2 → #302220 | dark | 4.14 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--status-draft` (#98A2B3) | --status-draft-bg over --surface-shell → #F1F3F5 | light | 2.31 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--status-draft` (#98A2B3) | --status-draft-bg over --surface-shell-2 → #E4E9EC | light | 2.10 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--status-ready` (#4C8DF5) | --status-ready-bg over --surface-shell → #E7F0FE | light | 2.84 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--status-ready` (#4C8DF5) | --status-ready-bg over --surface-shell-2 → #DAE6F5 | light | 2.58 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--status-approved` (#2BB673) | --status-approved-bg over --surface-shell → #E3F5EC | light | 2.30 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--status-approved` (#2BB673) | --status-approved-bg over --surface-shell-2 → #D6ECE4 | light | 2.11 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-sport` (#4C8DF5) | --kind-sport-bg over --surface-shell → #E7F0FE | light | 2.84 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-sport` (#4C8DF5) | --kind-sport-bg over --surface-shell-2 → #DAE6F5 | light | 2.58 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-competition` (#E5A13C) | --kind-competition-bg over --surface-shell → #FCF2E5 | light | 1.99 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-competition` (#E5A13C) | --kind-competition-bg over --surface-shell-2 → #EFE9DC | light | 1.82 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-team` (#2FD6C3) | --kind-team-bg over --surface-shell → #E3FAF7 | light | 1.67 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-team` (#2FD6C3) | --kind-team-bg over --surface-shell-2 → #D6F0EE | light | 1.52 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-player` (#2BB673) | --kind-player-bg over --surface-shell → #E3F5EC | light | 2.30 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-player` (#2BB673) | --kind-player-bg over --surface-shell-2 → #D6ECE4 | light | 2.11 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-performer` (#B48EF5) | --kind-performer-bg over --surface-shell → #F5F0FE | light | 2.31 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-performer` (#B48EF5) | --kind-performer-bg over --surface-shell-2 → #E8E6F5 | light | 2.09 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-staff` (#E4572E) | --kind-staff-bg over --surface-shell → #FBE9E3 | light | 3.13 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |
| `--kind-staff` (#E4572E) | --kind-staff-bg over --surface-shell-2 → #EEDFDA | light | 2.84 | 4.5:1 | **FAIL** | chip label (8.5px mono 600) |

### 5. Channel colors (audited as 10.5–11px text at 4.5:1; swatch-only use falls under non-text 3:1 — see summary)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--channel-een` (#E4572E) | --bg-shell (#090B0D) | dark | 5.35 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-een` (#E4572E) | --surface-shell (#0F1316) | dark | 5.06 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-canvas` (#4C8DF5) | --bg-shell (#090B0D) | dark | 6.04 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-canvas` (#4C8DF5) | --surface-shell (#0F1316) | dark | 5.72 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-vrtmax` (#2BB673) | --bg-shell (#090B0D) | dark | 7.54 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-vrtmax` (#2BB673) | --surface-shell (#0F1316) | dark | 7.14 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-een` (#E4572E) | --bg-shell (#EDF1F2) | light | 3.23 | 4.5:1 | **FAIL** | channel name text / lane label |
| `--channel-een` (#E4572E) | --surface-shell (#FFFFFF) | light | 3.68 | 4.5:1 | **FAIL** | channel name text / lane label |
| `--channel-canvas` (#4C8DF5) | --bg-shell (#EDF1F2) | light | 2.86 | 4.5:1 | **FAIL** | channel name text / lane label |
| `--channel-canvas` (#4C8DF5) | --surface-shell (#FFFFFF) | light | 3.26 | 4.5:1 | **FAIL** | channel name text / lane label |
| `--channel-vrtmax` (#2BB673) | --bg-shell (#EDF1F2) | light | 2.29 | 4.5:1 | **FAIL** | channel name text / lane label |
| `--channel-vrtmax` (#2BB673) | --surface-shell (#FFFFFF) | light | 2.61 | 4.5:1 | **FAIL** | channel name text / lane label |

---

## Summary

**Totals: 93 pairs audited · 54 PASS · 39 FAIL · 0 N-A.** The dark (default) theme is nearly clean (5 failing rows, all in two clusters); the light theme fails systematically (34 rows) because the fixed semantic colors are final-intent values tuned against dark backdrops and the design reuses them unchanged on white.

### Failures — Architect follow-up items (flagged only; no values adjusted)

| # | Item | Failing rows (worst ratio) | Minimum change direction (no values proposed) |
|---|---|---|---|
| F-1 | `--text-shell-3` fails on every surface in BOTH themes (dark 2.51–2.82, light 2.65–3.02) | 6 | Dark value needs L* lighter, light value needs L* darker — OR Architect rules 9px column headers/labels as exempt-by-design and accepts the AA miss explicitly. Note: this is the design's own `--t3` intent (mission-control low-key headers); a conforming alternative is pairing it with a ≥4.5:1 hover/focus state or reserving it for non-essential duplicated info. |
| F-2 | Light accent button/tab text: `--accent-shell-fg` #FFFFFF on `--accent-shell` #0D9488 = 3.74 | 1 | Light `--accent-shell` needs L* darker, or light `--accent-shell-fg` needs a dark value instead of white (dark-theme pairing scores 9.02 — the asymmetry is fixable on the fg side alone). |
| F-3 | ALL six status/alert words on light `--surface-shell` (2.21–3.91): draft, ready, approved, danger, warning, negotiation | 6 | The fixed "same in both themes" semantic set cannot meet AA on white at 10.5px. Options for Architect: per-theme semantic values (breaks the "fixed" design rule — needs a design decision), or render status words on their `-bg` chip with a darker text variant, or bold ≥14pt (not viable at this type scale). |
| F-4 | Chip combos: ALL 18 light-theme chips fail (1.52–3.13); dark `--kind-staff` chip fails both backdrops (4.14, 4.44) | 20 | Same-color-on-own-tint is structurally low-contrast: raising the tint alpha makes it WORSE (bg approaches fg). Needs a separate chip *text* color (darker variant of each kind/status color) at least in light theme; dark staff additionally needs its fg slightly lighter or its chip tint reduced. |
| F-5 | ALL six channel-as-text pairs in light theme (2.29–3.68). Additionally, at the *non-text* 3:1 swatch threshold, light `--channel-canvas` on `--bg-shell` (2.86) and `--channel-vrtmax` on `--bg-shell` (2.29) / `--surface-shell` (2.61) still fail | 6 | Channel colors need darker light-theme variants for text use; even swatch-only use of Canvas/VRT MAX misses 1.4.11 on light backdrops. Eén passes swatch use (3.23/3.68). |

### Borderline passes (< 0.3 above threshold — watch at EPIC E light-theme QA)

| Pair | Theme | Ratio | Threshold |
|---|---|---|---|
| `--accent-shell` on `--bg-shell` (non-text) | light | 3.29 | 3:1 |
| `--alert-danger` on `--surface-shell` (CONFLICT word) | dark | 4.76 | 4.5:1 |
| `--status-ready` chip on `--surface-shell-2` | dark | 4.51 | 4.5:1 |
| `--kind-sport` chip on `--surface-shell-2` | dark | 4.51 | 4.5:1 |

### Chip-alpha `22` bounded assumption (docs/ops-token-map.md) — verdict

**No chip failure is caused by the alpha-`22` choice; the assumption stands and the map doc is unchanged.** Verified numerically at the design's alternate `26` alpha (~14.9%): every failing chip fails at both alphas (higher alpha moves the tint toward the fg color and lowers contrast — dark staff drops 4.44→4.34). However, the two borderline dark passes (`--status-ready`/`--kind-sport` chips on `--surface-shell-2`, 4.51 at `22`) **would flip to FAIL at `26` (4.39)** — i.e. `22` is the correct, more conservative reading of "~13%", and any future move to `26` must re-run this audit.

### Scope note

Audit covers token pairs from ops-tokens v1 per the task card. Component-level derived colors that are not yet tokens (rundown block 15%-alpha channel tint, 10% red conflict callout — see map doc "Deliberately NOT tokens") must be audited when B-story tasks introduce them.
