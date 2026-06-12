# Planza — Definition of Done (Global)

_Source: Core Specification v1 §3 · Mode: DELIVERY · Calibrated for a solo developer (Core §5.1) · Effective: 2026-06-12_

A task is **done** when every box below is checked. No box, no done — a documented exception requires a TD item in [`debt-register.md`](./debt-register.md).

## Checklist

- [ ] **Tests written first (Red → Green → Refactor), all passing.**
  Tests are the specification, not an after-the-fact gate. Characterization tasks (PREPARATORY hat) pin *current* behavior instead — zero `src/` diffs.
- [ ] **New logic runs against a database in CI (not just typechecks).** *(project-specific)*
  The evaluation's core finding: "done" had meant "typechecks", producing schema and routes never applied to any DB (Teams Phases 0–2). Until A-2-T4 lands the CI Postgres service container, run against a disposable local Postgres and say so in the commit body.
- [ ] **No hardcoded secrets, tokens, or credentials.**
  CI adds a new secrets surface (ASM in backlog §1) — GitHub Actions secrets only, never `.env` in repo.
- [ ] **Lint and format clean** (both workspaces; backend typecheck runs from `backend/`, frontend uses `tsc -b --force`).
  Stale `tsbuildinfo` lies; force it.
- [ ] **New logic has ≥ 80% unit test coverage.**
  Applies to new/changed logic, not retroactively to legacy files (those carry TD items instead).
- [ ] **Contract tests pass for any external integration** (import adapters, webhooks, integration pushes).
  External APIs change without warning; the contract test is the tripwire.
- [ ] **Feature flag declared for user-facing changes.**
  Solo dev has no staging gatekeeper — the flag *is* the rollback plan.
- [ ] **No new technical debt without a corresponding TD item.**
  Debt is visible or it compounds (Core P4). A shortcut without a register entry didn't happen.
- [ ] **Hand-off artifacts present for downstream tasks** (Contract Snapshots per Core §4.1).
  The next session — or the next agent — starts from the snapshot, not from re-reading source.
- [ ] **No pattern duplicated from a previous task without extraction** (Rule of Three).
  First time do it, second time wince, third time extract.
- [ ] **Domain Glossary terms used consistently** ([`domain-glossary.md`](./domain-glossary.md)).
  Membership not assignment; Team vs Canonical Team; Planza not Sporza.
- [ ] **Integration Note present** (plain-language business context).
  Solo calibration: one paragraph in the commit/PR body suffices — what changed, for whom, why now.

## Solo-developer calibrations (Core §5.1)

- No required PR reviews; a green CI run substitutes for a second pair of eyes.
- Documentation-only tasks carry minimal ceremony: the doc *is* the output (anti-bureaucracy test).
- Maximum rigor is never reduced for: database changes, security (field visibility, RBAC, RLS), or CI — high blast radius, hard to reverse.
