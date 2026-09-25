# Recipe Systems — Setup & Runbook

> **Purpose:** one step-by-step guide to stand up the whole stack from a fresh checkout.
> **Stack (authoritative, E:\recipe):** npm monorepo · `apps/web` (Next.js) · `apps/api`
> (NestJS BFF) · `apps/analysis-worker` (Node.js + TS) · Prisma (exclusive DDL authority) ·
> Keycloak (sole IdP, OIDC via the adapter seam).
> **Companion docs:** `SCAFFOLD.md` (standards), `Recipe_Systems_Architecture_Decision_FINAL_V5.md`,
> `Recipe_Systems_ERD_FINAL.md` (24-table model), `Recipe_Systems_API.md` (endpoint contract),
> `USER_STORIES.md` + `user_story/` (canonical stories).
> The pre-reconciliation runbook (ROPC trade-offs, Drizzle, Python service, Redis, audit_log
> rows on every mutation) is retired to `docs/historical/SETUP.md` — none of it is active.

## 0. Architecture map

```
web (:3000)  ──HTTPS/JSON, httpOnly session cookie──▶  api (:3001, /api/v1)  ──pg-boss──▶  analysis-worker (D-17)
                                                          │ OIDC (adapter seam)                │
                                                          ▼                                    ▼
                                                     Keycloak (IdP)                       Postgres (Prisma)
                                                          └─ no hosted pages? hosted login + registration via redirect
```

**Binding rules (SCAFFOLD §2/§3):**

- Prisma is the **only** Postgres DDL authority; only `packages/database` owns migrations.
- The browser never holds an IdP token: the BFF exchanges the OIDC code, verifies the ID token
  (JWKS signature, issuer, audience, nonce), and issues its own **httpOnly session cookie**.
- Credentials live only in Keycloak. `account.password_hash` stays null (`auth_provider = 'sso'`).
- Guest identity is a `guest_session` row (unguessable UUID, expiry); claiming moves recipes
  under `chk_recipe_owner_xor` (A2/D-08).
- The analysis worker is the only writer of `analysis_*`; the admin module owns reference data
  (one-writer rule, ADR §2).

## 1. Prerequisites

Node ≥ 20, npm ≥ 10, Docker (with compose). On Windows dev machines, a native PostgreSQL may
already own port 5432 — the compose stack therefore maps Postgres to host **5433** (CI is
unaffected and uses 5432 in an isolated container).

## 2. One-time setup

```bash
cp .env.example .env                        # dev secrets only — prod uses a managed secrets store
npm install --no-audit --no-fund
(cd packages/database && npx prisma generate)
```

## 3. Infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d                    # postgres + minio + nginx
docker compose -f infra/docker/docker-compose.yml --profile identity up -d # Keycloak — P1 onward (D-06), NOT before
(cd packages/database && npx prisma migrate deploy)                        # applies 001 (extension) + 002 (24 tables)
```

The Keycloak realm `recipesystems` is imported from `infra/keycloak/recipe-systems-realm.json`.
Seeded dev users (import-time password `password`): `chef@recipesystems.test`,
`demo@recipesystems.test`.

## 4. Dev loop

```bash
npm run dev            # web (:3000) + api (:3001)
```

Login flow: `GET /api/v1/auth/login` → Keycloak authorization endpoint → callback at
`/api/v1/auth/callback` → session cookie. Sign-up: `GET /api/v1/auth/signup` (Keycloak
registration). Guest: `POST /api/v1/auth/guest/session`.

## 5. Verification (the CI pipeline, locally)

```bash
bash scripts/verify-local.sh       # install → prisma generate → lint → typecheck → unit
                                   # → regression gates → contract check → migrate deploy
                                   # → integration → build → perf-baselines check
```

Quality gates (TEST_PLAN §2): QG1 coverage floors · QG2 cumulative suite + `regression-gates.sh` ·
QG3 `.perf-baselines.json` schema · QG4 fault matrix (P1+) · QG5 deterministic fixtures (D-03).

## 6. Ports

| Service | Host port | Notes |
|---|---|---|
| web | 3000 | Next.js dev |
| api | 3001 | NestJS, prefix `/api/v1` |
| postgres | 5433 | compose mapping; container 5432 |
| minio | 9000 | S3-compatible API (s3mock — MinIO's community images were withdrawn) |
| nginx | 8080 | edge, `/healthz` |
| keycloak | 8081 | identity profile only; realm `recipesystems` |

## 7. Environment variables

See `.env.example` — every variable is dev-labeled; `SESSION_SECRET` and
`KEYCLOAK_CLIENT_SECRET` must be replaced in production (Tech Stack §16: managed secrets
store, never `.env`).
