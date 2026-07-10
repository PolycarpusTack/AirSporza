# Ops Security Review — STRIDE re-check of the two write paths + RBAC parity

**Story E-3 / Task E-3-T1 · EPIC E (HARDENING) · Hat = VERIFICATION (threat analysis, no code changes).**
Date: 2026-07-10. Reviewed against DELIVERED code on `feature/C-1-registry-selectors`
(registry create C-4, merge decisions D-3). Every role set and guard below is quoted from
source, not from the backlog.

---

## 1. Summary verdict

Both ops write paths are **authenticated, rate-limited, tenant-scoped in their primary
queries, input-validated (Zod), and Prisma-parameterised**. The backend `authorize(...)`
middleware on every write route is intact and **unchanged** by the ops redesign — it is the
real authorization boundary, and it is the reason there is **no data-level privilege
escalation** despite the shell dropping the front-end route guard.

The headline residual is an **elevation-of-privilege at the UI-surface level**: `/ops/*`
renders with **no `RequireRole`** (authenticated-only), so roles that the legacy
`RequireRole` gates excluded can now navigate to, see, and click ops write surfaces. This is
consequential in exactly one place where the back-end authorize set is *broader* than the
legacy front-end gate:

> **`sports` gains a working, one-click, irreversible merge-decision surface at `/ops/sync`
> that the legacy `/import` route denied them.** Legacy `ImportView` is gated
> `roles={['admin', 'planner']}` (App.tsx:226) — `sports` is excluded. The back-end merge
> routes are gated `authorize('planner', 'sports', 'admin')` — `sports` is **included**. The
> legacy UI gate was the only thing stopping `sports`; ops removed it and the back-end
> accepts the write.

Everywhere else the exposure is cosmetic (a lesser role sees a button that returns 403).

Disposition summary: **1 GATE** (the RBAC-parity policy question — needs an architect
decision), plus **3 residual findings with cheap defence-in-depth mitigations** (missing
app-level tenant scope on the merge target, no actor attribution on the create routes,
missing sport-ownership check on competition create). None is a shipped data breach on its
own; each narrows a gap that today depends on a control outside this code (RLS) or on
admin-only trust.

---

## 2. STRIDE table — the two write paths

Legend: **✅ mitigated** (how) · **➖ accepted** (why) · **⛔ GATE** (needs architect).

### Path 1 — Registry create (C-4): `POST /api/{teams,players,sports,competitions}`

| STRIDE | Disposition | Evidence / reasoning |
|---|---|---|
| **S — Spoofing** | ✅ mitigated | `authenticate` (passport-JWT, bearer, `secretOrKey` from `getJwtSecret()`) is inline on all four POST routes (teams.ts:98, players.ts:101, sports.ts:49, competitions.ts:68). `/api/teams` + `/api/players` also carry a mount-level `authenticate` (index.ts:126–127). `/api/sports` + `/api/competitions` mount **public** (index.ts:104–105, `publicLimiter`, no mount-level authenticate) — but the write route's inline `authenticate` still applies, so create is not spoofable. Only the GET reads on sports/competitions are public (pre-existing; read-only; out of ops scope). |
| **T — Tampering** | ✅ mitigated, **1 minor gap** | `validate({ body: … })` (Zod) on every create; Prisma parameterises all writes. teams/players re-check `sportId` belongs to the tenant ("Unknown sport", teams.ts:104–109, players.ts:106–111). **Gap:** `competitions.ts` create (line 68–83) sets `sportId` with **no tenant-ownership check** — an admin can create a competition referencing another tenant's `sportId` (cross-tenant FK reference). Admin-only + per-tenant admin makes this low severity, but it is an integrity inconsistency vs. the teams/players guard. See §5 residual F-3. |
| **R — Repudiation** | ⛔→ residual | **No actor attribution on any create route.** None of the four create handlers records *who* created the row — no `createdBy`, no call to the existing `/api/audit` trail. Provenance is captured (`isManaged: false`, MANUAL source implied) but that is *what*, not *who*. Contrast the merge path, which records `reviewedBy`/`reviewedAt`. See §5 residual F-2. |
| **I — Info disclosure** | ✅ mitigated | `tenantId` is in every create's ownership pre-check and is written on the row (`tenantId: req.tenantId!`). 409 duplicate messages are generic and tenant-scoped ("A team with that name already exists"). `errorHandler` returns `"Internal server error"` for 500s and only leaks `stack` when `NODE_ENV === 'development'` (errorHandler.ts:30–31). |
| **D — DoS** | ✅ mitigated / ➖ accepted | `standardLimiter` (teams/players) and `publicLimiter` (sports/competitions) at mount; each create is a single bounded row-insert; front-end `isSubmittingRef` synchronous single-flight prevents double-submit (RegistryCreateModal.tsx:74,104,107). ➖ `GET /api/sports` and `GET /api/competitions` return **bare, unpaginated arrays** (sports.ts:11–24, competitions.ts:11–36) — bounded by per-tenant reference-data size; low risk, accepted. |
| **E — Elevation** | ✅ mitigated (backend) / ⛔ GATE (UI surface) | Every create route is `authorize('admin')` (teams.ts:98, players.ts:101, sports.ts:49, competitions.ts:68). **Create is admin-only at the back-end regardless of who reaches the UI** → no data-level EoP. The `/ops/registry` modal is exposed to *any* authenticated role (incl. `contracts`, who could not reach legacy `TeamsView`), but a non-admin create returns 403. UI-exposure only → folded into the §4 RBAC GATE. |

### Path 2 — Merge decisions (D-3): `POST /api/import/merge-candidates/:id/{approve-merge,create-new,ignore}`

| STRIDE | Disposition | Evidence / reasoning |
|---|---|---|
| **S — Spoofing** | ✅ mitigated | `authenticate` inline on all three routes (mergeCandidates.ts:98,166,223) **and** at mount (`/api/import`, index.ts:114). JWT bearer as above. |
| **T — Tampering** | ✅ mitigated, **1 real gap (RLS-dependent)** | approve-merge validates the body with `mergeDecisionSchema` (Zod, import.ts:20–22); `entityType === 'event'` enforced (409/400 otherwise); `toCanonicalImportEvent` shape-validates the stored `normalizedJson` before replay (mergeCandidates.ts:14–52,119); `targetEntityId` coerced via `Number(...)`, NaN falls through to a 400 (line 124–132). **Gap:** the merge *target* event id is attacker-controllable (`mergeDecisionSchema.targetEntityId`, unbounded) and `updateImportedEvent` looks it up with `db.event.findUnique({ where: { id: eventId } })` — **no `tenantId` in that where-clause** (provision.ts:963–979). The *candidate* is tenant-scoped (`findFirst … tenantId`, line 100–101), but the target event is not re-validated against the caller's tenant at the app layer. A tenant-A user can pass a tenant-B event id and overwrite it — mitigated **only** by DB RLS (`setTenantRLS`), which is a separate, possibly-inactive track. See §5 residual F-1. |
| **R — Repudiation** | ✅ mitigated | All three decision routes record `reviewedBy = user.email \|\| user.id` and `reviewedAt = new Date()` on the candidate (mergeCandidates.ts:143–154, 200–211, 237–247). This is the audit-trail standard the create routes lack. |
| **I — Info disclosure** | ✅ mitigated | Candidate lookup is `findFirst({ where: { id, tenantId } })` on all three routes → a cross-tenant candidate id returns **404** (not 403), no existence disclosure. Error messages are human-readable and carry the decided status (by design, for the "already decided" UX). |
| **D — DoS** | ✅ mitigated | D-3-T0 guard `candidate.status !== 'pending' → 409` on all three routes (lines 111, 179, 233) blocks re-decide / decision-amplification; `standardLimiter` at mount; per-card `isSubmittingRef` single-flight on the client (SyncScreen.tsx:114,117); `GET /merge-candidates` caps `limit` at 100 (line 55). |
| **E — Elevation** | ⛔ GATE (headline) | Routes are `authorize('planner', 'sports', 'admin')` (lines 98,166,223). `/ops/sync` is authenticated-only, so **`sports` — excluded from legacy `/import` (`['admin','planner']`) — now reaches a surface the back-end already accepts.** This is a *real* newly-reachable irreversible write, not merely cosmetic. See §4 + §5. |

---

## 3. What is NOT in scope (verified, not re-opened)

- **Tenant/RLS isolation** is owned by the separate mitigation-plan track (memory: "RLS
  activation story… per-request tx wrapper, ADR-011"). In-scope *observation*: the ops
  **primary** queries all carry `tenantId` in their where-clauses (create ownership checks,
  candidate lookups, list filters). The one place app-level tenant scope is **absent** is the
  merge *target* lookup (§5 F-1) — reported as a defence-in-depth finding, not an RLS redesign.
- **No new auth mechanism** is proposed. Parity means reusing the existing `RequireRole`
  component, not inventing a scheme.

---

## 4. RBAC parity matrix

### 4a. Legacy `RequireRole` sets — quoted from `src/App.tsx`

| Legacy route | Component | `RequireRole roles={[…]}` | Source |
|---|---|---|---|
| `/dashboard` | `DashboardView` | **(none — authenticated-only)** | App.tsx:152–155 |
| `/planner` | `PlannerView` | **(none — authenticated-only)** | App.tsx:156–179 |
| `/sports` | `SportsWorkspace` | `['admin', 'sports', 'planner']` | App.tsx:183 |
| `/teams` | `TeamsView` | `['admin', 'sports', 'planner']` | App.tsx:202 |
| `/contracts` | `ContractsView` | `['admin', 'contracts', 'planner']` | App.tsx:216 |
| `/import` | `ImportView` | `['admin', 'planner']` | App.tsx:226 |
| `/schedule` | `ScheduleView` | `['admin', 'planner', 'sports']` | App.tsx:244 |
| `/settings/*`, `/admin/*` | `SettingsView` | `['admin']` | App.tsx:236, 252 |
| **`/ops/*`** | **`OpsShell`** | **(none — authenticated-only; only a `user` truthy check)** | App.tsx:390–402 |

`RequireRole` itself: unauthenticated → `/login`; authenticated-but-wrong-role →
redirect to `/planner` (RequireRole.tsx:12–13). Role universe (data/types.ts:171):
**`planner` · `sports` · `contracts` · `admin`** (four roles, no viewer).

`/ops/*` is confirmed authenticated-only (App.tsx:390–402): the only check is `user ?
<OpsShell/> : <Navigate to="/login">`. **OpsShell renders all tabs inside this single
route** — there is no per-tab `RequireRole`, so gating individual tabs is *new work*, not a
config change.

### 4b. Ops tab → legacy peer → parity gap

Every ops tab is reachable by **all four roles** (authenticated-only shell). The gap column
is the set of roles that can now reach the ops surface but were denied the legacy peer, and
whether the **back-end** guard turns that into an actual write.

| Ops tab | Legacy peer (gate) | Roles legacy DENIED | Back-end write guard | Real consequence |
|---|---|---|---|---|
| schedule | ScheduleView `['admin','planner','sports']` | contracts | (read tab) | contracts sees schedule — cosmetic |
| planner / **rundown** | PlannerView **(none)** | — | (read/event edit) | no parity change (legacy was already open) |
| rights | ContractsView `['admin','contracts','planner']` | sports | (contracts write) | sports sees rights — cosmetic |
| **registry** | TeamsView `['admin','sports','planner']` | **contracts** | create = `authorize('admin')` | contracts sees the **create modal**; back-end 403s non-admins → **UI exposure only, no write** |
| **sync** | ImportView `['admin','planner']` | **sports, contracts** | decisions = `authorize('planner','sports','admin')` | **`sports` → genuine one-click IRREVERSIBLE merge (back-end accepts).** `contracts` → sees buttons, 403 on click (cosmetic). |

### 4c. The elevation gap (headline)

- **`sports` on `/ops/sync` = a true elevation.** Denied by legacy `/import`
  (`['admin','planner']`, App.tsx:226); permitted by the merge back-end
  (`authorize('planner','sports','admin')`, mergeCandidates.ts:98/166/223). The write is
  **irreversible** (approve-merge collapses the candidate into a canonical event via
  `manualMergeNormalizedEvent` + writes an outbox `event.updated`; create-new mints a
  canonical event). The ops UI executes it on click with **no confirm step** (§6).
- **`contracts` on `/ops/registry` and `/ops/sync` = cosmetic elevation.** Reaches surfaces
  legacy denied, but the back-end (`authorize('admin')` for create; `authorize('planner',
  'sports','admin')` excludes contracts for merge) returns 403. No data written; the residual
  is UX confusion + minor existence disclosure of the write surface.
- **No back-end authorize is missing on any ops write.** Registry create =
  `authorize('admin')`; merge decisions = `authorize('planner','sports','admin')`; the
  adjacent C-5 notes PATCH and membership routes = `authorize('admin','sports')`. Defence in
  depth holds — which is precisely why this is a *policy/parity* gap, not an open door.

---

## 5. Residual findings (cheap defence-in-depth; not the GATE)

- **F-1 (Tampering / cross-tenant, merge path) — app-level tenant scope missing on the merge
  target.** `updateImportedEvent` (provision.ts:963–979) looks up the target event by id
  only; `mergeDecisionSchema.targetEntityId` is caller-supplied and unbounded. A tenant-A
  user can approve-merge onto a tenant-B event id. Today this is stopped **only** by DB RLS
  (`setTenantRLS`), which the mitigation-plan notes is not yet activated. Cheap fix
  (independent of the RLS redesign): re-validate the target with
  `where: { id, tenantId: req.tenantId }` before replay. **Most material non-RBAC finding.**
- **F-2 (Repudiation, create path) — no actor attribution on registry create.** The four
  create routes write no `createdBy` and emit nothing to `/api/audit`. A created record
  cannot be attributed to a user. Cheap fix: record the creating user (mirror the merge
  path's `reviewedBy`).
- **F-3 (Tampering / integrity, competition create) — missing sport-ownership check.**
  `competitions.ts` create (line 68–83) omits the tenant-ownership check that teams/players
  perform, allowing a competition to reference a foreign-tenant `sportId`. Cheap fix: add the
  same `prisma.sport.findFirst({ where: { id: sportId, tenantId } })` guard.

---

## 6. Merge-decision confirm step — security verdict (AC-4)

**Verdict: the confirm step is primarily a UX/safety control, and it acquires a *secondary*
security rationale only for as long as the §4 elevation gap stays open. It is NOT the
security boundary and must not be treated as the fix.**

Reasoning:
- The write is genuinely irreversible against canonical records, so a confirm step is
  good practice for any role (reduces accidental one-click execution — SyncScreen executes
  `decide('merged')` directly on click, SyncScreen.tsx:257,307–314).
- The security dimension is real *today* only because a role that arguably should not be here
  (`sports`, per the elevation gap) can one-click an irreversible merge. A confirm dialog
  reduces *accidental* misuse but does **not** stop an authorized-but-wrong role from
  proceeding deliberately.
- Therefore a confirm step is a **mitigation of the consequence, not of the cause.** The
  correct security fix is closing the RBAC parity gap (§4 / §7). Once the role set that
  reaches `/ops/sync` matches intent, the confirm step reverts to a pure UX/designer decision.

Recommendation to the architect: treat the RBAC gate (§7) as the security requirement; treat
the confirm step as a strongly-advised safety affordance for irreversible writes that becomes
*temporarily* security-relevant while the gate is open.

---

## 7. ⛔ ARCHITECT GATE

### Gate-4 — RBAC policy for `/ops/*` (POLICY DECISION, not decided here)

`/ops/*` is authenticated-only (App.tsx:390–402); OpsShell renders all tabs under one route,
so tab-level gating is **new work**. Two questions for the architect:

1. **Which roles may reach `/ops/*`, and at what granularity — SHELL-level or PER-TAB?**
   - *Shell-level* (one `RequireRole` around `<OpsShell/>`) is a one-line change but is only
     as strict as its most-permissive tab, so it cannot reproduce the legacy per-screen sets.
   - *Per-tab* gating reproduces legacy parity but is genuinely new structure (guards inside
     OpsShell's tab router, or per-tab route registration).
2. **Should the front-end gate mirror the legacy `RequireRole` sets, or the (broader) back-end
   `authorize` sets?** The two diverge exactly at the headline finding (`/import` front-end
   `['admin','planner']` vs. merge back-end `['planner','sports','admin']`). The architect
   must decide the intended authority for `sports` on merge review — and whether the *back-end*
   authorize set should also be tightened to match.

**Proposed parity mapping — a STARTING POINT for the architect, explicitly NOT a decision:**

| Ops tab | Proposed `RequireRole` (mirrors legacy peer) |
|---|---|
| schedule | `['admin','planner','sports']` |
| planner / rundown | (authenticated-only — matches legacy PlannerView) |
| rights | `['admin','contracts','planner']` |
| registry | `['admin','sports','planner']` |
| **sync** | `['admin','planner']` **(this is the decision point — excludes `sports`, matching legacy `/import`; conflicts with today's back-end `authorize('planner','sports','admin')`)** |

The `sync` row is where the policy must be resolved: adopt `['admin','planner']` (restore
legacy parity, and consider tightening the back-end authorize to drop `sports`), or adopt
`['admin','planner','sports']` (ratify the current back-end reach as intended). Either way,
close the divergence deliberately rather than by the current accident of a missing gate.

### Residual with no in-scope cheap owner

- **F-1 (merge target cross-tenant)** has a cheap app-level mitigation (add
  `tenantId` to the target where-clause), but the *systemic* answer (RLS activation) is owned
  by the separate mitigation-plan track. Flagging here so the architect can decide whether to
  land the cheap app-level guard now or wait on the RLS track. Do not conflate the two — the
  app-level guard is valuable defence-in-depth regardless of RLS status.

---

*No source file was modified by this review. No git add/commit performed.*

---

## 8. E-3-T2 — Resolution

**Task E-3-T2 · EPIC E (HARDENING) · Hat = FEATURE (architect-decided security remediation
to parity — "fix the real backend boundary, not heavy UI gating"). Backend only, TDD.**
Date: 2026-07-10.

The E-3-T1 review (above) surfaced one **live over-permission** (the §4c/§7 headline: `sports`
reaching an irreversible merge decision) and one **RLS-dependent cross-tenant gap** (§5 F-1).
E-3-T2 closes both at the real backend boundary. Dispositions:

1. **Merge WRITE routes tightened to `authorize('planner', 'admin')` — `sports` dropped
   (RESOLVED).** All three decision routes — `POST /merge-candidates/:id/{approve-merge,
   create-new,ignore}` (mergeCandidates.ts:98/166/223) — now gate `authorize('planner',
   'admin')`, matching the legacy `ImportView` set `['admin','planner']` (App.tsx:226). This
   closes the verified elevation: a `sports` user can no longer make an irreversible merge
   decision at the real boundary. The GET reads (`/merge-candidates` list, `/jobs`) are left
   UNCHANGED (authenticated-only) by design — the backend gates the *writes*; reads stay as-is.
   No legacy regression: legacy `ImportView` already blocked `sports` at the UI, so this only
   *adds* backend enforcement. **Pinned by a new test that exercises the REAL `authorize`
   middleware** (`tests/mergeCandidates-authz-guard.test.ts`) — the pre-existing import tests
   mock `authorize` to a no-op and therefore cannot catch an authz regression; the new test
   injects a role via a partial `authenticate` mock and keeps the real `authorize`, asserting
   `sports → 403` and `planner|admin → not 403` on each of the 3 write routes.

2. **`/ops/*` UI stays authenticated-only — ACCEPTED (with rationale).** No front-end
   `RequireRole` is added around `OpsShell`. Rationale: the backend `authorize()` is the
   authoritative boundary and now matches the legacy per-route role sets, so a UI guard would
   merely duplicate a control that is already correct and enforced server-side. The §7 Gate-4
   "which roles reach `/ops/*`" policy question is resolved at the write boundary rather than by
   a UI gate. (Reads through the ops shell remain authenticated-only, consistent with the
   decision to gate writes, not navigation.)

3. **Per-tab UI role-hiding — DEFERRED (UX polish, not a security requirement).** Hiding tabs
   or buttons a role cannot successfully use (e.g. graying out the merge actions for
   `contracts`, whose clicks 403) is a UX-confusion improvement, not a security control. With
   the backend authoritative (disposition 1/2), it carries no data-security weight and is
   deferred.

4. **F-1 (merge target cross-tenant) — FIXED (app-level defense-in-depth, independent of
   RLS).** `updateImportedEvent` (provision.ts) now accepts an optional `tenantId` and, when
   supplied, scopes the target lookup as `db.event.findFirst({ where: { id, tenantId } })`
   instead of the id-only `findUnique`. `manualMergeNormalizedEvent` — the **only**
   user-supplied-target path (approve-merge) — threads its `tid` (truthy-guarded, so an empty
   string never over-restricts). The three automated-import callers pass **no** tenantId, so
   their behavior is identical (zero import-pipeline blast radius, no collision with the
   RLS/mitigation track's core path). Effect: a tenant-A user who supplies a tenant-B
   `targetEntityId` finds no target → the route errors instead of silently merging onto the
   cross-tenant event. This is valuable defense-in-depth regardless of RLS activation status.
   **Pinned by** `tests/mergeCandidates-tenant-scope.test.ts` — cross-tenant target (lookup
   returns null) → route does not merge and does not mark the candidate decided; same-tenant
   target → merges as before (no regression), with the lookup where-clause asserted to carry
   `tenantId`.

*Frontend, the automated-import callers, and `docs/governance/debt-register.md` were left
untouched. No git add/commit performed.*
