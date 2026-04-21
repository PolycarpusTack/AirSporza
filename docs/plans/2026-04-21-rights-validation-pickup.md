# Rights Validation — Pickup Notes (2026-04-21)

Checkpoint so the next session can resume without re-reading a full transcript.

## Where we are

### Default-schema rights validation is shipped end-to-end

Four-phase feature landed, then one review pass with five findings fixed. Ten commits on local `main`, ready to push. Pre-session baseline was commit `792f736` (Phase 4 Rights Matrix); the fix-pass starts at `acbcb4e`.

```
b551bde fix(dashboard): restore inline-section defaults, register RightsMatrix
c5c26de fix(dashboard): hide unimplemented widgets from defaults              ← superseded by b551bde
3733284 fix(channels): renumber siblings on reorder so equal sortOrders can't stall
5b0413f fix(cascade): add real /api/cascade/estimates REST fallback
92e42bd fix(schedule): validate() returns fresh results so publish doesn't race state
acbcb4e fix(schedule): CREATE_SLOT persists client id so undo actually undoes
792f736 feat(rights): phase 4 — Rights Matrix panel with runs, expiry, blackouts
584c5b7 feat(rights): phase 3 — rights issues dashboard widget
9f07c62 feat(rights): phase 2 — inline rights badge on planner event cards
b31d4f2 feat(rights): phase 1 — blackout check, DB-backed run counting, API
```

### What the user sees now

| Surface | Behaviour |
|---|---|
| Planner event card | Red or amber rights dot in top-right when an event fails rights validation; tooltip lists validator codes + messages |
| Dashboard (planner role) | `Rights Issues` widget lists events with problems, errors first, click routes to planner |
| Dashboard (contracts role) | `Rights Matrix` widget (same component as /contracts inline) + `Rights Issues` widget |
| `/contracts` page | Rich per-contract matrix (runs used as progress bar, days to expiry, blackouts, severity pill) |
| Publish flow | Fresh validation, blocks on ERROR, confirm dialog listing warnings on WARNING, writes `acknowledgedWarnings` on the version |
| Schedule editor | Undo now propagates inverse ops to server, sync queue stops dropping concurrent ops, CREATE_SLOT persists client UUID so undo targets the right row at publish time |
| Cascade dashboard | Real `/api/cascade/estimates` REST fallback on mount; socket pushes supersede once they flow |
| Channels admin | Up/down buttons renumber siblings 0..N so reorder can't be a no-op |

### New data surfaces

- `Contract.blackoutPeriods Json default []` — array of `{ start, end, reason? }`. Safe to `prisma db push`, no migration needed.
- `POST /api/rights/check?eventId=X[&territory=Y]` — single-event rights probe.
- `POST /api/rights/check/batch?eventIds=…` — batched, max 200, tenant-filtered.
- `GET /api/rights/matrix` — one row per contract, with run counts / expiry / severity rolled up.
- `GET /api/cascade/estimates?courtId=N&date=YYYY-MM-DD` — initial-load backfill for useCascade.
- `routes/cascade.ts` is a new router file mounted at `/api/cascade`.

### New frontend surfaces

- `src/hooks/useRightsCheck.ts` — batched + debounced event rights lookup; 250ms debounce, merge-cache, swallows errors (advisory UI).
- `src/components/planner/RightsStatusBadge.tsx` — small coloured dot on event cards.
- `src/components/dashboard/widgets/RightsIssuesWidget.tsx` — registered as `rightsIssues` in the widget registry.
- `src/components/contracts/RightsMatrixPanel.tsx` — per-contract matrix view; registered as `rightsMatrix` in the widget registry.
- `src/components/dashboard/widgets/registry.tsx` — single source of truth for dashboard widget id → component mapping.

### Backend services extended

- `services/rightsChecker.ts` now exports:
  - `checkRights(input, contracts)` — pure, unchanged signature, new BLACKOUT_PERIOD validator.
  - `checkRightsForEvent(eventId, { db?, territory? })` — DB-backed, season-narrows the candidate query, counts actual RunLedger usage.
  - `checkRightsForEvents(eventIds[])` — sequential batch.
  - `getRightsMatrix(tenantId)` — single GROUP BY for run counts, no N+1.
- 20 unit tests in `backend/tests/rightsChecker.test.ts`.

## Open design decisions — paused for user input

### RightsException overlay for granular outliers

User asked to implement the default schema first, then design for team / athlete / event-level outliers. Design doc is IN the chat history (not yet written to `docs/plans/`):

**Proposed single-table overlay:**

```prisma
model RightsException {
  id         Int      @id @default(autoincrement())
  tenantId   String   @db.Uuid
  contractId Int
  teamId     Int?
  athleteId  Int?     // nullable — becomes FK when/if Athlete entity ships
  eventId    Int?
  mode       String   // "EXCLUDE" | "INCLUDE_ONLY" | "SEPARATE_LIMITS"
  maxLiveRuns Int?
  territory  String[] @default([])
  platforms  String[] @default([])
  reason     String?
  ...
}
```

Rules: candidate contracts resolved as today → apply matching exceptions → `EXCLUDE` drops the contract, `INCLUDE_ONLY` narrows subject, `SEPARATE_LIMITS` overrides per-exception caps.

**Open questions:**
1. Which outlier pattern(s) do you actually hit in production? Team-level is the most common outlier in broadcast rights; athlete-level is heavier (no Athlete entity in Planza today); event-level is the lightest touch.
2. Do we commit to home/away team FK extraction on Event (currently participants is free text)? That unlocks Pattern A cleanly and benefits standings/brackets, but is a data-model rework.

User signal: "team, athletes, event sell their rights separate, so after implementing our 'default' rights schema let's discuss how we do these granular outliers" — design next, implement after approval.

### Dashboard widget id double-duty

Widget ids drive BOTH `/dashboard` tile rendering AND inline sections on the role's main page (`sportTree` in SportsWorkspace, `rightsMatrix` in ContractsView, etc.). That's why a naïve "hide unregistered widgets" default broke fresh `/sports`, `/contracts`, `/admin` pages. Corrected for now by registering `RightsMatrixPanel` as a widget (showing the same component in both places for contracts role).

**Cleanup candidate:** separate the two concerns — dashboard widgets should be distinct ids from inline page-section flags, so visibility toggles don't leak across surfaces. Not urgent.

## Next items from the product review (largest → smallest by effort)

These were on the list before the rights pass and remain open:

1. **RightsException overlay** — per above.
2. **Crew availability / leave / skill matching** — new subsystem. Data model work before any UI.
3. **Renewal workflow + attachments + owner tasks** on contracts — bundle of contract-governance features.
4. **Printable run sheet** — self-contained new route per event. Low coordination, real deliverable.
5. **EPG / playout export formatter** — outbound integration adapters exist; need the XMLTV or similar serializer.
6. **Schedule version compare (diff)** — two published snapshots side by side. Frontend-only if backend returns both snapshots.
7. **Proper rollback to new draft** — the placeholder button in VersionHistoryPanel is disabled with a tooltip. Semantics need a design discussion (additive ops vs. state-replacement vs. clone-as-template).
8. **Real channel-switch execution tracking** — `ChannelSwitchAction` model exists; adapter side needs wiring.
9. **`inputsUsed` tracking for CascadeEstimate** — currently populated but no UI reads it. Future "why did this estimate say X?" surface.

## Apply on pull

Frontend and backend both typecheck clean. On a fresh pull:

```powershell
cd backend
npx prisma db push    # picks up blackoutPeriods column
npm run dev
```

No data migration. Existing contracts default to `blackoutPeriods: []`.

## Gotchas caught during the review pass (for future regression checks)

- **CREATE_SLOT id round-trip** — frontend must mint a real UUID; backend must persist `op.data.id`. Either side alone is not enough. Regression test: create a slot, undo, publish, verify the slot is gone (not a ghost row).
- **validate() return value** — `editor.validate()` returns `Promise<ValidationResult[]>`. Callers that need fresh results *must* use the returned array, not `editor.validationResults` state.
- **Channel reorder normalization** — siblings get contiguous `sortOrder` assigned after every move. Regression test: create three new channels (all default to `sortOrder=0`), reorder, confirm the visible order actually changes.
- **Widget id double-duty** — before toggling any widget visibility default, check `Grep "const show.*=.*w\.id" src/pages` to see which ids drive inline sections.
