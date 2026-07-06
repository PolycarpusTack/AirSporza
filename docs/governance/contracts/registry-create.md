# CONTRACT SNAPSHOT: registry-create

Version: 1 · Date: 2026-07-06 · Task: C-4-T1 (the initiative's FIRST WRITE PATH) · consumer: RegistryScreen

The Registry create modal — manual creation of a record (all four kinds) with
server-implied MANUAL provenance. Pure component + the four `*.create` services;
the screen orchestrates the post-create refresh/select.

## Public interface

```ts
// src/components/ops/RegistryCreateModal.tsx
export interface RegistryCreateModalProps {
  sports: Sport[]                                   // for the player/competition sport <select>
  onCancel: () => void                              // ✕ / CANCEL / backdrop-click
  onCreated: (kind: RegistryKind, id: number) => void  // fired ONCE on a successful create
}
export function RegistryCreateModal(props: RegistryCreateModalProps): JSX.Element
```

## Per-kind create (verified against the zod schemas — user decision: all 4 kinds, per-kind fields)

| kind | service | payload sent | required modal fields |
|---|---|---|---|
| team | `teamsApi.create` | `{ name }` | name |
| player | `playersApi.create` | `{ fullName: name, sportId: Number(sportId) }` | name + sport select |
| sport | `sportsApi.create` | `{ name, icon, federation: '' }` | name + icon |
| competition | `competitionsApi.create` | `{ sportId: Number(sportId), name, season }` | name + sport select + season |

NO `externalRefs` is ever sent → the server leaves `externalRefs {}` / `isManaged false`
→ SOURCE derives `MANUAL` (registry-selectors) → the inspector renders
`MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE`. DoD-2 honesty: the UI proves
"right shape sent + right provenance rendered", NOT the server's sync-protection.

## Semantics (normative — write tests to these)

1. **Single-flight (DoD).** A synchronous `isSubmittingRef` latch is set at handler
   entry and checked FIRST — so a genuine same-tick second intent (double-click,
   Enter+click; both take the `type="submit"` form path) is dropped before React
   re-renders the disabled button. There is NO idempotency header on any create
   endpoint, so this UI latch is the guarantee: exactly one request per intent.
   (The `disabled={isSubmitting || !hasRequiredFields}` button is a secondary
   layer. Both are unit-pinned — the ref via direct `fireEvent.submit(form)` that
   bypasses the disabled button.) A network retry can still create a server-side
   duplicate, which then surfaces on the 409 path below.
2. **Empty/whitespace name → NO-OP** (no request; modal stays). Ditto a missing
   per-kind required field. Pinned at BOTH the button (disabled) and the handler
   (`if (!hasRequiredFields) return`) layers.
3. **Success:** `*.create` resolves `{ id }`; the modal calls `onCreated(kind, id)`
   and keeps `isSubmitting` true (the screen unmounts it — no re-enable flash).
4. **Duplicate (409):** the backend (C-4-T0) returns `ApiError { status: 409,
   message: '<kind> … already exists' }`. The modal detects `caught instanceof
   ApiError && caught.status === 409` → inline duplicate error (server message),
   modal STAYS OPEN, fields KEPT, no row appended, `onCreated` NOT called, CREATE
   re-enabled (`isSubmittingRef` reset). Do NOT guess other statuses.
5. **Any other failure → generic** inline error ('Could not create the record.
   Please try again.'), CREATE re-enabled. Errors render mono in `var(--alert-danger)`.
6. **Post-create orchestration (RegistryScreen `handleCreated`, pin 4 — no
   optimistic append):** `await refresh()` → `setQuery('')` → `setFacet('all')` →
   `setRecordId(makeRecordId(kind, id))` → close the modal. Provenance/LINKED come
   from the server refetch, never an optimistic row.

## Design

Centered 430px card over an `rgba(0,0,0,.55)` backdrop (backdrop-click closes);
`NEW ENTITY` + ✕; kind chips (radio, `--kind-*` tint on the active one); NAME input;
per-kind fields; the `CREATED RECORDS ARE SOURCE: MANUAL · PROTECTED FROM SYNC
OVERWRITE` note; CANCEL + accent CREATE. `role="dialog"`, `aria-modal`,
`aria-pressed` chips, labelled inputs.

## testids

`ops-create-backdrop` · `ops-create-modal` · `ops-create-close` ·
`ops-create-kind-{team|player|sport|competition}` · `ops-create-form` ·
`ops-create-name` · `ops-create-sport` · `ops-create-icon` · `ops-create-season` ·
`ops-create-manual-note` · `ops-create-error` · `ops-create-cancel` ·
`ops-create-submit`.

## Depends on

The four `*.create` services (`src/services/*`), `ApiError` (`src/utils/api`),
`makeRecordId` + `RegistryKind` (registry-selectors), `useRegistryData.refresh` +
`useOpsRecord.setRecordId` (RegistryScreen wiring), C-4-T0 (P2002→409 backend),
ops-tokens v3 (`--kind-*`, `--alert-danger`).

## Known limitations (recorded)

- **Cancel-during-submit:** CANCEL is not disabled while a create is in flight; if
  the user cancels mid-request, the (already-succeeded) POST still resolves and
  `onCreated` selects the created record. Defensible — the record genuinely exists
  server-side — but noted for E-2.
- **Sport creation needs `icon`; `federation` is sent as `''`** (schema allows it).
  The design's name-only modal grew per-kind fields (user decision) — E-2 designer note.

## Domain terms used

Record, Kind, Provenance→SOURCE (MANUAL), Create (backlog §4 + §EPIC C).
