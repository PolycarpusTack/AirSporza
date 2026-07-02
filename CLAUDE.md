# Planza — Claude Code Project Guide

## Active initiative
Ops redesign (5 screens) — backlog: `docs/backlog-planza-ops-redesign.md`.
Execution mode: **DELIVERY** (full governance per `.claude/frameworks/core-specification-v1.md`):
tests before implementation, one Hat per task (FEATURE | REFACTORING | PREPARATORY), feature
flags for user-facing changes, shortcuts recorded in `docs/governance/debt-register.md`.

## Key references
- ADRs: `docs/governance/adr/` (ops redesign: ADR-012 flagged shell, ADR-013 theming, ADR-014 deep-linking)
- Domain glossary for ops work: backlog §4 — enforced in code names. Notable: the day-timeline
  screen is **Rundown** in code (never "Planner" — that name belongs to the existing `PlannerView`).
- Ops UI rule: derived logic lives in pure selectors (`src/**/ops/selectors*`), not components;
  consume `Contract.platforms[]` and `BroadcastSlot` — never `@deprecated` Event/Contract fields.

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
