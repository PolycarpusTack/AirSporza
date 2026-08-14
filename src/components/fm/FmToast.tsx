/**
 * FmToast — the FIRST toast component in the FM initiative (Story FM1-5,
 * FM1-5-T1). Sibling to the legacy `src/components/Toast.tsx` (`useToast`) —
 * NOT a reuse: FM has its own dark ops-shell-token visual language (bottom-
 * center, mono, teal-on-#141A1E) that the legacy toast (top-right, Tailwind
 * semantic colors, icon rows) doesn't share, and the story's own Interfaces
 * note calls this out explicitly as a new module, not an extension of the
 * legacy one. Also reused by FM1-6 (its create-modal confirmations) — built
 * as its own module now since two real callers already exist within this
 * EPIC (Story FM1-5 Interfaces note), not a speculative extraction.
 *
 * Spec: docs/design_handoff_planza_fm/README.md, "Interactions & Behavior" —
 * "Toast: bottom-center, #141A1E bg, teal border/text, mono 10.5px, ~2.6s,
 * slide-up 250ms ease-out." Colors/radius/font via ops-tokens v3 vars
 * (`--surface-shell-2`, `--accent-shell`, `--font-mono`, `--r-sm`) — never
 * hex (FmShell v1's own header rule, still in force here).
 *
 * API shape (documented for FM1-6's reuse):
 *   <FmToastHost> is mounted ONCE, at the FM shell level (FmShell.tsx). It
 *   owns toast state/timing and provides `useFmToast(): { show(message) }`
 *   to any descendant via context. A caller rendered with no <FmToastHost>
 *   ancestor never throws — the context default is a no-op (mirrors
 *   FmNavBadgeContext's convention, fmNavBadges.ts).
 *   Only one toast is shown at a time — a new `show()` call replaces the
 *   current message and restarts the ~2.6s timer (last call wins; no
 *   queueing). Both of this EPIC's real callers (CONTINUE's advance(),
 *   FM1-6's create-modal confirmation) fire single, standalone
 *   announcements, never bursts, so queueing would be speculative.
 *
 * Keyframes are injected via a scoped <style> tag rather than added to
 * fm.css, so this module stays fully self-contained for FM1-6's reuse
 * without requiring every future importer to also pull in fm.css.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

const TOAST_DURATION_MS = 2600

export interface FmToastApi {
  show: (message: string) => void
}

const FmToastContext = createContext<FmToastApi>({ show: () => {} })

/** Default is a no-op (mirrors FmNavBadgeContext's convention) — a caller
 * rendered without a <FmToastHost> ancestor never throws, it just publishes
 * into the void. */
export function useFmToast(): FmToastApi {
  return useContext(FmToastContext)
}

const FM_TOAST_KEYFRAMES =
  '@keyframes fm-toast-slide-up { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }'

const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: '24px',
  transform: 'translateX(-50%)',
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
  padding: '9px 16px',
  borderRadius: 'var(--r-sm)',
  background: 'var(--surface-shell-2)',
  border: '1px solid var(--accent-shell)',
  color: 'var(--accent-shell)',
  zIndex: 1000,
  animationName: 'fm-toast-slide-up',
  animationDuration: '250ms',
  animationTimingFunction: 'ease-out',
  animationFillMode: 'forwards',
}

interface FmToastHostProps {
  children?: ReactNode
}

export function FmToastHost({ children }: FmToastHostProps) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idSeqRef = useRef(0)

  const show = useCallback((message: string) => {
    idSeqRef.current += 1
    const id = idSeqRef.current
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setToast({ id, message })
    timeoutRef.current = setTimeout(() => {
      // Guard: only clear if this timer's own toast is still the current one
      // (a later show() already replaced it and owns its own timer).
      setToast((prev) => (prev?.id === id ? null : prev))
    }, TOAST_DURATION_MS)
  }, [])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const api = useMemo<FmToastApi>(() => ({ show }), [show])

  return (
    <FmToastContext.Provider value={api}>
      <style>{FM_TOAST_KEYFRAMES}</style>
      {children}
      {toast && (
        <div data-testid="fm-toast" role="status" style={toastStyle}>
          {toast.message}
        </div>
      )}
    </FmToastContext.Provider>
  )
}
