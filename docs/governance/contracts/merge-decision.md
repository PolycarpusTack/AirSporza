# CONTRACT SNAPSHOT: merge-decision

Version: 1 · Date: 2026-07-09 · Task: D-3-T0 (backend guard) + D-3-T1 (UI write path) · consumers: SyncScreen MergeCardView · smoke: D-4

The SYNC merge-review decision write path — the initiative's SECOND write surface
(IRREVERSIBLE merge decisions on canonical records). Endpoint mapping + single-flight
+ the idempotency/error contract actually available.

## Decision → endpoint mapping (VERIFIED against services/imports.ts + mergeCandidates.ts)

| UI action | Service call | Route | Terminal status (route) | design `decided` value |
|---|---|---|---|---|
| **APPROVE MERGE** | `importsApi.approveMergeCandidate(id, suggestedEntityId)` | POST `/import/merge-candidates/:id/approve-merge` (validates `mergeDecisionSchema` body) | `approved_merge` | `'merged'` |
| **KEEP SEPARATE** | `importsApi.createMergeCandidateEntity(id)` | POST `/import/merge-candidates/:id/create-new` | `create_new` | `'kept'` |
| ~~ignore~~ | — | — | — | NOT surfaced in SYNC v1 (legacy ImportView retains it) |

- APPROVE passes the card's `suggestedEntityId` as `targetEntityId`; the button is
  DISABLED (create-only) when `suggestedEntityId === null` — never a dead merge button.
- Both success responses resolve `{ message, candidate, event }`. The UI only needs the
  promise to resolve — it marks the decision terminal locally (no field read required).

## Idempotency (D-3-T0 backend guard — AS-7 fix)

- Each decision route now guards `candidate.status !== 'pending'` → **HTTP 409**
  `{ status: 'fail', message: 'Merge candidate has already been decided (<status>)' }`,
  BEFORE re-running the merge/create. This closes the AS-7 duplicate-event hazard
  server-side (multi-operator races / stale cards): a repeat `create-new` can no longer
  create a second canonical event; a repeat `approve-merge` no longer re-runs the merge.
- The service throws `ApiError(409, message)`; the UI treats ANY decision rejection
  (409 included — its message is human-readable) as an inline error + re-enable.

## UI guarantees (D-3-T1 — SyncScreen MergeCardView)

1. **Single-flight (per card):** a SYNCHRONOUS `isSubmittingRef` latch drops a 2nd intent
   (double-click / Enter+click) BEFORE React re-renders the disabled buttons — EXACTLY ONE
   request per user intent (registry-create v1 precedent). The `disabled` prop is a
   secondary visual guard only. (Unit-tested by two same-tick native clicks in one `act()`,
   which isolates the ref as the sole guard.)
2. **Terminal replacement:** on success the parent records `decided[id]` and the footer
   buttons are REPLACED by a right-aligned mono status line — `✓ MERGED INTO REGISTRY`
   (`--status-approved`) / `KEPT AS SEPARATE RECORDS` (`--text-shell-2`) — no live buttons
   remain (not re-decidable in-view). testid `ops-sync-decision-status`.
3. **Badge decrement:** the SYNC tab badge = `candidates.filter(c => c.status === 'pending'
   && !decided[c.id]).length` — decrements as `decided` grows. `pendingCandidateCount`'s
   selector contract is unchanged (decided cards stay VISIBLE in-view with their terminal
   line; only the badge drops). No refetch — `useSyncData.refresh()` is OPTIONAL background
   reconcile, deliberately NOT auto-wired (C-5 no-socket precedent).
4. **Failure path:** a rejection renders a quiet inline error (`ops-sync-decision-error`,
   the `ApiError.message`), RE-ENABLES both buttons, RELEASES the single-flight latch (a
   user-initiated retry fires again — still single-flight), and leaves the badge unchanged.

## Depends-on

- **D-3-T0** backend 409 guard (`backend/src/routes/import/mergeCandidates.ts`) +
  `mergeCandidates-decide-guard.test.ts` (anti-duplicate not-called assertions).
- **sync-selectors v1.2** (`deriveMergeCard` supplies `suggestedEntityId` + the create-gate)
  · **useSyncData v1** (`candidates`) · **OpsShell v1.1** (`useSetTabBadge` — badge decrement).

## Found-work / debt (TEXT — debt-register has uncommitted parallel-session edits)

- The D-3-T0 409-guard block is repeated inline ×3 (Rule of Three now met) — a candidate
  `assertPending(candidate)` backend helper if a 4th decision route ever appears; left
  inline to keep the PREP additive.
- SYNC surfaces no `ignore` decision (design's 2-button footer); the legacy ImportView
  retains ignore. Reconciled at the EPIC E cutover.
