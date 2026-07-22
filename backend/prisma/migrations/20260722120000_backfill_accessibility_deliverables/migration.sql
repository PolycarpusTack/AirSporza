-- TD-31 — backfill accessibility deliverables for events created BEFORE every
-- creation site seeded them (the import paths bypassed the RC-2-T1 hook until
-- TD-31 wired provision.ts / csvImport.ts through the shared seeding service).
-- Data-only migration: INSERTs the missing (eventId, type) rows for ALL existing
-- events; rows that already exist are left untouched (ON CONFLICT DO NOTHING on
-- the unique (eventId, type) index — mirrors the hook's skipDuplicates posture).
--
-- ASSUMPTION (TODO-KPI): the provisional T888 sport-exclusion set
-- (T888_EXCLUDED_SPORT_IDS, backend/src/config/accessibility.ts) is EMPTY, so
-- T888 = REQUIRED for EVERY sport — the safe/inclusive default (never silently
-- drops the subtitling obligation). If RC-0-T1 later lands a non-empty set,
-- affected rows are corrected as a data edit, not a schema change.
-- AUDIO_DESCRIPTION and VGT default to NOT_REQUIRED (same as the seeding hook).
--
-- RLS (ADR-011): tenant_isolation already exists on "AccessibilityDeliverable"
-- (shipped with the table in 20260714120000). This backfill runs as the
-- migration owner, which bypasses RLS by design (same worker/owner posture as
-- the RC-2-T1 gated tests); tenantId is copied from each event's own row, so no
-- cross-tenant rows can be produced.

INSERT INTO "AccessibilityDeliverable" ("tenantId", "eventId", "type", "status", "updatedAt")
SELECT e."tenantId", e."id", d."type", d."status", NOW()
FROM "Event" e
CROSS JOIN (
  VALUES
    ('T888'::"AccessibilityType", 'REQUIRED'::"AccessibilityStatus"),
    ('AUDIO_DESCRIPTION'::"AccessibilityType", 'NOT_REQUIRED'::"AccessibilityStatus"),
    ('VGT'::"AccessibilityType", 'NOT_REQUIRED'::"AccessibilityStatus")
) AS d("type", "status")
ON CONFLICT ("eventId", "type") DO NOTHING;
