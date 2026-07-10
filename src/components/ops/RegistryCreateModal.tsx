/**
 * RegistryCreateModal — the Registry create modal (C-4-T1, FIRST WRITE PATH).
 * Design: docs/design_handoff_planza_ops/README.md §4 create modal.
 * Contracts: the four *.create services; ApiError (409 = duplicate). Created
 * records send NO externalRefs → SOURCE derives MANUAL server-side → the
 * inspector renders the protected provenance (C-3). DoD-2 scope: right shape
 * sent + right provenance rendered (server sync-protection is not re-proven here).
 *
 * Write-path guarantees:
 * - SINGLE-FLIGHT: an `isSubmittingRef` set synchronously at handler entry drops any
 *   second intent (double-click, Enter+click) BEFORE React re-renders the disabled
 *   button — exactly one request per intent, no idempotency header available.
 * - Empty/whitespace name (or a missing per-kind required field) → NO-OP (no
 *   request; modal stays).
 * - 409 → inline duplicate error, modal stays, fields kept, CREATE re-enabled,
 *   onCreated NOT called. Any other failure → generic inline error, re-enabled.
 * - Success keeps `isSubmitting` true (the screen refreshes/selects/unmounts — no
 *   re-enable flash). Optimistic append is REJECTED: the new row's provenance/
 *   LINKED must come from the server refetch (RegistryScreen handleCreated).
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Sport } from '../../data/types'
import { ApiError } from '../../utils/api'
import { competitionsApi, playersApi, sportsApi, teamsApi } from '../../services'
import type { RegistryKind } from './registrySelectors'

const monoStyle: CSSProperties = { fontFamily: 'var(--font-mono)' }

const KIND_OPTIONS: { kind: RegistryKind; label: string }[] = [
  { kind: 'team', label: 'TEAM' },
  { kind: 'player', label: 'PLAYER' },
  { kind: 'sport', label: 'SPORT' },
  { kind: 'competition', label: 'COMPETITION' },
]

const fieldStyle: CSSProperties = {
  ...monoStyle,
  width: '100%',
  fontSize: '12px',
  padding: '9px 11px',
  background: 'var(--surface-shell-2)',
  border: '1px solid var(--border-shell)',
  borderRadius: '6px',
  color: 'var(--text-shell)',
  boxSizing: 'border-box',
}

// Dialog a11y (E-4 item 2, self-contained focus trap — no new dep, ops-token native
// so it stays clear of ui/Btn|Button per TD-23). jsdom computes no layout, so we
// cannot filter by visibility (offsetParent is always null); the :not([disabled])
// selector is enough for this modal's flat, always-visible field set.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const TITLE_ID = 'ops-create-title'

const labelStyle: CSSProperties = {
  ...monoStyle,
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '1px',
  color: 'var(--text-shell-3)',
  marginBottom: '5px',
  display: 'block',
}

export interface RegistryCreateModalProps {
  sports: Sport[]
  onCancel: () => void
  onCreated: (kind: RegistryKind, id: number) => void
}

export function RegistryCreateModal({ sports, onCancel, onCreated }: RegistryCreateModalProps) {
  const [kind, setKind] = useState<RegistryKind>('team')
  const [name, setName] = useState('')
  const [sportId, setSportId] = useState('')
  const [icon, setIcon] = useState('')
  const [season, setSeason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Synchronous single-flight latch — set before React re-renders the disabled button.
  const isSubmittingRef = useRef(false)

  // Dialog a11y refs: the modal container (focus-trap scope) + the first field to
  // receive initial focus. The trigger (`+ NEW`) is captured on open so focus can
  // return to it on close (return-focus contract).
  const modalRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    nameInputRef.current?.focus() // initial focus INTO the modal (first field)
    return () => trigger?.focus?.() // return focus to the opener on close
  }, [])

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const modal = modalRef.current
    if (!modal) return
    const focusables = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (event.shiftKey) {
      if (active === first || !modal.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last || !modal.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  const trimmedName = name.trim()
  const hasRequiredFields =
    trimmedName.length > 0 &&
    (kind === 'team' ||
      (kind === 'player' && sportId !== '') ||
      (kind === 'sport' && icon.trim() !== '') ||
      (kind === 'competition' && sportId !== '' && season.trim() !== ''))

  const selectKind = (next: RegistryKind) => {
    setKind(next)
    setError(null)
  }

  const createForKind = (): Promise<{ id: number }> => {
    switch (kind) {
      case 'team':
        return teamsApi.create({ name: trimmedName })
      case 'player':
        return playersApi.create({ fullName: trimmedName, sportId: Number(sportId) })
      case 'sport':
        return sportsApi.create({ name: trimmedName, icon, federation: '' })
      case 'competition':
        return competitionsApi.create({ sportId: Number(sportId), name: trimmedName, season })
    }
  }

  const handleSubmit = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault()
    if (isSubmittingRef.current) return // single-flight
    if (!hasRequiredFields) return // empty/whitespace name or missing required field → no-op

    isSubmittingRef.current = true
    setIsSubmitting(true)
    setError(null)
    try {
      const created = await createForKind()
      // keep isSubmitting true — the screen refreshes/selects/unmounts this modal.
      onCreated(kind, created.id)
    } catch (caught) {
      isSubmittingRef.current = false
      setIsSubmitting(false)
      if (caught instanceof ApiError && caught.status === 409) {
        setError(caught.message || 'A record with those details already exists')
      } else {
        setError('Could not create the record. Please try again.')
      }
    }
  }

  return (
    <div
      data-testid="ops-create-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={modalRef}
        data-testid="ops-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onKeyDown={handleDialogKeyDown}
        style={{
          width: '430px',
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--surface-shell)',
          border: '1px solid var(--border-shell)',
          borderRadius: '10px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div id={TITLE_ID} style={{ ...monoStyle, fontSize: '10px', fontWeight: 600, letterSpacing: '2px', color: 'var(--text-shell-2)' }}>
            NEW ENTITY
          </div>
          <button
            type="button"
            data-testid="ops-create-close"
            onClick={onCancel}
            aria-label="Close"
            style={{ ...monoStyle, background: 'transparent', border: 'none', color: 'var(--text-shell-3)', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
          </button>
        </div>

        {/* kind chips (radio behavior) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {KIND_OPTIONS.map(({ kind: option, label }) => {
            const isActive = kind === option
            return (
              <button
                type="button"
                key={option}
                data-testid={`ops-create-kind-${option}`}
                aria-pressed={isActive}
                onClick={() => selectKind(option)}
                style={{
                  ...monoStyle,
                  fontSize: '9px',
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  padding: '6px 10px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  color: isActive ? `var(--kind-${option})` : 'var(--text-shell-3)',
                  background: isActive ? `var(--kind-${option}-bg)` : 'transparent',
                  border: isActive ? '1px solid var(--kind-' + option + ')' : '1px solid var(--border-shell)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* fields */}
        <form data-testid="ops-create-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle} htmlFor="ops-create-name-input">
              NAME
            </label>
            <input
              ref={nameInputRef}
              id="ops-create-name-input"
              data-testid="ops-create-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Record name"
              style={fieldStyle}
            />
          </div>

          {(kind === 'player' || kind === 'competition') && (
            <div>
              <label style={labelStyle} htmlFor="ops-create-sport-input">
                SPORT
              </label>
              <select
                id="ops-create-sport-input"
                data-testid="ops-create-sport"
                value={sportId}
                onChange={(event) => setSportId(event.target.value)}
                style={fieldStyle}
              >
                <option value="">Select a sport…</option>
                {sports.map((sport) => (
                  <option key={sport.id} value={sport.id}>
                    {sport.icon} {sport.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === 'sport' && (
            <div>
              <label style={labelStyle} htmlFor="ops-create-icon-input">
                ICON
              </label>
              <input
                id="ops-create-icon-input"
                data-testid="ops-create-icon"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder="🏅"
                style={fieldStyle}
              />
            </div>
          )}

          {kind === 'competition' && (
            <div>
              <label style={labelStyle} htmlFor="ops-create-season-input">
                SEASON
              </label>
              <input
                id="ops-create-season-input"
                data-testid="ops-create-season"
                value={season}
                onChange={(event) => setSeason(event.target.value)}
                placeholder="2026"
                style={fieldStyle}
              />
            </div>
          )}

          {/* MANUAL provenance note */}
          <div
            data-testid="ops-create-manual-note"
            style={{ ...monoStyle, fontSize: '9px', fontWeight: 500, letterSpacing: '0.5px', color: 'var(--text-shell-3)', lineHeight: 1.5 }}
          >
            CREATED RECORDS ARE SOURCE: MANUAL · PROTECTED FROM SYNC OVERWRITE
          </div>

          {error && (
            <div
              data-testid="ops-create-error"
              style={{ ...monoStyle, fontSize: '10.5px', fontWeight: 500, color: 'var(--alert-danger)' }}
            >
              {error}
            </div>
          )}

          {/* actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
            <button
              type="button"
              data-testid="ops-create-cancel"
              onClick={onCancel}
              style={{
                ...monoStyle,
                fontSize: '10.5px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--border-shell)',
                background: 'transparent',
                color: 'var(--text-shell-2)',
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              data-testid="ops-create-submit"
              disabled={isSubmitting || !hasRequiredFields}
              style={{
                ...monoStyle,
                fontSize: '10.5px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--accent-shell)',
                color: 'var(--accent-shell-fg)',
                cursor: isSubmitting || !hasRequiredFields ? 'not-allowed' : 'pointer',
                opacity: isSubmitting || !hasRequiredFields ? 0.6 : 1,
              }}
            >
              CREATE
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
