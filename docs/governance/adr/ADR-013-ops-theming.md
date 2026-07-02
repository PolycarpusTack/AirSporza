# ADR-013: Theming via data-theme CSS-variable override on the existing token layer

**Status:** Accepted (2026-07-02)

## Context

The Ops design requires a dark default plus a full light palette with a per-user toggle.
Today the app is dark-only: `src/styles/tokens.css` has a single `:root` block, and
`tailwind.config.ts`'s `darkMode: ['class']` is unwired (nothing toggles a class). The design
handoff mandates mapping its palette onto Planza's existing CSS-variable token system rather
than hard-coding hex in components. Alternatives considered:

1. **Second token system for ops** (`--ops-*` vars). Rejected: two sources of truth, drifts
   from the handoff's instruction to extend `--surface/--text/--border` families.
2. **Tailwind `dark:` class variants per component.** Rejected: doubles every class list,
   defeats the token layer already in place.
3. **`data-theme` attribute overriding the existing CSS variables.** Chosen.

## Decision

- `tokens.css` remains the single token source. Ops palette values extend the existing
  variable families; light values live under a `[data-theme="light"]` selector overriding the
  same variable names. Fixed semantic sets (status/alert/channel/registry-kind colors) become
  named variables too, identical in both themes.
- `ThemeProvider` (`useOpsTheme`) sets/removes `data-theme="light"` on `<html>`; preference
  persists in `localStorage` key `planza.opsTheme`; a pre-hydration guard prevents FOUC.
  Absent/unreadable storage degrades to session-only toggling.
- Components never hard-code hex. Any exception requires a debt-register entry.
- Server-side persistence (settings service) is a later enhancement, not part of EPIC A.

## Consequences

- Light theme is effectively global capability: existing screens keep working because they
  only ever see the dark defaults until they opt in with light-value coverage; the A-1
  contrast audit gates the ops surfaces specifically.
- Unused `darkMode: ['class']` config remains cosmetic; not repurposed (attribute strategy
  chosen over class to avoid colliding with any future Tailwind dark-variant use).

## Review date

EPIC E (light-theme QA across all five screens), or 2026-10-02.
