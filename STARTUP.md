# Recipe Systems — Local Startup & Test Commands

Everything needed to run the application locally and execute the test suites.
All commands run from the repository root (`E:\Pente_Recipe_System-main`) in **git-bash**.

> There is also an automated harness: `bash scripts/dev.sh start|stop|status|test:unit|test:api|test:e2e|test:all|verify`.
> This file lists the same commands individually.

---

## 1. Dev credentials (local only)

| What | Value |
|---|---|
| Sign in (seeded user) | `chef@recipesystems.test` / `password` |
| Postgres | `recipe` / `recipe_dev_password` @ `localhost:5433/recipe` |
| Keycloak realm | `recipesystems` @ `http://localhost:8081` |
| Keycloak client | `recipe-systems-bff` / `dev-bff-client-secret` |
| Session secret (dev) | `dev-session-secret-change-me` |

---

## 2. Start the application

### 2.1 Infrastructure (Docker: Postgres, MinIO, nginx, Keycloak)

```bash
cd infra/docker
docker compose --profile core --profile identity up -d
```

Wait for health:

```bash
docker compose ps            # postgres + keycloak must show (healthy)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/realms/recipesystems/.well-known/openid-configuration   # 200
```

### 2.2 Database migrations (idempotent)

```bash
cd ../../packages/database
npx prisma migrate deploy
```

### 2.3 API (NestJS BFF, port 3001) — new terminal

```bash
cd apps/api
DATABASE_URL="postgresql://recipe:recipe_dev_password@localhost:5433/recipe" \
SESSION_SECRET="dev-session-secret-change-me" \
SESSION_SECURE=false \
KEYCLOAK_BASE_URL="http://localhost:8081" \
KEYCLOAK_REALM="recipesystems" \
KEYCLOAK_CLIENT_ID="recipe-systems-bff" \
KEYCLOAK_CLIENT_SECRET="dev-bff-client-secret" \
KEYCLOAK_ISSUER_URL="http://localhost:8081/realms/recipesystems" \
AUTH_REDIRECT_BASE="http://localhost:3001" \
WEB_ORIGIN="http://localhost:3000" \
CORS_ORIGINS="http://localhost:3000" \
PORT=3001 \
npx nest start
```

Health check: `curl -s http://localhost:3001/api/v1/health` → `{"status":"ok"}`

### 2.4 Web (Next.js, port 3000) — new terminal

```bash
cd apps/web
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 npx next dev -p 3000
```

Open **http://localhost:3000** — sign in with `chef@recipesystems.test` / `password`.

### 2.5 One-shot harness (does 2.1 → 2.4 for you)

```bash
bash scripts/dev.sh start
```

Stop: `bash scripts/dev.sh stop` (add `--infra` to also stop Docker).

---

## 3. Test commands

### 3.1 Unit tests

```bash
npm run test                 # all workspace suites (api 57, database, schemas, …)
cd apps/api && npx jest --config jest.config.js --coverage   # API with coverage (QG1 floor 75%)
```

### 3.2 E2E tests (Playwright — requires the full stack running)

```bash
npx playwright test                          # all specs (entry, signin, signup, logout, security)
npx playwright test tests/e2e/signin.spec.ts # one spec
npx playwright test tests/e2e/signup.spec.ts --grep "duplicate"   # one test
```

E2E drives the real browser through Keycloak + Postgres — the stack from §2 must be up.

### 3.3 Quality gates

```bash
npm run lint                 # eslint --max-warnings=0 (all workspaces)
npm run typecheck            # tsc across workspaces
npm run build                # production builds (incl. next build)
bash scripts/regression-gates.sh
bash scripts/contract-check.sh
bash scripts/verify-local.sh # full pipeline: ci → lint → typecheck → unit → integration → gates → contract → build → perf
```

> `verify-local.sh` runs `npm ci` — stop the dev servers first (`bash scripts/dev.sh stop`), otherwise Windows file locks fail the install step.

---

## 4. Quick reference

| Task | Command |
|---|---|
| Everything up | `bash scripts/dev.sh start` |
| Everything down | `bash scripts/dev.sh stop --infra` |
| Health check | `bash scripts/dev.sh status` |
| All tests | `bash scripts/dev.sh test:all` |
| Full verification | `bash scripts/dev.sh verify` |

**Ports:** web `3000` · API `3001` · nginx `8080` · Keycloak `8081` · Postgres `5433`
**Logs (harness):** `%LOCALAPPDATA%\Temp\recipe-systems-dev\{api,web}.log`
