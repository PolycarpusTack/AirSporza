/**
 * FmCreateModal — the global "+ NEW" create modal (Story FM1-6, FM1-6-T1).
 * Design: docs/design_handoff_planza_fm/README.md §8b. Contract: this
 * task's hand-off, Contract Snapshot `FmCreateModal v1`.
 *
 * Interfaces contract (Story FM1-6): "thin composition wrapping
 * DynamicEventForm and RegistryCreateModal behind kind tabs; no new
 * mutation logic." This file adds ZERO create/save/validation logic of its
 * own — every field, every submit, every error path belongs to the wrapped
 * component. FmCreateModal's own job is exactly three things: (1) render
 * the outer kind-tab chrome per §8b, (2) map its outer kind to the right
 * wrapped component + props, (3) turn each wrapped component's OWN success
 * callback into the interim-bridge navigation (+ a toast) — nothing else.
 *
 * KIND-TAB WRINKLE (resolved, documented per this story's own "resolved
 * ambiguity" precedent): FM's outer tabs are TRANSMISSION / TEAM / ATHLETE /
 * COMPETITION (§8b) — but `RegistryCreateModal` already owns ITS OWN
 * internal 4-way kind selector (team/player/sport/competition,
 * `RegistryCreateModal`'s own `KIND_OPTIONS`), with no "athlete" (it says
 * "player") and an extra "sport" option FM's outer chrome doesn't have.
 * `RegistryCreateModalProps` exposed no way to seed or restrict that
 * internal state (only `sports`/`onCancel`/`onCreated`). Two options were
 * considered:
 *   (a) render it wholesale, let its own internal tabs win — outer TEAM/
 *       ATHLETE/COMPETITION clicks would all land on the same "team"
 *       internal default, with "PLAYER"/"SPORT" visible as separate,
 *       redundant internal tabs. Rejected: actively misleading (clicking
 *       outer ATHLETE would silently open a TEAM form).
 *   (b) add a minimal, additive, backward-compatible `initialKind?:
 *       RegistryKind` prop to `RegistryCreateModalProps` (defaults preserve
 *       today's behavior when omitted) so FM's outer tab click seeds the
 *       right internal tab. CHOSEN. `RegistryCreateModal.tsx` was touched
 *       for exactly this one optional prop — see its own updated header
 *       comment. Existing callers (`RegistryScreen.tsx`) pass no
 *       `initialKind` and are unaffected; both files' existing test suites
 *       were re-run to confirm zero regression (this task's hand-off notes).
 *   "sport" remains reachable via RegistryCreateModal's own internal tab
 *   row when opened from FM's TEAM/ATHLETE/COMPETITION tabs — filtering it
 *   out would require a DEEPER prop (an allowed-kinds list) than the single
 *   seed this story's reuse mandate calls for ("no new mutation logic",
 *   read here as also bounding new SELECTION logic); left as a known,
 *   accepted interim overlap, not silently hidden.
 *
 * OUTER-VS-INNER CANCEL/CREATE COMPOSITION (resolved): both wrapped
 * components are already COMPLETE, self-contained modals of their own —
 * `DynamicEventForm` renders `ui/Modal` (its own `fixed inset-0` scrim,
 * header, close button, and `SaveFooter`'s own SAVE/CANCEL);
 * `RegistryCreateModal` renders its own `position:fixed; inset:0` backdrop,
 * header, and CANCEL/CREATE buttons. Neither can be de-chromed within this
 * task's touch-list (DynamicEventForm.tsx is explicitly off-limits;
 * RegistryCreateModal.tsx is touchable ONLY for the one additive prop
 * above). Given that, FmCreateModal does NOT render its own duplicate
 * CANCEL/CREATE buttons — a button that doesn't know how to trigger the
 * wrapped form's internal submit would be worse than none. The wrapped
 * component's OWN buttons remain the sole action surface; FmCreateModal
 * only ever reacts to their existing callback props (`onSave`/`onCreated`/
 * `onClose`/`onCancel`), never invents a parallel one.
 * To still deliver §8b's literal "one 540px panel with kind tabs on top",
 * the body container below the tab row sets `transform: translateZ(0)` —
 * a standard CSS technique: a `transform` on an ancestor makes THAT
 * ancestor the containing block for `position: fixed` descendants instead
 * of the viewport. Both wrapped components' own `fixed`/`inset:0` backdrops
 * therefore render CONFINED to this body box, not the full screen — so
 * FmCreateModal's own header + kind-tab row stay visibly pinned above them
 * in one visual shell, without touching either wrapped component's
 * internals. This is a genuine, standard containment technique, not a
 * layout hack — but it IS an interim visual compromise (the wrapped
 * component's own header text — "New Sports Event" / "NEW ENTITY" — still
 * renders as a sub-header inside the body, slightly redundant with the
 * outer kind tabs). Recorded here as a deliberate, reasoned adaptation
 * (mirrors this story's own "Resolved ambiguity" note for the unplaced
 * tray) — a fully seamless single-panel merge would require restructuring
 * one or both wrapped components' own chrome, which is out of this task's
 * FEATURE-hat scope (a PREPARATORY task, if ever wanted).
 *
 * INTERIM-BRIDGE NAVIGATION (Story FM1-6 AC):
 *  - TRANSMISSION success → `/ops/schedule?event=<newId>`. `onSaveEvent`
 *    (this task's prop name for `useApp().handleSaveEvent`, threaded down
 *    by FmShell.tsx — the wiring layer, not this file) is called exactly
 *    as App.tsx's own DynamicEventForm wiring does (no new mutation call
 *    invented) — see its own null-check convention echoed below.
 *  - TEAM/ATHLETE/COMPETITION success → `/ops/registry?record=<kind>:<id>`
 *    via `makeRecordId` (registrySelectors.ts) — verified against the REAL
 *    format `RegistryScreen.tsx`/`useOpsRecord()` already consume
 *    (`opsUrlState.ts`: "`?record=<kind>:<dbId>`"), NOT the story text's
 *    literal bare `<newId>` shorthand.
 *  - Unlike `DynamicEventForm` (closes itself ~600ms after a successful
 *    `onSave`), `RegistryCreateModal` does NOT close itself on success —
 *    per its own header comment, "the screen refreshes/selects/unmounts
 *    this modal" is the CALLER's job. FmCreateModal is that caller here
 *    (mirrors `RegistryScreen.handleCreated`'s own close-on-success
 *    responsibility) — `onClose()` is called explicitly in
 *    `handleRegistryCreated`, but NOT in the transmission path (calling it
 *    there too would double-fire DynamicEventForm's own delayed close).
 *
 * TOAST (judgment call, low-impact per GPM "WHEN UNSURE"): the AC bullets
 * don't literally mandate a toast, but `FmToast.tsx`'s own header comment
 * (FM1-5-T1, already merged) explicitly names "FM1-6 (its create-modal
 * confirmations)" as its second intended caller. Reusing the existing
 * `useFmToast()` here (never inventing a new mechanism) both honors that
 * documented intent and the story's blanket reuse mandate.
 *
 * `eventFields`/`sports`/`onSaveEvent` are received as PROPS, not sourced
 * from `useApp()` inside this file — deliberately, unlike `DynamicEventForm`
 * (which does call `useApp()` itself for legacy-app reasons). This mirrors
 * `RegistryCreateModal`'s own established precedent (props over reaching
 * into context) and keeps this "thin composition" component free of any
 * context-provider coupling — `FmShell.tsx` (the wiring layer) is the one
 * `useApp()` call site, same division of labor `useContinue.ts` already
 * uses for `useFmActionItems()`/`useNavigate()`/`useFmToast()`.
 */
import { useCallback, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Event, FieldConfig, Sport } from '../../data/types'
import { DynamicEventForm } from '../forms/DynamicEventForm'
import { RegistryCreateModal } from '../ops/RegistryCreateModal'
import { makeRecordId, type RegistryKind } from '../ops/registrySelectors'
import { useFmToast } from './FmToast'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

export type FmCreateKind = 'transmission' | 'team' | 'athlete' | 'competition'

const KIND_TABS: { kind: FmCreateKind; label: string }[] = [
  { kind: 'transmission', label: 'TRANSMISSION' },
  { kind: 'team', label: 'TEAM' },
  { kind: 'athlete', label: 'ATHLETE' },
  { kind: 'competition', label: 'COMPETITION' },
]

/** Outer FM kind → RegistryCreateModal's own internal `RegistryKind` (see
 * this file's header comment, "KIND-TAB WRINKLE"). `transmission` never
 * reaches this map (it renders DynamicEventForm instead). */
const REGISTRY_KIND_FOR_FM_TAB: Record<Exclude<FmCreateKind, 'transmission'>, RegistryKind> = {
  team: 'team',
  athlete: 'player',
  competition: 'competition',
}

const scrimStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(9,11,13,.74)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const panelStyle: CSSProperties = {
  width: '540px',
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface-shell)',
  border: '1px solid var(--border-shell)',
  borderRadius: '8px',
  overflow: 'hidden',
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid var(--border-shell)',
}

const titleStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '2px',
  color: 'var(--text-shell-2)',
}

const closeButtonStyle: CSSProperties = {
  ...monoStyle,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-shell-3)',
  cursor: 'pointer',
  fontSize: '14px',
}

const tabsRowStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-shell)',
}

const tabButtonStyle = (isActive: boolean): CSSProperties => ({
  ...monoStyle,
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  padding: '7px 12px',
  borderRadius: 'var(--r-sm)',
  cursor: 'pointer',
  border: isActive ? '1px solid var(--accent-shell)' : '1px solid var(--border-shell)',
  background: isActive ? 'var(--accent-shell)' : 'transparent',
  color: isActive ? 'var(--accent-shell-fg)' : 'var(--text-shell-2)',
})

const bodyContainerStyle: CSSProperties = {
  position: 'relative',
  // See this file's header comment ("OUTER-VS-INNER CANCEL/CREATE
  // COMPOSITION"): `transform` on this ancestor makes it the containing
  // block for the wrapped component's own `position: fixed` backdrop, so
  // it renders confined to this box instead of the full viewport.
  transform: 'translateZ(0)',
  minHeight: '55vh',
  maxHeight: '75vh',
  overflowY: 'auto',
}

export interface FmCreateModalProps {
  /** Passed straight through to DynamicEventForm, unmodified — sourced
   * from `useApp().eventFields` by the caller (FmShell.tsx). */
  eventFields: FieldConfig[]
  /** Passed straight through to RegistryCreateModal, unmodified — sourced
   * from `useApp().sports` by the caller. */
  sports: Sport[]
  /** `useApp().handleSaveEvent`, threaded down by the caller — the ONLY
   * mutation entry point this file uses for the TRANSMISSION tab, same as
   * App.tsx's own existing DynamicEventForm wiring. */
  handleSaveEvent: (ev: Event) => Promise<Event | null>
  /** Closes the whole modal (all kinds) — cancel, ✕, scrim-click, and a
   * successful registry create all route through this one prop. */
  onClose: () => void
}

export function FmCreateModal({ eventFields, sports, handleSaveEvent, onClose }: FmCreateModalProps) {
  const [activeKind, setActiveKind] = useState<FmCreateKind>('transmission')
  const navigate = useNavigate()
  const { show } = useFmToast()

  const handleTransmissionSave = useCallback(
    async (event: Event) => {
      const saved = await handleSaveEvent(event)
      // Same "!saved -> throw" convention App.tsx's own DynamicEventForm
      // wiring already uses — DynamicEventForm's own handleSave wraps this
      // call in a try/catch and surfaces the failure as its OWN error
      // state (saveState = 'error'); this file adds no new handling.
      if (!saved) throw new Error('Save failed')
      navigate(`/ops/schedule?event=${saved.id}`)
      show(`TRANSMISSION created: ${saved.content || saved.participants || 'New transmission'}`)
      // DynamicEventForm closes ITSELF ~600ms after a successful onSave
      // (its own handleSave: `setTimeout(onClose, 600)`) — do not call
      // onClose() here too, that would double-fire it.
    },
    [handleSaveEvent, navigate, show],
  )

  const handleRegistryCreated = useCallback(
    (kind: RegistryKind, id: number) => {
      navigate(`/ops/registry?record=${makeRecordId(kind, id)}`)
      show(`${kind.toUpperCase()} created`)
      // RegistryCreateModal does NOT close itself on success (its own
      // header comment: the host screen's refresh/select/unmount is what
      // retires it) — FmCreateModal is that host here.
      onClose()
    },
    [navigate, show, onClose],
  )

  const handleScrimClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div data-testid="fm-create-scrim" onClick={handleScrimClick} style={scrimStyle}>
      <div data-testid="fm-create-modal" role="dialog" aria-modal="true" style={panelStyle}>
        <div style={headerRowStyle}>
          <span style={titleStyle}>+ NEW</span>
          <button
            type="button"
            data-testid="fm-create-close"
            onClick={onClose}
            aria-label="Close"
            style={closeButtonStyle}
          >
            ✕
          </button>
        </div>

        <div style={tabsRowStyle} role="tablist" aria-label="Create kind">
          {KIND_TABS.map(({ kind, label }) => (
            <button
              type="button"
              key={kind}
              data-testid={`fm-create-tab-${kind}`}
              role="tab"
              aria-selected={activeKind === kind}
              onClick={() => setActiveKind(kind)}
              style={tabButtonStyle(activeKind === kind)}
            >
              {label}
            </button>
          ))}
        </div>

        <div data-testid="fm-create-body" style={bodyContainerStyle}>
          {activeKind === 'transmission' ? (
            <DynamicEventForm eventFields={eventFields} onClose={onClose} onSave={handleTransmissionSave} />
          ) : (
            <RegistryCreateModal
              key={activeKind}
              sports={sports}
              onCancel={onClose}
              onCreated={handleRegistryCreated}
              initialKind={REGISTRY_KIND_FOR_FM_TAB[activeKind]}
            />
          )}
        </div>
      </div>
    </div>
  )
}
