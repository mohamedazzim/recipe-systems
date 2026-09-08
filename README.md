# Recipe Systems

A recipe **analysis** product (not a generator). Turns a typed, pasted, or photographed recipe
card into a structured briefing across **nine fixed views** — ingredient-function, taste pillars,
process/timing, load-bearing, regional, ratio, sensory/time, dietary (View 8), and calories &
micros (View 9).

This repository implements the authoritative specification corpus (vendored in `docs/`):
`USER_STORIES.md` (50 canonical stories, A1–I7) → `user_story/` epic partitions →
`Recipe_Systems_ERD_FINAL.md` (24 tables, v13) → `DISPATCH.md` (D-01…D-31).
Reconciled 2026-09-07 — the mentor's earlier WP/Drizzle/Python draft is retired to
`docs/historical/` (provenance only).

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router) + React + TypeScript + Tailwind |
| Backend (BFF) | NestJS + TypeScript — the only service browsers call |
| Analysis worker | Node.js + TypeScript, separate process (pg-boss at D-17) |
| Database | PostgreSQL 16 — **Prisma owns ALL DDL, exclusively** (SCAFFOLD §2) |
| Files | MinIO (dev) / S3 (prod) — S3-compatible, private buckets, signed URLs |
| Identity | **Keycloak** (sole IdP; OIDC/OAuth2 through the adapter seam — SCAFFOLD §3) |
| Queue | pg-boss (Postgres-backed — no Redis in the pilot, TEST_PLAN §1) |
| Contracts | `packages/schemas` (zod) → generated `openapi/` (freeze at D-05) |

## Monorepo layout

```
apps/web             Next.js frontend (OIDC login via BFF, guest mode)
apps/api             NestJS BFF — auth (Keycloak seam), account/guest services
apps/analysis-worker Node.js analysis worker skeleton (pg-boss consumption at D-17)
packages/database    Prisma — the exclusive Postgres DDL authority (24 canonical tables)
packages/schemas     nine-view JSON schemas — frozen first (D-05)
packages/domain      shared domain contracts
packages/llm-adapter provider-neutral LLM seam (Q9 OPEN)
packages/ocr-adapter provider-neutral OCR seam (Q10 OPEN)
packages/rendering   print rendering (read-only)
tests/               fixtures (D-03), assertions, integration suites
infra/               docker-compose (postgres, minio, nginx; keycloak in the identity profile)
docs/                the authoritative spec corpus + retained mentor assets
docs/historical/     superseded WP-era mentor documents (provenance only)
scripts/             verify-local, regression-gates, contract-check, check-perf-baselines
```

## Quick start (dev)

```bash
cp .env.example .env                  # dev secrets only; prod = managed secrets store
docker compose -f infra/docker/docker-compose.yml up -d        # postgres + minio + nginx
docker compose -f infra/docker/docker-compose.yml --profile identity up -d   # Keycloak (P1 onward)
(cd packages/database && npx prisma generate && npx prisma migrate deploy)
npm run dev                           # web (:3000) + api (:3001)
bash scripts/verify-local.sh          # the CI pipeline, locally (SCAFFOLD §6 order)
```

Note: on dev machines with a native PostgreSQL on 5432, the compose stack maps Postgres to
host port **5433** (see `.env.example`). CI runs the standard 5432 in an isolated container.

## Development program

- Active roadmap: **D-01…D-31** (`docs/DISPATCH.md`) with paired **A-01…A-31** audits.
- Quality gates **QG1–QG5** (`docs/TEST_PLAN.md`): coverage floors, cumulative regression gates,
  perf baselines, fault matrix, deterministic fixtures.
- One-writer rule (ADR §2): Prisma owns DDL; the analysis worker owns `analysis_*`; the admin
  module owns reference data.
- Keycloak is the sole identity provider (Q8 RESOLVED). No Auth0, no alternative IdP.
