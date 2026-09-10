# QA REPORT — AUTONOMOUS END-TO-END QA OF D-01 → D-19

**Date:** 2026-09-10 · **Method:** black-box E2E through the VS Code internal browser (all user
interaction in-browser; terminal/API/Postgres used only for backend verification afterward).
**Scope:** everything implemented through D-19 (foundation/auth, intake, parse review, method,
readiness, analysis pipeline, Views 1–9, View 9 recompute, reference data, security, UX).
**Baseline:** git HEAD `df1dda0` (clean tree) · web :3000 · API :3001 · worker consuming ·
Keycloak realm `recipesystems` · Postgres :5433 · MinIO :9000 · pg-boss live · reference data
17/12/6/6/12/12.

## VERDICT

**PASS-WITH-FINDINGS → PASS** — six confirmed defects (1×P1 x2, 2×P2 x2, 1×P2, 1×P2) were found,
all fixed in the same run with regression coverage, then the affected flows re-verified live and
the full suite + verify-local + CI re-run green. One P3 documented with no code change. See the
fix commit and HANDOFF §5 entries QA-B1…QA-B7 for the permanent trace.

## AREA TABLE

| Area | Tested | Pass | Fail | Notes |
|---|---|---|---|---|
| Auth: landing / sign-in / sign-up / logout / forgot / register | 12 | 12 | 0 | Keycloak flows end-to-end; logout→login cycle; auth_error surface; KC SSO ended on logout |
| Guest: session, claim, isolation | 14 | 12 | 2 | QA-B1 (churn) + QA-B2 (claim never ran) — FIXED, re-verified live |
| Intake: paste, raw immutability, segmentation | 14 | 14 | 0 | semicolon/newline/mixed/unicode/duplicates/whitespace; raw byte-preserved; ordering verified in psql |
| Parse review: edit/add/delete/split/merge | 16 | 16 | 0 | all persisted; soft-delete; line_no unique among active; stale-token guarded (unit+integration) |
| Review flag: badge, Clear review, blockers | 6 | 3 | 3 | QA-B6 (wire shape) + QA-B7 (stale readiness) — FIXED, live re-verified |
| Method: paste/inferred/none, save lifecycle | 12 | 12 | 0 | guard rails (empty/blank-source disabled), tags METHOD/INFERRED, reload + restart persistence, no silent reset |
| Readiness / enqueue: blockers, 409, 422 | 8 | 8 | 0 | canonical 422 METHOD_REQUIRED (A7), 409 path unit-covered; QA-B5 P3 copy note |
| Analysis: enqueue, worker, is_current, idempotency | 10 | 10 | 0 | double-enqueue → newest `is_current`; worker outage → queued job durable, completes on restart |
| SSE | 3 | 1 | 2 | QA-B3 (403 without credentials) — FIXED, `/events` now 200 |
| Views 1–9 (D-18/D-19) | 18 | 18 | 0 | all tabs render; V8 flags + H6 + no "safe"; V9 band + sodium Unknown + I6 + assumptions |
| View 9 assumption editor + recompute | 6 | 6 | 0 | PATCH → queued → worker persists (oily/lean verified in payload) → band honest; only view 9 rewritten |
| Reference-data consumption (D-29) | 6 | 6 | 0 | effective-dating (A1/A2 attacks), golden counts intact after every run |
| Ownership / security (INV-17) | 14 | 13 | 1 | QA-B4 (malformed UUID → 500) — FIXED, 404 everywhere now |
| Responsive UX | 6 | 6 | 0 | entire run at 273 px viewport; zero horizontal overflow on all screens/tabs |
| Error recovery / failure injection | 8 | 8 | 0 | API-down → visible errors + retry; worker-down → queued durable; no infinite spinners, no false success |
| Golden E2E regression journey (P14) | 1 | 1 | 0 | full cycle incl. recompute, reload, reopen, logout, login, reopen |

## DEFECTS FOUND (severity, repro, root cause, fix)

1. **QA-B1 — P1 MAJOR — guest-session churn.** Every dashboard entry minted a new
   `guest_session` row + cookie, so a returning guest's recipes 404'd and showed "No ingredient
   lines" (session `beec17bd` → `4ee62155` → `894d5d3c` → `0d41cca4` in 4 minutes).
   Fix: reuse the valid cookie session (API); keep parse lines for guest reopens (web).
2. **QA-B2 — P1 MAJOR — "Create account and claim" never claimed.** Nothing invoked
   `POST /auth/guest/claim`; UI copy promised automatic claiming. Fix: server-side claim in the
   OIDC callback + `?claimed=1` marker + client re-tag (AC-2 now works end-to-end: 10/10 recipes
   moved, session `claimed=t`, `still_guest=0`).
3. **QA-B3 — P2 MODERATE — SSE 403 on every connect.** Cross-origin `EventSource` without
   credentials → guard 403; polling silently masked it. Fix: `withCredentials: true` (live: 200).
4. **QA-B4 — P2 MODERATE — malformed recipe UUID → 500.** Prisma P2023 surfaced as
   INTERNAL_ERROR on `GET /recipes/:id/lines|method`. Fix: format guard in `assertOwned`
   (analysis routes already guarded; parity restored; live: 404).
5. **QA-B6 — P1 MAJOR — `needs_review` absent from the wire shape.** The UI's Review-required
   badge + Clear-review button existed and were unit-tested but dead: `toWireLine` never sent
   the flag, so flagged recipes could never be unblocked from the UI. Fix: carry the field
   (live: badge + Clear review → unblock).
6. **QA-B7 — P2 MODERATE — stale readiness.** `ReadinessPanel` fetched enqueue-state only on
   mount; after Clear review the "Review required" blocker + disabled Analyse persisted until a
   reload. Fix: re-fetch when lines change (live: unblocks without reload).
7. **QA-B5 — P3 MINOR (no code change)** — readiness copy says "Ready to analyse" while enqueue
   canonical-422s until a method is saved; the error surface is correct per A7. Noted for a
   D-14 polish pass.

## TESTS PERFORMED / EVIDENCE

- Browser: ~130 distinct user actions across 14 phases (guest + 3 real accounts; golden
  Kanyakumari card; 9 malformed-input pastes; ownership battery; failure injection).
- Unit: API **178/178** (+7 regression) · web **86/86** (+4) · worker **32/32** · packages green.
- Integration: **90/90** (12 suites, serial) · regression gates **PASS** (8/8 golden + invariants).
- lint 0 · typecheck 0 · **verify-local: ALL STEPS PASSED, exit 0**.
- Live re-verification of every fix in the browser (session reuse stable; claim + re-tag; SSE
  200; 404 battery; badge/Clear-review/unblock cycle; golden journey).
- Reference data intact after all runs: 17/12/6/6/12/12.
- CI: green on the fix commit (run id recorded in HANDOFF §5).

## GIT / WORKING TREE

- Fix commit: `f02e37a044ad18bb8c7bf6a1d0c88d501c496821` (`f02e37a`) — pushed; tree clean.
- CI: **success** — run `34476238511` (head `f02e37a`).
- Q1/Q5/Q9/Q10/Q11 remain OPEN — untouched by QA.

## NEXT DEVELOPMENT RESUME POINT

Proceed per dispatch: **D-21 (disclaimer sweep) or D-20 (chef mode + station card)**, with the
dispatcher scoping F-2 (analysis_claim row materialization) if desired. QA is complete; no
roadmap units were implemented.
