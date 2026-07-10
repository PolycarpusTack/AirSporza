# Sports Broadcasting Domain — Gap Analysis vs. Planza Baseline

> **Provenance:** Deep-research run 2026-07-02 (brief: `docs/ops-domain-investigation-prompt.md`).
> 24 sources fetched across 5 angles; 110 claims extracted; top 25 adversarially verified
> (3-vote refutation panel) → 24 confirmed, 1 refuted. All findings below are **high confidence**
> unless noted. Read §6 (caveats) before seeding backlog items from this document.

---

## 1. Executive summary — the most consequential gaps

1. **Rights are multi-dimensional; Planza's model is flat.** Sports media rights are segmented
   by **territory** (domestic/international, exclusivity, geo-blocking) and **temporal window**
   (live, delayed, highlights, clips, archive) — what may be scheduled varies per market,
   platform, *and* window. Planza's `Contract` (validity window + `platforms[]`) cannot express
   this ([WIPO](https://www.wipo.int/en/web/sports/broadcasting)).

2. **Rights-driven scheduling is the category-standard capability.** Industry systems
   (Mediagenix WHATS'ON, Provys Sphere) continuously **verify every scheduled broadcast against
   acquired rights** (channel/territory/window, holdbacks, blackouts) and manage the contract
   lifecycle including payments and amortisation. Planza's derived
   `VALID/EXPIRING/NEGOTIATION/MISSING` status is a thin slice of this
   ([Mediagenix](https://www.mediagenix.tv/solutions/live-sports/),
   [Provys](https://provyssphere.tv/sphere-pro/)).

3. **Live-event volatility is THE defining sports-scheduling problem — Planza's rundown is
   static.** Overruns, delays, postponements and cancellations are treated by the tooling
   landscape as first-class: automated schedule retiming, ripple/repair of dependent downstream
   items, alternative-schedule switching with automatic playout/EPG propagation. Planza has no
   volatility-absorption or downstream-propagation mechanism.

4. **Feed changes don't ripple into the schedule.** Commercial systems model sports as a
   hierarchy (league → season → event → linked content: full game, highlights, interviews) whose
   metadata (kickoff time, teams) imports from providers (Opta, Sportradar) and **ripples
   automatically through linked content, transmissions and EPGs**. Planza syncs registry master
   data but a kickoff-time change does not propagate to broadcast slots or the rundown.

5. **A dense Belgian/EU regulatory layer applies to VRT sports output and is absent from
   Planza:**
   - **Listed events** — Besluit Vlaamse Regering 28 May 2004 (implementing AVMSD art. 14 via
     Mediadecreet art. 153): ten event categories, nine sports; **eight require full live
     free-to-air coverage** ("volledige rechtstreekse verslaggeving"). Live/full-broadcast
     status of a slot can be a *legal requirement*, not an editorial choice
     ([Codex Vlaanderen](https://codex.vlaanderen.be/portals/codex/documenten/1013337.html)).
   - **Accessibility quotas** — AVMSD art. 7 + Flemish besluit 27 Jan 2023 + VRT
     beheersovereenkomst KPIs: **T888 subtitling in 99% of Dutch-language programmes (sport not
     excluded)**, ≥90% online-video subtitling, audio description expanding to sports
     competitions (already delivered live for Red Devils / Euro 2024). Accessibility is a
     quantified, per-event operational deliverable
     ([VRM](https://www.vlaamseregulatormedia.be/nl/mediatoegankelijkheid),
     [beheersovereenkomst](https://themis.vlaanderen.be/files/5fd2189805144e000d000022/download)).
   - **Remit constraints** — KPI 13: attention to **32 sports**, women's competitions, G-sport
     (2026-2030: 30% Sporza-share target); **restraint on acquiring open-net rights** for
     cycling, cyclocross and football when Flemish private broadcasters are interested. Implies
     remit-coverage tracking and a rights-window category ("open net") Planza cannot express.
   - **Advertising limits** — AVMSD art. 23: ads ≤20% per daypart (06–18h, 18–24h); planning
     tools in this class enforce such limits automatically. (Possibly a traffic-layer concern —
     see open question Q2.)

6. **Resource planning beyond crew is standard; Planza has crew only.** Instant pre-booking
   conflict detection across **studios, edit suites, equipment, facilities, vehicles** is
   expected of broadcast ops tooling (farmerswife, Xytech, ScheduALL); Planza detects crew
   conflicts only and holds production info as free-form tech notes.

7. **Labour-rule enforcement per staff member.** Encoding union/collective agreements and
   European Working Time Directive parameters (hour limits, minimum rest between assignments,
   day-off rules) with warnings at scheduling time is an expected crew-scheduling capability —
   absent from Planza's basic assignment model.

---

## 2. Gap matrix

Coverage: ⬤ covered · ◐ partial · ○ not covered. Priority is from the perspective of a public
broadcaster's sports-ops team (stakeholder confirmation required — see §5).

| # | Dimension | Requirement | Planza today | Priority | Evidence |
|---|---|---|---|---|---|
| G1 | Rights depth | Rights per **territory** (exclusivity, geo-blocking) | ○ | Must | WIPO (3-0, 3-0) |
| G2 | Rights depth | Rights per **temporal window** (live / delayed / highlights / clips / archive) | ○ | Must | WIPO (3-0) |
| G3 | Rights depth | **Rights-driven schedule verification** (every slot checked against rights incl. holdbacks/blackouts) | ◐ (derived status per event) | Must | Mediagenix, Provys (3-0 ×2) |
| G4 | Rights depth | Contract lifecycle: payments, finance, **amortisation** | ○ | Could | Provys (3-0) |
| G5 | Rights depth | "**Open net**" (free-to-air) as a rights-window category + portfolio-level acquisition policy | ○ | Should | Beheersovereenkomst (3-0 ×2) |
| G6 | Volatility | Absorb overruns/delays/postponements: **retiming + ripple/repair of dependent items** | ○ (static rundown) | Must | Mediagenix (2-1, 2-1, 3-0, 3-0) |
| G7 | Volatility | Alternative/contingency schedules, switchable with downstream propagation | ○ | Should | Mediagenix (3-0) |
| G8 | Feed ops | Provider metadata changes (kickoff, teams) **ripple into slots/rundown/EPG** | ◐ (registry sync only) | Must | Mediagenix legacy sports module, Provys (3-0 ×2) |
| G9 | Feed ops | Sports content hierarchy: league → season → event → **linked content** (full game, highlights, interviews) | ◐ (competition→event; no linked content) | Should | Mediagenix, Provys (3-0) |
| G10 | Regulatory | **Listed-events** compliance: flag events on the Flemish list; 8/10 categories require full live FTA coverage | ○ | Must | Codex Vlaanderen, VRM (3-0 ×3) |
| G11 | Regulatory | **Accessibility deliverables per event**: T888 subtitling (99% KPI, sport included), audio description (expanding to sport), VGT | ○ | Must | VRM, beheersovereenkomst, EUR-Lex (3-0 ×5) |
| G12 | Regulatory | **Remit coverage tracking**: 32 sports / women's / G-sport breadth vs. actual output | ○ | Should | Beheersovereenkomst + VRM audits (3-0) |
| G13 | Regulatory | Ad-break limits (AVMSD 20%/daypart) validated at planning time | ○ | Could (likely traffic-layer — Q2) | EUR-Lex, Provys (3-0 ×2) |
| G14 | Resources | Conflict detection for **studios, equipment, facilities** (pre-booking) | ○ (crew only) | Should | farmerswife + Xytech/ScheduALL (3-0) |
| G15 | Crew/labour | **Union/WTD labour-rule enforcement** per staff member (hours, rest, days off) | ○ | Should | farmerswife + Xytech MediaPulse (3-0) |

**Not evidenced (unresearched, not absent):** OB-van/connectivity booking, REMI/remote
production, multi-feed parallel-event days (Olympics-scale), regional opt-outs, EPG/DRM
pipeline integration, feed latency/correction handling, audience/financial performance
tracking. One claim (real-time quoted-vs-actual cost tracking) was **refuted 1-2**. These
dimensions need stakeholder input or a follow-up research pass before backlog decisions.

## 3. Domain-model implications (candidate glossary terms, not schema)

- **Rights Window** — a temporal exploitation category on a contract: live / delayed /
  highlights / clips / archive; the unit rights verification operates on (G2, G3).
- **Territory** — geographic scope of a right; drives geo-blocking and exclusivity (G1).
- **Exclusivity Tier** — exclusive / non-exclusive / open-net qualifier on a Rights Window (G1, G5).
- **Holdback / Blackout** — a contractual prohibition window that scheduling must respect (G3).
- **Listed Event** — an event matching the Flemish events-of-major-importance list, carrying a
  full-live-FTA obligation flag (G10).
- **Accessibility Deliverable** — per-event required services: subtitling (T888), audio
  description, Flemish Sign Language — each with its own resourcing (G11).
- **Schedule Ripple** — the propagation of a timing/metadata change through dependent slots,
  linked content and downstream systems (G6, G8).
- **Contingency Schedule** — a pre-built alternative rundown switchable when a live event
  changes (G7).
- **Linked Content** — derived assets of an event (highlights, interviews, full replay), each
  with its own rights window (G9).
- **Production Resource** — bookable non-crew asset (studio, edit suite, equipment, OB
  facility) subject to conflict detection (G14).
- **Labour Rule** — per-person constraint set (max hours, min rest, day-off) evaluated at
  assignment time; extends Crew Health (G15).
- **Remit Coverage** — accumulated per-sport/per-category output measured against
  beheersovereenkomst KPIs (G12).

Note: `Rights Status` (existing glossary) would become a *derivation over Rights Windows ×
Territory × Exclusivity* rather than a per-contract scalar.

## 4. Candidate epics (traceable to matrix)

1. **Rights model v2** — introduce Rights Window / Territory / Exclusivity Tier on contracts;
   re-derive Rights Status per slot, not per event (G1, G2, G5).
2. **Rights-aware scheduling** — validate every BroadcastSlot against rights incl. holdbacks
   and blackouts; surface violations in Schedule/Rundown (G3).
3. **Listed-events compliance** — flag listed events in the registry/schedule and enforce the
   full-live-FTA rule as a scheduling constraint (G10).
4. **Accessibility planning** — per-event accessibility deliverables with status and resource
   assignment; KPI dashboard (99% T888, AD for sport) (G11).
5. **Schedule ripple engine** — propagate event timing/metadata changes (manual or feed-driven)
   through dependent slots and linked items, with review-before-apply (G6, G8).
6. **Contingency schedules** — pre-built alternates per volatile event, one-action switch (G7).
7. **Linked content** — model highlights/replays/interviews as content derived from an event,
   each with its own rights window (G9).
8. **Production resources** — bookable studios/equipment/facilities with conflict detection,
   extending the crew-conflict pattern (G14).
9. **Labour rules in Crew Health** — encode working-time/union constraints; warn at assignment
   time (G15).
10. **Remit coverage reporting** — track output breadth (32 sports, women's, G-sport) against
    KPI targets (G12).

## 5. Open questions for stakeholders

1. **Rights dimensions in practice** — which dimensions do VRT's actual sports contracts
   distinguish (territory, exclusivity tier, open-net vs. pay window, live/delayed/highlights/
   clips), and which should Planza *validate at scheduling time* vs. leave to legal/rights?
2. **Enforcement boundary** — where does Planza (planning) end and traffic/playout/EPG begin
   for regulatory checks (ad limits, listed-events FTA status) and automated retiming: should
   Planza validate, propagate, or merely annotate?
3. **Actual resource booking today** — which non-crew resources (studios, OB vans, edit
   suites, contribution links) does the ops team book, in what tool, and which conflicts hurt
   most? (No public evidence survived for dimension 3's OB/connectivity items.)
4. **Compliance reporting pipeline** — how are remit and accessibility KPIs tracked today; does
   Planza feed an existing pipeline or become the system of record?

## 6. Caveats on the evidence

1. **Vendor-marketing skew** — the "expected capability" findings (G3, G6–G9, G14, G15) rest on
   vendor pages (Mediagenix, Provys, farmerswife); the brief sanctioned this as a proxy and
   multi-vendor convergence was verified, but marketing attests that capabilities are *offered*,
   not that they are hard requirements for VRT.
2. **Two volatility sub-claims passed only 2-1**, and one Mediagenix quote was recovered from a
   search-index copy of a now-removed page (provenance verified, weaker than a live page).
3. **Beheersovereenkomst citations are to 2021-2025**; the 2026-2030 agreement (signed July
   2025) maintains or strengthens the obligations, but **re-check exact KPI numbers against the
   current agreement before writing acceptance criteria**.
4. **The Flemish listed-events list is 20+ years old** and under parliamentary discussion for
   updating (e.g. "UEFA Cup" no longer exists); in force today, may change.
5. **Legal obligations bind VRT, not the tool** — whether Planza or a downstream system is the
   right enforcement point is an organizational decision (Q2).
6. **Absence of evidence ≠ absence of requirement** for the unresearched dimensions listed
   under the gap matrix.
