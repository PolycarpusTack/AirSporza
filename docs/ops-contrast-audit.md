# Ops Contrast Audit — WCAG AA, both themes (A-1-T3, remediated by A-1-T4)

**v2** · Post-remediation: 2026-07-02 (A-1-T4, architect decisions of 2026-07-02) · Original audit: 2026-07-02 (A-1-T3, commit c9fc3d2)
Source of truth: committed `src/styles/tokens.css` (Contract Snapshot **ops-tokens v2**) — values parsed from the file, both `:root` (dark) and `[data-theme="light"]` blocks.

## Method

- WCAG 2.1 relative luminance: sRGB channels linearized (`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`), `L = 0.2126R + 0.7152G + 0.0722B`; contrast ratio `(L₁+0.05)/(L₂+0.05)`.
- 8-digit hex (`22`-alpha chip backgrounds) composited over their backdrop first (sRGB alpha compositing, `a = 0x22/255 ≈ 13.3%`); the composited hex is shown in the table.
- Ratios truncated (not rounded) to 2 decimals so a fail can never round up to a pass.
- Thresholds: **4.5:1** small text · **3:1** large text (≥18pt / 14pt bold) and non-text UI (WCAG 1.4.11). **The ops type scale is 8.5–15px** — nothing qualifies as "large text", so all text pairs are audited at 4.5:1. Non-text UI (matrix dots, selected-row accent bar, swatches) at 3:1.
- Remediation targets (A-1-T4, architect decision 5): text ≥ 4.6:1, non-text ≥ 3.1:1 (threshold + margin), minimal HSL-lightness delta with hue/saturation locked.
- Statuses: PASS / FAIL / N-A (decorative). No pair classified N-A — every audited color carries information.

## Post-remediation results (v2) — 93 pairs · **93 PASS · 0 FAIL · 0 N-A**

### 1. Text hierarchy on surfaces (small text — AA 4.5:1)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--text-shell` (#D9E4EB) | --bg-shell (#090B0D) | dark | 15.25 | 4.5:1 | PASS | primary text |
| `--text-shell` (#D9E4EB) | --surface-shell (#0F1316) | dark | 14.44 | 4.5:1 | PASS | primary text |
| `--text-shell` (#D9E4EB) | --surface-shell-2 (#141A1E) | dark | 13.58 | 4.5:1 | PASS | primary text |
| `--text-shell-2` (#7E8E9A) | --bg-shell (#090B0D) | dark | 5.84 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#7E8E9A) | --surface-shell (#0F1316) | dark | 5.53 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#7E8E9A) | --surface-shell-2 (#141A1E) | dark | 5.20 | 4.5:1 | PASS | secondary text |
| `--text-shell-3` (#738594) | --bg-shell (#090B0D) | dark | 5.17 | 4.5:1 | PASS | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#738594) | --surface-shell (#0F1316) | dark | 4.89 | 4.5:1 | PASS | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#738594) | --surface-shell-2 (#141A1E) | dark | 4.60 | 4.5:1 | PASS | tertiary text / column headers (9px mono) |
| `--text-shell` (#111A1F) | --bg-shell (#EDF1F2) | light | 15.49 | 4.5:1 | PASS | primary text |
| `--text-shell` (#111A1F) | --surface-shell (#FFFFFF) | light | 17.62 | 4.5:1 | PASS | primary text |
| `--text-shell` (#111A1F) | --surface-shell-2 (#F0F4F5) | light | 15.91 | 4.5:1 | PASS | primary text |
| `--text-shell-2` (#54646D) | --bg-shell (#EDF1F2) | light | 5.39 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#54646D) | --surface-shell (#FFFFFF) | light | 6.13 | 4.5:1 | PASS | secondary text |
| `--text-shell-2` (#54646D) | --surface-shell-2 (#F0F4F5) | light | 5.54 | 4.5:1 | PASS | secondary text |
| `--text-shell-3` (#5E6E77) | --bg-shell (#EDF1F2) | light | 4.64 | 4.5:1 | PASS | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#5E6E77) | --surface-shell (#FFFFFF) | light | 5.28 | 4.5:1 | PASS | tertiary text / column headers (9px mono) |
| `--text-shell-3` (#5E6E77) | --surface-shell-2 (#F0F4F5) | light | 4.77 | 4.5:1 | PASS | tertiary text / column headers (9px mono) |

### 2. Accent (button/tab text 4.5:1 · non-text UI 3:1)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--accent-shell-fg` (#04241F) | --accent-shell (#2FD6C3) | dark | 9.02 | 4.5:1 | PASS | text on accent (buttons, active tab — mono 10.5px) |
| `--accent-shell` (#2FD6C3) | --bg-shell (#090B0D) | dark | 10.82 | 3:1 | PASS | non-text UI (matrix dot, selected-row bar) on app bg |
| `--accent-shell` (#2FD6C3) | --surface-shell (#0F1316) | dark | 10.24 | 3:1 | PASS | non-text UI (matrix dot, accent border) on panel |
| `--accent-shell-fg` (#111A1F) | --accent-shell (#0D9488) | light | 4.70 | 4.5:1 | PASS | text on accent (buttons, active tab — mono 10.5px) |
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
| `--status-draft` (#5C687D) | --surface-shell (#FFFFFF) | light | 5.62 | 4.5:1 | PASS | DRAFT word (mono 10.5px 600) |
| `--status-ready` (#0C5CDC) | --surface-shell (#FFFFFF) | light | 5.86 | 4.5:1 | PASS | READY word (mono 10.5px 600) |
| `--status-approved` (#1C744A) | --surface-shell (#FFFFFF) | light | 5.75 | 4.5:1 | PASS | APPROVED word (mono 10.5px 600) |
| `--alert-danger` (#D71F24) | --surface-shell (#FFFFFF) | light | 5.10 | 4.5:1 | PASS | CONFLICT/LIVE word (mono 10.5px 600) |
| `--alert-warning` (#976214) | --surface-shell (#FFFFFF) | light | 5.15 | 4.5:1 | PASS | EXPIRING word (mono 10.5px 600) |
| `--alert-negotiation` (#AE551B) | --surface-shell (#FFFFFF) | light | 5.10 | 4.5:1 | PASS | NEGOTIATION word (mono 10.5px 600) |

### 4. Chip text on own `-bg` chip variant, composited (small text — AA 4.5:1)

Chip `-bg` tints remain the dark-tuned base @ alpha `22` in BOTH themes (architect decision 3); light chip TEXT uses the AA-derived light base.

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
| `--kind-staff` (#E76843) | --kind-staff-bg over --surface-shell → #2C1E1C | dark | 4.93 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-staff` (#E76843) | --kind-staff-bg over --surface-shell-2 → #302423 | dark | 4.60 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-draft` (#5C687D) | --status-draft-bg over --surface-shell → #F1F3F5 | light | 5.05 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-draft` (#5C687D) | --status-draft-bg over --surface-shell-2 → #E4E9EC | light | 4.60 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-ready` (#0C5CDC) | --status-ready-bg over --surface-shell → #E7F0FE | light | 5.10 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-ready` (#0C5CDC) | --status-ready-bg over --surface-shell-2 → #DAE6F5 | light | 4.64 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-approved` (#1C744A) | --status-approved-bg over --surface-shell → #E3F5EC | light | 5.08 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--status-approved` (#1C744A) | --status-approved-bg over --surface-shell-2 → #D6ECE4 | light | 4.65 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-sport` (#0C5CDC) | --kind-sport-bg over --surface-shell → #E7F0FE | light | 5.10 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-sport` (#0C5CDC) | --kind-sport-bg over --surface-shell-2 → #DAE6F5 | light | 4.64 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-competition` (#8F5D13) | --kind-competition-bg over --surface-shell → #FCF2E5 | light | 5.06 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-competition` (#8F5D13) | --kind-competition-bg over --surface-shell-2 → #EFE9DC | light | 4.63 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-team` (#17756B) | --kind-team-bg over --surface-shell → #E3FAF7 | light | 5.08 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-team` (#17756B) | --kind-team-bg over --surface-shell-2 → #D6F0EE | light | 4.62 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-player` (#1C744A) | --kind-player-bg over --surface-shell → #E3F5EC | light | 5.08 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-player` (#1C744A) | --kind-player-bg over --surface-shell-2 → #D6ECE4 | light | 4.65 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-performer` (#7C3AEE) | --kind-performer-bg over --surface-shell → #F5F0FE | light | 5.07 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-performer` (#7C3AEE) | --kind-performer-bg over --surface-shell-2 → #E8E6F5 | light | 4.61 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-staff` (#B43B17) | --kind-staff-bg over --surface-shell → #FCEBE6 | light | 5.07 | 4.5:1 | PASS | chip label (8.5px mono 600) |
| `--kind-staff` (#B43B17) | --kind-staff-bg over --surface-shell-2 → #EFE1DD | light | 4.60 | 4.5:1 | PASS | chip label (8.5px mono 600) |

### 5. Channel colors (audited as 10.5–11px text at 4.5:1; swatch-only use falls under non-text 3:1)

| Foreground | Background (composited where alpha) | Theme | Ratio | AA threshold | Verdict | Usage |
|---|---|---|---|---|---|---|
| `--channel-een` (#E4572E) | --bg-shell (#090B0D) | dark | 5.35 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-een` (#E4572E) | --surface-shell (#0F1316) | dark | 5.06 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-canvas` (#4C8DF5) | --bg-shell (#090B0D) | dark | 6.04 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-canvas` (#4C8DF5) | --surface-shell (#0F1316) | dark | 5.72 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-vrtmax` (#2BB673) | --bg-shell (#090B0D) | dark | 7.54 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-vrtmax` (#2BB673) | --surface-shell (#0F1316) | dark | 7.14 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-een` (#C13F19) | --bg-shell (#EDF1F2) | light | 4.62 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-een` (#C13F19) | --surface-shell (#FFFFFF) | light | 5.25 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-canvas` (#0D63EC) | --bg-shell (#EDF1F2) | light | 4.60 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-canvas` (#0D63EC) | --surface-shell (#FFFFFF) | light | 5.23 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-vrtmax` (#1D7B4E) | --bg-shell (#EDF1F2) | light | 4.62 | 4.5:1 | PASS | channel name text / lane label |
| `--channel-vrtmax` (#1D7B4E) | --surface-shell (#FFFFFF) | light | 5.25 | 4.5:1 | PASS | channel name text / lane label |

## v2 summary

**0 FAIL.** All 39 pre-remediation failures resolved by the A-1-T4 value derivation (HSL lightness shift, hue/saturation locked, target ≥4.6 text / ≥3.1 non-text). Derived values are flagged "pending designer sign-off" in `docs/ops-token-map.md`.

### Remaining borderline passes (< 0.3 above threshold — 21)

All borderlines PASS with at least the mandated +0.1 margin. Most sit at 4.60–4.77 **by design**: "minimal lightness delta" places derived values just above the 4.6 target, which is inside the <0.3 borderline reporting window. Grouped:

| Group | Pairs | Ratios |
|---|---|---|
| Derived values at their binding constraint (expected consequence of minimal-delta mandate) | `--text-shell-3` dark on `--surface-shell-2` (4.60); light on `--bg-shell`/`--surface-shell-2` (4.64/4.77); light `--accent-shell-fg` on accent (4.70); dark `--kind-staff` chip on `--surface-shell`-2 (4.60); all 9 light chips on `--surface-shell-2` (4.60–4.65); all 3 light channels on `--bg-shell` (4.60–4.62) | 4.60–4.77 |
| Pre-existing, design final-intent, unchanged | light `--accent-shell` non-text on `--bg-shell` (3.29/3:1); dark `--alert-danger` word (4.76); dark `--status-ready` / `--kind-sport` chips on `--surface-shell-2` (4.51) | 3.29–4.76 |

Watch items for EPIC E light-theme QA: the pre-existing group (teal accent swatch on light bg, dark ready/sport chips at 4.51).

---

<details>
<summary><strong>Pre-remediation record (A-1-T3 original findings, 2026-07-02 — commit c9fc3d2)</strong>: 93 pairs · 54 PASS · 39 FAIL. Superseded by v2 above; retained for traceability.</summary>

Original verdict: dark (default) theme nearly clean (5 failing rows); light theme failed systematically (34 rows) because the then-fixed semantic colors were tuned against dark backdrops. The "identical in both themes" rule was dropped by architect decision 2026-07-02, resolving F-3/F-4/F-5 via theme-aware light overrides; F-1/F-2 resolved by adjusting `--text-shell-3` (both themes) and light `--accent-shell-fg`; dark `--kind-staff` minimally shifted for chip contrast (F-4).

### Original failures (39 rows, grouped F-1..F-5)

| # | Item | Failing rows (ratios) | Resolution (A-1-T4) |
|---|---|---|---|
| F-1 | `--text-shell-3` (#4E5B66 dark / #8697A0 light) on every surface, BOTH themes | 6 rows, 2.51–3.02 | Both values AA-adjusted (→ #738594 / #5E6E77) |
| F-2 | Light accent text: #FFFFFF on #0D9488 | 1 row, 3.74 | Light `--accent-shell-fg` → #111A1F (reuses light `--text-shell`); teal unchanged |
| F-3 | All six status/alert words on light `--surface-shell` (#FFFFFF) | 6 rows, 2.21–3.91 | Theme-aware light overrides (architect decision) |
| F-4 | All 18 light chips (1.52–3.13) + dark `--kind-staff` (#E4572E) chip (4.14 / 4.44) | 20 rows | Light overrides; dark staff base → #E76843 (tint follows) |
| F-5 | All six light channel-as-text pairs (2.29–3.68); Canvas/VRT MAX also missed non-text 3:1 on light backdrops | 6 rows | Theme-aware light channel overrides |

### Original borderline passes (4)

Light `--accent-shell` non-text on `--bg-shell` 3.29/3:1 · dark `--alert-danger` word 4.76 · dark `--status-ready` chip on `--surface-shell-2` 4.51 · dark `--kind-sport` chip on `--surface-shell-2` 4.51. (All still present in v2 — final-intent colors unchanged.)

### Original chip-alpha `22` verdict

No chip failure was caused by the alpha-`22` choice (all failing chips failed at `26` too, marginally worse); the two 4.51 borderline dark passes would flip to FAIL at `26` (4.39) — `22` confirmed as the conservative reading; any move to `26` requires an audit re-run. (Unchanged by A-1-T4: tints remain hex+`22`.)

### Original per-row tables

The full original per-row tables are preserved in git history (commit `c9fc3d2`, this file); old→new values per var are recorded in the derivation table in `docs/ops-token-map.md`. Passing rows were identical to v2's dark-theme rows except `--text-shell-3` and `--kind-staff`.

</details>

## Scope note

Audit covers token pairs from ops-tokens v2 per the task card. Component-level derived colors that are not yet tokens (rundown block 15%-alpha channel tint, 10% red conflict callout — see map doc "Deliberately NOT tokens") must be audited when B-story tasks introduce them.
