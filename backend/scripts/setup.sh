#!/usr/bin/env bash
# Planza Local Setup Script (Bash / macOS / Linux / WSL)
# Run from the project root: bash backend/scripts/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"

echo ""
echo "=== Planza Local Setup ==="
echo ""

# ─── 1. Prerequisites ────────────────────────────────────────────────────────
echo "[1/7] Checking prerequisites..."

if ! command -v node &>/dev/null; then
    echo "  ERROR: Node.js not found. Install from https://nodejs.org"
    exit 1
fi
echo "  Node.js $(node -v)"

if ! command -v psql &>/dev/null; then
    echo "  ERROR: PostgreSQL (psql) not found."
    echo "  Install: brew install postgresql (macOS) or apt install postgresql-client (Linux)"
    exit 1
fi
echo "  $(psql --version)"

# ─── 2. Environment ──────────────────────────────────────────────────────────
echo ""
echo "[2/7] Setting up environment..."

if [ ! -f "$BACKEND_DIR/.env" ]; then
    if [ -f "$BACKEND_DIR/.env.example" ]; then
        cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
        echo "  Created .env from .env.example"
    else
        cat > "$BACKEND_DIR/.env" <<'EOF'
NODE_ENV=development
PORT=3001
DATABASE_URL="postgresql://sporza:sporza123@localhost:5432/sporza_planner?schema=public"
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
EOF
        echo "  Created .env with defaults"
    fi
else
    echo "  .env already exists"
fi

# ─── 3. Database ─────────────────────────────────────────────────────────────
echo ""
echo "[3/7] Creating database..."
echo "  You may be prompted for the PostgreSQL superuser password."

psql -U postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sporza') THEN CREATE USER sporza WITH PASSWORD 'sporza123'; END IF; END \$\$;" 2>/dev/null || echo "  Note: user may already exist"

DB_EXISTS=$(psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'sporza_planner'" 2>/dev/null || echo "0")
if [ "$DB_EXISTS" = "1" ]; then
    echo "  Database 'sporza_planner' already exists"
else
    psql -U postgres -c "CREATE DATABASE sporza_planner OWNER sporza;" 2>/dev/null || true
    psql -U postgres -d sporza_planner -c "GRANT ALL ON SCHEMA public TO sporza;" 2>/dev/null || true
    echo "  Database 'sporza_planner' created"
fi

# ─── 4. Dependencies ─────────────────────────────────────────────────────────
echo ""
echo "[4/7] Installing dependencies..."

cd "$PROJECT_ROOT"
npm install --silent 2>/dev/null
echo "  Frontend dependencies installed"

cd "$BACKEND_DIR"
npm install --silent 2>/dev/null
echo "  Backend dependencies installed"

# ─── 5. Schema ───────────────────────────────────────────────────────────────
echo ""
echo "[5/7] Pushing database schema..."

npx prisma generate 2>/dev/null
npx prisma db push --accept-data-loss 2>&1 | sed 's/^/  /'
echo "  Schema pushed successfully"

# ─── 6. Migrations ───────────────────────────────────────────────────────────
echo ""
echo "[6/7] Running migrations..."

MIGRATIONS=(
    "add_event_status.sql"
    "add_on_demand_channel.sql"
    "add_app_setting.sql"
    "add_saved_views.sql"
    "add_notifications.sql"
    "add_resources.sql"
    "add_crew_member_and_template.sql"
    "add_webhook_tables.sql"
    "add_import_schedules.sql"
    "import_schema.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    SQL_FILE="$BACKEND_DIR/prisma/migrations/$migration"
    if [ -f "$SQL_FILE" ]; then
        if psql -U sporza -d sporza_planner -f "$SQL_FILE" &>/dev/null; then
            echo "  Applied: $migration"
        else
            echo "  Skipped: $migration (already applied or error)"
        fi
    fi
done

# ─── 7. Seed ─────────────────────────────────────────────────────────────────
echo ""
echo "[7/7] Seeding test data..."

npx tsx prisma/seed.ts 2>&1 | sed 's/^/  /'
echo "  Seed data loaded"

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Test accounts:"
echo "  admin@sporza.vrt.be     (admin)     - Full access"
echo "  planner@sporza.vrt.be   (planner)   - Planning + scheduling"
echo "  sports@sporza.vrt.be    (sports)    - Sports workspace"
echo "  contracts@sporza.vrt.be (contracts) - Contract management"
echo ""
echo "To start the app:"
echo "  Terminal 1:  cd backend && npm run dev"
echo "  Terminal 2:  npm run dev"
echo ""
echo "Open http://localhost:5173 in your browser"
echo ""
