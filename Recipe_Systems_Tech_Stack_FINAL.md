# Recipe Systems — Final Technology Stack Recommendation

**Date:** 2026-09-02  
**Inputs:** `Recipe_Systems.md`, `Recipe_Systems_ERD_FINAL.md`,  
`Recipe_Systems_Architecture_Decision_FINAL.md`

## 1\. Executive Decision

Recipe Systems will use a **modular monolith with a separate  
asynchronous Analysis worker**, one managed PostgreSQL control plane,  
private object storage, provider-neutral AI/OCR adapters, and  
Docker-based pilot deployment.

The stack is optimized for the five required qualities: **suitable,  
reliable, scalable, durable, and secure**, while avoiding unnecessary  
infrastructure for the 12-week pilot.

### Final stack

| Area | Technology | Decision |
| :--- | :--- | :--- |
| Frontend | Next.js + React + TypeScript | Selected |
| UI | Tailwind CSS + shadcn/ui | Selected |
| API / BFF | Node.js + TypeScript + NestJS | Selected |
| Intake | NestJS module | Selected |
| Analysis worker | Node.js + TypeScript, separate process/container | Selected |
| Queue | pg-boss + PostgreSQL | Selected |
| Database | Managed PostgreSQL 16-compatible + PITR | Selected |
| ORM | Prisma + SQL migrations | Selected |
| Object storage | Amazon S3 | Selected |
| LLM | Provider-neutral adapter; Gemini 2.5 Flash initial candidate | Benchmark required |
| OCR | Provider-neutral adapter; Google Cloud Vision initial candidate | Benchmark required |
| PDF | Playwright + Chromium | Selected |
| Realtime | PostgreSQL LISTEN/NOTIFY + SSE | Selected |
| Identity | Managed IdP; Auth0 recommended | Confirmation required |
| Sessions | Secure HTTP-only cookies | Selected |
| Reverse proxy | Nginx | Selected |
| TLS | Let’s Encrypt | Selected |
| Deployment | Docker Compose on controlled VPS | Pilot selection |
| Secrets | Managed secrets store; AWS Secrets Manager recommended | Hosting-dependent |
| Logging | Pino | Selected |
| Error tracking | Sentry | Selected |
| Telemetry | OpenTelemetry | Selected |
| Security headers | Helmet | Selected |
| Validation | class-validator / NestJS DTOs | Selected |
| Rate limiting | @nestjs/throttler + Nginx | Selected |
| Dependency security | Dependabot + npm audit | Selected |
| CI/CD | GitHub Actions | Selected |

> This document selects technologies for ADR-001. It does not replace  
> ADR-001 or ERD.

---

## 2\. Architecture Alignment

The technology choices preserve the following ADR-001 rules:

1.  PostgreSQL is the relational source of truth.
    
2.  Object storage is the source of truth for binary images.
    
3.  Every application table has one logical writer.
    
4.  Corrected structured recipe data is the source of truth for  
    Analysis.
    
5.  Low-confidence OCR is human-gated through `needs_review`.
    
6.  Analysis is asynchronous and versioned.
    
7.  Analysis uses the immutable structured-recipe state captured for its  
    own job.
    
8.  LLM output is never canonical recipe truth.
    
9.  Runtime grounding validation must pass before an analysis becomes  
    current.
    
10.  Shopping-list and station-card rendering reads persisted historical  
     snapshots.
     
11.  Reference data is changed only through reviewed/admin workflows.
     
12.  The golden fixture is a CI gate, not a runtime substitute for  
     grounding validation.
     

---

## 3\. Frontend

### Recommendation

**Next.js + React + TypeScript + Tailwind CSS + shadcn/ui**

### Rationale

The application needs:

-   recipe intake,
    
-   OCR review,
    
-   ingredient correction,
    
-   Home/Chef modes,
    
-   progressive analysis views,
    
-   shopping lists,
    
-   print previews,
    
-   cook logging,
    
-   dietary restrictions,
    
-   nutrition presentation,
    
-   recipe history.
    

Next.js supports server-rendered and interactive client components in  
one application. TypeScript keeps frontend contracts aligned with  
backend types. Tailwind and shadcn/ui provide fast, consistent UI  
implementation without adding a large component-framework dependency.

The frontend is never authoritative for ownership, recipe identity,  
analysis status, allergen claims, or nutrition calculations.

---

## 4\. Backend / API / BFF

### Recommendation

**Node.js + TypeScript + NestJS**

NestJS modules map directly to the logical boundaries in ADR-001:

-   Web API,
    
-   Intake,
    
-   Render,
    
-   Admin/reference-data,
    
-   shared application infrastructure.
    

### Why

NestJS provides structured modules, dependency injection, guards,  
validation, testing support, logging integration, and SSE support. This  
is a strong fit for the modular-monolith pilot.

### Alternative

Express/Fastify remains technically viable, but NestJS provides stronger  
conventions for enforcing boundaries across a small team.

---

## 5\. ORM and Database Access

### Recommendation

**Prisma**, with explicit SQL migrations for PostgreSQL-specific  
constraints.

The ERD uses:

-   composite keys,
    
-   partial unique indexes,
    
-   `CHECK` constraints,
    
-   `JSONB`,
    
-   range types,
    
-   `EXCLUDE USING gist`,
    
-   ownership constraints.
    

Prisma provides type-safe application queries while SQL migrations  
preserve full PostgreSQL capability.

**Rule:** application validation improves developer experience;  
PostgreSQL constraints remain the final integrity boundary.

---

## 6\. Database

### Recommendation

**Managed PostgreSQL 16-compatible service with point-in-time  
recovery.**

Required capabilities:

-   automated backups,
    
-   PITR,
    
-   WAL protection where provided,
    
-   encryption at rest,
    
-   encryption in transit,
    
-   restricted network access,
    
-   monitoring.
    

The ERD is PostgreSQL-specific, so PostgreSQL is not replaceable without  
redesign.

A managed database is preferred to placing the primary database on the  
application VPS because the database contains the system’s most  
important durable state: recipes, ownership, analyses, cook history,  
snapshots, and curated reference data.

If budget forces self-hosting during the pilot, automated backups and  
WAL archiving must exist from day one.

---

## 7\. Object Storage

### Recommendation

**Amazon S3**

Store:

-   recipe-card photos,
    
-   cook/plate photos,
    
-   other binary objects explicitly required by the architecture.
    

PostgreSQL stores URIs and metadata, not image payloads.

Amazon S3 is designed for 99.99% object durability and regional  
redundancy across multiple Availability Zones.

### Security

-   Private buckets.
    
-   Public access disabled.
    
-   Encryption enabled.
    
-   HTTPS only.
    
-   Short-lived signed URLs where direct access is needed.
    
-   Explicit lifecycle/retention policies.
    
-   No permanent cloud credentials in user applications.
    

### Alternative

Cloudflare R2 is an acceptable S3-compatible alternative and provides  
strong consistency; it may be preferable if egress economics become  
important.

---

## 8\. Analysis Worker

### Recommendation

**Separate Node.js + TypeScript worker container**

The worker shares the repository and domain contracts with the API but  
has an independent process lifecycle.

This is preferred for the pilot because it avoids introducing a second  
application runtime while still providing:

-   independent scaling,
    
-   independent restarts,
    
-   separate CPU/memory limits,
    
-   long-running LLM execution,
    
-   retry handling,
    
-   grounding validation.
    

The API must never block a request while waiting for LLM generation.

---

## 9\. Job Queue

### Recommendation

**pg-boss + PostgreSQL**

pg-boss provides PostgreSQL-backed jobs with retries, retry backoff, job  
states, and dead-letter support.

This avoids operating Redis, RabbitMQ, or Kafka solely for the pilot.

### Reliability rule

Do **not** design business logic around “exactly once.”

Retries and external calls can produce repeated processing attempts.  
Therefore every Analysis job must be **idempotent** using the  
analysis/job identity and database state transitions.

A failed worker must never leave an analysis permanently stuck in  
`generating`.

### Future alternative

BullMQ + Redis becomes reasonable if measured queue volume or  
queue-specific operational requirements justify a dedicated broker.

---

## 10\. LLM Layer

### Recommendation

**Provider-neutral LLM adapter**, with **Gemini 2.5 Flash as the initial  
candidate**.

The worker must call an internal interface rather than scattering  
provider SDK calls throughout business logic:

```text
generate(recipe_snapshot, prompt_version, model_version)
        ↓
structured nine-view payload
```

### Selection criteria

The model must be evaluated against:

-   Kanyakumari golden fixture,
    
-   printed recipe cards,
    
-   handwritten cards,
    
-   regional/vernacular ingredient terms,
    
-   ambiguous ingredient senses,
    
-   no-invention cases,
    
-   View 8 allergen cases,
    
-   View 9 nutrition uncertainty,
    
-   latency,
    
-   cost.
    

The model is replaceable without changing the Analysis domain.

### Non-negotiable

The LLM is not the source of recipe truth. The corrected structured  
recipe remains authoritative.

---

## 11\. OCR Layer

### Recommendation

**Provider-neutral OCR adapter**, with **Google Cloud Vision as the  
initial candidate**.

The OCR contract should preserve, where supported:

-   recognized text,
    
-   line/word information,
    
-   confidence,
    
-   source metadata.
    

Confidence must flow into the ERD’s OCR fields.

### B2 gate

```text
Photo
  ↓
OCR
  ↓
Draft ingredient lines
  ↓
Confidence evaluation
  ↓
needs_review = TRUE where required
  ↓
Human correction/confirmation
  ↓
Analysis allowed
```

Low-confidence lines are never silently dropped.

If a provider does not expose reliable confidence for a result, the  
system uses a conservative review policy rather than inventing a  
confidence score.

The final OCR provider must be benchmarked against the team’s real  
recipe-card dataset, including handwriting, poor lighting,  
multilingual/vernacular terms, and ambiguous ingredient names.

---

## 12\. Print / PDF

### Recommendation

**Playwright + headless Chromium**

Templates:

1.  Shopping list.
    
2.  Chef station card.
    

HTML/CSS print templates fit the product’s layout requirements and allow  
designers to iterate using familiar frontend technologies.

The renderer is read-only and uses only persisted historical snapshot  
records. It must never reconstruct historical output from mutable live  
recipe rows.

---

## 13\. Realtime Analysis Status

### Recommendation

**PostgreSQL** `LISTEN/NOTIFY` **→ Server-Sent Events**

```text
Analysis worker
      ↓
PostgreSQL write
      ↓
NOTIFY
      ↓
API LISTEN
      ↓
SSE
      ↓
Browser
```

SSE is sufficient because the browser currently needs server-to-client  
progress, not bidirectional messaging.

### Reliability rule

`NOTIFY` is only a signal. PostgreSQL rows remain the durable source of  
truth.

If a browser misses a notification, it reconnects and reloads the  
current analysis state from PostgreSQL.

---

## 14\. Authentication and Authorization

### Recommendation

**Managed identity provider; Auth0 recommended**

The identity provider should own:

-   credential lifecycle,
    
-   password reset,
    
-   email verification,
    
-   OAuth/SSO,
    
-   MFA where required.
    

The application continues to own:

-   `account`,
    
-   `guest_session`,
    
-   recipe ownership,
    
-   guest-to-account claiming,
    
-   application authorization.
    

### Session security

Use secure HTTP-only cookies with appropriate:

-   `Secure`,
    
-   `HttpOnly`,
    
-   `SameSite`,
    
-   expiration settings.
    

### Guest security

Guest-session identifiers must be cryptographically unpredictable and  
scoped to a single guest session.

Every recipe operation must verify that the authenticated account or  
guest session owns the requested data.

---

## 15\. Security

Required controls:

-   Helmet.
    
-   Authentication and authorization guards.
    
-   DTO validation.
    
-   PostgreSQL constraints.
    
-   CSRF protection appropriate to the cookie architecture.
    
-   Strict CORS.
    
-   API rate limiting.
    
-   Nginx edge rate limiting.
    
-   Private object storage.
    
-   Short-lived signed URLs.
    
-   Dependency scanning.
    
-   Secret rotation.
    
-   HTTPS everywhere.
    

Never log passwords, API keys, access tokens, private photos, or  
unrestricted personal data.

---

## 16\. Secrets

### Development

Use `.env`, excluded from source control.

### Production

Use a managed secret store. **AWS Secrets Manager** is recommended if  
AWS is selected as the primary infrastructure provider.

Secrets include:

-   database credentials,
    
-   IdP credentials,
    
-   LLM keys,
    
-   OCR keys,
    
-   S3 credentials,
    
-   Sentry credentials,
    
-   deployment credentials.
    

Secrets must never be committed to Git.

---

## 17\. Observability

### Logging

**Pino** structured JSON logs.

Minimum fields:

```text
timestamp
level
correlation_id
request_id
recipe_id
input_id
analysis_id
provider
model_version
prompt_version
duration_ms
status
failure_category
```

Sensitive payloads must be excluded.

### Error tracking

**Sentry** for API, worker, and frontend errors.

### Telemetry

**OpenTelemetry** for vendor-neutral traces and metrics, with log  
correlation where appropriate. OpenTelemetry supports traces, metrics,  
logs, and context propagation.

Do not introduce Prometheus/Grafana solely for convention during the  
pilot. Add heavier monitoring infrastructure when measured operational  
requirements justify it.

---

## 18\. Pilot Deployment

### Technology

**Docker + Docker Compose + Nginx + Let’s Encrypt**

```text
Internet
   |
   v
Nginx + TLS
   |--------------------|
   v                    v
Next.js              NestJS API
                         |\
                         | \----> Amazon S3
                         |
                         +----> OCR Provider
                         |
                         v
                 Managed PostgreSQL
                         ^
                         |
                  pg-boss jobs
                         |
                         v
                 Analysis Worker
                         |
                         +----> LLM Provider
                         |
                         +----> PostgreSQL NOTIFY
                                      |
                                      v
                                  API / SSE
                                      |
                                      v
                                   Browser
```

Application containers:

```text
nginx
web
api
analysis-worker
```

The database and object storage remain managed external services.

### Why not Kubernetes?

Kubernetes is not justified for the 12-week pilot. It adds cluster, networking, ingress, secrets, monitoring, upgrade, and operational complexity without a current requirement.

## 19\. Growth Path

### Pilot

```text
One controlled VPS
  ├── Nginx
  ├── Next.js
  ├── NestJS
  └── Analysis worker

Managed PostgreSQL
Amazon S3
External LLM
External OCR
```

### Later

```text
Managed container platform
  ├── Next.js
  ├── API instances
  └── Analysis worker pool

Managed PostgreSQL
Amazon S3
External LLM
External OCR
```

The first scaling target should be the Analysis worker because LLM  
generation is the most expensive and latency-sensitive application  
workload.

---

## 20\. CI/CD

### Recommendation

**GitHub Actions**

Every pull request should run:

```text
lint
typecheck
unit tests
integration tests
migration validation
build
golden fixture tests
grounding validation tests
dependency vulnerability checks
```

Deployment should:

1.  Build immutable images.
    
2.  Tag the release.
    
3.  Deploy.
    
4.  Run safe database migrations.
    
5.  Execute health checks.
    
6.  Expose the release version for rollback.
    

The G1 golden fixture remains a CI quality gate, not a runtime  
substitute for grounding validation.

---

## 21\. Failure Handling

| Failure | Required behavior |
| :--- | :--- |
| OCR timeout | Preserve input/photo; mark intake retryable |
| OCR low confidence | Set needs_review; block Analysis |
| LLM timeout | Mark analysis failed/retryable; preserve previous current analysis |
| Invalid LLM output | Reject/regenerate; never publish |
| Grounding failure | Do not mark analysis current |
| Worker crash | Allow job recovery/retry |
| Duplicate attempt | Idempotency prevents duplicate business effects |
| PDF failure | Return retryable error; preserve snapshots |
| Database failure | Controlled application failure; no partial business state |
| Object upload failure | Do not persist a URI for a missing object |
| Stale recipe edit | Reject stale write; require reload/merge |
| Reference-data conflict | Reject import; preserve current reference data |
| SSE/NOTIFY loss | Reconnect and reload durable PostgreSQL state |
| Guest expiry | Clean expired unclaimed guest data according to retention policy |

---

## 22\. Repository Structure

```text
recipe-systems/
├── apps/
│   ├── web/                    # Next.js
│   ├── api/                    # NestJS
│   └── analysis-worker/        # Analysis worker
├── packages/
│   ├── domain/                 # Shared domain contracts
│   ├── schemas/                # Validation / output schemas
│   ├── database/               # Prisma + SQL migrations
│   ├── llm-adapter/            # Provider-neutral LLM interface
│   ├── ocr-adapter/            # Provider-neutral OCR interface
│   └── rendering/              # Print contracts/templates
├── tests/
│   ├── fixtures/
│   ├── assertions/
│   └── integration/
├── infra/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
├── docs/
└── .github/
    └── workflows/
```

The exact directory layout can change during implementation, but domain  
ownership and one-writer boundaries must remain aligned with ADR-001.

---

## 23\. Quality Assessment

| Quality | How the stack satisfies it |
| :--- | :--- |
| Suitable | Direct mapping from ADR roles to mature technologies; optimized for the pilot’s workflows |
| Reliable | Managed database, durable jobs, retries, idempotency, validation, error tracking |
| Scalable | Analysis worker scales independently; managed storage/database scale without redesign |
| Durable | PostgreSQL PITR + Amazon S3 durability; historical output snapshots preserved |
| Secure | Managed identity, secure cookies, private objects, validation, rate limits, TLS, secret management, dependency scanning |

---

## 24\. Non-Negotiable Implementation Rules

1.  PostgreSQL is the relational source of truth.
    
2.  Object storage is the source of truth for binary images.
    
3.  Every application table has one logical writer.
    
4.  Corrected structured recipe data is the source of truth for  
    Analysis.
    
5.  Raw OCR is never confirmed recipe truth.
    
6.  `needs_review` blocks Analysis.
    
7.  Analysis is asynchronous.
    
8.  Analysis jobs are idempotent.
    
9.  Each job uses only its captured structured-recipe state.
    
10.  Prompt and model versions are persisted.
     
11.  Structured model output is required.
     
12.  Grounding validation must pass before an analysis becomes current.
     
13.  Historical render output uses persisted snapshots.
     
14.  Renderers are read-only.
     
15.  `LISTEN/NOTIFY` is a signal, not durable state.
     
16.  Guest ownership is enforced transactionally.
     
17.  Reference data uses reviewed/admin-only workflows.
     
18.  The golden fixture remains in CI.
     
19.  Private images are never publicly exposed.
     
20.  Secrets are never committed to source control.
     

---

## 25\. Lead Approval Items

The technology direction is complete. The following require final  
operational/vendor confirmation:

1.  Managed PostgreSQL provider and budget.
    
2.  S3 region, retention, and lifecycle policy.
    
3.  Auth0 tenant and required SSO providers.
    
4.  Final LLM after quality/cost evaluation.
    
5.  Final OCR provider after real-photo benchmarking.
    
6.  Pilot VPS sizing and deployment credentials.
    
7.  Production secrets-store selection if AWS is not the primary  
    infrastructure provider.
    
8.  Guest-session TTL and cleanup policy.
    

These are implementation/vendor decisions. They should not change the  
core architecture unless a selected provider fails a required contract.

---

## 26\. Final Recommendation

### Recommended production direction for the 12-week pilot

```text
Frontend
  Next.js + React + TypeScript
  Tailwind CSS + shadcn/ui

Backend
  Node.js + TypeScript + NestJS

Analysis
  Separate Node.js + TypeScript worker

Async jobs
  pg-boss + PostgreSQL

Database
  Managed PostgreSQL 16-compatible + PITR

Object storage
  Amazon S3

AI
  Provider-neutral adapter
  Gemini 2.5 Flash initial candidate

OCR
  Provider-neutral adapter
  Google Cloud Vision initial candidate

Rendering
  Playwright + Chromium

Realtime
  PostgreSQL LISTEN/NOTIFY + SSE

Identity
  Auth0 recommended
  Secure HTTP-only application sessions

Security
  Helmet
  DTO validation
  CSRF protection
  Rate limiting
  Private S3
  Signed URLs
  Managed secrets
  Dependency scanning

Observability
  Pino
  Sentry
  OpenTelemetry

Infrastructure
  Docker
  Nginx
  Let's Encrypt
  Docker Compose

CI/CD
  GitHub Actions
```

The strongest part of this stack is not any single framework. It is the  
combination of **PostgreSQL as the control plane, explicit module  
ownership, asynchronous Analysis, provider adapters, human-gated intake,  
runtime grounding validation, and immutable historical output  
snapshots**.

That combination directly protects the product’s core invariants while  
keeping the pilot operationally manageable and providing a credible path  
to independent scaling later.

---

## References

-   [pg-boss documentation](https://github.com/timgit/pg-boss) — PostgreSQL-backed job queue capabilities.
    
-   [Amazon S3 documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html) — object durability and data-protection capabilities.
    
-   [Cloudflare R2 documentation](https://developers.cloudflare.com/r2/) — S3-compatible object storage alternative.
    
-   [OpenTelemetry documentation](https://opentelemetry.io/docs/) — vendor-neutral traces, metrics, logs, and context propagation.
    
-   [GitHub Flavored Markdown specification](https://github.github.com/gfm/) — Markdown table syntax.
    

  
**Architecture dependency:** ADR-001  
**Data-model dependency:** ERD  
**Implementation principle:** Do not introduce additional infrastructure unless a measured product or operational requirement justifies it.
