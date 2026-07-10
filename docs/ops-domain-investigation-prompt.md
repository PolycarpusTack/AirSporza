# Investigation Prompt — Sports Broadcasting Domain: Requirements & Challenges Beyond Planza's Current Scope

> **How to use:** Paste everything below the line into a deep-research-capable session
> (Claude Code `/deep-research`, Claude.ai Research, or an API agent with web search).
> The prompt is self-contained — it assumes the researcher has **no** access to the Planza codebase.

---

## Role and goal

You are a domain researcher specializing in broadcast media operations. Your task is to
investigate the **full landscape of requirements and challenges in professional sports
broadcasting operations** and produce a **gap analysis** against the current capabilities of
Planza, an internal sports-broadcast planning tool. The output will seed future backlog epics,
so precision about *what the domain demands* matters more than solution ideas.

## Baseline — what Planza covers today (treat as given, do not re-research)

Planza is a planning/ops tool for a public broadcaster (Belgian/European context; linear
channels such as Eén and Canvas plus a streaming platform, VRT MAX). Current domain model
and capabilities:

- **Events & editorial workflow** — sports events with an editorial status lifecycle
  (`DRAFT → READY → APPROVED`), day-based scheduling, and a per-channel day timeline
  ("rundown") with positioned event blocks.
- **Rights management (basic)** — Contracts per competition with a validity window and a
  list of licensed platforms; derived per-event rights status
  (`VALID / EXPIRING / NEGOTIATION / MISSING`), expiry warning at 90 days.
- **Broadcast slots & channels** — events map to channels via `BroadcastSlot` entities
  (linear channels + streaming platform).
- **Crew planning (basic)** — crew assignments per event with automatic conflict detection;
  derived crew health (`OK / OPEN / CONFLICT`).
- **Registry / master data** — sports, competitions, teams, players (performers/staff planned),
  with provenance tracking (`MANUAL` vs. external source) and protection of manual edits.
- **Data sync & merge** — nightly import jobs from external sports-data feeds (e.g.
  TheSportsDB-style APIs), dead-letter handling, duplicate/merge-candidate review with
  approve-merge / keep-separate decisions.
- **Technical production notes** — free-form tech plans and remarks per event exist but are
  not structured resource planning.

Out of scope for this investigation: UI/UX design (a redesign is already underway),
authentication/security infrastructure, and generic software concerns.

## Research question

**What requirements and challenges of professional sports broadcasting operations are NOT
covered by the baseline above — and which of them would a tool like Planza be expected to
handle?**

## Dimensions to investigate (cover all; flag any additional ones you discover)

1. **Rights management depth** — territorial rights and geo-blocking; exclusivity tiers and
   sublicensing; per-window rights (live, delayed, highlights, clips, archive); simulcast vs.
   catch-up rights; blackout rules; rights auctions/renewal cycles; collective vs. individual
   selling (e.g. UEFA, domestic leagues); rights-cost amortization and reporting obligations.
2. **Scheduling volatility** — fixture changes, postponements, extra time/overruns and
   knock-on effects on the linear schedule; contingency/alternative programming; multi-feed
   and parallel-event days (e.g. Olympics, Grand Slams); regional opt-outs.
3. **Production resource planning** — OB vans/trucks, studios, galleries, edit suites;
   connectivity booking (satellite, fiber, IP contribution); remote/decentralized production
   (REMI); host-broadcaster vs. unilateral coverage; equipment and facility conflicts.
4. **Crew, talent & labor constraints** — commentator/pundit assignment; working-time
   regulations and union/collective agreements; travel and accreditation logistics;
   freelancer vs. staff planning.
5. **Regulatory & compliance (EU/Belgian focus)** — AVMS Directive obligations; "listed
   events"/events of major importance rules; accessibility mandates (subtitling, audio
   description, sign language quotas); advertising and sponsorship rules around sport;
   public-broadcaster remit constraints.
6. **Metadata & distribution** — EPG/programme-metadata pipelines; content IDs and
   versioning (live, clean feed, highlights, short-form); DRM and platform packaging;
   dynamic ad insertion implications for planning.
7. **Data-feed operations** — official vs. unofficial fixture/results feeds; feed latency and
   correction handling; entity mapping across providers; live data (scores, lineups) vs.
   planning data.
8. **Financial & performance tracking** — cost-per-event/production budgeting; rights value
   vs. audience performance; audience measurement integration for planning decisions.
9. **Industry tooling landscape** — what do established broadcast-planning systems
   (e.g. Mediagenix WHATS'ON, Provys, Xytech/ScheduALL, IBMS-class systems) and
   sports-specific ops tools cover that generic planners don't? Use this as a proxy for
   "expected capabilities."

## Method

- Prioritize authoritative sources: EBU publications, industry press (SVG / SVG Europe,
  Broadcast, IBC/NAB conference material), regulator texts (EU AVMS, Flemish media decree),
  vendor documentation, and league/federation broadcaster manuals where public.
- For each claimed requirement, cite at least one source; mark claims you could not verify.
- Distinguish clearly between **(a)** universal industry requirements, **(b)** European
  public-broadcaster-specific requirements, and **(c)** nice-to-have/emerging practices.

## Deliverable

A report with:

1. **Executive summary** — the 5–8 most consequential gaps, one paragraph each.
2. **Gap matrix** — per dimension: the requirement, why it matters, evidence/source,
   whether Planza's baseline covers it (fully / partially / not at all), and priority
   (Must / Should / Could) from the perspective of a public broadcaster's sports ops team.
3. **Domain-model implications** — new entities, relationships, or fields the gaps imply
   (e.g. "Rights need a territory + window dimension, not just platform list"), stated as
   candidate glossary terms, not schema designs.
4. **Candidate epics** — 5–10 one-line epic statements suitable for backlog refinement,
   each traceable to gaps in the matrix.
5. **Open questions for stakeholders** — things only the broadcaster's own ops team can
   answer (workflow specifics, contractual realities, org structure).

Keep the report skimmable: tables for the matrix, prose for the summary. Cite sources inline.
