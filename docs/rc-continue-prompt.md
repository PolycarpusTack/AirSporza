# Continue: Domain-Gaps Initiative — Session Kickoff (updated 2026-07-22: RC-2 COMPLETE)

> **2026-07-22 UPDATE — supersedes the "FIRST THING" section below.** Story RC-2 is DONE on
> `feature/RC-2-accessibility`: T1 `775a77b` (model+migration+defaulting hook), T2 `473ca36`
> (state machine + accessibilityApi + KPI, snapshot `accessibility v1`), T3 `6910ff7`
> (`ACCESSIBILITY_UNPLANNED` + TD-30 stub removal + golden-master regen). Each task ran the full
> review chain with fixes applied. Backend 650 pass / 38 skipped, backend+root tsc clean,
> frontend 838 pass. Debt: TD-30 SETTLED; **TD-31 registered** (import-path event creates don't
> seed deliverables — service within EPIC RC); **TD-32 registered** (frontend ApiError discards
> structured 409 body — service with first UI consumer). **Open architect decisions:** (A)
> lifecycle undo/backward transitions not modelled; (B) T888 per-event override locked to config
> policy; (C) KPI targets global config vs per-tenant; (D) `ACCESSIBILITY_UNPLANNED` severity +
> lead-time N=14 provisional pending ADR-017/ops. **Next:** RC-2 PR merge decision, then RC-0
> people-work (KPI verify RC-0-T1, ADR-017 session RC-0-T2, seed-list RC-0-T3) and/or RC-3
> (HELD) / RC-4 — see "Standing open threads" below (still accurate).

> Paste into a fresh Claude Code session in `C:\Projects\Planza` to resume. The auto-memory
> `domain-gaps-initiative` has the same state in short form. **Execution mode: DELIVERY, full
> governance** (per CLAUDE.md + `.claude/frameworks/core-specification-v1.md`): DoR re-gate per
> story (backlog-health-advisor), TDD RED-first, one Hat per task, the review chain on every task
> (two-hats-enforcer + test-quality-auditor + code-smell-detector + naming-reviewer +
> ubiquitous-language-guard), architect gates surfaced via decisions, check in at story/EPIC
> boundaries. Delegate execution to `gpm-partner`; review its output before committing.

## ⚠️ FIRST THING ON RESUME — RC-2-T1 is COMPLETE + green, UNCOMMITTED

**RC-2-T1 (AccessibilityDeliverable migration + defaulting hook) finished cleanly** (backend
vitest **551 pass**, tsc clean, prisma valid) — its output is **UNCOMMITTED in the working tree**
on branch `feature/RC-2-accessibility`. It is NOT partial. `git status` shows:
- `backend/prisma/migrations/20260714120000_add_accessibility_deliverables/` (migration.sql + rollback.sql)
- `backend/prisma/schema.prisma`, `packages/shared/types.ts` (M — model + AccessibilityType/Status enum unions)
- `backend/src/routes/events.ts` (M — defaulting hook: `createMany` defaults after the two `tx.event.create` sites, `skipDuplicates`, additive)
- `backend/src/config/accessibility.ts` (?? — `T888_EXCLUDED_SPORT_IDS` empty `TODO-KPI` set + pure `defaultAccessibilityDeliverables`)
- `backend/tests/accessibilityDefaults.test.ts` (5 pure), `backend/tests/accessibilityDeliverable.test.ts` (8 gated), `backend/tests/events.test.ts` (M — tx mock)

**Resume path:** re-verify (`cd backend && npx prisma generate && npx tsc --noEmit && npx vitest run` → expect 551 pass, gated accessibility tests skip), then run the **review chain** on the RC-2-T1 diff (two-hats: the defaulting hook must be additive / no behavior change to event/slot writes; test-quality: structural + defaulting-MECHANISM not "legally correct", RLS read+write+owner-bypass; naming/ubiquitous on AccessibilityDeliverable/Type/Status) → apply fixes → **commit RC-2-T1**. (Model shape: `AccessibilityDeliverable` id/tenantId/eventId(CASCADE)/type/status/updatedBy?/timestamps, unique(eventId,type), RLS. Hook: T888→REQUIRED unless sport in the empty `TODO-KPI` exclusion set, AD/VGT→NOT_REQUIRED.) If for any reason it's broken, the spec to re-run is in the backlog (Story RC-2 §634, DoR READY `f3c8284`).

RC-2-T1 spec recap: `AccessibilityDeliverable` (id, tenantId, eventId FK **ON DELETE CASCADE**, `type` [T888|AUDIO_DESCRIPTION|VGT], `status` [NOT_REQUIRED|REQUIRED|PLANNED|CONFIRMED|DELIVERED], updatedBy?, timestamps), **unique(eventId,type)**, RLS `tenant_isolation`. Defaulting hook on event-create: **T888→REQUIRED** unless the event's sport is in the config exclusion set (→NOT_REQUIRED); AD/VGT→NOT_REQUIRED. Exclusion set read from config, **provisional `TODO-KPI` default (empty = all REQUIRED)**, verified via RC-0-T1 as a config edit. Additive — no behavior change to events/slots.

## Where the whole initiative stands

**All on `main` (PRs #14–#22):**
- **EPIC RD (Rights Depth) — COMPLETE.** RightsWindow model+CRUD+matrix (#15), window-aware checker v2 + holdback + defect-(b) fix behind `RIGHTS_WINDOWS_ENABLED` (#16), `/rights/check-slots`+selector (#17), smoke+runbook+retro (#18). Snapshots: rights-window/matrix/checker v2, slot-rights v1. Honest caveat: non-LIVE holdback is checker capability not reachable from real slots (needs **RD-7** slot coverage-category source).
- **EPIC SV — HELD.** SV-1 spike + **ADR-019** accepted (#19); SV-2+ blocked on **AS-8** cascade debt (TD-5/12/13/14 → CASCADE_PREVIEW_PARITY).
- **EPIC RC — underway.** RC-0 prep (#21: **ADR-017** enforcement-boundary OPTIONS draft [Proposed — for the stakeholder session] + `docs/plans/rc-0-kpi-verification-checklist.md` + staging-flag runbook §Rollout). **RC-1 (Listed Events) — COMPLETE (#22)**: ListedEventCategory + Event.listedCategoryId + Channel.isFreeToAir; suggest/confirm/dismiss (never auto-bind); stage-4 `LISTED_EVENT_FTA` (provisional WARNING) behind `REGULATORY_COMPLIANCE_ENABLED`. Snapshot listed-events v1.

**Baselines:** backend vitest ~546 pass on main; tsc clean (backend/shared/frontend); both feature flags ship **OFF** (byte-identical to baseline, golden masters prove it).

## After RC-2-T1 — finish RC-2, then the RC-2 boundary checkpoint

- **RC-2-T2** (FEATURE): lifecycle state machine `REQUIRED→PLANNED→CONFIRMED→DELIVERED` (or NOT_REQUIRED), each transition audited + optimistic expected-current-status guard (409 on skip); `accessibilityApi` (list/setRequirement/transition/kpi); **KPI aggregation endpoint** (coverage % per type over a period, reconciles 1:1 with raw rows, **target read from config — provisional `TODO-KPI`, not a hardcoded 99%**). Snapshot `accessibility v1`.
- **RC-2-T3** (FEATURE): stage-4 `ACCESSIBILITY_UNPLANNED` check (configurable lead-time N days; REQUIRED deliverable not ≥PLANNED within N → WARNING) + **remove the dead `ACCESSIBILITY_MISSING` stub** (`validation/regulatory.ts:58-69`; verified NO consumers — grep clean, backend definition only) in the same FEATURE Hat (TD-30 settled); flag-gated + flag-off golden master.
- Then push the RC-2 PR + **checkpoint** (like the RC-1 boundary).

## Standing open threads (architect decisions — surface, don't auto-pick)
1. **RC-0 people-work** (prepped, yours to run): the ADR-017 enforcement-boundary session (sets final severities for RC-1-T3/RC-2-T3), the RC-0-T1 KPI re-verification (fills the checklist → config values), and **RC-0-T3** (verify the RC-1 besluit-2004 seed list). All land as config/data edits, no deploy.
2. **Prod flag rollout** — architect chose staging-ON for `RIGHTS_WINDOWS_ENABLED` (runbook §Rollout; the env-var set + redeploy is a deploy-pipeline action, not done here). Prod flip gates **RD-6**.
3. **SV** — service the AS-8 cascade debt to unblock SV-2 (feed→RippleProposal), when chosen.
4. **RD-6** (RightsPolicy deprecation, DoR-ready, one-way door — needs prod flag-ON first) · **RD-7** (slot coverage-category source — unlocks non-LIVE holdback).
5. **RC-3** stays HELD — genuine second gate (Q4 reporting-consumer, AS-6), not just KPI numbers.

## Conventions / guardrails
- Branch `feature/[STORY-ID]-slug`; commits `type(scope): summary` + the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer; squash-merge PRs, delete branch.
- The **DoR-refinement pattern** (used for RD-3, RC-1, RC-2): when an AC asserts a value we can't verify (legal list, KPI number), don't block — build the mechanism flag-off with a `TODO-LEGAL`/`TODO-KPI` config marker + a people-work verification gate (RC-0-T1/T3), tests assert the MECHANISM not the value.
- Flags are build-time (TD-27, rollback=redeploy); parse `env` flags as `z.string().optional().transform(v => v === 'true')` (NEVER `z.coerce.boolean` — it makes `"false"` true).
- Anonymised fixtures (no real crew/person names); RLS `tenant_isolation` on every new tenant table (ADR-011).
