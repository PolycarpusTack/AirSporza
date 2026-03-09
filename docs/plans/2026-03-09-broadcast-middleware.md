# Broadcast Scheduling Middleware — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add broadcast scheduling middleware to Planza — BroadcastSlots, schedule versioning, CascadeEngine, rights tracking, validation pipeline, outbox-driven integration, multi-tenant with RLS.

**Architecture:** Extend the existing Express + Prisma + React stack. Add BullMQ (Redis-backed) for job queues and the CascadeEngine. Extend existing Socket.IO for real-time cascade/alert/switch namespaces. All new tables get `tenant_id` with PostgreSQL RLS. Outbox table drives all integration side effects.

**Tech Stack:** Express, Prisma, PostgreSQL (RLS), BullMQ + Redis, Socket.IO (existing), React + TypeScript, Vitest

**Design doc:** `docs/plans/2026-03-09-broadcast-middleware-design.md`

---

## Phase 1: Multi-Tenancy Foundation

### Task 1: Add Tenant model and seed default tenant

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_tenant.sql`
- Modify: `backend/prisma/seed.ts`
- Test: `backend/src/__tests__/tenant.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/__tests__/tenant.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '../db/prisma'

describe('Tenant', () => {
  it('has a default tenant after seeding', async () => {
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } })
    expect(tenant).not.toBeNull()
    expect(tenant!.name).toBe('Default')
  })
})
```

**Step 2: Run test — expect FAIL** (Tenant model doesn't exist)

Run: `cd backend && npx vitest run src/__tests__/tenant.test.ts`

**Step 3: Add Tenant model to Prisma schema**

Add to `backend/prisma/schema.prisma`:

```prisma
model Tenant {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  slug      String   @unique
  config    Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Step 4: Create migration SQL**

```sql
-- backend/prisma/migrations/add_tenant.sql
CREATE TABLE "Tenant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- Insert default tenant
INSERT INTO "Tenant" ("name", "slug") VALUES ('Default', 'default');
```

**Step 5: Update seed.ts** — add default tenant creation if not exists

**Step 6: Run migration, generate Prisma client, run test**

Run: `cd backend && npx prisma generate && npx vitest run src/__tests__/tenant.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/add_tenant.sql backend/prisma/seed.ts backend/src/__tests__/tenant.test.ts
git commit -m "feat: add Tenant model with default tenant"
```

---

### Task 2: Add tenant_id to existing tables + RLS policies

**Files:**
- Create: `backend/prisma/migrations/add_tenant_id_and_rls.sql`
- Modify: `backend/prisma/schema.prisma` (add tenantId to all models)
- Modify: `backend/src/middleware/auth.ts` (set tenant context on request)
- Create: `backend/src/middleware/tenantContext.ts`
- Test: `backend/src/__tests__/rls.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/__tests__/rls.test.ts
import { describe, it, expect } from 'vitest'
import { prisma } from '../db/prisma'

describe('RLS', () => {
  it('Event table has tenantId column', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Event' AND column_name = 'tenantId'
    `
    expect(columns.length).toBe(1)
  })

  it('RLS is enabled on Event table', async () => {
    const result = await prisma.$queryRaw<{ rowsecurity: boolean }[]>`
      SELECT rowsecurity FROM pg_tables WHERE tablename = 'Event'
    `
    expect(result[0].rowsecurity).toBe(true)
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Create migration**

Add `tenantId` (UUID, FK → Tenant, NOT NULL with default from the default tenant) to all existing tables: Event, Sport, Competition, Contract, Encoder, TechPlan, Resource, ResourceAssignment, CrewMember, CrewTemplate, Notification, SavedView, AuditLog, AppSetting, EncoderLock.

Enable RLS on each table with policy: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

Create helper function:

```sql
CREATE OR REPLACE FUNCTION set_tenant_context(tid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.tenant_id', tid::text, true); -- true = local to transaction
END;
$$ LANGUAGE plpgsql;
```

**Step 4: Add tenantId to all Prisma models**

Every model gets:
```prisma
tenantId  String  @db.Uuid
tenant    Tenant  @relation(fields: [tenantId], references: [id])
```

**Step 5: Create tenant context middleware**

```typescript
// backend/src/middleware/tenantContext.ts
import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/prisma'

export async function setTenantContext(req: Request, _res: Response, next: NextFunction) {
  // For now: all requests use default tenant
  // Later: derive from JWT or subdomain
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } })
  if (tenant) {
    await prisma.$executeRawUnsafe(`SELECT set_tenant_context('${tenant.id}')`)
    ;(req as any).tenantId = tenant.id
  }
  next()
}
```

**Step 6: Wire middleware into Express app** in `backend/src/index.ts` — add `app.use(setTenantContext)` after auth middleware.

**Step 7: Run migration, regenerate, run tests**

Expected: PASS

**Step 8: Commit**

```bash
git commit -m "feat: add tenant_id to all tables with RLS policies"
```

---

### Task 3: Update all existing routes to include tenantId

**Files:**
- Modify: All route files in `backend/src/routes/` (20 files)
- Modify: `backend/src/middleware/tenantContext.ts` (attach to req)

**Step 1: Update tenantContext middleware** to attach `req.tenantId` reliably.

**Step 2: Update each route's Prisma queries** to include `where: { tenantId: req.tenantId }` on all reads and `data: { tenantId: req.tenantId }` on all creates.

Do this file by file:
- `events.ts` — all Event queries
- `sports.ts` — all Sport queries
- `competitions.ts` — all Competition queries
- `contracts.ts` — all Contract queries
- `encoders.ts` — all Encoder queries
- `techPlans.ts` — all TechPlan queries
- `resources.ts` — all Resource/ResourceAssignment queries
- `crewMembers.ts` — all CrewMember queries
- `crewTemplates.ts` — all CrewTemplate queries
- `audit.ts` — all AuditLog queries
- `settings.ts` — all AppSetting queries
- `notifications.ts` — all Notification queries
- `users.ts` — User queries (scoped differently — users belong to tenant)
- `publish.ts` — WebhookEndpoint/Delivery queries
- `savedViews.ts` — SavedView queries
- `fieldConfig.ts` — FieldDefinition/CustomFieldValue queries
- `import.ts`, `csvImport.ts`, `importSchedules.ts` — import system queries

**Step 3: Run existing test suite** to verify nothing broke

Run: `cd backend && npx vitest run`

**Step 4: Commit**

```bash
git commit -m "feat: scope all existing routes to tenant context"
```

---

## Phase 2: Competition Structure Deepening

### Task 4: Add Venue, Team, Court models

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_venue_team_court.sql`
- Create: `backend/src/routes/venues.ts`
- Create: `backend/src/routes/teams.ts`
- Create: `backend/src/routes/courts.ts`
- Modify: `backend/src/index.ts` (register routes)
- Test: `backend/src/__tests__/venues.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/__tests__/venues.test.ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../index'

describe('GET /api/venues', () => {
  it('returns empty list initially', async () => {
    const res = await request(app).get('/api/venues').set('Authorization', `Bearer ${testToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add Prisma models**

```prisma
model Venue {
  id        Int      @id @default(autoincrement())
  tenantId  String   @db.Uuid
  name      String
  timezone  String   // IANA timezone (e.g. "Europe/Brussels")
  country   String?
  address   String?
  capacity  Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  courts    Court[]
  events    Event[]
  @@unique([tenantId, name])
}

model Team {
  id           Int      @id @default(autoincrement())
  tenantId     String   @db.Uuid
  name         String
  shortName    String?
  country      String?
  logoUrl      String?
  externalRefs Json     @default("{}")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, name])
}

model Court {
  id                Int      @id @default(autoincrement())
  tenantId          String   @db.Uuid
  venueId           Int
  name              String
  capacity          Int?
  hasRoof           Boolean  @default(false)
  isShowCourt       Boolean  @default(false)
  broadcastPriority Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  venue             Venue    @relation(fields: [venueId], references: [id])
  @@unique([venueId, name])
}
```

**Step 4: Create route files** — standard CRUD for each (list, get, create, update, delete). Follow pattern from existing routes like `sports.ts`.

**Step 5: Register routes in index.ts**

```typescript
app.use('/api/venues', authenticate, venueRoutes)
app.use('/api/teams', authenticate, teamRoutes)
app.use('/api/courts', authenticate, courtRoutes)
```

**Step 6: Run migration, generate, run tests**

Expected: PASS

**Step 7: Commit**

```bash
git commit -m "feat: add Venue, Team, Court models with CRUD routes"
```

---

### Task 5: Add Season, Stage, Round models

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_season_stage_round.sql`
- Create: `backend/src/routes/seasons.ts`
- Modify: `backend/prisma/schema.prisma` (add relations to Event)
- Test: `backend/src/__tests__/seasons.test.ts`

**Step 1: Write failing test**

```typescript
describe('Season hierarchy', () => {
  it('creates season with stages and rounds', async () => {
    // Create competition first, then season, stage, round
    const season = await prisma.season.create({
      data: {
        tenantId: defaultTenantId,
        competitionId: testCompetition.id,
        name: '2025-26',
        startDate: new Date('2025-08-01'),
        endDate: new Date('2026-05-31'),
        sportMetadata: {},
        stages: {
          create: {
            tenantId: defaultTenantId,
            name: 'League Phase',
            stageType: 'LEAGUE',
            sortOrder: 1,
            advancementRules: {},
            sportMetadata: {},
            rounds: {
              create: {
                tenantId: defaultTenantId,
                name: 'Matchday 1',
                roundNumber: 1,
              }
            }
          }
        }
      },
      include: { stages: { include: { rounds: true } } }
    })
    expect(season.stages).toHaveLength(1)
    expect(season.stages[0].rounds).toHaveLength(1)
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add Prisma models**

```prisma
enum StageType {
  LEAGUE
  GROUP
  KNOCKOUT
  QUALIFIER
  TOURNAMENT_MAIN
}

model Season {
  id            Int         @id @default(autoincrement())
  tenantId      String      @db.Uuid
  competitionId Int
  name          String      // "2025-26", "Indian Wells 2026"
  startDate     DateTime    @db.Date
  endDate       DateTime    @db.Date
  sportMetadata Json        @default("{}")
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  competition   Competition @relation(fields: [competitionId], references: [id])
  stages        Stage[]
  events        Event[]
  @@unique([tenantId, competitionId, name])
}

model Stage {
  id               Int       @id @default(autoincrement())
  tenantId         String    @db.Uuid
  seasonId         Int
  name             String
  stageType        StageType
  sortOrder        Int       @default(0)
  advancementRules Json      @default("{}")
  sportMetadata    Json      @default("{}")
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  tenant           Tenant    @relation(fields: [tenantId], references: [id])
  season           Season    @relation(fields: [seasonId], references: [id])
  rounds           Round[]
  events           Event[]
}

model Round {
  id                 Int       @id @default(autoincrement())
  tenantId           String    @db.Uuid
  stageId            Int
  name               String
  roundNumber        Int
  scheduledDateStart DateTime? @db.Date
  scheduledDateEnd   DateTime? @db.Date
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  tenant             Tenant    @relation(fields: [tenantId], references: [id])
  stage              Stage     @relation(fields: [stageId], references: [id])
  events             Event[]
}
```

**Step 4: Add optional FKs to Event model**

```prisma
// Add to existing Event model:
  seasonId  Int?
  stageId   Int?
  roundId   Int?
  venueId   Int?
  schedulingMode SchedulingMode @default(FIXED)
  sportMetadata  Json           @default("{}")
  externalRefs   Json           @default("{}")
  season    Season?  @relation(fields: [seasonId], references: [id])
  stage     Stage?   @relation(fields: [stageId], references: [id])
  round     Round?   @relation(fields: [roundId], references: [id])
  venue     Venue?   @relation(fields: [venueId], references: [id])
```

```prisma
enum SchedulingMode {
  FIXED
  FLOATING
  WINDOW
}
```

**Step 5: Create seasons route** — CRUD with nested stage/round creation. List by competition.

**Step 6: Run migration, generate, run tests**

**Step 7: Commit**

```bash
git commit -m "feat: add Season, Stage, Round hierarchy with Event relations"
```

---

### Task 6: Add shared types to @planza/shared

**Files:**
- Modify: `packages/shared/types.ts`
- Modify: `src/data/types.ts`

**Step 1: Add new types to shared package**

```typescript
// packages/shared/types.ts — append:

export type SchedulingMode = 'FIXED' | 'FLOATING' | 'WINDOW'
export type StageType = 'LEAGUE' | 'GROUP' | 'KNOCKOUT' | 'QUALIFIER' | 'TOURNAMENT_MAIN'

export type OverrunStrategy = 'EXTEND' | 'CONDITIONAL_SWITCH' | 'HARD_CUT' | 'SPLIT_SCREEN'
export type AnchorType = 'FIXED_TIME' | 'COURT_POSITION' | 'FOLLOWS_MATCH' | 'HANDOFF' | 'NOT_BEFORE'
export type BroadcastSlotStatus = 'PLANNED' | 'LIVE' | 'OVERRUN' | 'SWITCHED_OUT' | 'COMPLETED' | 'VOIDED'
export type ContentSegment = 'FULL' | 'CONTINUATION'
export type DraftStatus = 'EDITING' | 'VALIDATING' | 'PUBLISHED'
export type RunType = 'LIVE' | 'CONTINUATION' | 'TAPE_DELAY' | 'HIGHLIGHTS' | 'CLIP'
export type RunStatus = 'PENDING' | 'CONFIRMED' | 'RECONCILED' | 'DISPUTED'
export type CoverageType = 'LIVE' | 'HIGHLIGHTS' | 'DELAYED' | 'CLIP'
export type Platform = 'LINEAR' | 'OTT' | 'SVOD' | 'AVOD' | 'PPV' | 'STREAMING'
export type SwitchTriggerType = 'CONDITIONAL' | 'REACTIVE' | 'EMERGENCY' | 'HARD_CUT' | 'COURT_SWITCH'
export type SwitchExecutionStatus = 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED'
export type OutboxPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type AdapterType = 'LIVE_SCORE' | 'OOP' | 'LIVE_TIMING' | 'AS_RUN' | 'EPG' | 'PLAYOUT' | 'NOTIFICATION'
export type AdapterDirection = 'INBOUND' | 'OUTBOUND'

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface ValidationResult {
  severity: ValidationSeverity
  code: string
  scope: string[]  // affected entity IDs
  message: string
  remediation?: string
}
```

**Step 2: Add frontend types to `src/data/types.ts`**

```typescript
export interface Tenant {
  id: string
  name: string
  slug: string
  config: Record<string, unknown>
}

export interface Venue {
  id: number
  tenantId: string
  name: string
  timezone: string
  country?: string
  address?: string
  capacity?: number
}

export interface Team {
  id: number
  tenantId: string
  name: string
  shortName?: string
  country?: string
  logoUrl?: string
}

export interface Court {
  id: number
  tenantId: string
  venueId: number
  name: string
  hasRoof: boolean
  isShowCourt: boolean
  broadcastPriority: number
}

export interface Season {
  id: number
  tenantId: string
  competitionId: number
  name: string
  startDate: string
  endDate: string
  sportMetadata: Record<string, unknown>
  stages?: Stage[]
}

export interface Stage {
  id: number
  tenantId: string
  seasonId: number
  name: string
  stageType: StageType
  sortOrder: number
  advancementRules: Record<string, unknown>
  sportMetadata: Record<string, unknown>
  rounds?: Round[]
}

export interface Round {
  id: number
  tenantId: string
  stageId: number
  name: string
  roundNumber: number
  scheduledDateStart?: string
  scheduledDateEnd?: string
}

export interface Channel {
  id: number
  tenantId: string
  name: string
  timezone: string
  broadcastDayStartLocal: string
  epgConfig: Record<string, unknown>
  color: string
}

export interface BroadcastSlot {
  id: string
  tenantId: string
  channelId: number
  eventId?: number
  schedulingMode: SchedulingMode
  plannedStartUtc?: string
  plannedEndUtc?: string
  estimatedStartUtc?: string
  estimatedEndUtc?: string
  earliestStartUtc?: string
  latestStartUtc?: string
  actualStartUtc?: string
  actualEndUtc?: string
  bufferBeforeMin: number
  bufferAfterMin: number
  expectedDurationMin?: number
  overrunStrategy: OverrunStrategy
  conditionalTriggerUtc?: string
  conditionalTargetChannelId?: number
  anchorType: AnchorType
  coveragePriority: number
  fallbackEventId?: number
  status: BroadcastSlotStatus
  contentSegment: ContentSegment
  scheduleVersionId?: string
  sportMetadata: Record<string, unknown>
  event?: Event
  channel?: Channel
}

export interface ScheduleDraft {
  id: string
  tenantId: string
  channelId: number
  dateRangeStart: string
  dateRangeEnd: string
  version: number
  status: DraftStatus
  channel?: Channel
}

export interface ScheduleVersion {
  id: string
  tenantId: string
  channelId: number
  draftId: string
  versionNumber: number
  publishedAt: string
  publishedBy: string
  isEmergency: boolean
  acknowledgedWarnings: ValidationResult[]
}

export interface CascadeEstimate {
  id: string
  eventId: number
  estimatedStartUtc: string
  earliestStartUtc: string
  latestStartUtc: string
  estDurationShortMin: number
  estDurationLongMin: number
  confidenceScore: number
  computedAt: string
}
```

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git commit -m "feat: add broadcast middleware types to shared package and frontend"
```

---

## Phase 3: Channel & BroadcastSlot

### Task 7: Add Channel model and CRUD

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_channel.sql`
- Create: `backend/src/routes/channels.ts`
- Modify: `backend/src/index.ts`
- Create: `src/services/channels.ts`
- Test: `backend/src/__tests__/channels.test.ts`

**Step 1: Write failing test**

```typescript
describe('Channels', () => {
  it('POST /api/channels creates a channel', async () => {
    const res = await request(app)
      .post('/api/channels')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sports 1', timezone: 'Europe/Brussels', color: '#3B82F6' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Sports 1')
    expect(res.body.broadcastDayStartLocal).toBe('06:00')
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add Channel model**

```prisma
model Channel {
  id                     Int      @id @default(autoincrement())
  tenantId               String   @db.Uuid
  name                   String
  timezone               String   @default("Europe/Brussels")
  broadcastDayStartLocal String   @default("06:00")
  epgConfig              Json     @default("{}")
  color                  String   @default("#3B82F6")
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  tenant                 Tenant   @relation(fields: [tenantId], references: [id])
  broadcastSlots         BroadcastSlot[]
  scheduleDrafts         ScheduleDraft[]
  scheduleVersions       ScheduleVersion[]
  @@unique([tenantId, name])
}
```

**Step 4: Create route** — CRUD following existing pattern. Admin-only for create/update/delete.

**Step 5: Create frontend service**

```typescript
// src/services/channels.ts
import { api } from '../utils/api'
import type { Channel } from '../data/types'

export const channelsApi = {
  list: () => api.get<Channel[]>('/channels'),
  get: (id: number) => api.get<Channel>(`/channels/${id}`),
  create: (data: Partial<Channel>) => api.post<Channel>('/channels', data),
  update: (id: number, data: Partial<Channel>) => api.put<Channel>(`/channels/${id}`, data),
  delete: (id: number) => api.delete(`/channels/${id}`),
}
```

**Step 6: Run migration, generate, run tests**

**Step 7: Commit**

```bash
git commit -m "feat: add Channel model with CRUD routes"
```

---

### Task 8: Add BroadcastSlot model and CRUD

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_broadcast_slot.sql`
- Create: `backend/src/routes/broadcastSlots.ts`
- Create: `src/services/broadcastSlots.ts`
- Test: `backend/src/__tests__/broadcastSlots.test.ts`

**Step 1: Write failing test**

```typescript
describe('BroadcastSlot', () => {
  it('creates a FIXED slot for a football match', async () => {
    const res = await request(app)
      .post('/api/broadcast-slots')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        channelId: sportsChannel.id,
        eventId: footballMatch.id,
        schedulingMode: 'FIXED',
        plannedStartUtc: '2026-03-15T19:30:00Z',
        plannedEndUtc: '2026-03-15T21:55:00Z',
        bufferBeforeMin: 15,
        bufferAfterMin: 25,
        expectedDurationMin: 105,
        overrunStrategy: 'EXTEND',
        anchorType: 'FIXED_TIME',
      })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('PLANNED')
    expect(res.body.contentSegment).toBe('FULL')
  })

  it('creates a FLOATING slot for a tennis match', async () => {
    const res = await request(app)
      .post('/api/broadcast-slots')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        channelId: sportsChannel.id,
        eventId: tennisMatch.id,
        schedulingMode: 'FLOATING',
        anchorType: 'FOLLOWS_MATCH',
        bufferBeforeMin: 15,
        bufferAfterMin: 20,
        overrunStrategy: 'CONDITIONAL_SWITCH',
      })
    expect(res.status).toBe(201)
    expect(res.body.schedulingMode).toBe('FLOATING')
    expect(res.body.plannedStartUtc).toBeNull()
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add BroadcastSlot model**

```prisma
model BroadcastSlot {
  id                         String               @id @default(uuid()) @db.Uuid
  tenantId                   String               @db.Uuid
  channelId                  Int
  eventId                    Int?
  schedulingMode             SchedulingMode       @default(FIXED)
  plannedStartUtc            DateTime?            @db.Timestamptz
  plannedEndUtc              DateTime?            @db.Timestamptz
  estimatedStartUtc          DateTime?            @db.Timestamptz
  estimatedEndUtc            DateTime?            @db.Timestamptz
  earliestStartUtc           DateTime?            @db.Timestamptz
  latestStartUtc             DateTime?            @db.Timestamptz
  actualStartUtc             DateTime?            @db.Timestamptz
  actualEndUtc               DateTime?            @db.Timestamptz
  bufferBeforeMin            Int                  @default(15)
  bufferAfterMin             Int                  @default(25)
  expectedDurationMin        Int?
  overrunStrategy            OverrunStrategy      @default(EXTEND)
  conditionalTriggerUtc      DateTime?            @db.Timestamptz
  conditionalTargetChannelId Int?
  anchorType                 AnchorType           @default(FIXED_TIME)
  coveragePriority           Int                  @default(1)
  fallbackEventId            Int?
  status                     BroadcastSlotStatus  @default(PLANNED)
  contentSegment             ContentSegment       @default(FULL)
  scheduleVersionId          String?              @db.Uuid
  sportMetadata              Json                 @default("{}")
  createdAt                  DateTime             @default(now())
  updatedAt                  DateTime             @updatedAt
  tenant                     Tenant               @relation(fields: [tenantId], references: [id])
  channel                    Channel              @relation(fields: [channelId], references: [id])
  event                      Event?               @relation(fields: [eventId], references: [id])
  scheduleVersion            ScheduleVersion?     @relation(fields: [scheduleVersionId], references: [id])
  runLedgerEntries           RunLedger[]
  switchesFrom               ChannelSwitchAction[] @relation("SwitchFrom")
  switchesTo                 ChannelSwitchAction[] @relation("SwitchTo")
}

enum OverrunStrategy {
  EXTEND
  CONDITIONAL_SWITCH
  HARD_CUT
  SPLIT_SCREEN
}

enum AnchorType {
  FIXED_TIME
  COURT_POSITION
  FOLLOWS_MATCH
  HANDOFF
  NOT_BEFORE
}

enum BroadcastSlotStatus {
  PLANNED
  LIVE
  OVERRUN
  SWITCHED_OUT
  COMPLETED
  VOIDED
}

enum ContentSegment {
  FULL
  CONTINUATION
}
```

**Step 4: Create route** — CRUD + list by channel + list by date range. Planner+ role.

**Step 5: Create frontend service**

```typescript
// src/services/broadcastSlots.ts
import { api } from '../utils/api'
import type { BroadcastSlot } from '../data/types'

export const broadcastSlotsApi = {
  list: (params?: { channelId?: number; dateStart?: string; dateEnd?: string }) =>
    api.get<BroadcastSlot[]>('/broadcast-slots', params),
  get: (id: string) => api.get<BroadcastSlot>(`/broadcast-slots/${id}`),
  create: (data: Partial<BroadcastSlot>) => api.post<BroadcastSlot>('/broadcast-slots', data),
  update: (id: string, data: Partial<BroadcastSlot>) =>
    api.put<BroadcastSlot>(`/broadcast-slots/${id}`, data),
  delete: (id: string) => api.delete(`/broadcast-slots/${id}`),
}
```

**Step 6: Run migration, generate, run tests**

**Step 7: Commit**

```bash
git commit -m "feat: add BroadcastSlot model with CRUD routes"
```

---

## Phase 4: Schedule Versioning & Validation

### Task 9: Add ScheduleDraft and ScheduleVersion models

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_schedule_draft_version.sql`
- Create: `backend/src/routes/schedules.ts`
- Create: `src/services/schedules.ts`
- Test: `backend/src/__tests__/schedules.test.ts`

**Step 1: Write failing test**

```typescript
describe('ScheduleDraft', () => {
  it('creates a draft for a channel', async () => {
    const res = await request(app)
      .post('/api/schedule-drafts')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        channelId: sportsChannel.id,
        dateRangeStart: '2026-03-15',
        dateRangeEnd: '2026-03-21',
      })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('EDITING')
    expect(res.body.version).toBe(1)
  })

  it('appends operations to draft with optimistic locking', async () => {
    const res = await request(app)
      .patch(`/api/schedule-drafts/${draftId}`)
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        version: 1,
        operations: [
          { op: 'INSERT_ITEM', slot: { eventId: match.id, channelId: sportsChannel.id, plannedStartUtc: '2026-03-15T19:30:00Z' } }
        ]
      })
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(2)
  })

  it('rejects stale version', async () => {
    const res = await request(app)
      .patch(`/api/schedule-drafts/${draftId}`)
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ version: 1, operations: [{ op: 'DELETE_ITEM', slotId: 'some-id' }] })
    expect(res.status).toBe(409)
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add Prisma models**

```prisma
enum DraftStatus {
  EDITING
  VALIDATING
  PUBLISHED
}

model ScheduleDraft {
  id             String      @id @default(uuid()) @db.Uuid
  tenantId       String      @db.Uuid
  channelId      Int
  dateRangeStart DateTime    @db.Date
  dateRangeEnd   DateTime    @db.Date
  operations     Json        @default("[]") // append-only operation log
  version        Int         @default(1)
  status         DraftStatus @default(EDITING)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  tenant         Tenant      @relation(fields: [tenantId], references: [id])
  channel        Channel     @relation(fields: [channelId], references: [id])
  versions       ScheduleVersion[]
  @@unique([tenantId, channelId, dateRangeStart, dateRangeEnd])
}

model ScheduleVersion {
  id                   String    @id @default(uuid()) @db.Uuid
  tenantId             String    @db.Uuid
  channelId            Int
  draftId              String    @db.Uuid
  versionNumber        Int
  snapshot             Json      // immutable slot snapshot
  publishedAt          DateTime  @default(now()) @db.Timestamptz
  publishedBy          String
  isEmergency          Boolean   @default(false)
  reasonCode           String?
  acknowledgedWarnings Json      @default("[]")
  tenant               Tenant    @relation(fields: [tenantId], references: [id])
  channel              Channel   @relation(fields: [channelId], references: [id])
  draft                ScheduleDraft @relation(fields: [draftId], references: [id])
  broadcastSlots       BroadcastSlot[]
}
```

**Step 4: Create schedules route**

Endpoints:
- `POST /api/schedule-drafts` — create draft
- `GET /api/schedule-drafts` — list (by channel, date range)
- `GET /api/schedule-drafts/:id` — get with materialized slot state
- `PATCH /api/schedule-drafts/:id` — append operations (with optimistic locking)
- `POST /api/schedule-drafts/:id/publish` — validate + publish (Task 10)
- `GET /api/schedule-versions` — list published versions
- `GET /api/schedule-versions/:id` — get snapshot

**Step 5: Run migration, generate, run tests**

**Step 6: Commit**

```bash
git commit -m "feat: add ScheduleDraft and ScheduleVersion with optimistic locking"
```

---

### Task 10: Validation pipeline

**Files:**
- Create: `backend/src/services/validation/index.ts`
- Create: `backend/src/services/validation/structural.ts`
- Create: `backend/src/services/validation/duration.ts`
- Create: `backend/src/services/validation/rights.ts`
- Create: `backend/src/services/validation/regulatory.ts`
- Create: `backend/src/services/validation/business.ts`
- Modify: `backend/src/routes/schedules.ts` (wire into publish endpoint)
- Test: `backend/src/__tests__/validation.test.ts`

**Step 1: Write failing tests**

```typescript
// backend/src/__tests__/validation.test.ts
import { describe, it, expect } from 'vitest'
import { validateSchedule } from '../services/validation'

describe('Validation Pipeline', () => {
  describe('Stage 1 — Structural', () => {
    it('returns OVERLAP_FIXED_SLOTS error when two fixed slots overlap on same channel', () => {
      const slots = [
        { id: '1', channelId: 1, schedulingMode: 'FIXED', plannedStartUtc: '2026-03-15T19:00:00Z', plannedEndUtc: '2026-03-15T21:00:00Z' },
        { id: '2', channelId: 1, schedulingMode: 'FIXED', plannedStartUtc: '2026-03-15T20:00:00Z', plannedEndUtc: '2026-03-15T22:00:00Z' },
      ]
      const results = validateSchedule(slots, { rightsPolices: [], events: [] })
      const errors = results.filter(r => r.severity === 'ERROR')
      expect(errors.some(e => e.code === 'OVERLAP_FIXED_SLOTS')).toBe(true)
    })

    it('returns no errors for non-overlapping fixed slots', () => {
      const slots = [
        { id: '1', channelId: 1, schedulingMode: 'FIXED', plannedStartUtc: '2026-03-15T19:00:00Z', plannedEndUtc: '2026-03-15T21:00:00Z' },
        { id: '2', channelId: 1, schedulingMode: 'FIXED', plannedStartUtc: '2026-03-15T21:00:00Z', plannedEndUtc: '2026-03-15T23:00:00Z' },
      ]
      const results = validateSchedule(slots, { rightsPolices: [], events: [] })
      const errors = results.filter(r => r.severity === 'ERROR')
      expect(errors).toHaveLength(0)
    })
  })

  describe('Stage 3 — Rights', () => {
    it('returns RIGHTS_RUN_EXCEEDED when broadcast count exceeds limit', () => {
      const slots = [{ id: '1', eventId: 42, channelId: 1 }]
      const context = {
        rightsPolicies: [{ competitionId: 1, maxLiveRuns: 2 }],
        existingRuns: [
          { eventId: 42, runType: 'LIVE' },
          { eventId: 42, runType: 'LIVE' },
        ],
        events: [{ id: 42, competitionId: 1 }],
      }
      const results = validateSchedule(slots, context)
      expect(results.some(r => r.code === 'RIGHTS_RUN_EXCEEDED')).toBe(true)
    })
  })
})
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement validation pipeline**

```typescript
// backend/src/services/validation/index.ts
import { validateStructural } from './structural'
import { validateDuration } from './duration'
import { validateRights } from './rights'
import { validateRegulatory } from './regulatory'
import { validateBusiness } from './business'
import type { ValidationResult } from '@planza/shared'

export interface ValidationContext {
  rightsPolicies: any[]
  existingRuns?: any[]
  events: any[]
}

export function validateSchedule(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  return [
    ...validateStructural(slots),
    ...validateDuration(slots),
    ...validateRights(slots, context),
    ...validateRegulatory(slots),
    ...validateBusiness(slots, context),
  ]
}
```

Implement each stage file with the rules from the design doc (Section 4). Each rule is a pure function taking slots and returning `ValidationResult[]`.

**Step 4: Wire into publish endpoint**

In `POST /api/schedule-drafts/:id/publish`:
1. Load draft + materialized slots + rights policies + existing runs
2. Call `validateSchedule(slots, context)`
3. If any ERROR results → return 422 with results, set draft status back to EDITING
4. If only WARNING/INFO → check if client sent `acknowledgeWarnings: true`
5. On success → create ScheduleVersion, update BroadcastSlot.scheduleVersionId

**Step 5: Run tests**

Expected: PASS

**Step 6: Commit**

```bash
git commit -m "feat: add 5-stage validation pipeline for schedule publishing"
```

---

## Phase 5: Rights & Run Tracking

### Task 11: Add RightsPolicy and RunLedger models

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_rights_and_run_ledger.sql`
- Create: `backend/src/routes/rights.ts`
- Create: `src/services/rights.ts`
- Test: `backend/src/__tests__/rights.test.ts`

**Step 1: Write failing test**

```typescript
describe('RightsPolicy', () => {
  it('creates a rights policy for a competition', async () => {
    const res = await request(app)
      .post('/api/rights-policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        competitionId: championsLeague.id,
        territory: ['BE', 'NL'],
        platforms: ['LINEAR', 'OTT'],
        coverageType: 'LIVE',
        maxLiveRuns: 4,
      })
    expect(res.status).toBe(201)
  })
})

describe('RunLedger', () => {
  it('records a broadcast run', async () => {
    const res = await request(app)
      .post('/api/run-ledger')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        broadcastSlotId: slot.id,
        eventId: match.id,
        channelId: sportsChannel.id,
        runType: 'LIVE',
      })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('PENDING')
  })

  it('counts continuation + primary as one rights run', async () => {
    // Create primary run
    const primary = await createRun({ runType: 'LIVE', eventId: 42 })
    // Create continuation linked to primary
    await createRun({ runType: 'CONTINUATION', eventId: 42, parentRunId: primary.id })
    // Check: should count as 1 run against policy
    const count = await getRunCount(42)
    expect(count).toBe(1)
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add Prisma models**

```prisma
enum CoverageType {
  LIVE
  HIGHLIGHTS
  DELAYED
  CLIP
}

enum Platform {
  LINEAR
  OTT
  SVOD
  AVOD
  PPV
  STREAMING
}

enum RunType {
  LIVE
  CONTINUATION
  TAPE_DELAY
  HIGHLIGHTS
  CLIP
}

enum RunStatus {
  PENDING
  CONFIRMED
  RECONCILED
  DISPUTED
}

model RightsPolicy {
  id                   String       @id @default(uuid()) @db.Uuid
  tenantId             String       @db.Uuid
  competitionId        Int
  seasonId             Int?
  stageIds             String[]     @db.Uuid
  territory            String[]     // ISO 3166-1 alpha-2
  platforms            Platform[]
  coverageType         CoverageType @default(LIVE)
  maxLiveRuns          Int?         // null = unlimited
  maxPickRunsPerRound  Int?
  windowStartUtc       DateTime?    @db.Timestamptz
  windowEndUtc         DateTime?    @db.Timestamptz
  tapeDelayHoursMin    Int?
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt
  tenant               Tenant       @relation(fields: [tenantId], references: [id])
  competition          Competition  @relation(fields: [competitionId], references: [id])
}

model RunLedger {
  id              String    @id @default(uuid()) @db.Uuid
  tenantId        String    @db.Uuid
  broadcastSlotId String    @db.Uuid
  eventId         Int
  channelId       Int
  runType         RunType   @default(LIVE)
  parentRunId     String?   @db.Uuid
  startedAtUtc    DateTime? @db.Timestamptz
  endedAtUtc      DateTime? @db.Timestamptz
  durationMin     Int?
  status          RunStatus @default(PENDING)
  createdAt       DateTime  @default(now())
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  broadcastSlot   BroadcastSlot @relation(fields: [broadcastSlotId], references: [id])
  parentRun       RunLedger?    @relation("RunChain", fields: [parentRunId], references: [id])
  childRuns       RunLedger[]   @relation("RunChain")
  @@unique([tenantId, broadcastSlotId, runType])
}
```

**Step 4: Create rights routes**

- `GET /api/rights-policies` — list (filter by competition, territory)
- `POST /api/rights-policies` — create (admin only)
- `PUT /api/rights-policies/:id` — update
- `DELETE /api/rights-policies/:id` — delete
- `GET /api/run-ledger` — list (filter by event, channel, date range)
- `POST /api/run-ledger` — record run
- `GET /api/run-ledger/count/:eventId` — get run count (counting CONTINUATION with parent as 1)

**Step 5: Run migration, generate, run tests**

**Step 6: Commit**

```bash
git commit -m "feat: add RightsPolicy and RunLedger with run counting"
```

---

## Phase 6: Outbox & BullMQ Infrastructure

### Task 12: Add OutboxEvent model and BullMQ setup

**Files:**
- Modify: `backend/package.json` (add bullmq, ioredis)
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_outbox.sql`
- Create: `backend/src/services/outbox.ts`
- Create: `backend/src/services/queue.ts`
- Create: `backend/src/workers/outboxConsumer.ts`
- Modify: `backend/src/worker.ts` (register outbox consumer)
- Test: `backend/src/__tests__/outbox.test.ts`

**Step 1: Install dependencies**

Run: `cd backend && npm install bullmq ioredis`

**Step 2: Write failing test**

```typescript
describe('Outbox', () => {
  it('writeOutboxEvent creates an event in the same transaction', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: match.id }, data: { status: 'live' } })
      await writeOutboxEvent(tx, {
        tenantId: defaultTenantId,
        eventType: 'fixture.status_changed',
        aggregateType: 'Event',
        aggregateId: match.id.toString(),
        payload: { status: 'live' },
      })
    })

    const outbox = await prisma.outboxEvent.findFirst({
      where: { eventType: 'fixture.status_changed' }
    })
    expect(outbox).not.toBeNull()
    expect(outbox!.processedAt).toBeNull()
  })
})
```

**Step 3: Run test — expect FAIL**

**Step 4: Add OutboxEvent model**

```prisma
enum OutboxPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

model OutboxEvent {
  id             String         @id @default(uuid()) @db.Uuid
  tenantId       String         @db.Uuid
  eventType      String
  aggregateType  String
  aggregateId    String
  payload        Json
  idempotencyKey String         @unique
  priority       OutboxPriority @default(NORMAL)
  createdAt      DateTime       @default(now()) @db.Timestamptz
  processedAt    DateTime?      @db.Timestamptz
  failedAt       DateTime?      @db.Timestamptz
  retryCount     Int            @default(0)
  maxRetries     Int            @default(5)
  deadLetteredAt DateTime?      @db.Timestamptz
  tenant         Tenant         @relation(fields: [tenantId], references: [id])
}
```

**Step 5: Create outbox service**

```typescript
// backend/src/services/outbox.ts
import { PrismaClient, Prisma } from '@prisma/client'
import { v4 as uuid } from 'uuid'

interface OutboxParams {
  tenantId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  payload: unknown
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  idempotencyKey?: string
}

export async function writeOutboxEvent(
  tx: Prisma.TransactionClient,
  params: OutboxParams
) {
  return tx.outboxEvent.create({
    data: {
      tenantId: params.tenantId,
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      payload: params.payload as Prisma.JsonObject,
      priority: params.priority ?? 'NORMAL',
      idempotencyKey: params.idempotencyKey ?? `${params.eventType}:${params.aggregateId}:${uuid()}`,
    },
  })
}
```

**Step 6: Create BullMQ queue setup**

```typescript
// backend/src/services/queue.ts
import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

export const cascadeQueue = new Queue('cascade', { connection: redis })
export const alertQueue = new Queue('alerts', { connection: redis })
export const standingsQueue = new Queue('standings', { connection: redis })
export const bracketQueue = new Queue('bracket', { connection: redis })

export function createWorker(name: string, processor: any, opts?: { concurrency?: number }) {
  return new Worker(name, processor, {
    connection: redis,
    concurrency: opts?.concurrency ?? 1,
  })
}
```

**Step 7: Create outbox consumer**

```typescript
// backend/src/workers/outboxConsumer.ts
import { prisma } from '../db/prisma'
import { cascadeQueue, alertQueue, standingsQueue, bracketQueue } from '../services/queue'
import { logger } from '../utils/logger'

const EVENT_ROUTING: Record<string, string[]> = {
  'fixture.status_changed': ['cascade', 'standings', 'bracket'],
  'fixture.completed': ['standings', 'bracket'],
  'match.score_updated': ['cascade'],
  'cascade.recomputed': ['alerts'],
  'schedule.published': [],  // EPG adapter (future)
  'channel_switch.confirmed': [],  // EPG + playout (future)
}

const QUEUE_MAP: Record<string, any> = {
  cascade: cascadeQueue,
  alerts: alertQueue,
  standings: standingsQueue,
  bracket: bracketQueue,
}

export async function consumeOutbox() {
  const events = await prisma.$queryRaw<any[]>`
    SELECT * FROM "OutboxEvent"
    WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL
    ORDER BY
      CASE "priority"
        WHEN 'URGENT' THEN 0
        WHEN 'HIGH' THEN 1
        WHEN 'NORMAL' THEN 2
        WHEN 'LOW' THEN 3
      END,
      "createdAt" ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  `

  for (const event of events) {
    try {
      const queues = EVENT_ROUTING[event.eventType] || []
      for (const queueName of queues) {
        const queue = QUEUE_MAP[queueName]
        if (queue) {
          await queue.add(event.eventType, event.payload, {
            jobId: event.idempotencyKey,
          })
        }
      }
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      })
    } catch (err) {
      logger.error(`Outbox processing failed for ${event.id}:`, err)
      const retryCount = event.retryCount + 1
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: retryCount >= event.maxRetries
          ? { deadLetteredAt: new Date(), retryCount }
          : { retryCount, failedAt: new Date() },
      })
    }
  }

  return events.length
}
```

**Step 8: Wire into worker.ts** — add outbox consumer polling alongside existing import worker.

**Step 9: Run migration, generate, run tests**

**Step 10: Commit**

```bash
git commit -m "feat: add OutboxEvent model, BullMQ setup, and outbox consumer"
```

---

## Phase 7: CascadeEngine

### Task 13: Add CascadeEstimate model and duration estimator

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_cascade_estimate.sql`
- Create: `backend/src/services/cascade/estimator.ts`
- Create: `backend/src/services/cascade/engine.ts`
- Create: `backend/src/workers/cascadeWorker.ts`
- Test: `backend/src/__tests__/cascade.test.ts`

**Step 1: Write failing test**

```typescript
describe('DurationEstimator', () => {
  it('estimates BO3 tennis short duration as 65 min', () => {
    const event = { sportMetadata: { match_format: 'BEST_OF_3' }, sport: { name: 'Tennis' } }
    expect(shortDuration(event)).toBe(65)
  })

  it('estimates BO3 tennis long duration as 210 min', () => {
    const event = { sportMetadata: { match_format: 'BEST_OF_3' }, sport: { name: 'Tennis' } }
    expect(longDuration(event)).toBe(210)
  })

  it('estimates cycling flat duration from distance', () => {
    const event = { sportMetadata: { distance_km: 180, stage_profile: 'flat' }, sport: { name: 'Cycling' } }
    expect(shortDuration(event)).toBe(240) // 180/45*60
    expect(longDuration(event)).toBe(300) // 180/36*60
  })
})

describe('CascadeEngine', () => {
  it('chains matches on a court with degrading confidence', async () => {
    // Setup: 3 matches on Court 1, match 1 completed, match 2+3 scheduled
    const estimates = await runCascade(tenantId, court1.id, today)
    expect(estimates).toHaveLength(3)
    expect(estimates[0].confidenceScore).toBe(1.0) // completed
    expect(estimates[1].confidenceScore).toBeGreaterThan(0.8)
    expect(estimates[2].confidenceScore).toBeLessThan(estimates[1].confidenceScore)
  })
})
```

**Step 2: Run tests — expect FAIL**

**Step 3: Add CascadeEstimate model**

```prisma
model CascadeEstimate {
  id                 String   @id @default(uuid()) @db.Uuid
  tenantId           String   @db.Uuid
  eventId            Int
  estimatedStartUtc  DateTime? @db.Timestamptz
  earliestStartUtc   DateTime? @db.Timestamptz
  latestStartUtc     DateTime? @db.Timestamptz
  estDurationShortMin Int?
  estDurationLongMin  Int?
  confidenceScore    Float    @default(0.5)
  inputsUsed         Json     @default("{}")
  computedAt         DateTime @default(now()) @db.Timestamptz
  tenant             Tenant   @relation(fields: [tenantId], references: [id])
  event              Event    @relation(fields: [eventId], references: [id])
  @@unique([tenantId, eventId])
}
```

**Step 4: Implement duration estimator**

```typescript
// backend/src/services/cascade/estimator.ts

export interface DurationEstimator {
  shortDuration(event: any): number  // minutes
  longDuration(event: any): number   // minutes
  remainingDuration(event: any, liveScore: any): number
}

// V1: simple heuristics
export const heuristicEstimator: DurationEstimator = {
  shortDuration(event) {
    const meta = event.sportMetadata || {}
    const sport = event.sport?.name?.toLowerCase() || ''

    if (sport === 'tennis' || sport.includes('tennis')) {
      return meta.match_format === 'BEST_OF_5' ? 105 : 65
    }
    if (sport === 'cycling' || sport.includes('cycling')) {
      const km = meta.distance_km || 150
      const speed = meta.stage_profile === 'mountain' ? 40 : 45
      return Math.round((km / speed) * 60)
    }
    if (sport === 'formula 1' || sport.includes('f1')) {
      const laps = meta.circuit_laps || 60
      return Math.round((laps * 85) / 60)
    }
    // Default: football
    return 95
  },

  longDuration(event) {
    const meta = event.sportMetadata || {}
    const sport = event.sport?.name?.toLowerCase() || ''

    if (sport === 'tennis' || sport.includes('tennis')) {
      return meta.match_format === 'BEST_OF_5' ? 330 : 210
    }
    if (sport === 'cycling' || sport.includes('cycling')) {
      const km = meta.distance_km || 150
      const speed = meta.stage_profile === 'mountain' ? 32 : 36
      return Math.round((km / speed) * 60)
    }
    if (sport === 'formula 1' || sport.includes('f1')) {
      const laps = meta.circuit_laps || 60
      return Math.round((laps * 105) / 60)
    }
    // Default: football with ET + penalties
    return 140
  },

  remainingDuration(event, liveScore) {
    // V1: simple linear interpolation based on elapsed
    const elapsed = liveScore?.elapsedMin || 0
    const total = (this.shortDuration(event) + this.longDuration(event)) / 2
    return Math.max(0, total - elapsed)
  },
}
```

**Step 5: Implement CascadeEngine**

```typescript
// backend/src/services/cascade/engine.ts
import { prisma } from '../../db/prisma'
import { heuristicEstimator } from './estimator'
import { writeOutboxEvent } from '../outbox'
import { logger } from '../../utils/logger'

const CHANGEOVER_MIN = 15
const CONFIDENCE_DECAY = 0.85

export async function runCascade(tenantId: string, courtId: number, date: Date) {
  // Advisory lock per court+date
  const lockKey = `${courtId}_${date.toISOString().slice(0, 10)}`

  const events = await prisma.event.findMany({
    where: {
      tenantId,
      sportMetadata: { path: ['court_id'], equals: courtId },
      startDateBE: date,
    },
    include: { sport: true },
    orderBy: { sportMetadata: { path: ['order_on_court'] } },
  })

  // Note: actual implementation should use advisory lock via raw SQL
  // SELECT pg_advisory_xact_lock(hashtext($1))
  // For now, process sequentially

  const estimates = []
  let prevEnd: { earliest: Date | null; estimated: Date | null; latest: Date | null } = {
    earliest: null, estimated: null, latest: null
  }
  let prevConfidence = 1.0

  for (const event of events) {
    const meta = event.sportMetadata as any
    const status = event.status

    if (status === 'completed') {
      const est = {
        eventId: event.id,
        estimatedStartUtc: event.actualStartUtc || event.startDateBE,
        earliestStartUtc: event.actualStartUtc || event.startDateBE,
        latestStartUtc: event.actualStartUtc || event.startDateBE,
        estDurationShortMin: 0,
        estDurationLongMin: 0,
        confidenceScore: 1.0,
        computedAt: new Date(),
      }
      prevEnd = {
        earliest: event.actualEndUtc || addMinutes(est.estimatedStartUtc, heuristicEstimator.shortDuration(event)),
        estimated: event.actualEndUtc || addMinutes(est.estimatedStartUtc, heuristicEstimator.shortDuration(event)),
        latest: event.actualEndUtc || addMinutes(est.estimatedStartUtc, heuristicEstimator.shortDuration(event)),
      }
      prevConfidence = 1.0
      estimates.push(est)
      continue
    }

    const shortMin = heuristicEstimator.shortDuration(event)
    const longMin = heuristicEstimator.longDuration(event)
    const midMin = (shortMin + longMin) / 2
    const confidence = prevConfidence * CONFIDENCE_DECAY

    const notBefore = meta.not_before_utc ? new Date(meta.not_before_utc) : null

    let earliest: Date, estimated: Date, latest: Date

    if (!prevEnd.earliest) {
      // First match — use court open time or event start
      const courtOpen = new Date(event.startDateBE)
      earliest = notBefore ? maxDate(courtOpen, notBefore) : courtOpen
      estimated = earliest
      latest = earliest
    } else {
      const changeover = CHANGEOVER_MIN * 60 * 1000
      earliest = maxDate(
        new Date(prevEnd.earliest.getTime() + changeover),
        notBefore || new Date(0)
      )
      estimated = maxDate(
        new Date(prevEnd.estimated!.getTime() + changeover),
        notBefore || new Date(0)
      )
      latest = maxDate(
        new Date(prevEnd.latest!.getTime() + changeover),
        notBefore || new Date(0)
      )
    }

    const est = {
      eventId: event.id,
      estimatedStartUtc: estimated,
      earliestStartUtc: earliest,
      latestStartUtc: latest,
      estDurationShortMin: shortMin,
      estDurationLongMin: longMin,
      confidenceScore: Math.round(confidence * 100) / 100,
      computedAt: new Date(),
    }

    prevEnd = {
      earliest: addMinutes(earliest, shortMin),
      estimated: addMinutes(estimated, midMin),
      latest: addMinutes(latest, longMin),
    }
    prevConfidence = confidence
    estimates.push(est)
  }

  // Upsert all estimates
  for (const est of estimates) {
    await prisma.cascadeEstimate.upsert({
      where: { tenantId_eventId: { tenantId, eventId: est.eventId } },
      create: { tenantId, ...est, inputsUsed: {} },
      update: { ...est, inputsUsed: {} },
    })

    // Update linked BroadcastSlot
    await prisma.broadcastSlot.updateMany({
      where: { tenantId, eventId: est.eventId },
      data: {
        estimatedStartUtc: est.estimatedStartUtc,
        estimatedEndUtc: addMinutes(est.estimatedStartUtc, est.estDurationLongMin || 0),
        earliestStartUtc: est.earliestStartUtc,
        latestStartUtc: est.latestStartUtc,
      },
    })
  }

  return estimates
}

function addMinutes(date: Date, min: number): Date {
  return new Date(date.getTime() + min * 60 * 1000)
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b
}
```

**Step 6: Create cascade BullMQ worker**

```typescript
// backend/src/workers/cascadeWorker.ts
import { createWorker } from '../services/queue'
import { runCascade } from '../services/cascade/engine'
import { logger } from '../utils/logger'

export const cascadeWorker = createWorker('cascade', async (job) => {
  const { tenantId, courtId, date, eventId } = job.data
  logger.info(`Cascade recompute: court=${courtId}, date=${date}`)

  try {
    const estimates = await runCascade(tenantId, courtId, new Date(date))
    logger.info(`Cascade complete: ${estimates.length} estimates updated`)
    return { estimateCount: estimates.length }
  } catch (err) {
    logger.error('Cascade worker error:', err)
    throw err
  }
}, { concurrency: 3 })
```

**Step 7: Run migration, generate, run tests**

**Step 8: Commit**

```bash
git commit -m "feat: add CascadeEngine with pluggable duration estimator and BullMQ worker"
```

---

### Task 14: Add ChannelSwitchAction model and alert system

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_channel_switch.sql`
- Create: `backend/src/routes/channelSwitches.ts`
- Create: `backend/src/services/cascade/alerts.ts`
- Create: `backend/src/workers/alertWorker.ts`
- Modify: `backend/src/services/socket.ts` (add /cascade, /alerts, /switches namespaces)
- Test: `backend/src/__tests__/alerts.test.ts`

**Step 1: Write failing test**

```typescript
describe('Alert System', () => {
  it('fires OVERRUN_WARNING when estimated end 25min past slot end', () => {
    const slot = {
      plannedEndUtc: new Date('2026-03-15T21:00:00Z'),
      estimatedEndUtc: new Date('2026-03-15T21:25:00Z'),
      status: 'LIVE',
      conditionalTriggerUtc: null,
    }
    const alerts = evaluateAlerts([slot])
    expect(alerts).toContainEqual(expect.objectContaining({ code: 'OVERRUN_WARNING', severity: 'INFO' }))
  })

  it('fires TRIGGER_THRESHOLD_MET when match live at trigger time', () => {
    const now = new Date()
    const slot = {
      status: 'LIVE',
      conditionalTriggerUtc: new Date(now.getTime() - 60000), // 1 min ago
      overrunStrategy: 'CONDITIONAL_SWITCH',
    }
    const alerts = evaluateAlerts([slot], now)
    expect(alerts).toContainEqual(expect.objectContaining({ code: 'TRIGGER_THRESHOLD_MET' }))
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add ChannelSwitchAction model**

```prisma
enum SwitchTriggerType {
  CONDITIONAL
  REACTIVE
  EMERGENCY
  HARD_CUT
  COURT_SWITCH
}

enum SwitchExecutionStatus {
  PENDING
  EXECUTING
  COMPLETED
  FAILED
}

model ChannelSwitchAction {
  id              String               @id @default(uuid()) @db.Uuid
  tenantId        String               @db.Uuid
  fromSlotId      String               @db.Uuid
  toChannelId     Int
  toSlotId        String?              @db.Uuid
  triggerType     SwitchTriggerType
  switchAtUtc     DateTime?            @db.Timestamptz
  reasonCode      String
  reasonText      String?
  confirmedBy     String?
  confirmedAt     DateTime?            @db.Timestamptz
  executionStatus SwitchExecutionStatus @default(PENDING)
  autoConfirmed   Boolean              @default(false)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  tenant          Tenant               @relation(fields: [tenantId], references: [id])
  fromSlot        BroadcastSlot        @relation("SwitchFrom", fields: [fromSlotId], references: [id])
  toSlot          BroadcastSlot?       @relation("SwitchTo", fields: [toSlotId], references: [id])
}
```

**Step 4: Implement alert evaluation**

```typescript
// backend/src/services/cascade/alerts.ts
export interface Alert {
  code: string
  severity: 'INFO' | 'WARNING' | 'ACTION' | 'URGENT' | 'OPPORTUNITY'
  slotId: string
  message: string
  data?: Record<string, unknown>
}

export function evaluateAlerts(slots: any[], now = new Date()): Alert[] {
  const alerts: Alert[] = []

  for (const slot of slots) {
    if (slot.status !== 'LIVE' && slot.status !== 'PLANNED') continue

    const planned = slot.plannedEndUtc ? new Date(slot.plannedEndUtc).getTime() : null
    const estimated = slot.estimatedEndUtc ? new Date(slot.estimatedEndUtc).getTime() : null

    if (planned && estimated) {
      const overrunMin = (estimated - planned) / 60000
      if (overrunMin >= 30) {
        alerts.push({ code: 'OVERRUN_ELEVATED', severity: 'WARNING', slotId: slot.id, message: `Estimated end ${Math.round(overrunMin)}min past slot end` })
      } else if (overrunMin >= 20) {
        alerts.push({ code: 'OVERRUN_WARNING', severity: 'INFO', slotId: slot.id, message: `Estimated end ${Math.round(overrunMin)}min past slot end` })
      }
    }

    if (slot.conditionalTriggerUtc && slot.status === 'LIVE') {
      const trigger = new Date(slot.conditionalTriggerUtc).getTime()
      if (now.getTime() >= trigger) {
        alerts.push({
          code: 'TRIGGER_THRESHOLD_MET',
          severity: 'ACTION',
          slotId: slot.id,
          message: 'Match still live at conditional trigger time — confirm or cancel switch',
          data: { triggerUtc: slot.conditionalTriggerUtc, switchStrategy: slot.overrunStrategy },
        })
      }
    }
  }

  return alerts
}
```

**Step 5: Extend Socket.IO** with new namespaces in `backend/src/services/socket.ts`:

```typescript
// Add namespaces:
const cascadeNs = io.of('/cascade')
const alertsNs = io.of('/alerts')
const switchesNs = io.of('/switches')
const scheduleNs = io.of('/schedule')

// Each namespace gets JWT auth middleware (same as main)
// Room pattern: tenant:{tenantId}:court:{courtId} for /cascade
// Room pattern: tenant:{tenantId} for /alerts and /switches
// Room pattern: tenant:{tenantId}:channel:{channelId} for /schedule
```

**Step 6: Create routes for channel switches**

- `POST /api/channel-switches` — initiate
- `POST /api/channel-switches/:id/confirm` — planner confirms
- `GET /api/channel-switches` — list (audit trail)

**Step 7: Run migration, generate, run tests**

**Step 8: Commit**

```bash
git commit -m "feat: add ChannelSwitchAction, alert system, and Socket.IO namespaces"
```

---

## Phase 8: Adapter Infrastructure

### Task 15: Add AdapterConfig model and adapter framework

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/add_adapter_config.sql`
- Create: `backend/src/adapters/base.ts`
- Create: `backend/src/adapters/liveScore.ts`
- Create: `backend/src/routes/adapters.ts`
- Test: `backend/src/__tests__/adapters.test.ts`

**Step 1: Write failing test**

```typescript
describe('AdapterConfig', () => {
  it('creates a live score adapter config', async () => {
    const res = await request(app)
      .post('/api/adapter-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        adapterType: 'LIVE_SCORE',
        direction: 'INBOUND',
        providerName: 'opta',
        config: { webhookSecret: 'test', pollUrl: 'https://api.opta.com/...' },
        isActive: true,
      })
    expect(res.status).toBe(201)
  })
})

describe('Live Score Webhook', () => {
  it('processes score update and writes outbox event', async () => {
    const res = await request(app)
      .post('/api/adapters/live-score/webhook')
      .send({
        matchId: 'ext-123',
        status: 'IN_PROGRESS',
        score: { home: 1, away: 0 },
        minute: 35,
      })
    expect(res.status).toBe(200)

    const outbox = await prisma.outboxEvent.findFirst({
      where: { eventType: 'match.score_updated' }
    })
    expect(outbox).not.toBeNull()
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Add AdapterConfig model**

```prisma
enum AdapterType {
  LIVE_SCORE
  OOP
  LIVE_TIMING
  AS_RUN
  EPG
  PLAYOUT
  NOTIFICATION
}

enum AdapterDirection {
  INBOUND
  OUTBOUND
}

model AdapterConfig {
  id                  String           @id @default(uuid()) @db.Uuid
  tenantId            String           @db.Uuid
  adapterType         AdapterType
  direction           AdapterDirection
  providerName        String
  config              Json             @default("{}")
  isActive            Boolean          @default(true)
  lastSuccessAt       DateTime?        @db.Timestamptz
  lastFailureAt       DateTime?        @db.Timestamptz
  consecutiveFailures Int              @default(0)
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  tenant              Tenant           @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, adapterType, providerName])
}
```

**Step 4: Create base adapter interface and live score adapter**

```typescript
// backend/src/adapters/base.ts
export interface InboundAdapter {
  name: string
  processWebhook(payload: unknown, tenantId: string): Promise<void>
}

// backend/src/adapters/liveScore.ts
import { prisma } from '../db/prisma'
import { writeOutboxEvent } from '../services/outbox'
import type { InboundAdapter } from './base'

export const liveScoreAdapter: InboundAdapter = {
  name: 'live-score',

  async processWebhook(payload: any, tenantId: string) {
    const { matchId, status, score, minute } = payload

    // Resolve external ID to internal event
    const event = await prisma.event.findFirst({
      where: { tenantId, externalRefs: { path: ['matchId'], equals: matchId } },
    })
    if (!event) return

    // Update event
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: event.id },
        data: {
          sportMetadata: {
            ...(event.sportMetadata as any),
            live_score: score,
            live_minute: minute,
          },
          status: mapStatus(status),
        },
      })

      await writeOutboxEvent(tx, {
        tenantId,
        eventType: status === 'COMPLETED' ? 'fixture.completed' : 'match.score_updated',
        aggregateType: 'Event',
        aggregateId: event.id.toString(),
        payload: { eventId: event.id, score, minute, status },
      })
    })
  },
}

function mapStatus(ext: string): string {
  const map: Record<string, string> = {
    'NOT_STARTED': 'confirmed',
    'IN_PROGRESS': 'live',
    'HALF_TIME': 'live',
    'EXTRA_TIME': 'live',
    'PENALTIES': 'live',
    'COMPLETED': 'completed',
    'POSTPONED': 'cancelled',
  }
  return map[ext] || 'draft'
}
```

**Step 5: Create adapter routes**

- `GET /api/adapter-configs` — list configs for tenant
- `POST /api/adapter-configs` — create config (admin)
- `PUT /api/adapter-configs/:id` — update
- `DELETE /api/adapter-configs/:id` — delete
- `POST /api/adapters/live-score/webhook` — inbound webhook endpoint
- `POST /api/adapters/oop/webhook` — OOP inbound (future)
- `POST /api/adapters/live-timing/webhook` — timing inbound (future)
- `POST /api/adapters/as-run/webhook` — as-run inbound (future)

**Step 6: Run migration, generate, run tests**

**Step 7: Commit**

```bash
git commit -m "feat: add AdapterConfig model and live score inbound adapter"
```

---

## Phase 9: Frontend — Schedule Grid View

### Task 16: Create ScheduleView page with channel grid

**Files:**
- Create: `src/pages/ScheduleView.tsx`
- Create: `src/components/schedule/ScheduleGrid.tsx`
- Create: `src/components/schedule/SlotCard.tsx`
- Create: `src/components/schedule/DraftToolbar.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/layout/Sidebar.tsx` (add nav item)
- Create: `src/services/schedules.ts`

**Step 1: Create frontend service**

```typescript
// src/services/schedules.ts
import { api } from '../utils/api'
import type { ScheduleDraft, ScheduleVersion, BroadcastSlot, ValidationResult } from '../data/types'

export const schedulesApi = {
  // Drafts
  listDrafts: (params?: { channelId?: number }) =>
    api.get<ScheduleDraft[]>('/schedule-drafts', params),
  getDraft: (id: string) =>
    api.get<ScheduleDraft & { slots: BroadcastSlot[] }>(`/schedule-drafts/${id}`),
  createDraft: (data: { channelId: number; dateRangeStart: string; dateRangeEnd: string }) =>
    api.post<ScheduleDraft>('/schedule-drafts', data),
  appendOps: (id: string, version: number, operations: any[]) =>
    api.patch<ScheduleDraft>(`/schedule-drafts/${id}`, { version, operations }),
  publish: (id: string, acknowledgeWarnings?: boolean) =>
    api.post<{ version: ScheduleVersion; warnings: ValidationResult[] }>(`/schedule-drafts/${id}/publish`, { acknowledgeWarnings }),

  // Versions
  listVersions: (params?: { channelId?: number }) =>
    api.get<ScheduleVersion[]>('/schedule-versions', params),
  getVersion: (id: string) =>
    api.get<ScheduleVersion>(`/schedule-versions/${id}`),
}
```

**Step 2: Create ScheduleGrid component**

A time-based grid with channels as columns and hours as rows. BroadcastSlots rendered as colored blocks positioned by their start/end times.

Key behaviors:
- Channels as columns (from `channelsApi.list()`)
- Time axis: hours of the broadcast day (06:00–06:00 next day)
- FIXED slots: solid position
- FLOATING slots: dashed border, positioned at `estimatedStartUtc` with whiskers showing `earliest`/`latest`
- WINDOW slots: solid start, gradient fade toward `latestEndUtc`
- Color coding by status: PLANNED (blue), LIVE (green), OVERRUN (orange), SWITCHED_OUT (gray), COMPLETED (muted)
- Drag to move slots (emits MOVE_ITEM operation)
- Drag edge to resize (emits RESIZE_ITEM operation)
- Click to select (shows detail panel)

**Step 3: Create SlotCard component**

Renders a single BroadcastSlot within the grid:
- Event name + participants
- Time range (planned or estimated)
- Status badge
- Overrun strategy icon
- Conditional trigger indicator (armed/fired)
- Confidence score bar (for floating slots)

**Step 4: Create DraftToolbar**

- Draft name + status badge
- "Save" (append ops)
- "Validate" (dry-run validation, show results)
- "Publish" button (with warning acknowledgement modal)
- Version history dropdown

**Step 5: Create ScheduleView page**

Combines: channel selector, date picker, ScheduleGrid, DraftToolbar, slot detail panel.

**Step 6: Add route and nav**

In `App.tsx`: `<Route path="/schedule" element={<ScheduleView />} />`
In `Sidebar.tsx`: add "Schedule" nav item with Calendar icon.

**Step 7: Run TypeScript check**

Run: `npx tsc --noEmit`

**Step 8: Commit**

```bash
git commit -m "feat: add ScheduleView with channel grid and draft toolbar"
```

---

### Task 17: Create CascadeDashboard component

**Files:**
- Create: `src/components/schedule/CascadeDashboard.tsx`
- Create: `src/components/schedule/CourtTimeline.tsx`
- Create: `src/components/schedule/AlertPanel.tsx`
- Create: `src/hooks/useCascade.ts`
- Modify: `src/hooks/useSocket.ts` (add cascade/alert namespace support)

**Step 1: Create useCascade hook**

```typescript
// src/hooks/useCascade.ts
import { useState, useEffect } from 'react'
import { useSocket } from './useSocket'
import type { CascadeEstimate } from '../data/types'
import type { Alert } from '../data/types' // add Alert type

export function useCascade(tenantId: string, courtId?: number) {
  const { socket } = useSocket()
  const [estimates, setEstimates] = useState<Map<number, CascadeEstimate>>(new Map())
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    if (!socket) return

    const cascadeNs = socket.io.socket('/cascade')
    const alertsNs = socket.io.socket('/alerts')

    cascadeNs.on('estimate_updated', (est: CascadeEstimate) => {
      setEstimates(prev => new Map(prev).set(est.eventId, est))
    })

    alertsNs.on('alert', (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50))
    })

    if (courtId) {
      cascadeNs.emit('subscribe', { room: `tenant:${tenantId}:court:${courtId}` })
    }
    alertsNs.emit('subscribe', { room: `tenant:${tenantId}` })

    return () => {
      cascadeNs.disconnect()
      alertsNs.disconnect()
    }
  }, [socket, tenantId, courtId])

  return { estimates, alerts }
}
```

**Step 2: Create CourtTimeline**

Vertical timeline for a single court showing:
- Matches in order, positioned by estimated start time
- Confidence bands (whiskers from earliest to latest)
- Color: green (completed), blue (in progress), gray (scheduled)
- Changeover gaps between matches
- NOT_BEFORE constraint markers
- Duration range (short–long) as gradient

**Step 3: Create AlertPanel**

Live alert feed:
- Grouped by severity (ACTION first, then URGENT, WARNING, INFO)
- ACTION alerts show "Confirm Switch" button → opens switch confirmation modal
- Auto-dismiss INFO after 5 min
- Badge count on tab

**Step 4: Create CascadeDashboard**

Multi-court view:
- Court selector (from venue)
- Date picker
- Side-by-side CourtTimeline components
- AlertPanel sidebar
- Connected to useCascade hook for live updates

**Step 5: Integrate into ScheduleView** as a tab alongside the channel grid.

**Step 6: Run TypeScript check**

**Step 7: Commit**

```bash
git commit -m "feat: add CascadeDashboard with court timelines and live alert panel"
```

---

### Task 18: Channel switch confirmation UI

**Files:**
- Create: `src/components/schedule/SwitchConfirmModal.tsx`
- Modify: `src/hooks/useCascade.ts` (handle switch events)
- Create: `src/services/channelSwitches.ts`

**Step 1: Create service**

```typescript
// src/services/channelSwitches.ts
import { api } from '../utils/api'

export const channelSwitchesApi = {
  list: () => api.get('/channel-switches'),
  confirm: (id: string, reasonCode: string, reasonText?: string) =>
    api.post(`/channel-switches/${id}/confirm`, { reasonCode, reasonText }),
  cancel: (id: string, reason: string) =>
    api.post(`/channel-switches/${id}/cancel`, { reason }),
}
```

**Step 2: Create SwitchConfirmModal**

Triggered by `TRIGGER_THRESHOLD_MET` alert via Socket.IO `/switches` namespace:

```
┌─────────────────────────────────────────────┐
│ Channel Switch Required                     │
├─────────────────────────────────────────────┤
│ Match: Djokovic vs Alcaraz                  │
│ Score: 6-4 4-6 5-5                          │
│ Est. remaining: ~25 min                     │
│                                             │
│ From: Sports 1                              │
│ To:   Sports 2                              │
│ Switch at: 21:15 CET                        │
│                                             │
│ Deadline: 21:25 CET (8 min remaining)       │
│ ▓▓▓▓▓▓▓░░░ progress bar                    │
│                                             │
│ Reason: [PLANNED_HANDOFF ▾]                 │
│ Notes:  [optional text_________]            │
│                                             │
│         [Cancel]      [Confirm Switch]      │
└─────────────────────────────────────────────┘
```

- Auto-opens when TRIGGER_THRESHOLD_MET arrives
- Countdown timer (10min window)
- Reason code dropdown
- Optional text
- Confirm → POST /channel-switches/:id/confirm
- Audio notification on appearance

**Step 3: Wire into useCascade hook** — listen on `/switches` namespace for `switch_confirmation_required` events.

**Step 4: Run TypeScript check**

**Step 5: Commit**

```bash
git commit -m "feat: add channel switch confirmation modal with countdown timer"
```

---

## Phase 10: Integration & Polish

### Task 19: Wire outbox events into existing route handlers

**Files:**
- Modify: `backend/src/routes/events.ts` — write outbox events on create/update/status change
- Modify: `backend/src/routes/broadcastSlots.ts` — write outbox events on create/update
- Modify: `backend/src/routes/schedules.ts` — write outbox events on publish

**Step 1: Update events.ts**

In every Event mutation (create, update, status change, batch create), wrap in `$transaction` and call `writeOutboxEvent()`:

```typescript
// Example: status change
router.patch('/:id/status', authenticate, async (req, res) => {
  const { status } = req.body
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: parseInt(req.params.id) },
      data: { status },
    })
    await writeOutboxEvent(tx, {
      tenantId: req.tenantId,
      eventType: status === 'completed' ? 'fixture.completed' : 'fixture.status_changed',
      aggregateType: 'Event',
      aggregateId: event.id.toString(),
      payload: { eventId: event.id, status, previousStatus: req.body.previousStatus },
    })
    res.json(event)
  })
})
```

**Step 2: Update broadcastSlots.ts** — outbox on slot status changes.

**Step 3: Update schedules.ts** — outbox on publish:

```typescript
await writeOutboxEvent(tx, {
  tenantId: req.tenantId,
  eventType: isEmergency ? 'schedule.emergency_published' : 'schedule.published',
  aggregateType: 'ScheduleVersion',
  aggregateId: version.id,
  payload: { versionId: version.id, channelId, slotCount: slots.length },
  priority: isEmergency ? 'HIGH' : 'NORMAL',
})
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git commit -m "feat: wire outbox events into event, slot, and schedule routes"
```

---

### Task 20: Standings and bracket progression workers

**Files:**
- Create: `backend/src/workers/standingsWorker.ts`
- Create: `backend/src/workers/bracketWorker.ts`
- Modify: `backend/src/worker.ts` (register workers)
- Test: `backend/src/__tests__/standings.test.ts`

**Step 1: Write failing test**

```typescript
describe('Standings Worker', () => {
  it('recomputes league standings after fixture completion', async () => {
    // Setup: league stage with 4 teams, 2 completed fixtures
    // Team A beat Team B 2-1, Team C drew Team D 0-0
    await processFixtureCompleted({ eventId: match1.id, tenantId })

    const stage = await prisma.stage.findUnique({ where: { id: leagueStage.id } })
    const standings = (stage!.sportMetadata as any).standings
    expect(standings).toHaveLength(4)
    expect(standings[0].teamId).toBe(teamA.id) // 3 points
    expect(standings[0].points).toBe(3)
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement standings worker**

Reads Stage.sportMetadata.standings_config, computes points/GD/tiebreakers, writes back to Stage.sportMetadata.standings[].

**Step 4: Implement bracket worker**

On fixture completion:
1. Check if event is part of a knockout stage
2. Find bracket position where source_event_id = this event
3. Set winner
4. If next match has both players resolved, update Event participants
5. For ties: check if both legs complete, compute aggregate

**Step 5: Register in worker.ts**

**Step 6: Run tests**

**Step 7: Commit**

```bash
git commit -m "feat: add standings and bracket progression background workers"
```

---

### Task 21: Add broadcast middleware admin panels

**Files:**
- Create: `src/components/admin/ChannelsPanel.tsx`
- Create: `src/components/admin/RightsPoliciesPanel.tsx`
- Create: `src/components/admin/AdapterConfigPanel.tsx`
- Modify: `src/pages/AdminView.tsx` (add new tabs)

**Step 1: Create ChannelsPanel**

Table of channels with:
- Name, timezone, broadcast day start, color swatch
- Add/edit/delete (admin only)

**Step 2: Create RightsPoliciesPanel**

Table of rights policies:
- Competition, territories, platforms, coverage type, max runs
- Filter by competition
- Add/edit/delete

**Step 3: Create AdapterConfigPanel**

List of adapter configs:
- Type, provider, direction, active toggle
- Health indicators (last success/failure, consecutive failures)
- Config editor (JSON)

**Step 4: Add to AdminView sidebar**

Add new group "Broadcast" with tabs: Channels, Rights Policies, Adapters

**Step 5: Run TypeScript check**

**Step 6: Commit**

```bash
git commit -m "feat: add broadcast middleware admin panels (channels, rights, adapters)"
```

---

### Task 22: Final integration test and TypeScript check

**Files:**
- Create: `backend/src/__tests__/integration/broadcastFlow.test.ts`

**Step 1: Write end-to-end integration test**

```typescript
describe('Broadcast Flow Integration', () => {
  it('full lifecycle: create channel → create slot → draft → validate → publish', async () => {
    // 1. Create channel
    const channel = await createChannel('Sports 1')

    // 2. Create event (football match)
    const event = await createEvent({ schedulingMode: 'FIXED', startDateBE: '2026-03-15' })

    // 3. Create broadcast slot
    const slot = await createBroadcastSlot({
      channelId: channel.id,
      eventId: event.id,
      schedulingMode: 'FIXED',
      plannedStartUtc: '2026-03-15T19:30:00Z',
      plannedEndUtc: '2026-03-15T21:55:00Z',
    })
    expect(slot.status).toBe('PLANNED')

    // 4. Create draft
    const draft = await createDraft({ channelId: channel.id, dateRangeStart: '2026-03-15', dateRangeEnd: '2026-03-21' })

    // 5. Insert slot into draft
    await appendOps(draft.id, 1, [{ op: 'INSERT_ITEM', slotId: slot.id }])

    // 6. Publish
    const result = await publishDraft(draft.id)
    expect(result.version).toBeDefined()
    expect(result.warnings).toEqual([])

    // 7. Verify outbox event created
    const outbox = await prisma.outboxEvent.findFirst({ where: { eventType: 'schedule.published' } })
    expect(outbox).not.toBeNull()
  })
})
```

**Step 2: Run integration test**

Run: `cd backend && npx vitest run src/__tests__/integration/broadcastFlow.test.ts`

**Step 3: Run full TypeScript check**

Run: `npx tsc --noEmit && cd backend && npx tsc --noEmit`

**Step 4: Fix any issues**

**Step 5: Commit**

```bash
git commit -m "test: add broadcast flow integration test"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Multi-tenancy | 1–3 | Tenant model, RLS, all tables scoped |
| 2. Competition structure | 4–6 | Venue, Team, Court, Season/Stage/Round, shared types |
| 3. Channel & BroadcastSlot | 7–8 | First-class Channel, BroadcastSlot with all 3 modes |
| 4. Schedule versioning | 9–10 | Draft/publish workflow, 5-stage validation pipeline |
| 5. Rights tracking | 11 | RightsPolicy, RunLedger, run counting |
| 6. Outbox infrastructure | 12 | OutboxEvent, BullMQ, outbox consumer |
| 7. CascadeEngine | 13–14 | Duration estimator, cascade chain, alerts, Socket.IO namespaces, channel switches |
| 8. Adapters | 15 | AdapterConfig, live score webhook |
| 9. Frontend schedule | 16–18 | Schedule grid, cascade dashboard, switch confirmation |
| 10. Integration | 19–22 | Route wiring, workers, admin panels, integration test |

**Total: 22 tasks across 10 phases.**
**Dependencies: strictly sequential within phases; Phase 6 blocks Phase 7; Phase 8 can parallel with Phase 9.**
