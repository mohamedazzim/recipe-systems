@echo off
setlocal EnableDelayedExpansion
rem =====================================================================
rem  Recipe Systems - local dev startup (native Windows cmd script)
rem
rem  What it does:
rem    1. Docker infrastructure (Postgres :5433, MinIO, nginx :8080, Keycloak :8081)
rem    2. Prisma migrations (packages\database)
rem    3. NestJS API in its own window (:3001)
rem    4. Analysis worker in its own window (pg-boss queue, ANALYSIS_LLM_STUB=1)
rem    5. Next.js web in its own window (:3000)
rem    6. Health-checks everything, then opens the app
rem
rem  Test account : chef@recipesystems.test / password
rem  To stop      : close the app windows, then
rem                 docker compose --profile core --profile identity -f infra\docker\docker-compose.yml down
rem =====================================================================

cd /d "%~dp0"

echo.
echo ==========================================================
echo  Recipe Systems - local dev startup
echo ==========================================================

rem --- dev environment (inherited by the API/web windows) ----------------
set "DATABASE_URL=postgresql://recipe:recipe_dev_password@localhost:5433/recipe"
set "SESSION_SECRET=dev-session-secret-change-me"
set "SESSION_SECURE=false"
set "KEYCLOAK_BASE_URL=http://localhost:8081"
set "KEYCLOAK_REALM=recipesystems"
set "KEYCLOAK_CLIENT_ID=recipe-systems-bff"
set "KEYCLOAK_CLIENT_SECRET=dev-bff-client-secret"
set "KEYCLOAK_ISSUER_URL=http://localhost:8081/realms/recipesystems"
set "S3_ENDPOINT=http://localhost:9000"
set "S3_BUCKET=recipe-assets"
set "S3_ACCESS_KEY=minioadmin"
set "S3_SECRET_KEY=minioadmin"
set "AUTH_REDIRECT_BASE=http://localhost:3001"
set "WEB_ORIGIN=http://localhost:3000"
set "CORS_ORIGINS=http://localhost:3000"
set "PORT=3001"
set "NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1"
rem Q9 is OPEN — the dev worker runs the deterministic stub adapter so the
rem analysis pipeline (incl. the D-16 grounding gate) is demonstrable end-to-end.
set "ANALYSIS_LLM_STUB=1"

rem --- 0. Docker daemon must be running -----------------------------------
echo [0/6] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
  echo   ERROR: Docker Desktop is not running. Start it and re-run this script.
  pause
  exit /b 1
)
echo   Docker daemon OK.

rem --- 1. Docker infrastructure ------------------------------------------
echo [1/5] Starting Docker infrastructure...
docker compose --profile core --profile identity -f "infra\docker\docker-compose.yml" up -d
if errorlevel 1 (
  echo   ERROR: docker compose up failed.
  pause
  exit /b 1
)

echo   Waiting for Postgres (healthy)...
set tries=0
:wait_pg
docker compose --profile core --profile identity -f "infra\docker\docker-compose.yml" ps --format "{{.Service}} {{.Status}}" 2>nul | findstr /C:"postgres" | findstr /C:"healthy" >nul && goto pg_ok
set /a tries+=1
if !tries! GEQ 40 (
  echo   ERROR: Postgres did not become healthy.
  pause
  exit /b 1
)
ping -n 6 127.0.0.1 >nul
goto wait_pg
:pg_ok
echo   Postgres healthy.

echo   Waiting for Keycloak realm recipesystems...
set tries=0
:wait_kc
curl -s http://localhost:8081/realms/recipesystems/.well-known/openid-configuration >nul 2>&1 && goto kc_ok
set /a tries+=1
if !tries! GEQ 40 (
  echo   ERROR: Keycloak realm did not come up.
  pause
  exit /b 1
)
ping -n 4 127.0.0.1 >nul
goto wait_kc
:kc_ok
echo   Keycloak realm up.

rem --- 2. Prisma migrations ------------------------------------------------
echo [2/5] Applying Prisma migrations...
pushd packages\database
call npx prisma migrate deploy
if errorlevel 1 (
  popd
  echo   ERROR: migration failed.
  pause
  exit /b 1
)
popd
echo   Migrations applied.

rem --- 3. API ---------------------------------------------------------------
echo [3/5] API (NestJS)...
netstat -ano | findstr /R /C:":3001 " | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  echo   API already running on :3001 - skipping.
) else (
  start "Recipe Systems - API" /D "%~dp0apps\api" cmd /k npx nest start
  echo   API window started on port 3001.
)

rem --- 4. Analysis worker -----------------------------------------------------
echo [4/6] Analysis worker (pg-boss queue, dev stub adapter)...
wmic process where "name='node.exe'" get commandline 2>nul | findstr /I "analysis-worker" | findstr /I "src/main.ts" >nul
if not errorlevel 1 (
  echo   Worker already running - skipping.
) else (
  start "Recipe Systems - Worker" /D "%~dp0apps\analysis-worker" cmd /k npx ts-node -T src/main.ts
  echo   Worker window started (consumes queue "analysis").
)

rem --- 5. Web --------------------------------------------------------------
echo [5/6] Web (Next.js)...
netstat -ano | findstr /R /C:":3000 " | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  echo   Web already running on :3000 - skipping.
) else (
  start "Recipe Systems - Web" /D "%~dp0apps\web" cmd /k npx next dev -p 3000
  echo   Web window started on port 3000.
)

rem --- 6. Health checks -----------------------------------------------------
echo [6/6] Waiting for the app to answer...

set tries=0
:wait_api
curl -s http://localhost:3001/api/v1/health >nul 2>&1 && goto api_ok
set /a tries+=1
if !tries! GEQ 60 (
  echo   ERROR: API did not answer on :3001. Check the API window.
  pause
  exit /b 1
)
ping -n 4 127.0.0.1 >nul
goto wait_api
:api_ok
echo   API health OK.

set tries=0
:wait_web
curl -s http://localhost:3000/ >nul 2>&1 && goto web_ok
set /a tries+=1
if !tries! GEQ 60 (
  echo   ERROR: web did not answer on :3000. Check the web window.
  pause
  exit /b 1
)
ping -n 4 127.0.0.1 >nul
goto wait_web
:web_ok
echo   Web OK.

echo.
echo ==========================================================
echo  Recipe Systems is up
echo    Web       : http://localhost:3000
echo    API       : http://localhost:3001/api/v1
echo    Worker    : consuming queue "analysis" (ANALYSIS_LLM_STUB=1)
echo    Keycloak  : http://localhost:8081  (realm: recipesystems)
echo    Postgres  : localhost:5433/recipe
echo    Sign in   : chef@recipesystems.test / password
echo    Note      : if the DB volume was reset, re-load reference data
echo                via the reviewed import path (apps\api):
echo                  npm run reference-data:import -- approve infra\reference-data\imports\<file>.json --reviewer "your name"
echo ==========================================================
echo.
start "" http://localhost:3000
endlocal
