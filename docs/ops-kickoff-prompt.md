# Session kickoff prompt — Ops redesign EPIC A

Paste the block below into a fresh Claude Code session in `C:\Projects\Planza`.

---

Start EPIC A of the Ops redesign.

Context (read in this order, don't re-derive):
1. `docs/backlog-planza-ops-redesign.md` — the backlog. EPIC A is the tracer bullet; ADR-012/013/014 are accepted; story A-1 and A-2 are DoR-READY.
2. `docs/design_handoff_planza_ops/README.md` — design tokens + screen specs (source of truth for values).
3. `docs/governance/adr/ADR-013-ops-theming.md` — the theming decision A-1 implements.

Process (DELIVERY mode, per CLAUDE.md):
- Create branch `feature/A-1-ops-theme-tokens` off main.
- Run the `backlog-health-advisor` agent on story A-1 as the DoR gate.
- Execute **A-1-T1** with the `gpm-partner` agent as a ZAP (template in `.claude/frameworks/gpm-v2.1.md` §Phase 2): extend `src/styles/tokens.css` with the Ops palette — dark values + `[data-theme="light"]` overrides + fixed semantic sets (status/alert/channel/kind) as variables. TDD order: style-contract test first. Deliverables per the backlog task card, including `docs/ops-token-map.md` and the `ops-tokens v1` contract snapshot.
- Pull gate before writing: confirm no existing component reads a variable being repurposed (grep `tokens.css` var usages).
- Review chain on the diff: `two-hats-enforcer` → `naming-reviewer` → `test-quality-auditor`.
- If A-1-T1 completes clean, continue to **A-1-T2** (ThemeProvider + `useOpsTheme` + persistence + FOUC guard) under the same flow, then **A-1-T3** (contrast audit — report failures, don't adjust design colors).
- Commit per task (`feat(ops): ...`), update the backlog task statuses, and record any shortcut as a TD item in `docs/governance/debt-register.md`.

Stop and ask only if a pull gate fails or an AC conflicts with the codebase; otherwise run A-1 to completion and report: tasks done, test results, snapshot produced, and anything the contrast audit flagged.

---

After A-1: next is A-2 (Ops shell + routing + `opsRedesign` flag) on branch `feature/A-2-ops-shell`; same flow.
