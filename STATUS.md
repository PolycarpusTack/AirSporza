# Planza — Session Status

_Last updated: 2026-03-04_

---

## What Was Done This Session

### 1. Outbound Publishing System (fully implemented)

**Backend**
- `backend/prisma/schema.prisma` — Added `WebhookEndpoint` and `WebhookDelivery` models
- `backend/src/routes/publish.ts` — Pull feed routes (JSON + iCal), webhook CRUD, delivery log, retry
- `backend/src/services/publishService.ts` — HMAC-SHA256 signing, exponential backoff retry (1s→5s→30s), `dispatch()`, `checkExpiringContracts()`
- `backend/src/routes/events.ts` + `techPlans.ts` — Hooked `publishService.dispatch()` on create/update/delete
- `backend/src/index.ts` — Registered `/api/publish` route + daily cron for contract expiry alerts

**Frontend**
- `src/services/publish.ts` — `publishApi` with all webhook/delivery/feed methods
- `src/components/admin/PublishPanel.tsx` — 3-tab UI: Webhooks, Feed URLs, Deliveries
- `src/pages/AdminView.tsx` + `SettingsView.tsx` — Added "Publish" tab

**Database migration needed:**
```bash
docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/add_webhook_tables.sql
```

---

### 2. PlannerView — Bug Fixes & Enhancements

- **SMPTE duration** — `parseDurationMin()` now correctly handles `HH:MM:SS;FF` format (was defaulting to 90 min)
- **VRT Canvas color** — Added `'VRT Canvas'` key to channel color map (was getting default gray)
- **Live filter** — `liveNow` now only shows events where date === today (was showing all-time)
- **Static data replaced** — `SPORTS`/`COMPETITIONS`/`CONTRACTS` now come from `useApp()` context + API
- **Contracts** — Loaded from `contractsApi.list()` with local fallback
- **Current time indicator** — Red dot + line in today's calendar column, updates every 60s
- **Click to edit** — Clicking a calendar event or list row opens the edit form
- **Keyboard nav** — `←` / `→` arrow keys change the week
- **Channel event counts** — Filter chips show count (e.g. `VRT 1 3`)
- **Performance** — Map-based sport/competition/contract lookups, memoised `eventsByDay`

---

### 3. Organisation Config System (generic / non-VRT-specific)

**What it does:** Replaces all hardcoded channel/phase/category/venue arrays with admin-configurable lists, stored in `AppSetting` (DB key: `org_config`, scope: global).

**Backend**
- `backend/src/routes/settings.ts` — `orgConfig` added to `GET /settings/app` response; new `PUT /settings/app/org` endpoint (admin only, Joi-validated)

**Frontend**
- `src/data/types.ts` — Added `ChannelConfig`, `OrgConfig` interfaces
- `src/data/index.ts` — Added `DEFAULT_ORG_CONFIG` (current VRT values as defaults)
- `src/services/settings.ts` — Extended `AppSettingsResponse`, added `updateOrgConfig()`
- `src/context/AppProvider.tsx` — `orgConfig` loaded from API, exposed in context with `setOrgConfig`
- `src/components/admin/OrgConfigPanel.tsx` — New panel with tabs:
  - **Linear Channels** — name + hex color picker + 12-color palette
  - **On-demand Platforms** — BVOD platforms (VRT MAX etc.)
  - **Radio Channels**
  - **Event Phases**
  - **Categories**
  - **Venues**
- `src/pages/AdminView.tsx` — Added `'org'` tab
- `src/pages/SettingsView.tsx` — Added "Organisation" sidebar entry (Building2 icon)

**Forms/views wired to org config:**
- `DynamicEventForm` — channels, onDemandChannels, radioChannels, phases, categories, complexes all from `useApp().orgConfig`
- `PlannerView` — channel filter chips + calendar colors built dynamically from `orgConfig.channels`

---

### 4. On-demand Channel Field (VRT MAX / BVOD distinction)

VRT MAX is a BVOD platform, not a linear channel. Separated them:

- `onDemandChannel` field added to `Event` model (Prisma schema + migration file)
- `livestreamDate`/`livestreamTime` relabelled to "On-demand Available From (date/time)"
- VRT MAX moved from linear channels → on-demand platforms in `DEFAULT_ORG_CONFIG`
- New "On-demand Platform" dropdown in the event form
- `OrgConfig.onDemandChannels: ChannelConfig[]` added

**Database migration needed:**
```bash
docker exec -i sporza-db psql -U sporza -d sporza_planner < backend/prisma/migrations/add_on_demand_channel.sql
```

---

## Pending Database Migrations

Two SQL files need to be applied to the Docker DB:

```bash
# 1. Webhook tables
docker exec -i sporza-db psql -U sporza -d sporza_planner \
  < backend/prisma/migrations/add_webhook_tables.sql

# 2. On-demand channel column
docker exec -i sporza-db psql -U sporza -d sporza_planner \
  < backend/prisma/migrations/add_on_demand_channel.sql

# 3. Regenerate Prisma client (after migrations)
cd backend && npx prisma generate
```

---

## Current TypeScript Status

```
npx tsc --noEmit          → 0 errors (frontend)
cd backend && npx tsc --noEmit  → 0 errors (backend)
```

---

## What to Do Next

### High priority

1. **Apply DB migrations** (see above) — without these, `WebhookEndpoint`/`WebhookDelivery` tables and `onDemandChannel` column don't exist in the DB

2. **Test Organisation Config panel** — Go to Settings → Organisation, change a channel name/color, save, verify it persists across reload and reflects in the Planner calendar chips

3. **Test Publish panel** — Settings → Publish → register a webhook, create/update an event, check the delivery log

4. **Planner calendar click** — Clicking an event block should open the edit form; verify it pre-fills correctly

### Medium priority

5. **ContractsView** — Currently loads from `contractsApi.list()` but the form may need the on-demand rights field reviewed (VRT MAX rights are in contracts as `maxRights`, which aligns with the new `onDemandChannel`)

6. **PlannerView on-demand badge** — Consider showing a "MAX" badge on calendar event blocks that have `onDemandChannel` set, similar to the existing LIVE dot

7. **PublishPanel feed URLs** — The `getFeedUrl()` helper in `publishApi` uses `/api/publish/events` — verify the backend route matches and the iCal feed renders correctly

8. **Event form field order** — The `DEFAULT_EVENT_FIELDS` order was updated (on-demand fields inserted). If users have saved custom field configs in `AppSetting`, the stored config won't have the new `onDemandChannel` field. Handle gracefully (it will just be invisible until they reset or manually add it via FieldConfigurator)

### Lower priority

9. **OrgConfigPanel drag-to-reorder** — The `GripVertical` icon is shown but actual DnD isn't wired up yet. Dragging doesn't work (cosmetic only right now)

10. **Encoder admin in SportsWorkspace** — The encoder lock/countdown is implemented, but the admin "manage encoders" path still goes through AdminView

11. **Audit log** — The admin audit log in AdminView is currently a hardcoded table. Wire it to the `AuditLog` table via a new `/api/audit` endpoint

---

## File Map (key files changed this session)

```
backend/
  prisma/schema.prisma                     ← WebhookEndpoint, WebhookDelivery, onDemandChannel
  prisma/migrations/add_webhook_tables.sql ← run this
  prisma/migrations/add_on_demand_channel.sql ← run this
  src/routes/publish.ts                    ← new: pull feeds + webhook CRUD
  src/routes/events.ts                     ← dispatch hooks added
  src/routes/techPlans.ts                  ← dispatch hooks added
  src/routes/settings.ts                   ← orgConfig GET+PUT added
  src/services/publishService.ts           ← new: HMAC, retry, dispatch, cron

src/
  data/types.ts                            ← ChannelConfig, OrgConfig, onDemandChannel on Event
  data/index.ts                            ← DEFAULT_ORG_CONFIG, onDemandChannel field
  services/publish.ts                      ← new: publishApi
  services/settings.ts                     ← extended AppSettingsResponse + updateOrgConfig
  context/AppProvider.tsx                  ← orgConfig state + context
  components/admin/OrgConfigPanel.tsx      ← new: org config UI
  components/admin/PublishPanel.tsx        ← new: publish UI
  components/forms/DynamicEventForm.tsx    ← orgConfig wired, SMPTE duration, onDemandChannel
  pages/AdminView.tsx                      ← org + publish tabs
  pages/SettingsView.tsx                   ← org + publish sidebar entries
  pages/PlannerView.tsx                    ← dynamic colors, click-to-edit, time indicator, etc.
```
