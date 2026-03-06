# Planza Local Setup Script (PowerShell)
# Run from the project root: .\backend\scripts\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n=== Planza Local Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVersion = (node -v)
Write-Host "  Node.js $nodeVersion" -ForegroundColor Green

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: PostgreSQL (psql) not found. Install from https://www.postgresql.org/download/" -ForegroundColor Red
    Write-Host "  Make sure PostgreSQL bin directory is in your PATH" -ForegroundColor Red
    exit 1
}
$pgVersion = (psql --version)
Write-Host "  $pgVersion" -ForegroundColor Green

# Determine project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $backendDir

Write-Host ""
Write-Host "[2/7] Setting up environment..." -ForegroundColor Yellow

# Create .env if it doesn't exist
$envFile = Join-Path $backendDir ".env"
$envExample = Join-Path $backendDir ".env.example"
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "  Created .env from .env.example" -ForegroundColor Green
    } else {
        @"
NODE_ENV=development
PORT=3001
DATABASE_URL="postgresql://sporza:sporza123@localhost:5432/sporza_planner?schema=public"
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
"@ | Out-File -FilePath $envFile -Encoding UTF8
        Write-Host "  Created .env with defaults" -ForegroundColor Green
    }
} else {
    Write-Host "  .env already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3/7] Creating database..." -ForegroundColor Yellow
Write-Host "  You may be prompted for the PostgreSQL superuser password." -ForegroundColor Gray

# Try to create user and database (ignore errors if they already exist)
try {
    psql -U postgres -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sporza') THEN CREATE USER sporza WITH PASSWORD 'sporza123'; END IF; END `$`$;" 2>$null
    Write-Host "  User 'sporza' ready" -ForegroundColor Green
} catch {
    Write-Host "  Note: Could not create user (may already exist)" -ForegroundColor Yellow
}

try {
    psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'sporza_planner'" | Out-Null
    $dbExists = psql -U postgres -t -c "SELECT 1 FROM pg_database WHERE datname = 'sporza_planner'" 2>$null
    if ($dbExists -match "1") {
        Write-Host "  Database 'sporza_planner' already exists" -ForegroundColor Green
    } else {
        psql -U postgres -c "CREATE DATABASE sporza_planner OWNER sporza;" 2>$null
        psql -U postgres -d sporza_planner -c "GRANT ALL ON SCHEMA public TO sporza;" 2>$null
        Write-Host "  Database 'sporza_planner' created" -ForegroundColor Green
    }
} catch {
    Write-Host "  Note: Could not create database (may already exist)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4/7] Installing dependencies..." -ForegroundColor Yellow

Push-Location $projectRoot
npm install --force 2>$null | Out-Null
Write-Host "  Frontend dependencies installed" -ForegroundColor Green
Pop-Location

Push-Location $backendDir
npm install --force 2>$null | Out-Null
Write-Host "  Backend dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "[5/7] Pushing database schema..." -ForegroundColor Yellow
npx prisma generate 2>$null | Out-Null
npx prisma db push --accept-data-loss 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host "  Schema pushed successfully" -ForegroundColor Green

Write-Host ""
Write-Host "[6/7] Running migrations..." -ForegroundColor Yellow

$migrations = @(
    "add_event_status.sql",
    "add_on_demand_channel.sql",
    "add_app_setting.sql",
    "add_saved_views.sql",
    "add_notifications.sql",
    "add_resources.sql",
    "add_crew_member_and_template.sql",
    "add_webhook_tables.sql",
    "add_import_schedules.sql",
    "import_schema.sql"
)

foreach ($migration in $migrations) {
    $sqlFile = Join-Path $backendDir "prisma\migrations\$migration"
    if (Test-Path $sqlFile) {
        try {
            psql -U sporza -d sporza_planner -f $sqlFile 2>$null | Out-Null
            Write-Host "  Applied: $migration" -ForegroundColor Green
        } catch {
            Write-Host "  Skipped: $migration (already applied or error)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "[7/7] Seeding test data..." -ForegroundColor Yellow
npx tsx prisma/seed.ts 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host "  Seed data loaded" -ForegroundColor Green

Pop-Location

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test accounts:" -ForegroundColor White
Write-Host "  admin@sporza.vrt.be    (admin)     - Full access" -ForegroundColor Gray
Write-Host "  planner@sporza.vrt.be  (planner)   - Planning + scheduling" -ForegroundColor Gray
Write-Host "  sports@sporza.vrt.be   (sports)    - Sports workspace" -ForegroundColor Gray
Write-Host "  contracts@sporza.vrt.be (contracts) - Contract management" -ForegroundColor Gray
Write-Host ""
Write-Host "To start the app:" -ForegroundColor White
Write-Host "  Terminal 1:  cd backend && npm run dev" -ForegroundColor Gray
Write-Host "  Terminal 2:  npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "Open http://localhost:5173 in your browser" -ForegroundColor White
Write-Host ""
