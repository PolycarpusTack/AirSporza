-- AppSetting table migration
-- Run this in psql or pgAdmin to create the missing AppSetting table

-- Create enum type (safe to run even if it already exists)
DO $$ BEGIN
  CREATE TYPE "SettingScopeKind" AS ENUM ('global', 'role', 'user', 'user_role');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create AppSetting table
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "id"        TEXT                  NOT NULL,
  "key"       TEXT                  NOT NULL,
  "scopeKind" "SettingScopeKind"    NOT NULL,
  "scopeId"   TEXT                  NOT NULL,
  "userId"    TEXT,
  "value"     JSONB                 NOT NULL,
  "createdAt" TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- Unique constraint (prevents duplicate key+scope combos, enables upsert)
CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_scopeKind_scopeId_key"
  ON "AppSetting"("key", "scopeKind", "scopeId");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "AppSetting_scopeKind_scopeId_idx"
  ON "AppSetting"("scopeKind", "scopeId");

CREATE INDEX IF NOT EXISTS "AppSetting_userId_idx"
  ON "AppSetting"("userId");

-- Foreign key to User (nullable, SET NULL on delete)
DO $$ BEGIN
  ALTER TABLE "AppSetting"
    ADD CONSTRAINT "AppSetting_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
