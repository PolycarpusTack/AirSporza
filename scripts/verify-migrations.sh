#!/usr/bin/env bash
# Migration verification (A-2-T2): proves `prisma migrate deploy` builds a complete,
# correct database from an empty one — including the objects Prisma cannot model
# (RLS policies, outbox trigger, expression + partial unique indexes).
#
# Usage:  DATABASE_URL=postgresql://user:pw@host:port/anydb [PSQL=psql] scripts/verify-migrations.sh
# The user must have CREATEDB. Runs from repo root. Exit 0 = history is sound.
set -euo pipefail

PSQL="${PSQL:-psql}"
BASE_URL="${DATABASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
VERIFY_DB="planza_migrate_verify"
VERIFY_URL="$SERVER_URL/$VERIFY_DB"

echo "==> Creating disposable database $VERIFY_DB"
"$PSQL" "$BASE_URL" -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $VERIFY_DB;" \
  -c "CREATE DATABASE $VERIFY_DB;"

cleanup() {
  "$PSQL" "$BASE_URL" -q -c "DROP DATABASE IF EXISTS $VERIFY_DB;" || true
}
trap cleanup EXIT

echo "==> prisma migrate deploy onto empty database"
(cd backend && DATABASE_URL="$VERIFY_URL?schema=public" npx prisma migrate deploy)

echo "==> prisma migrate status must be clean"
(cd backend && DATABASE_URL="$VERIFY_URL?schema=public" npx prisma migrate status)

echo "==> Asserting non-Prisma-modelable objects exist"
ASSERT=$("$PSQL" "$VERIFY_URL" -tA -v ON_ERROR_STOP=1 -c "
  SELECT
    (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='Tenant')
  + (SELECT CASE WHEN count(*) >= 40 THEN 1 ELSE 0 END FROM pg_policies)
  + (SELECT count(*) FROM pg_trigger WHERE tgname='outbox_event_notify')
  + (SELECT count(*) FROM pg_indexes WHERE indexname='event_court_day_idx')
  + (SELECT count(*) FROM pg_indexes WHERE indexname='BroadcastSlot_tenant_event_autolinked_key')
  + (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='TeamCompetition')
  + (SELECT CASE WHEN count(*) = 4 THEN 1 ELSE 0 END FROM information_schema.columns
       WHERE table_name='Team' AND column_name IN ('sportId','canonicalTeamId','notes','isManaged'));")

if [ "$ASSERT" != "7" ]; then
  echo "FAIL: expected 7 assertion points, got $ASSERT (Tenant / >=40 RLS policies / outbox trigger / court index / autoLinked unique / TeamCompetition / Team repository columns)"
  exit 1
fi

echo "OK: migration history builds a complete database (schema + RLS + trigger + special indexes)."
