# Reconciliation Record — 2026-09-07

Governance decision (owner-confirmed): **E:\recipe is the authoritative specification**;
this repository (`E:\Pente_Recipe_System-main`) implements it. The mentor's earlier program
(WP-00…WP-15, Drizzle, 17-table draft ERD, Python analysis service, Redis) is retired —
preserved for provenance under `docs/historical/`, never treated as authority.

## Traceability map (specification → story → unit → implementation)

| Reconciliation change | Canonical source | Stories | D-unit | Where it lands |
|---|---|---|---|---|
| Prisma as exclusive DDL authority | SCAFFOLD §2 | (foundation) | D-01/D-02 | `packages/database/` |
| 24-table ERD v13 schema + all §12 constraints | ERD_FINAL §3/§5–§10/§12 | A2, B1–I7 data foundation | D-02 | `packages/database/prisma/` (migrations 001, 002) |
| Keycloak realm `recipesystems` + OIDC redirects | D-06 | A1 | D-06 | `infra/keycloak/recipe-systems-realm.json` |
| Provider-neutral identity seam + Keycloak provider (JWKS/issuer/audience/nonce) | SCAFFOLD §3, ADR §19 | A1 | D-06 | `apps/api/src/modules/auth/identity/` |
| Session cookie + CSRF double-submit | Tech Stack §14/§15, SCAFFOLD §3 | A1 | D-07 | `apps/api/src/modules/auth/session.ts`, `csrf.guard.ts` |
| Account creation on first sign-in (sso, home mode) | ERD §5 `account` | A1 TC-01 | D-07 | `apps/api/src/modules/account/account.service.ts` |
| guest_session model + claim transaction (XOR-respecting, idempotent) | ERD §5/§13, SCAFFOLD §3 | A2 | D-08 | `apps/api/src/modules/auth/auth.service.ts` (claimGuestSession), `guest-or-jwt.guard.ts` |
| Guard pattern (session / guest actor resolution) | SCAFFOLD §3 | A1/A2 | D-07/D-08/D-09 spine | `apps/api/src/common/guards/` |
| Node analysis worker skeleton (Python retired) | Tech Stack §1, SCAFFOLD §1 | C1–C7 (later) | D-17 foundation | `apps/analysis-worker/` |
| Contracts pipeline (no failing stubs) | SCAFFOLD §6, BUILD_PLAN P0-5 | (contracts) | D-05 target | `packages/schemas/`, `scripts/contract-check.sh`, `apps/api/scripts/generate-openapi.ts` |
| CI 7-stage order + QG1–QG5 | SCAFFOLD §6, TEST_PLAN §2 | (gates) | continuous | `.github/workflows/ci.yml`, `scripts/verify-local.sh`, `scripts/regression-gates.sh` |
| Canonical docs corpus vendored; WP docs → historical | USER_STORIES v1.2 | (program) | D-01…D-31 | `docs/`, `docs/historical/` |

## Mentor assets retained (compatible)

- Keycloak realm export → renamed realm `recipesystems`, OIDC redirects, service-account user
  retired (admin-REST pattern gone), registration/reset allowed, seeded chef@/demo@ users.
- Auth module structure (reflowed: ROPC+admin-REST → OIDC adapter seam).
- Web UI kit (Button/Card/Typography/Input/Badge) + page shell (reflowed to OIDC/guest flow).
- `docs/recipe_systems_mockup.html` (design reference), `docs/Recipe_Systems_Analysis_Prompts.md`,
  `docs/Recipe_Systems_Deterministic_Views.md`, `docs/Recipe_Systems_API.md`/`API_CRUD.md`
  (auth sections re-authored to the implemented OIDC contract), `docs/DOCUMENTATION_FLOW.md`,
  `docs/SETUP.md` (rewritten to the canonical stack; original in `docs/historical/`).

## Mentor assets retired

- Drizzle ORM layer (`apps/api/drizzle/`, `src/db/drizzle.module.ts`, root `drizzle/`,
  `docs/drizzle/`), drizzle migration 0000 (17-table draft).
- `services/analysis` Python skeleton (FastAPI stubs) — replaced by `apps/analysis-worker`.
- Redis from compose (spec forbids it for the pilot, TEST_PLAN §1).
- ROPC login, Keycloak admin-REST signup, header-guest guard, dead WriteGuard, committed
  service-account user.
- WP dispatch program as active roadmap (now `docs/historical/`); fake/illustrative HANDOFF
  entries and pending CHANGE_LOG rows superseded by the canonical program + this record.
- Failing `contract-check` git-diff placeholder (replaced by the D-05-aware no-op pipeline).

## Verification evidence (2026-09-07)

- Migration battery: fresh deploy applies 001+002 (24 tables + 23 CHECKs + btree_gist +
  exclusion constraints + soft-delete trigger); 8/8 constraint classes provably fire; XOR
  satisfied-case passes; trigger cleans shopping state (1→0).
- `prisma migrate diff` (DB→datamodel): exactly 3 intentional raw-SQL objects remain
  (2 composite FKs + `uq_analysis_view` partial-style unique index) — documented in migration 002.
- `npm run lint` / `typecheck` / `test` / `build` green; api coverage 87.2% lines (QG1 floor 75%).
- Regression gates: all 8 QG2 gates green-trivially until their subjects land (D-03+).

## Next units after reconciliation

The foundation covers D-01-equivalent bootstrap, D-02's schema deliverable, and the
D-06/D-07/D-08/D-09 architecture spine (auth/guest/guard code + tests). Formal per-unit
story suites, A-unit audits, and the D-02 HANDOFF evidence entry remain for the paired-audit
cycle. First feature unit to dispatch: **D-03** (golden fixture scaffold) — or, if the user
prefers to treat this reconciliation as the D-02 submission itself, **A-02** audit first.
