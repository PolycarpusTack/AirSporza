# Planza Local Setup

## Prerequisites

- **Node.js** 18+ — [nodejs.org](https://nodejs.org)
- **PostgreSQL** 14+ — [postgresql.org/download](https://www.postgresql.org/download/)
  - Make sure `psql` is in your PATH

## Quick Start

### Windows (PowerShell)

```powershell
.\backend\scripts\setup.ps1
```

> **Important:** Run from PowerShell, not WSL. Running `npm install` from WSL installs Linux-specific packages that won't work on Windows.

### macOS / Linux

```bash
bash backend/scripts/setup.sh
```

## What the script does

1. Checks Node.js and PostgreSQL are installed
2. Creates `.env` with default database credentials
3. Creates the `sporza` database user and `sporza_planner` database
4. Installs frontend and backend dependencies
5. Pushes the Prisma schema to the database
6. Runs SQL migrations
7. Seeds test data (users, events, sports, crew, etc.)

## Start the app

```
Terminal 1:  cd backend && npm run dev
Terminal 2:  npm run dev
```

Open http://localhost:5173

## Test accounts

| Email | Role | Access |
|---|---|---|
| admin@sporza.vrt.be | admin | Full access |
| planner@sporza.vrt.be | planner | Planning + scheduling |
| sports@sporza.vrt.be | sports | Sports workspace |
| contracts@sporza.vrt.be | contracts | Contract management |

Password for all: `password123`

## Troubleshooting

### PostgreSQL on non-default port

If your PostgreSQL runs on a port other than 5432, update `backend/.env`:

```
DATABASE_URL="postgresql://sporza:sporza123@localhost:YOUR_PORT/sporza_planner?schema=public"
```

### Permission errors on `prisma db push`

Grant ownership to the sporza user:

```sql
-- Run as postgres superuser
GRANT ALL ON ALL TABLES IN SCHEMA public TO sporza;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO sporza;
```

### Linux packages on Windows

If a prior install was done from WSL you'll see errors like
`Cannot find module @rollup/rollup-win32-x64-msvc` or
`EBADPLATFORM` for `@rollup/rollup-linux-*`. The setup scripts now wipe
`node_modules` automatically, but to recover manually from PowerShell
(not WSL):

```powershell
Remove-Item -Recurse -Force node_modules
npm install
cd backend
Remove-Item -Recurse -Force node_modules
npm install
```

Always run `npm install` and `npm run dev` from PowerShell on Windows —
running them from WSL installs Linux-only native binaries that Vite
won't be able to load when you launch the app from Windows.
