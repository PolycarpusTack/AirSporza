# ADR-022: FM competition standings start as manual entry, not feed-integrated

**Status:** **Accepted** (2026-08-14, backlog-builder drafted; ratified by architect 2026-08-14 —
Recommendation as drafted, Option 1, no changes)

## Context

The FM Competitions screen (`docs/design_handoff_planza_fm/README.md` §4, EPIC FM-3 / Phase 3 in
`IMPLEMENTATION_PLAN.md`) shows a STANDINGS card for football leagues (positions, played/won/
drawn/lost/points columns) alongside broadcast fixtures. `IMPLEMENTATION_PLAN.md`'s own Phase 3.1
names the sourcing question explicitly as open: *"standings either from feed integration or
manual admin entry (start manual)"*, and the plan's own Risks section separately flags upkeep:
*"Standings upkeep — manual entry decays; treat the standings card as optional until a feed
integration exists."* Two of the plan's own sentences disagree on framing (one says "start
manual" as a build order, the other treats the card as "optional" pending a feed) — this ADR
exists to settle which is actually being committed to for EPIC FM-3, since it changes both the
data-model shape (is there a `Standing`/`StandingRow` entity at all, or is it computed?) and the
UI contract (does the card ever render `null`/hidden?).

Does not block EPIC FM-1 (Home/inbox/CONTINUE/create-modal touch no competition-standings data at
all). Raised now so EPIC FM-3 doesn't inherit an unresolved sourcing question at its own DoR gate.

## Options considered

1. **Manual admin entry only, v1.** A small `CompetitionStanding` table (or JSON blob on
   `Competition`) editable by an admin surface (new, out of FM-3's UI scope — likely a follow-up
   registry-style CRUD, mirroring the Ops Registry create/edit pattern) or seeded/updated by hand
   for the tenant's tracked leagues. Simple, no external dependency, but decays without upkeep
   exactly as the plan's risk note states — a real operational cost, not a hypothetical one.
2. **Feed integration from day one** — extend the existing import/feed machinery
   (`backend/src/routes/import/*`, the same machinery ADR-019/SV work builds on) to ingest
   standings from whatever data source already feeds fixtures/results. Rejected for v1: no such
   feed is confirmed to exist or to carry standings (fixtures feeds and standings feeds are
   typically separate upstream products); scoping this without a confirmed source would be
   inventing an integration, which is out of this backlog's authority (BB v5.1 §3.9 — no invented
   external dependencies).
3. **Optional card, hidden until a source exists** — ship the Competitions screen with the
   STANDINGS card entirely absent for v1, add it only once either option 1 or 2 lands. Keeps FM-3
   honest about what's real but drops a screenshot-visible piece of the design with no replacement
   plan.

## Recommendation

**Option 1, with the card explicitly labeled as manually-maintained data** (a small "last updated
<date>" line, matching the honesty precedent set by the ops redesign's rights-threshold
disclosure). This satisfies the plan's own "start manual" instruction, keeps FM-3 self-contained
(no invented feed dependency), and gives a real, demoable STANDINGS card rather than an empty
slot — at the acknowledged cost of the upkeep risk the plan itself already named. The admin-entry
surface for standings is **not** FM-3 scope by default; recommend treating it as a follow-up
story (mirrors how Registry record editing was its own EPIC C in the Ops redesign, not bundled
into the screen that merely displays the data) unless the Architect wants it pulled forward.

## Consequences

- FM-3's `GET /api/registry/:id/profile`-shaped endpoint (per the plan's own 3.1) can return
  standings as plain stored data with no feed dependency — smaller, faster to ship.
- Data staleness is a known, accepted, and disclosed limitation, not a silent one; if it proves
  unacceptable in practice, Option 2 becomes the natural upgrade once a standings-bearing feed is
  confirmed to exist.
- No new external trust boundary is introduced (STRIDE-light note, backlog §1): manually-entered
  data by an already-authenticated tenant user carries the same trust level as any other Registry
  edit.

## Review date

EPIC FM-3 DoR gate, or 2026-11-14.
