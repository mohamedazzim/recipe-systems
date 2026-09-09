#!/usr/bin/env bash
# Recipe Systems — local reproduction of the CI pipeline (DISPATCH global rule 5).
# Same steps, same order as .github/workflows/ci.yml (SCAFFOLD §6):
#   lint → typecheck → unit → golden+grounding (regression gates) → migrate deploy → integration → build
# Non-zero on any failure. Runs from the repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { echo ""; echo "==== verify-local: $1 ===="; }

step "install (npm ci)"
npm ci --no-audit --no-fund

step "prisma generate + database build (client and dist must exist before typecheck/unit)"
(cd packages/database && npx prisma generate && npm run build)

step "schemas build (D-15: consumers import @recipe-systems/schemas via dist)"
(cd packages/schemas && npm run build)

step "llm-adapter build (D-15/D-17: api + worker import it via dist)"
(cd packages/llm-adapter && npm run build)

step "lint"
npm run lint

step "typecheck"
npm run typecheck

step "unit tests (full cumulative suite)"
npm run test

step "golden fixture + grounding validation (QG2 regression gates)"
bash scripts/regression-gates.sh

step "contract check"
bash scripts/contract-check.sh

step "prisma migrate deploy (ephemeral Postgres)"
# CI runs this against a fresh postgres:16 service container. Locally it uses the compose stack
# (infra/docker/docker-compose.yml default profile; host port 5433 on dev machines).
DB_URL="$(node -e 'console.log(process.env.DATABASE_URL||"postgresql://recipe:recipe_dev_password@localhost:5433/recipe")')"
DB_HOST="$(node -e 'try{console.log(new URL(process.argv[1]).hostname)}catch{console.log("localhost")}' "$DB_URL")"
DB_PORT="$(node -e 'try{const p=new URL(process.argv[1]).port;console.log(p||5432)}catch{console.log(5432)}' "$DB_URL")"
if node -e 'const net=require("net");const s=net.connect(Number(process.argv[2]),process.argv[1],()=>{s.end();process.exit(0)});s.on("error",()=>process.exit(1));s.setTimeout(3000,()=>process.exit(1));' "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  (cd packages/database && DATABASE_URL="$DB_URL" npx prisma migrate deploy)
else
  echo "WARNING: Postgres unreachable at ${DB_HOST}:${DB_PORT} — skipping local migrate deploy."
  echo "         The hosted CI runs this step against a fresh Postgres service container."
fi

step "integration tests"
npm run test:integration

step "build"
npm run build

step "perf baselines schema check (QG3)"
node scripts/check-perf-baselines.js

echo ""
echo "verify-local: ALL STEPS PASSED"
