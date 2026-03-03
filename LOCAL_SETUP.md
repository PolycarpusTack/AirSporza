# Local Development Setup (No Docker)

## Prerequisites
- Node.js 20+
- PostgreSQL 16+ installed locally

## 1. Create PostgreSQL Database

```sql
-- Connect to PostgreSQL as superuser
pssql -U postgres

-- Create database and user
CREATE USER sporza WITH PASSWORD 'sporza123';
CREATE DATABASE sporza_planner OWNER sporza;
GRANT ALL PRIVILEGES ON DATABASE sporza_planner TO sporza;
```

Or via command line:
```bash
createdb -U postgres sporza_planner
psql -U postgres -c "CREATE USER sporza WITH PASSWORD 'sporza123';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE sporza_planner TO sporza;"
```

## 2. Backend Setup

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit .env if needed (default should work for local PostgreSQL)
# DATABASE_URL="postgresql://sporza:sporza123@localhost:5432/sporza_planner?schema=public"

# Install dependencies
npm install

# Generate Prisma client and push schema
npm run db:generate
npm run db:push

# Seed initial data
npm run db:seed

# Start development server
npm run dev
```

Backend runs on: http://localhost:3001

## 3. Frontend Setup (new terminal)

```bash
# From project root
cp .env.example .env

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs on: http://localhost:5173

## 4. Login

Development mode shows a dev login screen. Use:
- Email: `admin@sporza.vrt.be`
- Role: `admin`

## Troubleshooting

### PostgreSQL connection issues
```bash
# Check PostgreSQL is running
pg_isready

# Check connection
psql -U sporza -d sporza_planner -h localhost
```

### Port already in use
```bash
# Find process using port 3001
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill process if needed
kill -9 <PID>
```

### Reset database
```bash
cd backend
npm run db:push -- --force-reset
npm run db:seed
```
