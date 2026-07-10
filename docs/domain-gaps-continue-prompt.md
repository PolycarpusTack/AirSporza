# Continue: Domain-Gaps Initiative — Session Kickoff (written 2026-07-02)

> Paste this into a fresh Claude Code session in `C:\Projects\Planza` to resume the
> domain-gaps initiative. Memory file `domain-gaps-initiative` has the same state in short form.

## Where we are

**Initiative:** Domain Gaps (rights depth · schedule volatility · regulatory · resources/labour),
parallel to the ops-redesign initiative (which is separately at A-4 EventInspector).

| Artifact | Path | State |
|---|---|---|
| Research gap analysis | `docs/ops-domain-gap-analysis.md` | final (evidence caveats in §6) |
| Backlog v1.1 | `docs/backlog-planza-domain-gaps.md` | validated; re-refined against ADR-015 |
| ADR-015 (RightsWindow model) | `docs/governance/adr/ADR-015-rights-windows-model.md` | **Accepted 2026-07-02** — read the Acceptance record §1–4 |
| Spike memo + re-refinement triggers | `docs/plans/rd-1-rights-model-spike.md` | done (§5 = re-refinement rationale) |
| Q1 stakeholder packet | `docs/plans/rd-1-q1-stakeholder-questions.md` | ready, **not yet sent** |
| TD-29 (dual rights model) | `docs/governance/debt-register.md` | registered, serviced via RD-6 |

**Execution state:** RD-1 spike ✓ → RD-1F hotfix ✓ **merged to main** (`a4b40bd`, pushed;
branch `fix/rd-1f-maxliveruns-null-semantics` on origin) → **RD-2 is next** (RightsWindow
entity + Exclusivity Tier, tracer slice). RD-2's pull gate (RD-1F merged) is satisfied.

## ⚠️ First: housekeeping (do before RD-2)

1. **The initiative docs above are UNCOMMITTED** in the primary working tree (they were authored
   while the ops-redesign session owned the tree). Commit them on a docs branch
   (e.g. `docs/domain-gaps-initiative`) and merge/PR to main. Watch for a conflict in
   `docs/governance/debt-register.md` — the ops work also edits it on main. Verify what is
   ours vs. the ops session's before staging (our files: the six artifacts above + this file
   + `docs/ops-domain-investigation-prompt.md`).
2. **Backend tests on the main tree need `npx prisma generate` first** — `backend/node_modules`
   lost the generated client at some point on 2026-07-02.

## RD-2 — open decision to settle at DoR (architect)

**Window-overlap 409 semantics.** The RD-2 AC forbids "overlapping identical-category windows"
(409), but ADR-015 made territory/platforms per-window — two same-category windows with
disjoint territories may be legitimate. Proposed definition to confirm or amend:
*overlap = same `category` AND intersecting validity period AND intersecting territory scope
AND intersecting platform scope (empty array = matches everything, per the unrestricted rule).*
Record the decision in the RD-2 story block before pulling RD-2-T1.

Two smaller flags parked earlier: RD-4 "territory" dimension rides on RD-3-T2's event-level
scoping (`Channel` has no territory field — re-check at RD-4 DoR); `MAX_RUNS_NEAR` is a backlog
invention not ratified by ADR-015 (kept, flagged).

## Then: execute RD-2 with the standard flow

1. `backlog-health-advisor` — DoR check on Story RD-2 (post-overlap-decision).
2. `gpm-partner` — execute RD-2-T1 → T2 → T3 in TDD order (**use an isolated worktree,
   branch off main** — the ops session may be active on the primary tree):
   - T1: raw-SQL migration `RightsWindow` + enums (`ALTER TYPE ... ADD VALUE` cannot run in a
     transaction — own statement), RLS policy in the same migration (ADR-011), backfill 1
     window/contract per ADR-015 §1 mapping, rollback script, reconciliation test.
   - T2: nested CRUD under contracts + zod (regenerate full enum sets — fixes CLIP drift,
     register TD-28 incl. run-ledger zod `status` gap), idempotent create, 409 overlap per the
     decided semantics.
   - T3: additive `windows[]` on the rights matrix.
3. Review chain on the diff: `two-hats-enforcer` + smell detectors (real code now, not just a
   hotfix) + `naming-reviewer` (new entity — glossary: Rights Window, Exclusivity Tier,
   Holdback ≠ Blackout) → `test-quality-auditor`.

## Standing constraints (from ADR-015 acceptance + AS-10)

- Empty `territory[]`/`platforms[]` = **unrestricted**; checker v2 (RD-3) adds an INFO
  data-quality note for unscoped windows.
- **VRT is a test/first client** — regulatory/rights specifics are per-tenant configuration,
  never product constants (AS-10; shapes EPIC RC especially).
- Never consume `@deprecated` Event/Contract fields (TD-24). Windows use the lowercase
  channel-type platform vocabulary, NOT the orphaned UPPERCASE `Platform` enum.
- RD-3 (not RD-2) fixes `existingRuns: []` — non-skippable ACs already written; its flag-OFF
  golden master must be recorded against the post-RD-1F baseline (now = main).

## Parked (not tomorrow, don't lose)

- Send the Q1 packet to the VRT stakeholder (informative, not blocking).
- EPIC RC gates: re-verify KPI numbers against the **2026-2030 beheersovereenkomst**; stakeholder
  Q2 (enforcement boundary) → ADR-017.
- EPIC SV gate: cascade-engine debt TD-5/12/13/14 assessment before SV-2+.
- Agent worktree `C:\Projects\Planza\.claude\worktrees\agent-ae95d6efd8ed78bd6` (RD-1F, now
  merged) is disposable — remove when convenient.
