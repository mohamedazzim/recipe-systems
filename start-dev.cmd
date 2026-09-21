@echo off
setlocal EnableDelayedExpansion
rem =====================================================================
rem  Recipe Systems - local dev startup (native Windows cmd script)
rem
rem  What it does:
rem    1. Docker infrastructure (Postgres :5433, MinIO, nginx :8080, Keycloak :8081)
rem    2. Prisma migrations incl. D-30 shopping + D-23 print columns (packages\database)
rem    3. NestJS API in its own window (:3001)
rem    4. Analysis worker in its own window (pg-boss queue; DeepSeek drives both
rem       analysis-view generation and card OCR — provider + keys from .env)
rem    5. Next.js web in its own window (:3000)
rem    6. Health-checks everything, then opens the app
rem
rem  Test account : chef@recipesystems.test / Password@123
rem  To stop      : close the app windows, then
rem                 docker compose --profile core --profile identity -f infra\docker\docker-compose.yml down
rem =====================================================================

cd /d "%~dp0"

echo.
echo ==========================================================
echo  Recipe Systems - local dev startup
echo ==========================================================

rem --- optional local .env (provider config; NEVER committed) -------------
rem Loaded FIRST so the API/worker windows inherit it (DeepSeek/Gemini keys,
rem MODEL_PROVIDER, ANALYSIS_LLM_STUB). The inline dev defaults below still
rem win for infrastructure-critical values (ports, DB, Keycloak, MinIO).
if exist ".env" (
  for /F "usebackq eol=# delims=" %%A in (".env") do (
    set "line=%%A"
    if defined line (
      set "line=!line:"=!"
      for /F "tokens=1,* delims==" %%K in ("!line!") do (
        if not "%%K"=="" if not "%%L"=="" if not "!line:~0,1!"=="#" set "%%K=%%L"
      )
    )
  )
)

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
rem Providers (2026-09-16): DeepSeek drives BOTH analysis-view generation
rem (MODEL_PROVIDER / LLM_PROVIDER) and card OCR (OCR_PROVIDER). The local .env
rem supplies the keys (never committed); these defaults only fill the gaps.
rem With no DEEPSEEK_API_KEY present the view worker falls back to the
rem deterministic stub (ANALYSIS_LLM_STUB=1) so the pipeline still runs key-free.
if not defined MODEL_PROVIDER set "MODEL_PROVIDER=deepseek"
if not defined LLM_PROVIDER set "LLM_PROVIDER=deepseek"
if not defined OCR_PROVIDER set "OCR_PROVIDER=deepseek"
if not defined ANALYSIS_LLM_STUB (
  if defined DEEPSEEK_API_KEY (set "ANALYSIS_LLM_STUB=0") else (set "ANALYSIS_LLM_STUB=1")
)

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
echo [1/6] Starting Docker infrastructure...
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

rem --- 2. Prisma migrations + client ------------------------------------------
echo [2/6] Applying Prisma migrations + generating client...
pushd packages\database
call npx prisma migrate deploy
if errorlevel 1 (
  popd
  echo   ERROR: migration failed.
  pause
  exit /b 1
)
call npx prisma generate
if errorlevel 1 (
  popd
  echo   ERROR: Prisma client generation failed.
  pause
  exit /b 1
)
popd
echo   Migrations applied; Prisma client up to date.

rem --- 3. API ---------------------------------------------------------------
echo [3/6] API (NestJS)...
netstat -ano | findstr /R /C:":3001 " | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  echo   API already running on :3001 - skipping.
) else (
  start "Recipe Systems - API" /D "%~dp0apps\api" cmd /k npx nest start
  echo   API window started on port 3001.
)

rem --- 4. Analysis worker -----------------------------------------------------
echo [4/6] Analysis worker (pg-boss queue; provider per .env, stub default)...
call :worker_is_up && goto worker_ok
rem stale worker processes (dead consumers that never shut down cleanly) are
rem swept so a fresh window can start
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'tsx' -and $_.CommandLine -match 'src.main.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
start "Recipe Systems - Worker" /D "%~dp0apps\analysis-worker" cmd /k npm run dev
echo   Worker window started (consumes the analysis + ingestion + extraction queues).
set tries=0
:wait_worker
call :worker_is_up && goto worker_ok
set /a tries+=1
if !tries! GEQ 30 (
  echo   ERROR: the worker did not come up. Check the Worker window.
  pause
  exit /b 1
)
ping -n 3 127.0.0.1 >nul
goto wait_worker
:worker_ok
echo   Worker consuming.

rem --- 5. Web --------------------------------------------------------------
echo [5/6] Web (Next.js)...
netstat -ano | findstr /R /C:":3000 " | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  echo   Web already running on :3000 - skipping.
) else (
  goto start_web
)
goto web_started

:start_web
rem a previous Next.js dev server that died mid-compile can hold the SWC
rem binary lock ("operation rejected") — sweep stale next processes first
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'next' -and $_.CommandLine -notmatch 'nest' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
start "Recipe Systems - Web" /D "%~dp0apps\web" cmd /k npx next dev -p 3000
echo   Web window started on port 3000.
:web_started

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
  rem the skip-if-running branch above can race a dying dev server — sweep
  rem stale next processes (SWC binary lock pitfall) and start a fresh window
  if defined web_retried goto web_fail
  set web_retried=1
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'next' -and $_.CommandLine -notmatch 'nest' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
  start "Recipe Systems - Web" /D "%~dp0apps\web" cmd /k npx next dev -p 3000
  echo   Web window restarted after a stale-server race.
  set tries=0
  goto wait_web
)
ping -n 4 127.0.0.1 >nul
goto wait_web
:web_fail
echo   ERROR: web did not answer on :3000. Check the Web window
echo          (a stale Next.js process may still hold the SWC lock).
pause
exit /b 1
:web_ok
echo   Web OK.

echo.
echo ==========================================================
echo  Recipe Systems is up
echo    Web       : http://localhost:3000
echo    API       : http://localhost:3001/api/v1
if "%ANALYSIS_LLM_STUB%"=="1" (
  echo    Worker    : consuming "analysis" + "document-ingestion" + "document-extraction" ^(deterministic stub^)
) else (
  echo    Worker    : consuming "analysis" + "document-ingestion" + "document-extraction" ^(MODEL_PROVIDER=%MODEL_PROVIDER%^)
)
echo    OCR       : %OCR_PROVIDER% ^(DEEPSEEK_MODEL=%DEEPSEEK_MODEL%^)
echo    Keycloak  : http://localhost:8081  (realm: recipesystems)
echo    Postgres  : localhost:5433/recipe
echo    Sign in   : chef@recipesystems.test / Password@123
echo    Note      : if the DB volume was reset, re-load reference data
echo                via the reviewed import path (apps\api):
echo                  npm run reference-data:import -- approve infra\reference-data\imports\<file>.json --reviewer "your name"
echo ==========================================================
echo.
start "" http://localhost:3000
endlocal
exit /b 0

rem --- helper: is the analysis worker consuming? ----------------------------
rem The worker (tsx) runs as a node process whose command line carries the
rem worker's own src/main.ts. Checking the ACTUAL process (not just the cmd
rem window) means a worker that crashed inside its window is detected and
rem restarted. Returns 0 when the worker is up, 1 otherwise.
:worker_is_up
powershell -NoProfile -Command "$n = @(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'tsx' -and $_.CommandLine -match 'src.main.ts' }).Count; if ($n -gt 0) { exit 0 } else { exit 1 }"
exit /b %errorlevel%
