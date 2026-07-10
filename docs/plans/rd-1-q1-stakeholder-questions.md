# Q1 Stakeholder Packet — Rights dimensions in VRT sports contracts

_Produced by RD-1 spike (2026-07-02) · Owner: Stakeholder · Blocks nothing (AS-4: enum superset ships behind the_
_`rightsWindows` flag either way), but answers de-risk RD-3 validation semantics and RD-6 data migration._

## The question (Q1, gap analysis §5)

**Which rights dimensions do VRT's actual sports contracts distinguish — territory, exclusivity tier
(exclusive / non-exclusive / open net), open-net vs pay window, live / delayed / highlights / clips (/ archive) —
and which of those must Planza validate at scheduling time (vs leave to legal review)?**

Follow-ups that shape concrete model decisions (ADR-015 Open assumptions):
1. Per exploitation window, do contracts state an **earliest-release delay after the live broadcast ends**
   (a *holdback*, e.g. "on-demand no earlier than 24h after live end")? Measured from live **end** or from kickoff?
2. Do contracts cap the **number of runs per window category** (e.g. max 2 delayed reruns), or only live runs?
3. Is **archive/library exploitation** (older than a season) a distinct contractual category we should model
   (`ARCHIVE`), or folded into delayed/on-demand?
4. When a contract says "open net", is that a property of the **whole contract**, of a **specific window**
   (e.g. highlights only), or of a **channel obligation** (must air on free-to-air)?
5. Which platform vocabulary do contracts use — distribution channels (linear TV / online player / radio) or
   business models (OTT / SVOD / PPV)? (The code currently carries both vocabularies; only one is enforced.)

## Evidence attached: dimension inventory from the codebase + dev data

**Honesty note (spike rule C1):** the only readable database from this workstation is the local dev instance with
*synthetic seed data*. The table below is a **schema + seed inventory** — it shows what Planza *can* store and what
the seeds exercise. It is **not** evidence of what real VRT contracts contain; that is exactly what this packet
requests.

| Dimension | Planza schema today | Dev-data usage (n=42 contracts, 3 policies — synthetic) | Enforced at scheduling time today? |
|---|---|---|---|
| Territory | `Contract.territory: string[]` | 0/42 contracts populated; policies: `[BE]`, `[BE,LU]` | Only in `/rights/check` when a target territory is passed; **dead in draft validation** |
| Platform | `Contract.platforms: string[]` (lowercase, matched vs channel types) AND an orphaned UPPERCASE `Platform` enum on RightsPolicy | 0/42 contracts populated (36/42 ride deprecated booleans); policies use the enum | Warning in `/rights/check`; **dead in draft validation** |
| Window category (live/delayed/highlights/clips) | `coverageType` — **one scalar per contract**, enum `LIVE/HIGHLIGHTS/DELAYED/CLIP` (no `ARCHIVE`) | 100% `LIVE` everywhere | **Ignored by all checkers** — this is the core RD gap |
| Exclusivity tier / open net | **does not exist** | — | — |
| Validity window | `windowStartUtc/EndUtc` | 0 populated | Warning when populated |
| Holdback (earliest release after live end) | `tapeDelayHoursMin` — stored via CRUD, **read by no validator** | 0 populated | No |
| Run limits | `maxLiveRuns` (+ `RunLedger` tally) | 0/42 contracts; 2/3 policies | Broken in drafts (false positives); ledger empty |
| Blackout windows | `Contract.blackoutPeriods` JSON | 0 populated; **no UI/API writes it** | ERROR in `/rights/check` when populated |

## What we do with the answers

- Confirm or trim the window-category enum (`LIVE/DELAYED/HIGHLIGHTS/CLIP/ARCHIVE`) and the exclusivity tier values
  (`EXCLUSIVE/NON_EXCLUSIVE/OPEN_NET`) — ADR-015 §2–3.
- Set which violations are scheduling-time validation (ERROR/WARNING in draft validation) vs legal-review
  annotations — feeds RD-3 severities and the ADR-017 enforcement-boundary discussion.
- Assign real exclusivity tiers and holdbacks during the RD-2 backfill / RD-6 migration instead of defaults.
- Replace this synthetic inventory with real contract-shape distributions (even a sample of 5–10 representative
  contracts — football league, cycling classics, tennis grand slam, Olympics sublicense — would do).
