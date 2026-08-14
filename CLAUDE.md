# Planza — Claude Code Project Guide

## Active initiative
**Planza/FM** — Football-Manager-style scheduling shell unifying legacy + Ops into one interface
(8 screens: Home/inbox, Schedule board, Season calendar, Competitions, Team/Athlete profiles,
Crew, Match Day). Design handoff: `docs/design_handoff_planza_fm/README.md` +
`IMPLEMENTATION_PLAN.md`. Backlog: TBD (validate + generate per the plan's Phase 0–5 sequencing).
Status (2026-08-14): design handed off, backlog generation not yet started.
Execution mode: **DELIVERY** (full governance per `.claude/frameworks/core-specification-v1.md`):
tests before implementation, one Hat per task (FEATURE | REFACTORING | PREPARATORY), feature
flags for user-facing changes, shortcuts recorded in `docs/governance/debt-register.md`.

**Prior initiative (CLOSED 2026-07-10):** Ops redesign (5 screens) — backlog:
`docs/backlog-planza-ops-redesign.md`. All EPICs A–E complete incl. retros; the Ops shell FM
now builds on top of and is slated to eventually retire (per the FM plan's Phase 5.3, gated on
an ops-stakeholder taste-test — mirrors the SV EPIC's FEED=review gate).

## Key references
- ADRs: `docs/governance/adr/` (shell/theming/deep-linking foundation from the Ops redesign, reused
  by FM: ADR-012 flagged shell, ADR-013 theming, ADR-014 deep-linking)
- Domain glossary for ops work: `docs/backlog-planza-ops-redesign.md` §4 — enforced in code names.
  Notable: the day-timeline screen is **Rundown** in code (never "Planner" — that name belongs to
  the existing `PlannerView`).
- Ops UI rule: derived logic lives in pure selectors (`src/**/ops/selectors*`), not components;
  consume `Contract.platforms[]` and `BroadcastSlot` — never `@deprecated` Event/Contract fields.
  FM reuses these selectors per its own plan's "Reuse before build" principle.

## Subagents (.claude/agents/)
`gpm-partner` (execute backlog tasks, TDD order) · `backlog-builder` (extend/refine the backlog) ·
`backlog-health-advisor` (DoR check before starting a story) · `tdd-practitioner` ·
`two-hats-enforcer` · `fowler-smell-detector` · `code-smell-detector` · `naming-reviewer` ·
`ubiquitous-language-guard` · `test-quality-auditor`.
Typical flow per task: backlog-health-advisor (story DoR) → gpm-partner (execute) → review chain
(two-hats-enforcer → smell detectors → naming-reviewer) → test-quality-auditor.

## Guardrails (.claude/guardrails/)
Consult before refactoring or when scope questions arise: `anti-refactoring-without-tests`,
`anti-duplication` (Rule of Three), `anti-scope-creep`, `anti-smart-ui`.
