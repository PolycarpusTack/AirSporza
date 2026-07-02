/**
 * Ops theme switching (A-1-T2, ADR-013).
 * Contract: docs/governance/contracts/useOpsTheme.md (useOpsTheme v1).
 * Upstream: ops-tokens v1 — flipping `data-theme="light"` on <html> swaps the nine
 * `-shell` CSS vars; legacy screens do not consume them and are inert to the toggle.
 *
 * Rendered only inside the ops shell (mounted by A-2's flag-gated <OpsShell>).
 * The theme swap is CSS-variable-only: one attribute flip, no per-component state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type OpsTheme = 'dark' | 'light'

const STORAGE_KEY = 'planza.opsTheme'

/** Stored preference, defaulting to dark for absent/unknown/unreadable values (ADR-013). */
function readStoredTheme(): OpsTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark' // storage unavailable → session-only theming
  }
}

/** Dark = attribute absent (tokens.css `:root` defaults); light = data-theme="light". */
function applyTheme(theme: OpsTheme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

function persistTheme(theme: OpsTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // storage unavailable → keep toggling for the session, surface nothing (ADR-013)
  }
}

/*
 * FOUC guard (ADR-013 "pre-hydration attribute set"): runs when this module is
 * evaluated — the ops shell is a lazy route, so evaluation happens when the ops
 * chunk loads, strictly before React renders any ops content. Legacy screens never
 * load this chunk (and are shell-var-inert anyway), so no index.html script is needed.
 * Deliberately only ADDS the attribute: absent preference must leave <html> untouched.
 */
if (readStoredTheme() === 'light') {
  applyTheme('light')
}

interface OpsThemeContextType {
  theme: OpsTheme
  toggle: () => void
}

const OpsThemeContext = createContext<OpsThemeContextType | null>(null)

export function OpsThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<OpsTheme>(readStoredTheme)

  // Layout effect so the attribute is on <html> before the browser paints,
  // both on mount (backstop to the module-scope guard) and after toggle().
  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Persisting here (not in the updater or the effect) keeps state updaters pure
  // (StrictMode double-invokes them) and avoids writing a "dark" preference the
  // user never expressed on first mount.
  const toggle = useCallback(() => {
    const next: OpsTheme = theme === 'dark' ? 'light' : 'dark'
    persistTheme(next)
    setTheme(next)
  }, [theme])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])

  return <OpsThemeContext.Provider value={value}>{children}</OpsThemeContext.Provider>
}

export function useOpsTheme(): OpsThemeContextType {
  const ctx = useContext(OpsThemeContext)
  if (!ctx) {
    throw new Error('useOpsTheme must be used within the ops shell <OpsThemeProvider>')
  }
  return ctx
}
