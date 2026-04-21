@echo off
echo ========================================
echo SporzaPlanner Local Setup
echo ========================================
echo.

echo [1/4] Installing frontend dependencies...
REM Remove any node_modules left behind by a WSL/Linux install.
REM Those contain Linux-only rollup/esbuild binaries that fail on Windows.
if exist node_modules rmdir /s /q node_modules
call npm install
if %errorlevel% neq 0 (
    echo Failed to install frontend dependencies
    exit /b 1
)

echo.
echo [2/4] Installing backend dependencies...
cd backend
if exist node_modules rmdir /s /q node_modules
call npm install
if %errorlevel% neq 0 (
    echo Failed to install backend dependencies
    exit /b 1
)

echo.
echo [3/4] Generating Prisma client...
call npm run db:generate
if %errorlevel% neq 0 (
    echo Failed to generate Prisma client
    exit /b 1
)

echo.
echo [4/4] Pushing database schema...
echo Make sure PostgreSQL is running and database 'sporza_planner' exists
call npm run db:push
if %errorlevel% neq 0 (
    echo Failed to push database schema
    echo Check your PostgreSQL connection in backend\.env
    exit /b 1
)

echo.
echo Seeding database...
call npm run db:seed

cd ..
echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo To start development:
echo   Terminal 1: cd backend ^&^& npm run dev
echo   Terminal 2: npm run dev
echo.
echo Or run both: npm run dev:full
echo.
