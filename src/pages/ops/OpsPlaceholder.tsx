/**
 * Shared placeholder for unbuilt ops screens (A-2-T1; replaced screen-by-screen
 * in EPICs B–D). Five consumers from day one — shared per the Rule of Three.
 */
// type-only import: erased at compile time, so no runtime pages→components cycle
// (OpsShell imports the screens, which import this file).
import type { OpsTabId } from '../../components/ops/OpsShell'

export function OpsPlaceholder({ tabId, label }: { tabId: OpsTabId; label: string }) {
  return (
    <div
      data-testid={`ops-screen-${tabId}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        fontFamily: 'var(--font-mono)',
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '2px',
        color: 'var(--text-shell-3)',
      }}
    >
      {label} — SCREEN UNDER CONSTRUCTION
    </div>
  )
}
