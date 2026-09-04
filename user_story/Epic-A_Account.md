# Epic A — Account (A1, A2)

> **Epic:** A — Account · **Stories:** A1 (Must), A2 (Should) · **Domain:** Auth / Onboarding
> **Format:** account + guest session. Identity per Tech Stack §14 — the IdP is **OPEN DECISION Q8** (Keycloak working assumption, Auth0 managed fallback; never finalized here). The IdP owns credential lifecycle, password reset, email verification, OAuth/SSO, MFA (Tech Stack §14); the application owns `account`, recipe ownership, guest claiming, and authorization (ADR §19). Sessions are secure HTTP-only cookies with CSRF protection (Tech Stack §14/§15).
> **Full detail:** description + acceptance criteria + test cases + API + data.

---

## A1 — Create an account

| Field | Value |
|---|---|
| **Story ID** | A1 |
| **Epic ref** | A1 (Must) |
| **Phase** | P1 (wks 3–4) |
| **Domain** | Auth |
| **Priority** | Must |

**Badges:** UI · Backend · Auth · Priority: Must · Q8 (OPEN DECISION — IdP)

### Description

**As a cook**, I want **email/password (or existing SSO)** so that **my recipes survive closing the browser**. (Recipe_Systems.md §12)

**Mechanics (sourced):** OIDC → secure HTTP-only cookie session (`Secure`, `HttpOnly`, `SameSite`, expiration — Tech Stack §14); CSRF protection appropriate to the cookie architecture (Tech Stack §15); `account` creation on first sign-in with `preferred_mode` (home default) and `label_pack` US/EU (BUILD_PLAN P1-2, ERD `account`). The IdP choice is Q8 — never finalized here.

### Acceptance Criteria

- AC-1: Register → empty library.
- AC-2: Save while signed out → sign-in, then resume save.

### Test Cases

**TC-01 — Register → empty library**
- Given: the auth surface, signed out
- When: a new cook registers
- Then: an account exists and the library renders empty

**TC-02 — Save resumes after sign-in**
- Given: a save is pending while signed out
- When: the cook signs in
- Then: the save resumes onto the account

### API Endpoints

Not yet defined at the design stage — the sources specify no endpoint paths for this story. The surface will be specified by dispatch unit **D-07** against the binding conventions (SCAFFOLD §6: error envelope, snake_case, story-ID test naming).

### Data

| Table | Role | Key columns |
|---|---|---|
| `account` | created on first sign-in | `preferred_mode`, `label_pack` |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-07 | A-07 | H-07 | ERD §17 ✅ | Q8 (IdP) |

---

## A2 — Guest session, then claim it

| Field | Value |
|---|---|
| **Story ID** | A2 |
| **Epic ref** | A2 (Should) |
| **Phase** | P1 (wks 3–4) |
| **Domain** | Auth / Guest |
| **Priority** | Should |

**Badges:** UI · Backend · Auth · Priority: Should · Q11 (OPEN DECISION — TTL)

### Description

**As a first-time cook**, I want to **analyse one card before signing up**. (Recipe_Systems.md §12)

**Mechanics (sourced):** guest sessions use unguessable UUID identifiers, scoped to one guest session, with expiry cleanup (SCAFFOLD §3; the TTL value is Q11 — pilot default labeled until answered). The claim transaction is idempotent and preserves the guest row as audit (BUILD_PLAN P1-3); `chk_recipe_owner_xor` holds throughout (INV-02, ERD §5).

### Acceptance Criteria

- AC-1: Guest can ingest and see analysis.
- AC-2: Save migrates the current recipe onto a new account.

### Test Cases

**TC-01 — Guest ingests without an account**
- Given: a guest session
- When: the guest ingests a recipe
- Then: analysis renders (pipeline path; stubbed render acceptable until P3)

**TC-02 — Save migrates the current recipe on claim**
- Given: a guest with an analysed recipe signs up
- When: the claim transaction runs
- Then: the recipe migrates to the new account; the guest row is preserved as audit; the transaction is idempotent (double-submit safe)

### API Endpoints

Not yet defined at the design stage. The surface will be specified by dispatch unit **D-08** (claim transaction per ADR §5, ERD §13).

### Data

| Table | Role | Key columns |
|---|---|---|
| `guest_session` | anonymous session row; expiry cleanup | — |
| `recipe.guest_session_id` | guest ownership; XOR with account (INV-02) | — |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-08 | A-08 | H-08 | ERD §17 ✅ | Q8 (IdP), Q11 (TTL) |

---

*End of Epic A — Account. Stories A1–A2.*
