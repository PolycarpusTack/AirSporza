# EPIC RD — Phase Summary (2026-07-11): Rights Depth tracer bullet COMPLETE

> Initiative: `docs/backlog-planza-domain-gaps.md` · Mode: DELIVERY · Decision of record: `docs/governance/adr/ADR-015-rights-windows-model.md`
> Tracer bullet: schema → checker → validation stage → API → frontend selector. Flag `rightsWindows` (build-time, TD-27).

## What was built (all seven stories in the RD-1..RD-5 arc; RD-6 scoped, RD-7/RD-8 raised)

- **RD-1 (SPIKE → ADR-015 Accepted, 2026-07-02).** RightsWindow as a child table of Contract; RightsPolicy dispositioned **deprecate** (RD-6); enum = `CoverageType` + `ARCHIVE`; `ExclusivityTier { EXCLUSIVE, NON_EXCLUSIVE, OPEN_NET }`; empty `territory[]`/`platforms[]` = unrestricted + INFO note; C2 answered (stage 3 resolves windows **from Contract**, not the policy DTO). Two live defects surfaced → (a) split out as RD-1F, (b) folded into RD-3 with non-skippable ACs. TD-29 registered with a deprecate servicing path; Q1 packet sent as *informative, not blocking* (AS-4). RD-2..RD-5 ACs re-refined against the accepted ADR the same day.
- **RD-1F (HOTFIX, merged `a4b40bd`).** `maxLiveRuns: null` no longer coerced to `0` in the `loadRightsPolicies → policyToContractShape` chain and `checkRights`: null/absent = no limit (check skipped), `0` = genuine limit, positive unchanged. Unflagged defect fix, landed **before** RD-2 so RD-3's flag-OFF golden master pins correct null-semantics rather than the defect.
- **RD-2 (PR #15, `aaf316f`).**
  - T1 (PREP): raw-SQL migration — `RightsWindow` table + `ExclusivityTier` enum + `ARCHIVE` added to `CoverageType` (`ALTER TYPE … ADD VALUE` sequenced outside the tx block) + `tenant_isolation` RLS + backfill (exactly one window per existing contract, ADR-015 §1 field mapping, `exclusivity NON_EXCLUSIVE`) + rollback. Cross-package enum regen (Prisma + shared union + zod) that also fixed the pre-existing `CLIP` API-reject drift. Backfill reconciliation test: matrix totals pre == post, null scalars preserved (RD-1F semantics).
  - T2 (FEATURE): nested CRUD under `contracts` + `rightsWindowsApi`; **pure 4-way overlap-409 predicate** (two windows overlap IFF same `category` AND intersecting validity AND intersecting territory AND intersecting platform; empty[] = unrestricted → intersects every scope) per the architect decision (2026-07-10); idempotent create (client UUID, retry → 200 same row). **TD-28 registered** here.
  - T3 (FEATURE): additive `windows[]` on `getRightsMatrix` (existing fields untouched — ops B-3 consumer unaffected).
  - Snapshots produced: **`rights-window v1`**, **`rights-matrix v2`**.
- **RD-3 (PR #16, `29ecebd`) — Core Domain, max rigor.**
  - T1 (FEATURE): pure window-aware **`checkRights` v2** — window resolution by run intent/segment, holdback math with the ADR-015 §4 live-end resolution order (ledger actual `endedAtUtc` → scheduled end → INFO note, never guess), per-window/per-category run limits. New codes: `WINDOW_CATEGORY_MISSING` (WARNING), `HOLDBACK_VIOLATION` (ERROR), and three distinct INFO codes `WINDOW_UNSCOPED` / `NO_WINDOWS` / `HOLDBACK_LIVE_END_UNKNOWN` (per the RD-3 DoR refinement — one collapsed "INFO note" was un-testable). Legacy scalar path preserved behind an explicit `windowsEnabled` **param** (pure fn never reads env); frozen-message golden master.
  - T2 (FEATURE): wired into draft validate/publish behind `RIGHTS_WINDOWS_ENABLED`; `ValidationContext` gains `contracts` (loaded with `rightsWindows` included) alongside legacy `rightsPolicies`, and the slot query now includes `channel` so platform checks go live; per-category RunLedger tally. **Defect-(b) fix (non-skippable):** draft validation's `existingRuns` is populated **from the RunLedger query**, not the hardcoded `[]` — with a negative proof that a forced `[]` regresses the suite. CONFIRMED run fixtures seeded directly via Prisma (the API's zod `status` enum can't create counted states — TD-28 constraint). Flag OFF = post-RD-1F baseline **byte-identical**.
  - Snapshot produced: **`rights-checker v2`**.
- **RD-4 (PR #17, `e6ec688`).**
  - T1 (FEATURE): `GET /rights/check-slots?channelId=&date=` — checker v2 per slot, ADR-009 pagination, event-less slots → INFO `SLOT_EVENT_MISSING`, unresolvable events → `SLOT_EVENT_UNRESOLVED` (never silently dropped).
  - T2 (FEATURE): `rightsApi.checkSlots` + pure `deriveSlotRightsStatus(results): 'CLEAR'|'WARNING'|'VIOLATION'` selector living in a domain-service module (anti-smart-ui), no UI changes.
  - Snapshot produced: **`slot-rights v1`** — the designated consumption point for the ops Rundown/Schedule screens (their backlog, not this one).
- **RD-5 (committed `b607bc1`, branch `feature/RD-5-smoke-runbook` — not yet pushed/merged).** Gated tracer smoke: seed contract → add DELAYED window with holdback → draft a delayed slot inside the holdback → `POST /schedule-drafts/:id/validate` returns `HOLDBACK_VIOLATION` (flag ON) → `check-slots` reflects it → flag OFF → post-RD-1F golden master passes. Runbook `docs/runbooks/rights-windows.md` (flag-off = legacy path; symptoms + rollback = redeploy, stated honestly per TD-27).

## Key decisions of record

- **ADR-015 (Accepted):** RightsWindow child-of-Contract; RightsPolicy → deprecate (RD-6, TD-29); `CoverageType`+`ARCHIVE`; holdback live-end resolution order; RunType→category mapping (TAPE_DELAY→DELAYED, CONTINUATION excluded, ARCHIVE has no RunType yet).
- **Overlap-409 = 4-way predicate** (category ∧ validity ∧ territory ∧ platform; empty = unrestricted). Chosen over "category+validity only" and "category only" — both would reject legitimate disjoint multi-market windows.
- **Defect-(b) fix folded into RD-3** with non-skippable ACs so drafts provably consult the RunLedger — could not silently drop out during implementation.

## Snapshots produced (published to the ops backlog owner as integration points)

`rights-window v1` · `rights-matrix v2` · `rights-checker v2` · `slot-rights v1`.

## Review-chain catches (process value — recorded, all resolved)

The review chain (two-hats-enforcer → smell/naming → ubiquitous-language-guard → test-quality-auditor) caught six defects that green tests alone would have shipped:

1. **Out-of-hat zod widening** in a PREPARATORY task — a runtime behavior change smuggled into schema work; **reverted** and deferred to TD-28's own story (Two Hats held).
2. **Holdback NaN bypass** — an unresolved live-end produced `NaN` that silently compared false (no violation); replaced with the explicit `HOLDBACK_LIVE_END_UNKNOWN` INFO branch.
3. **Hollow golden master** — the legacy-parity snapshot asserted on a computed placeholder, not the real emitted strings; **rebuilt to freeze the actual messages**.
4. **A flag that couldn't be turned OFF** — `z.coerce.boolean()` treats any non-empty string as `true` (the `"false"` footgun), so `RIGHTS_WINDOWS=false` still ran the ON path; replaced with an explicit parse. Flag-off parity is a DoD gate, so this was load-bearing.
5. **Cross-tenant idempotent-echo leak** — an idempotent create retry echoed a row across a tenant boundary; scoped the uniqueness/lookup to `tenantId`.
6. **False all-clear on unresolvable events** in check-slots — slots whose event couldn't be resolved returned `ok: true`; changed to the explicit `SLOT_EVENT_UNRESOLVED` INFO entry.

## Two RD-retro refinements (raised as named backlog items, not invisible debt)

1. **Slot-level coverage-category source (→ Story RD-7, Should / M).** `BroadcastSlot` has **no coverage-category column**, so real slots resolve to `runIntent = LIVE`. Consequence: DELAYED/HIGHLIGHTS/CLIP holdback and per-window enforcement built in RD-3 is **checker CAPABILITY, not reachable from real slots** today. The per-category tally **isolation is real and tested**; what is missing is the input that routes a real published slot to a non-LIVE window. Reaching non-LIVE enforcement needs this source (derive from `Event.contentSegment`/`RunLedger.runType`, or a new explicit `BroadcastSlot.coverageCategory` — decided at RD-7).
2. **Slot/channel-level territory (→ Story RD-8, Could / S).** `Channel` has **no territory field** (ADR-015 Acceptance record §3), so territory checking stays **event-level**. Per AS-10 this is per-tenant rights-dimension configuration, not a product constant; reaching slot-level territory needs a `Channel.territory` (or slot override) source.

## Honest holdback-reachability caveat

The EPIC's headline capability — "validate a delayed rerun against its own right" — is **proven and tested through synthetic run-intent fixtures and the RD-5 smoke**, but is **not yet reachable from a real published schedule** because real slots carry no coverage category (refinement 1). RD-3's enforcement is correct and isolated; it is gated on RD-7 to fire on production data. This is stated so no one mistakes green checker tests for live non-LIVE enforcement.

## Debt movements

- **TD-28** (zod ↔ Prisma enum drift) — **registered** at RD-2-T2. Partially serviced (the new window write surface validates the full `CoverageType`+`ExclusivityTier` set; the `CLIP` contract-write drift fixed in the same cross-package regen). Remaining: contract/policy `coverageType`+`status` and run-ledger `status` drift — left to its own tested story (may be picked up opportunistically in RD-6, one Hat).
- **TD-29** (dual rights model + lossy adapter) — **registered**; servicing = **RD-6** (now DoR-ready, this retro). Interest is HIGH; the flag-OFF adapter path still carries the lossy round-trip until RD-6 deletes it.
- **TD-30** (dead `ACCESSIBILITY_MISSING` stub) — untouched by RD; superseded by RC-2.

## Metrics / flow

- **Backend vitest: 498 pass.** tsc clean across backend / shared / frontend.
- **Flag OFF byte-identical to the post-RD-1F baseline** (golden-master regression suite) — the core DoD gate held on every validation-pipeline change.
- **Rework:** one out-of-hat revert (review catch #1), five in-flight defect fixes from the review chain — all caught pre-merge, no post-merge rework. No budget breaches; no task exceeded its token/LOC ceiling (RD-3-T1 the largest, a bounded pure-fn extension).
- **Waste signals:** RD-5 sits committed-but-unmerged on a branch (partially-done work at the outward-facing edge — see below); no extra features, no context loss (snapshots + ADR carried hand-offs cleanly).

## Remaining / next

- **Housekeeping (outward-facing):** push + merge `feature/RD-5-smoke-runbook` to main, and record the `rightsWindows` flag posture per environment. Until then EPIC RD is code-complete but not fully on main.
- **RD-6** (RightsPolicy deprecation) is now DoR-ready — see backlog. It is a **one-way door** (deletes the flag-OFF fallback); gated on RD-5 merged + a decision to run `rightsWindows` ON everywhere.
- **RD-7 / RD-8** refinements recorded (NOT READY — gated on Q1 + AS-10 tenant-config framing).
- **Mode check:** stays **DELIVERY** — nothing observed argues for down-shifting; RC is regulated/compliance-bearing (max rigor), RD-6 is a Core-Domain migration.
- **Next EPIC:** see the retro entry in backlog §9 and the recommendation summary — RC-0 people-work should run as the long-pole gate; SV-1 SPIKE is the immediately code-ready step (its "RD retro complete" pull gate is now satisfied).
