CREATE TABLE "ImportSchedule" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sourceId"  TEXT NOT NULL UNIQUE REFERENCES "ImportSource"("id") ON DELETE CASCADE,
  "cronExpr"  TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMPTZ,
  "nextRunAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
