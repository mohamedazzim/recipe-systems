#!/usr/bin/env bash
# ============================================================================
# Recipe Systems — local dev + test harness (git-bash / MSYS on Windows)
#
# Usage:
#   bash scripts/dev.sh start            # bring up infra + API + web + worker (default)
#   bash scripts/dev.sh stop             # stop API + web + worker (keeps Docker infra)
#   bash scripts/dev.sh stop --infra     # stop API + web + worker + Docker stack
#   bash scripts/dev.sh status           # health-check the four tiers + worker
#   bash scripts/dev.sh test:unit        # workspace unit tests (jest)
#   bash scripts/dev.sh test:api         # API unit tests with coverage
#   bash scripts/dev.sh test:e2e [args]  # Playwright E2E (needs the stack up)
#   bash scripts/dev.sh test:all         # unit + E2E
#   bash scripts/dev.sh verify           # full verify-local (stops dev servers!)
#   bash scripts/dev.sh help
#
# Dev credentials (local only — seeded by infra/keycloak/recipe-systems-realm.json):
#   Sign in:  chef@recipesystems.test / password
#   Postgres: recipe / recipe_dev_password @ localhost:5433/recipe
# ============================================================================

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$REPO_DIR/infra/docker"
# Native Windows temp path — NOT $TMPDIR (/tmp breaks native curl: CURLE_WRITE_ERROR 23).
TMP_DIR="${LOCALAPPDATA:-$HOME/AppData/Local}/Temp/recipe-systems-dev"
PID_FILE="$TMP_DIR/pids"
mkdir -p "$TMP_DIR"

# Load the local .env (never committed) if present, so DeepSeek/Gemini keys and
# provider selections reach the API/worker processes — mirrors start-dev.cmd.
# `set -a` auto-exports every sourced assignment. The hard-coded dev defaults
# below still win for infrastructure-critical values (ports, DB, Keycloak, MinIO).
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_DIR/.env"
  set +a
fi

# --- dev environment (matches .env.example; dev-only values) ---------------
export DATABASE_URL="postgresql://recipe:recipe_dev_password@localhost:5433/recipe"
export SESSION_SECRET="dev-session-secret-change-me"
export SESSION_SECURE="false"          # plain-HTTP dev loop; browsers accept Secure on localhost
export KEYCLOAK_BASE_URL="http://localhost:8081"
export KEYCLOAK_REALM="recipesystems"
export KEYCLOAK_CLIENT_ID="recipe-systems-bff"
export KEYCLOAK_CLIENT_SECRET="dev-bff-client-secret"
export KEYCLOAK_ISSUER_URL="http://localhost:8081/realms/recipesystems"
export S3_ENDPOINT="http://localhost:9000"
export S3_BUCKET="recipe-assets"
export S3_ACCESS_KEY="minioadmin"
export S3_SECRET_KEY="minioadmin"
export AUTH_REDIRECT_BASE="http://localhost:3001"
export WEB_ORIGIN="http://localhost:3000"
export CORS_ORIGINS="http://localhost:3000"
export PORT=3001

# Providers: Gemini drives BOTH analysis-view generation and card OCR. The
# .env (loaded above) supplies the keys; these defaults fill the gaps. With no
# GEMINI_API_KEY the view worker falls back to the deterministic stub.
export MODEL_PROVIDER="${MODEL_PROVIDER:-gemini}"
export LLM_PROVIDER="${LLM_PROVIDER:-gemini}"
export OCR_PROVIDER="${OCR_PROVIDER:-gemini}"
if [ -z "${ANALYSIS_LLM_STUB:-}" ]; then
  if [ -n "${GEMINI_API_KEY:-}" ]; then
    export ANALYSIS_LLM_STUB=0
  else
    export ANALYSIS_LLM_STUB=1
  fi
fi

WEB_URL="http://localhost:3000"
API_URL="http://localhost:3001/api/v1"
KC_URL="http://localhost:8081/realms/recipesystems/.well-known/openid-configuration"

log()  { printf '\n\033[1;33m== %s ==\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; }

wait_for() { # wait_for <url> <label> <attempts>
  local url="$1" label="$2" attempts="${3:-40}"
  local probe="$TMP_DIR/_health_probe"
  for _ in $(seq 1 "$attempts"); do
    # NOTE: -o /dev/null exits 23 (CURLE_WRITE_ERROR) under MSYS even on HTTP 200 —
    # write to a real temp file instead.
    if curl -sf -o "$probe" "$url" 2>/dev/null; then rm -f "$probe"; ok "$label"; return 0; fi
    sleep 3
  done
  rm -f "$probe"
  fail "$label (after ${attempts} attempts)"; return 1
}

wait_for_pg() { # postgres healthy inside compose
  for _ in $(seq 1 40); do
    if (cd "$COMPOSE_DIR" && docker compose ps --format '{{.Service}} {{.Status}}' 2>/dev/null | grep -q "postgres.*healthy"); then
      ok "postgres healthy"; return 0
    fi
    sleep 5
  done
  fail "postgres healthy"; return 1
}

port_busy() { # port_busy <port> — netstat reports native Windows PIDs
  netstat -ano | grep -E ":${1}\s" | grep -q LISTENING
}

assert_ports_free() {
  local busy=0
  for p in 3000 3001; do
    if port_busy "$p"; then
      fail "port $p already in use — stop the existing stack first: bash scripts/dev.sh stop"
      busy=1
    fi
  done
  [ "$busy" = "0" ] || exit 1
}

infra_up() {
  log "Docker infrastructure (core + identity profiles)"
  (cd "$COMPOSE_DIR" && docker compose --profile core --profile identity up -d)
  wait_for_pg
  wait_for "$KC_URL" "keycloak realm recipesystems"
}

migrate() {
  log "Prisma migrations (packages/database)"
  (cd "$REPO_DIR/packages/database" && npx prisma migrate deploy)
}

start_api() {
  log "NestJS API → $API_URL"
  ( cd "$REPO_DIR/apps/api" && exec npx nest start ) >"$TMP_DIR/api.log" 2>&1 &
  local pid=$!
  echo "$pid" >>"$PID_FILE"
  sleep 5
  if ! kill -0 "$pid" 2>/dev/null; then
    fail "API exited during startup — log tail:"; tail -6 "$TMP_DIR/api.log"; exit 1
  fi
}

start_web() {
  log "Next.js web → $WEB_URL"
  ( cd "$REPO_DIR/apps/web" && NEXT_PUBLIC_API_BASE_URL="$API_URL" exec npx next dev -p 3000 ) >"$TMP_DIR/web.log" 2>&1 &
  local pid=$!
  echo "$pid" >>"$PID_FILE"
  sleep 5
  if ! kill -0 "$pid" 2>/dev/null; then
    fail "web exited during startup — log tail:"; tail -6 "$TMP_DIR/web.log"; exit 1
  fi
}

start_worker() {
  log "Analysis worker (pg-boss queue; DeepSeek views + OCR)"
  ( cd "$REPO_DIR/apps/analysis-worker" && exec npx ts-node -T src/main.ts ) >"$TMP_DIR/worker.log" 2>&1 &
  local pid=$!
  echo "$pid" >>"$PID_FILE"
  sleep 5
  if ! kill -0 "$pid" 2>/dev/null; then
    fail "worker exited during startup — log tail:"; tail -8 "$TMP_DIR/worker.log"; exit 1
  fi
  ok "worker consuming queue \"analysis\" + \"view9-recompute\""
}

kill_pids() {
  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      # single-slash form: //T //F does not work reliably under MSYS
      taskkill /PID "$pid" /F >/dev/null 2>&1 || kill "$pid" 2>/dev/null || true
    done <"$PID_FILE"
    rm -f "$PID_FILE"
  fi
  # Self-heal: npx detaches its node child, so also kill anything still
  # listening on the dev ports (native Windows PIDs from netstat).
  for p in 3000 3001; do
    netstat -ano | grep -E ":${p}\s" | grep LISTENING | awk '{print $NF}' | sort -u | while read -r pid; do
      taskkill /PID "$pid" /F >/dev/null 2>&1 || true
    done
  done
  # The worker listens on no port — sweep its ts-node consumer explicitly.
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'ts-node' -and \$_.CommandLine -match 'src.main' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
}

cmd_start() {
  assert_ports_free
  infra_up
  migrate
  : >"$PID_FILE"
  start_api
  start_web
  start_worker
  wait_for "$API_URL/health" "api health"
  wait_for "$WEB_URL" "web"
  echo
  ok "Stack is up"
  printf '  Web:        %s\n' "$WEB_URL"
  printf '  API:        %s\n' "$API_URL"
  printf '  Keycloak:   http://localhost:8081 (realm: recipesystems)\n'
  printf '  Postgres:   localhost:5433/recipe\n'
  printf '  Sign in:    chef@recipesystems.test / password\n'
  printf '  Logs:       %s/{api,web}.log\n' "$TMP_DIR"
}

cmd_stop() {
  log "Stopping API + web + worker"
  kill_pids
  if [ "${1:-}" = "--infra" ]; then
    (cd "$COMPOSE_DIR" && docker compose --profile core --profile identity down)
    ok "Docker stack stopped"
  fi
  ok "Done (Docker infra left running unless --infra)"
}

cmd_status() {
  local probe="$TMP_DIR/_status_probe"
  curl -sf -o "$probe" "$WEB_URL" 2>/dev/null && ok "web" || fail "web"
  curl -sf -o "$probe" "$API_URL/health" 2>/dev/null && ok "api" || fail "api"
  curl -sf -o "$probe" "$KC_URL" 2>/dev/null && ok "keycloak" || fail "keycloak"
  worker_count="$(powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'ts-node' -and \$_.CommandLine -match 'src.main' } | Measure-Object).Count" 2>/dev/null | tr -d '\r' || true)"
  if [ "${worker_count:-0}" -ge 1 ]; then ok "worker"; else fail "worker"; fi
  rm -f "$probe"
  (cd "$COMPOSE_DIR" && docker compose ps --format '{{.Service}} {{.Status}}' | grep -E "postgres|keycloak|minio|nginx")
}

cmd_test_unit() {
  log "Workspace unit tests (npm run test)"
  (cd "$REPO_DIR" && npm run test)
}

cmd_test_api() {
  log "API unit tests + coverage (QG1 floor 75%)"
  (cd "$REPO_DIR/apps/api" && npx jest --config jest.config.js --coverage)
}

cmd_test_e2e() {
  log "Playwright E2E (stack must be up — bash scripts/dev.sh start)"
  (cd "$REPO_DIR" && npx playwright test "$@")
}

cmd_test_all() {
  cmd_test_unit
  cmd_test_e2e
}

cmd_verify() {
  log "verify-local — NOTE: stops dev servers first (npm ci needs no locks)"
  echo "Stopping dev servers…"
  kill_pids
  (cd "$REPO_DIR" && bash scripts/verify-local.sh)
  ok "verify-local done — re-run: bash scripts/dev.sh start"
}

cmd_help() {
  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

case "${1:-start}" in
  start)  cmd_start ;;
  stop)   cmd_stop "${2:-}" ;;
  status) cmd_status ;;
  test:unit) cmd_test_unit ;;
  test:api)  cmd_test_api ;;
  test:e2e)  shift; cmd_test_e2e "$@" ;;
  test:all)  cmd_test_all ;;
  verify) cmd_verify ;;
  help|-h|--help) cmd_help ;;
  *) echo "unknown command: $1" >&2; cmd_help; exit 1 ;;
esac
