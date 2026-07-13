# ADR-017: Regulatory enforcement boundary (Planza vs traffic/playout)

**Status:** **Proposed — options for the RC-0-T2 enforcement-boundary session** (drafted 2026-07-13).
Acceptance requires the stakeholder session (Q2); this document frames the decision so that session is
a *choice between prepared options*, not a blank page. Nothing here is decided.

## The question (Q2)

For each regulatory check class, **where does Planza's responsibility end and the traffic/playout/EPG
layer's begin?** Concretely, what does Planza *do* when it detects a regulatory shortfall at planning time —
one of three postures **per check class**:

| Posture | Code severity | Effect | Meaning |
|---|---|---|---|
| **VALIDATE** | ERROR | **blocks publish** | Planza is the enforcement point — a violating schedule cannot be published. |
| **ANNOTATE** | WARNING | visible, does **not** block | Planza surfaces the obligation; the human/downstream layer owns the fix. |
| **RECORD** | INFO / none | recorded only | Planza notes it; enforcement lives entirely downstream (traffic/playout). |

This decision sets **every severity in EPIC RC** (AS-2) and confirms/lifts the **G13** (ad-break) deferral.

## Context / constraints (from the gap analysis + ADRs)

- **Legal obligations bind VRT (the broadcaster), not the tool** (gap analysis §6.5). Planza's *default* posture
  is **validate + annotate, never silently block** (AS-2) until this ADR says otherwise.
- **VRT is a test/first client, not the product** (AS-10 / ADR-010): the enforcement boundary is likely
  **per-tenant configuration**, not a product constant — a stricter broadcaster could opt into ERROR where VRT
  wants WARNING. Recommend the boundary be **modelled as configurable severity per check class**, with the VRT
  configuration decided here as the first instance.
- **Publish is hard to reverse once a schedule goes live** (Core §5.1) — arguing for caution before making any
  check a hard ERROR block.
- Planza already has the insertion point: the 5-stage validation pipeline (stage 4 = regulatory).

## Check classes + options + recommendation

### A. Listed-events full-live-FTA (`LISTED_EVENT_FTA`, RC-1)
A Flemish "event of major importance" (besluit 28 May 2004) scheduled without a full, live, free-to-air slot.

- **Option A1 — VALIDATE (ERROR, blocks publish).** Planza guarantees no listed event publishes without FTA cover.
  *For:* strongest compliance stance. *Against:* Planza becomes the single enforcement chokepoint; a data gap
  (mis-tagged channel FTA, unconfirmed listed match) would false-block legitimate publishes; the obligation is on
  VRT's overall carriage, which Planza cannot fully see (a listed event may be covered by another channel/outlet
  not in this schedule).
- **Option A2 — ANNOTATE (WARNING) [RECOMMENDED default].** Planza flags the shortfall prominently at planning
  time; the compliance officer confirms coverage or fixes. Matches AS-2, avoids false-blocks on incomplete data,
  keeps VRT the accountable party. *For:* visible-not-silent, no false chokepoint. *Against:* relies on humans to
  act on the warning.
- **Option A3 — RECORD (INFO).** Too weak for a legal obligation of this weight — not recommended.
- **Recommendation:** **A2 (WARNING)**, configurable to A1 per tenant. Revisit to ERROR only if the stakeholder
  wants Planza to be the hard gate AND the FTA/listed data quality is proven.

### B. Accessibility deliverables (`ACCESSIBILITY_MISSING`/successor, RC-2)
An event missing a required access service (T888 subtitling / audio description / VGT).

- **Option B1 — VALIDATE (ERROR).** Blocks publish on a missing deliverable. *Against:* accessibility is tracked
  as a **coverage KPI over time** (e.g. ≥90% online subtitling), not a per-event publish precondition — a single
  event missing AD is a KPI dent, not an illegal broadcast; ERROR would be operationally wrong.
- **Option B2 — ANNOTATE (WARNING) [RECOMMENDED].** Flags the gap so it can be closed before air; feeds the RC-2
  KPI aggregation. Aligns accessibility with its real nature (a target, not a gate).
- **Option B3 — RECORD (INFO) + KPI.** Also defensible if the KPI reporting (RC-3) is considered the real control
  and per-event flags add noise.
- **Recommendation:** **B2 (WARNING)** for the deliverable-missing check, with the KPI aggregation (RC-3) as the
  system of record for the target. Confirm the deliverable *set* per event type with the stakeholder.

### C. Ad-break limits (G13 — currently deferred)
AVMSD 20%/daypart advertising limits.

- **Recommendation:** **CONFIRM the deferral (RECORD/none, out of Planza scope).** Ad-break volume/placement is
  most plausibly a **traffic/playout-layer** concern (Planza plans programme slots, not ad breaks); the gap
  analysis flags this itself. Lift the deferral only if the stakeholder says Planza owns ad-time planning.

## Proposed boundary statement (for the session to ratify or amend)

> **Planza validates and annotates at planning time; the traffic/playout/EPG layer enforces at broadcast.**
> Default severity is **WARNING** (annotate) for listed-events FTA and accessibility; **ERROR** is reserved for
> checks the stakeholder explicitly designates as hard publish-gates, configured **per tenant**. Ad-break limits
> (G13) remain **out of scope** (downstream). Severities are **configurable per check class per tenant**, not
> product constants (AS-10).

## What the stakeholder session must produce (RC-0-T2 hand-off)

1. Ratify or amend the boundary statement above.
2. A final severity (ERROR/WARNING/INFO) for each of A, B, C — recorded in this ADR + propagated to RC-1-T3 and
   RC-2-T3 (which currently ship provisional WARNING per AS-2).
3. Confirm or lift the G13 deferral (§2 of this ADR).
4. (Opportunistic — Q4) Whether remit KPI reporting (RC-3) feeds an external pipeline or Planza is system of record.

## Consequences

- Until this ADR is accepted, RC-1-T3 and RC-2-T3 ship their new codes as **provisional WARNING** with a
  `TODO-ADR-017` marker (AS-2), and no RC acceptance criterion referencing a severity is frozen.
- If severities are per-tenant configurable (recommended), RC needs a small severity-config surface — scope at RC
  retro; the VRT configuration is the first row.

## Review date

RC-0-T2 stakeholder session, or 2026-10-13 — whichever comes first.
