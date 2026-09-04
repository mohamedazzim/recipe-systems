# Recipe Systems — Scaffold & Engineering Decisions

**Status:** v1.0 · 2026-09-04 · Companion to [BUILD_PLAN.md](BUILD_PLAN.md) and [TEST_PLAN.md](TEST_PLAN.md)
**Sources:** `Recipe_Systems.md` (product), `Recipe_Systems_ERD_FINAL.md` v13 (schema), `Recipe_Systems_Architecture_Decision_FINAL_V5.md` (ADR-001), `Recipe_Systems_Tech_Stack_FINAL.md` (stack).
**Purpose:** The bootstrap decisions a coding agent must not guess: repository layout, migration ownership, service and session mechanics, frontend stack, dev loop, and binding conventions. Where this document decides something none of the four sources assert, it is labeled a **convention**; where the sources are silent or in conflict on an architecture question, it is **OPEN DECISION** — never silently invented.

---

## 1. Repository layout: one monorepo

Tech Stack §22 defines the layout; this makes it binding, annotated with the ADR-001 §2 ownership boundaries:

```text
recipe-systems/
├── apps/
│   ├── web/                 # Next.js — intake review, nine views, library, cook loop UI
│   ├── api/                 # NestJS — Web API/BFF + Intake + Render + Admin/reference-data (pilot co-location, ADR §2)
│   └── analysis-worker/     # Separate process/container — the only writer of analysis_* tables
├── packages/
│   ├── domain/              # Shared domain contracts (nine views, provenance tags, modes)
│   ├── schemas/             # Nine-view JSON schemas — frozen first (BUILD_PLAN P0-5 · wks 1–2)
│   ├── database/            # Prisma schema + SQL migrations — sole DDL authority (§2)
│   ├── llm-adapter/         # Provider-neutral LLM interface (Tech Stack §10)
│   ├── ocr-adapter/         # Provider-neutral OCR interface (Tech Stack §11)
│   └── rendering/           # Print templates + snapshot-only render contracts (ADR §7)
├── tests/
│   ├── fixtures/            # golden_kanyakumari_card.json + 50-recipe corpus (ERD §16)
│   ├── assertions/          # golden_recipe_assertions.yaml (ERD §16)
│   └── integration/         # story_* suites, one file per story ID (SCAFFOLD §6)
├── infra/
│   ├── docker/              # compose: postgres, minio, nginx; keycloak via identity profile (P1)
│   ├── keycloak/            # realm export — created in P1, not before
│   ├── nginx/
│   └── deployment/
├── docs/                    # the four source documents + this trio, moved verbatim
└── .github/workflows/       # CI per Tech Stack §20
```

This documentation repository (`E:\recipe`) seeds the monorepo: `docs/` copies over verbatim at kickoff. Nothing in the four source documents is rewritten — if a build decision contradicts a source document, the decision is OPEN DECISION until the source is amended by reviewed patch.

## 2. Migration ownership: Prisma owns ALL Postgres DDL, exclusively

**Decision (Tech Stack §5):** `prisma migrate` is the only DDL authority for the single PostgreSQL control plane — all 24 tables in ERD §3. Every table the API reads is modeled in Prisma regardless; making the schema authoritative costs nothing and eliminates drift.

- ERD §12's SQL is the migration spec, applied verbatim: `CHECK` constraints (`chk_recipe_owner_xor`, `chk_ocr_confidence_range`, `chk_restriction_item_type_matches_value`), partial unique indexes (`uq_analysis_current`, `uq_recipe_ingredient_line`), `EXCLUDE USING gist` overlap protections, and the `trg_line_soft_delete_cleans_shopping_state` trigger (C-28). Where Prisma cannot express a construct, the migration is raw SQL — the constraint still ships.
- `CREATE EXTENSION IF NOT EXISTS btree_gist` is the first line of migration 001 (ERD §9 requires it).
- No table changes without an ERD revision. ADR §22 states no ERD v13 changes are required by the ADR; any future change is an ERD v14 patch, reviewed as such.
- Sequence in dev/CI: `prisma migrate deploy` → reference-data seed via the admin import path (ADR §7) → golden fixture load (CI only).

## 3. Service and session mechanics

- **Browser → Web API:** secure HTTP-only cookies (`Secure`, `HttpOnly`, `SameSite`, expiration — Tech Stack §14). CSRF protection appropriate to the cookie architecture (Tech Stack §15).
- **Identity:** the IdP is **OPEN DECISION (Q8)** — Tech Stack §1/§14/§25 recommend Auth0 ("Confirmation required") and the sources never mention Keycloak. **Working assumption for this plan:** Keycloak as the pilot IdP (position in BUILD_PLAN §5), Auth0 as the managed fallback, until Tech Stack is amended. Whichever wins, the IdP owns credential lifecycle, password reset, email verification, OAuth/SSO, and MFA — the list Tech Stack §14 assigns to it — and the application continues to own `account`, `guest_session`, recipe ownership, guest claiming, and authorization (ADR §19).
- **Guest sessions:** unguessable UUID identifiers, expiry cleanup, scoped to one guest session; every recipe operation verifies ownership first (ADR §20, INV-17).
- **API ↔ worker:** no direct HTTP. The worker dequeues pg-boss jobs from Postgres (Tech Stack §9); progress flows worker → Postgres `NOTIFY` → API → SSE → browser (Tech Stack §13). `NOTIFY` is a signal, never durable state (INV-16).
- **Provider adapters:** all LLM/OCR calls go through the provider-neutral adapter packages; vendor responses are normalized before they enter the domain (ADR §19). OCR is orchestrated by Intake, not by the worker (ADR §2 Decision 3); the topology diagram's Worker→OCR edge is Q3 and awaits a diagram patch (regenerate `diagram.png`). Provider credentials come from the managed secrets store — never `.env` in production (Tech Stack §16).
- **Object storage:** private buckets, public access disabled, short-lived signed URLs for client access (Tech Stack §7). Dev uses a MinIO compose container with the S3-compatible API (convention — production remains S3 per Tech Stack §7).

## 4. Frontend stack

Next.js (App Router, TypeScript) · Tailwind CSS + shadcn/ui (Tech Stack §3). Binding additions:

- **One app, not two.** Home and Chef modes are presentation modes over one `analysis` (`analysis.mode`, `account.preferred_mode` — ERD §6), not separate applications (Recipe_Systems §7).
- **Print is first-class.** HTML/CSS print templates rendered to PDF by Playwright + Chromium, read-only, from persisted snapshots only (Tech Stack §12, ADR §7). Browser print preview uses the same templates.
- **Analysis progress** via SSE with reconnect-and-reload reconciliation (Tech Stack §13).
- **The frontend is never authoritative** for ownership, recipe identity, analysis status, allergen claims, or nutrition calculations (Tech Stack §3).
- No additional data-fetching or state library is mandated beyond what Next.js provides (convention; OPEN DECISION if the team wants one).

## 5. Dev loop (target state — phases per BUILD_PLAN)

```text
cp .env.example .env                        # dev secrets only; prod = managed secrets store
docker compose up -d                        # core: postgres, minio, nginx
docker compose --profile identity up -d     # keycloak — P1 onward, NOT before (do not start Keycloak yet)
(cd packages/database && npx prisma migrate deploy)
scripts/seed-reference-dev.sh               # allergen defs, nutrition rows, dictionary/aliases via admin path
npm run dev                                 # web + api + worker (pg-boss picks up analysis jobs)
```

Compose profiles: default `up -d` is the core profile; `identity` adds Keycloak; `observability` (later) adds the OpenTelemetry collector per Tech Stack §17. The database and object storage are managed external services in production (Tech Stack §18); compose runs local stand-ins only.

Smoke test: paste or photograph the golden Kanyakumari card → review the parse → analysis enqueues → SSE updates → views 1–9 render → printed list and station card each fit one page with the allergen line.

## 6. Conventions (binding)

- **IDs:** UUIDv4 everywhere (ERD: every primary key is UUID). `shopping_key` is a UUID generated when an ingredient line is created and never reused across split/merge (ERD §5, C-39).
- **Wire format:** snake_case on every surface, matching ERD column names (convention).
- **Amounts:** NUMERIC(12,4) in Postgres; decimal strings on the wire — never floats for `amount` or nutrition values (convention; View 9 forbids false precision, INV-14).
- **Provenance:** every claim wears exactly one of `CARD | METHOD | INFERRED | ABSENT | UNKNOWN | ASSUMED` (Recipe_Systems §3; ERD `claim_tag` CHECK). Unknown fields stay blank — never fabricated (Recipe_Systems §7 "required blanks").
- **Errors:** `{"error": {"code": "MACHINE_READABLE", "message": "human text", "details": {}}}` on every endpoint (convention adopted from the reference methodology; the sources specify failure behaviors in Tech Stack §21 / ADR §21 but not the envelope).
- **No-invention:** analysis output may reference only ingredients in the captured structured recipe, or mark them ABSENT (ADR §6 grounding validator, INV-10). Views 3 and 7 render INCOMPLETE, never invented (Recipe_Systems §3.4).
- **View 8/9 language:** never "safe" (INV-13); never a point-kcal when inputs are ranges (INV-14); both disclaimers on every surface (H6/I6).
- **Testing:** story IDs are test-file names (`B3` → `tests/integration/story_b3_parse_review.test.ts`) — TEST_PLAN §1.
- **CI order:** lint → typecheck → unit → golden fixture + grounding validation → `prisma migrate deploy` on ephemeral Postgres → integration → build (Tech Stack §20; TEST_PLAN QG2).
- **Logs:** correlation/recipe/analysis IDs, duration, failure category — never passwords, keys, tokens, private photos, or cook notes (Tech Stack §17, ADR §21).

## 7. Deliberately deferred — OPEN DECISION register

Nothing on this list is decided by these documents. Each row points at where the sources declare the question.

| ID | Item | Declared in |
|---|---|---|
| Q1 | Analysis-input snapshot persistence (worker/job payload vs ERD v14 column) | ADR §6 vs ERD `analysis` |
| Q2 | Printed allergen-line source under the snapshot-only render rule | E4/H4/E5 vs ADR §7 permitted-source table |
| Q3 | Remove the Worker→OCR edge from the topology diagram (ADR §10, now `diagram.png`) — OCR is Intake-only | ADR §2/§10 vs Tech Stack §18 |
| Q4 | Single writer of `recipe_ingredient_line` (Intake drafts vs Web API corrections) | ADR §2 one-writer list vs INV-03 |
| Q5 | Writer of `ingredient_dictionary` / `ingredient_alias` | ADR §2 (unnamed) |
| Q6 | G2 "publishable" state home (manual queue vs `analysis_claim` status column) | ADR §8 |
| Q7 | Cloud vendor: AWS primary vs R2 alternative; managed-PG provider | Tech Stack §25 |
| Q8 | Keycloak pilot vs Auth0 — amend Tech Stack §1/§14/§25 | Tech Stack §25.3 |
| Q9 | Final LLM provider after quality/cost/grounding benchmark | Tech Stack §1, §25.4 |
| Q10 | Final OCR provider after real-card benchmarking | Tech Stack §11, §25.5 |
| Q11 | Guest-session TTL + cleanup schedule | ERD §15.12, ADR §24.7 |
| Q12 | RPO / RTO targets | ADR §17, §24.11 |
| Q13 | Retry counts / backoff values | ADR §24.12 |
| Q14 | I3 portion-count persistence | ERD §15.6, §17 |
| Q15 | Account erasure / photo retention windows | ERD §15.11 |
| Q16 | Freeze `Recipe_Systems.md` as v1.0 (three FINAL docs pin a draft) | ERD header |
| Q17 | PNG diagram policy (Mermaid canonical vs exports) | repo hygiene |
| Q18 | git init + GitHub remote timing | repo hygiene |

A decision that changes an existing source document is a reviewed patch to that document — never an in-place silent edit.
