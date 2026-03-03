@echo off
echo Starting SporzaPlanner development servers...
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
echo.
npx concurrently "npm run dev" "cd backend && npm run dev" "cd backend && npm run worker:dev"
