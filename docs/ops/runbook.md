# Recipe Systems — Pilot Operations Runbook

**Owner:** pilot ops · **Scope:** BUILD_PLAN §5 "Ops burden" row + Tech Stack §17
monitoring. This runbook is the D-27 (P7-3) operational tail. It documents the
pilot procedures; where a source decision is OPEN, it is labeled with the
register ID — nothing is silently decided here.

---

## 1. Trust boundaries and components

| Component | Pilot topology | Notes |
|---|---|---|
| Next.js web | 1 container | `apps/web` |
| Web API (BFF) | 1 container | `apps/api` — the only service browsers call |
| Analysis worker | 1+ container | `apps/analysis-worker` — sole writer of `analysis_*` |
| PostgreSQL | managed | relational control plane (single source of truth) |
| Object storage | S3-compatible (MinIO dev) | recipe + plate photos, private |
| Keycloak | external IdP | realm export versioned in `infra/keycloak/` |
| LLM provider | external | DeepSeek (see `.env`; never commit credentials) |

## 2. Backup & restore

### 2.1 PostgreSQL

- **Backups ride Postgres PITR** (BUILD_PLAN §5): enable automated backups +
  point-in-time recovery on the managed instance; encrypted storage + encrypted
  connections.
- **Restore procedure:**
  1. Restore a PITR instance to the target point.
  2. Run `npm run db:migrate -w @recipe-systems/database` (or
     `DATABASE_URL=… npx prisma migrate deploy`) to reach the current schema.
  3. Validate schema + a sample query: one recipe, its lines, its analyses.
  4. Point the API/worker at the restored `DATABASE_URL`.
  5. Retrieve a sample photo through an authorized expiring URL (restore
     validation, ADR §17 — a backup is NOT verified until restoration is tested).

### 2.2 Keycloak realm

- The realm export in `infra/keycloak/recipe-systems-realm.json` is versioned in
  git. Restore = re-import the realm export into a fresh Keycloak and recreate
  the `recipe-systems-bff` client secret to match the deployment env.
- Dev note: a recreated Keycloak has a fresh H2/Postgres realm — re-import the
  realm JSON after a container reset.

### 2.3 Object storage

- Recipe photos are private (ADR §20) and tied to the recipe-delete / guest-expiry
  compensating cleanup. Durable storage + a lifecycle policy + provider recovery
  are the production requirements; a backup of object storage is not verified
  until a sample object is restored and served.

## 3. Upgrade windows

- **Pilot maintenance windows (BUILD_PLAN §5):** schedule upgrades in an agreed
  maintenance window. Pre-announce; drain in-flight analysis jobs first (the
  worker resumes per-view on redelivery, but a clean stop is cheaper).
- **Order:** stop web → stop worker (drain queue) → migrate database →
  deploy API → deploy worker → deploy web.
- **Rollback:** restore the previous image + the PITR point taken before the
  window; the previous `analysis_*` and `recipe` rows remain intact (analysis is
  historical/versioned — never silently replaced).

## 4. Monitoring (Tech Stack §17)

At minimum, log per request/job: correlation ID, recipe ID, analysis ID, input
ID, provider/model version, duration, status, failure category. Never log raw
private data (recipe photos, full cook notes, credentials).

| Signal | What to watch |
|---|---|
| Analysis queue depth | `pg-boss` queue length; job age |
| Analysis latency | per-view + end-to-end wall clock (DeepSeek is slow — see HANDOFF §5) |
| Failure category | provider timeouts, grounding failures, retry exhaustion |
| Guest cleanup sweep | `CleanupRunner` log: removed sessions/recipes, storage residue |
| Object-storage residue | `recipe … deleted; storage cleanup residue remains` warnings |

## 5. Regional veto (G2) operations

- Reviewer authorization is env-configured (`REVIEWER_EMAILS`, comma-separated).
  A veto endpoint (`POST /analysis/:analysisId/view-5/veto`) is Bearer-only and
  CSRF-protected; a veto sets View 5 `COMPLETE → INCOMPLETE` (the blocked
  sentence leaves live views immediately) and records a governance log line
  OUTSIDE the canonical recipe. No review-event table, no publishable column
  (Q6 OPEN — labeled working assumption). Re-analysis produces a fresh analysis.
- **Do not fabricate reviewer identities:** the contracted regional reviewers
  (one Tamil Nadu/Kanyakumari, one Kerala — Recipe_Systems §12 G2) fill the
  slots; the roster is tracked in D-04.

## 6. Retention & cleanup (Q11/Q15 — OPEN, labeled pilot defaults)

- **Guest-session expiry (Q11 OPEN):** `GUEST_TTL_SECONDS` pilot default `86400`
  (labeled at D-08). The `CleanupRunner` sweep (interval `CLEANUP_INTERVAL_SECONDS`,
  pilot default `3600`) removes expired, **unclaimed** guest sessions and the
  recipes they own (with DB-level cascade + compensating storage cleanup).
  Claimed sessions are audit records and are never swept.
- **Photo/account retention (Q15 OPEN):** the pilot reuses the existing
  recipe-delete compensating storage cleanup; no retention window beyond the
  pilot defaults is set. A future account-erasure flow is a Q15 decision.

## 7. Open decisions referenced (register IDs)

- **Q6** — G2 "publishable" state home (manual queue vs `analysis_claim` status
  column). D-27 builds to the labeled working assumption: live blocking rides
  `analysis_view.status`; the review event is a governance log (no table).
- **Q11** — guest TTL + cleanup schedule (pilot default 86400s / 3600s sweep).
- **Q12** — RPO/RTO targets: **UNSET** (ADR §17 forbids inventing numbers).
- **Q15** — account erasure / photo retention windows: pilot defaults only.
