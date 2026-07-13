# RC-0-T1 — Beheersovereenkomst KPI re-verification checklist

> **Purpose (AS-1 gate):** every RC KPI number Planza will encode is currently cited from the **2021-2025**
> beheersovereenkomst. The 2026-2030 agreement was signed July 2025 and **supersedes** it. No RC acceptance
> criterion referencing a KPI number is final until re-verified here. Fill the "2026-2030 verified" + "delta"
> columns from the current agreement text (with article reference), then flag every changed number to the RC-2/RC-3
> ACs. This is people-work (needs the agreement text); the table + the downstream-impact mapping are pre-built so
> the verification itself is a fill-in-the-blanks pass.
>
> **Access note (RC-0-T1 DoR C1):** if the 2026-2030 text is not accessible, escalate to the stakeholder
> immediately and record here which numbers could not be verified — do NOT let a 2021-25 value ship as "verified".

## KPI table — FILL the last three columns

| # | KPI (Planza encoding) | 2021-2025 cited value | Cited in / claim | **2026-2030 verified value** | **Δ vs cited** | Affects |
|---|---|---|---|---|---|---|
| K1 | **T888 subtitling coverage** | **99%** of Dutch-language programming | gap analysis §; AS-1 | _[FILL — % + article]_ | _[same / changed→]_ | RC-2 deliverable targets; RC-3 T888 KPI |
| K2 | **Online subtitling coverage** | **≥90%** of catch-up/online | AS-1 | _[FILL]_ | _[  ]_ | RC-2; RC-3 online-subtitle KPI |
| K3 | **Audio description (AD) scope** | "AD expansion" (qualitative — quantify) | AS-1 | _[FILL — hours/titles/% + article]_ | _[  ]_ | RC-2 AD deliverable requirement; RC-3 |
| K4 | **VGT (Flemish Sign Language) scope** | _(not separately cited — confirm if in scope)_ | gap analysis (deliverable set) | _[FILL — is VGT a mandated deliverable? scope]_ | _[  ]_ | RC-2 deliverable *set* per event |
| K5 | **Sports breadth** | **32 sports** covered | AS-1 | _[FILL — count + article]_ | _[  ]_ | RC-3 remit breadth aggregation |
| K6 | **Sporza audience share** | **30%** share | AS-1 | _[FILL — % + article]_ | _[  ]_ | RC-3 remit target (if encoded) |
| K7 | **Women's / G-sport output** | _(gap analysis flags per-sport/women's/G-sport — confirm targets)_ | glossary "Remit Coverage" | _[FILL — targets if any]_ | _[  ]_ | RC-3 per-category remit targets |
| K8 | **Open-net / exclusivity restraint wording** | qualitative (open-net obligation) | ties to RD Exclusivity Tier `OPEN_NET` | _[FILL — exact obligation wording]_ | _[  ]_ | RC remit logic consuming `OPEN_NET`; RD interplay |

## Downstream impact — what a changed number touches

- **RC-2 (Accessibility Deliverables)** — K1/K2/K3/K4 set which deliverables are *required* per event type and the
  KPI thresholds the aggregation reconciles against. A changed % or an added/removed deliverable changes RC-2's AC
  thresholds and the deliverable *set*.
- **RC-3 (Remit Coverage)** — K1/K2/K5/K6/K7 are the aggregation targets. Changed numbers change RC-3's target
  constants (which per AS-3/AS-10 must be **tenant-configurable data, not hardcoded** — so a change is a config
  edit, not a code change, but the *default* values must be correct).
- **Listed events (RC-1)** — not KPI-driven (it's the besluit 2004 list, AS-3); **not gated by this checklist**.
  RC-1 proceeds independently.

## Procedure

1. Obtain the 2026-2030 beheersovereenkomst text (stakeholder/legal).
2. For each K#, record the current value + the exact **article/section reference** in the "verified" column.
3. Mark Δ: `same` (green — the cited value holds) or `changed → <new>` (flag).
4. For every `changed`, open the affected RC-2/RC-3 AC and update the number (or its config default). Record the
   edit in the Assumptions Ledger (AS-1 row → resolved, with date + article refs).
5. Any number that could not be verified → list it explicitly as **unverified**, escalate, and do NOT freeze the
   dependent AC.

## Output (RC-0-T1 hand-off)

- This table completed → appended to the backlog **Assumptions Ledger** (AS-1 resolved).
- A list of changed numbers → flagged to RC-2/RC-3 ACs (unblocks RC-2/RC-3 DoR).
- Unblocks **RC-0-T2** (ADR-017 severity decision) and the RC-2/RC-3 AC freeze.
