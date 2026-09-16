# Recipe Systems — API Endpoints

> **Project:** Recipe Systems — a recipe **analysis** product (not a generator) with nine fixed views.
> **Base URL:** `/api/v1`
> **Auth:** Keycloak is the sole IdP. Interactive sign-in is **OIDC authorization-code** (browser
> redirects; the BFF holds a **session cookie**, never a raw IdP token). Guest = a persisted
> `guest_session` row with an httpOnly UUID cookie (ERD v13, D-08) — not a header.
> **Content-Type:** `application/json` (multipart for uploads).
> **Date:** 01 Sep 2026 (auth sections amended 2026-09-07 during reconciliation) · **Status:** v1.1
> **Sources:** `USER_STORIES.md` (canonical A1–I7) + `Recipe_Systems_ERD_FINAL.md` (v13)
> **Error envelope (all responses):**
> ```json
> { "error": { "code": "SNAKE_CASE_CODE", "message": "Human-readable message", "details": {} } }
> ```
> **Pagination (list endpoints):** `?page=1&limit=20` → `{ "items": [], "total": 0, "page": 1, "limit": 20, "total_pages": 0 }` (SCAFFOLD §5.4).
> **Implementation status:** the §2 auth surface below is implemented. Sections 3+ are the
> target contract for D-10…D-31 and are NOT yet implemented.

---

## In plain words (7th grade)

This file lists **all the URLs (endpoints) that the app's different parts use to talk to each other**. Think of each one as a "phone number" you call to do something.

Examples:
- `POST /auth/login` — "log me in."
- `POST /recipes/parse-text` — "turn this pasted recipe text into a list of ingredients."
- `POST /recipes/:id/analyse` — "build the nine views for this recipe."
- `POST /recipes/:id/shopping-list` — "give me a shopping list for this recipe."

Every response either gives you the data you asked for, or an **error** in a fixed shape (a code + a message). The base address for all of them is `/api/v1`.

---

## 1. Auth model

- **Identity:** Keycloak is the sole IdP (Q8 RESOLVED). The app consumes OIDC claims through the
  provider-neutral adapter seam (`apps/api/src/modules/auth/identity/`) — provider-specific code
  never escapes the seam (SCAFFOLD §3, D-06).
- **Interactive flow:** the browser is redirected to Keycloak's hosted login/registration pages
  (authorization-code). The BFF exchanges the code, verifies the ID token (JWKS signature, issuer,
  audience, nonce), upserts the `account` row (`auth_provider = 'sso'`), and issues its own
  **httpOnly session cookie**. The browser never sees an IdP token.
- **Roles:** single USER realm role. No app-side roles.
- **Guest:** a persisted `guest_session` row (unguessable UUID, TTL, expiry cleanup) identified by
  an httpOnly cookie — NOT a header, NOT browser localStorage. Claiming (A2/D-08) moves recipes
  under `chk_recipe_owner_xor` and preserves the guest row as audit.
- **Credentials:** passwords never touch the NestJS control plane or Postgres. No ROPC, no
  Keycloak Admin-REST from app code (both retired with the pre-reconciliation draft).
- **CSRF (Tech Stack §15):** state-changing routes require the `X-CSRF-Token` header to match the
  `recipe_csrf` double-submit cookie.

---

## 2. Auth & Account

### GET /auth/login
Start interactive sign-in. Redirects the browser to the IdP authorization endpoint with
`state`/`nonce`; the BFF keeps a short-lived signed state cookie. **Auth:** none. **Story:** A1.
- Query: `redirect_to` (optional, path only). · 302 → IdP.

### GET /auth/callback
OIDC authorization-code callback. Verifies code+state+nonce, upserts `account`, sets the session
cookie and the CSRF cookie, redirects to the web app. **Auth:** none. **Story:** A1.
- Query: `code`, `state`. · 302 → web; 400 `AUTH_FAILED` on any verification failure.

### GET /auth/signup
Redirect to the IdP registration page. **Auth:** none. **Story:** A1.
- 302 → IdP.

### GET /auth/password/forgot
Redirect to the IdP password-reset flow. **Auth:** none. **Story:** A1.
- 302 → IdP.

### POST /auth/logout
Clear the BFF session + CSRF cookies and hand the browser the IdP logout URL
(RP-initiated logout — ends the Keycloak SSO session so the next sign-in prompts
for credentials). **Auth:** session cookie + CSRF. **Story:** A1.
- 200 `{ "ok": true, "redirect_to": "<keycloak>/realms/<realm>/protocol/openid-connect/logout?...&post_logout_redirect_uri=<web>" }`.

### GET /auth/me
Current account. **Auth:** session cookie (JwtAuthGuard). **Story:** A1, A2.
- 200: `{ "id": uuid, "email": string, "preferred_mode": "home"|"chef", "label_pack": "EU"|"US"|null }`
- 401: `UNAUTHENTICATED` / `SESSION_EXPIRED`.

### PATCH /auth/me/preferences
Update mode preference / label pack. **Auth:** session cookie + CSRF. **Story:** A1 (C3).
- Body: `{ "preferred_mode"?: "home"|"chef", "label_pack"?: "EU"|"US"|null }`
- 200: updated account · 403: `CSRF_MISMATCH`.

### POST /auth/guest/session
Create a guest session (unguessable UUID, pilot TTL — Q11 default 24h). Sets the guest cookie and
CSRF cookie. **Auth:** none. **Story:** A2.
- 200: `{ "ok": true, "guest_session_id": uuid }`.

### POST /auth/guest/claim
Claim the guest session onto the signed-in account: recipes move `guest_session_id → account_id`
(XOR-respecting), the guest row is marked claimed and preserved as audit. Idempotent.
**Auth:** session cookie + CSRF + guest cookie. **Story:** A2.
- 200: `{ "ok": true, "claimed": "new"|"already" }` · 400: `NO_GUEST_SESSION` / `CLAIM_FAILED`.

---

## 3. Intake (parse / upload / review)

### POST /recipes/parse-text
Parse pasted text into structured ingredient lines. **Auth:** Bearer or guest. **Story:** RS-US-06.
- Body: `{ "text": string }`
- 200: `{ "recipe": { "raw_text": string, "lines": [ { "display_name", "canonical_name", "amount", "unit", "quantity", "category", "is_header", "include_on_list", "confirmed_sense" } ], "flags": ["WRAPAROUND_DETECTED"] } }`

### POST /recipes/upload
Upload a card image; store the original. **Auth:** Bearer or guest. **Story:** RS-US-07.
- Body: multipart `file` (JPEG/PNG)
- 201: `{ "recipe_id"?: uuid, "image_id": uuid, "file_key": string }`

### POST /recipes/:recipeId/ocr
Run OCR + parse → draft lines with confidence. **Auth:** Bearer or guest. **Story:** RS-US-07.
- 200: `{ "image_id": uuid, "ocr_text": string, "lines": [ { "display_name", "amount", "unit", "confidence": float, "low_confidence": boolean } ] }`
- 422: `OCR_UNREADABLE`

### PATCH /recipes/:recipeId/lines/:lineId
Edit or merge a parsed line. **Auth:** Bearer. **Story:** RS-US-08.
- Body: `{ "display_name"?, "amount"?, "unit"?, "quantity"?, "category"?, "confirmed_sense"?, "include_on_list"?, "is_header"? }` or `{ "merge_with_next": true }`
- 200: updated line

### DELETE /recipes/:recipeId/lines/:lineId
Delete a line. **Auth:** Bearer. **Story:** RS-US-08.
- 204 No Content

### POST /recipes/:recipeId/lines/:lineId/split
Split a wrap-around line into two. **Auth:** Bearer. **Story:** RS-US-08.
- 200: `{ "lines": [ line1, line2 ] }`

### POST /recipes/:recipeId/lines
Add a new ingredient line. **Auth:** Bearer. **Story:** RS-US-08.
- Body: line object · 201: created line

### GET /recipes/:recipeId/lines
Get all lines for a recipe. **Auth:** Bearer.
- 200: `{ "items": [ line... ] }`

### GET /recipes/:recipeId/parse-preview
Return the corrected object that analysis will read (source-of-truth confirmation). **Auth:** Bearer. **Story:** RS-US-08 AC-6.
- 200: `{ "status": "draft"|"confirmed", "lines": [ ... ] }`

---

## 4. Method & identification

### PATCH /recipes/:recipeId/method
Set or attach a method (None / Paste / Accept INFERRED). **Auth:** Bearer. **Story:** RS-US-09. (Guest method selection is handled client-side on the ephemeral draft and passed to `POST /analyse`.)
- Body: `{ "method": "none"|"paste"|"inferred", "method_text"?: string, "method_source"?: string, "accept_inferred"?: boolean }`
- 200: `{ "method_tag": "METHOD"|"INFERRED"|null, "method_source": string|null, "list_only": boolean }`

### POST /recipes/:recipeId/identify
Identify the dish family. **Auth:** Bearer or guest. **Story:** RS-US-12.
- 200: `{ "family": string, "architecture": string, "confidence": "high"|"medium"|"low", "not_this": [ string ], "absent_on_card": [ string ], "tags": { "family": "INFERRED" } }`

---

## 5. Analysis

### POST /recipes/:recipeId/analyse
Run the full nine-view analysis. **Auth:** Bearer or guest. **Story:** RS-US-13.
- Body: `{ "mode": "home"|"chef" }`
- 200: `{ "analysis_id": uuid, "mode": "...", "identification": {...}, "views": { "view_1": {...}, ..., "view_9": {...} }, "claim_tags": {...}, "station_card": {...}|null, "is_latest": true, "model_version": string, "prompt_version": string }`
- 422: `METHOD_REQUIRED` (list-only → Views 3 & 7 `INCOMPLETE`)

### GET /analysis/:analysisId/station-card
Return the chef-mode station card for an analysis. **Auth:** Bearer or guest. **Story:** RS-US-16, RS-US-29.
- 200: `{ "station_card_id": uuid, "analysis_id": uuid, "mise": {...}, "sequence": [...], "do_nots": [...], "control_points": [...], "product_yield_hold": {...}|null, "printable": boolean }`
- 404: `STATION_CARD_NOT_FOUND` (list-only → no station card)

### GET /recipes/:recipeId/analysis
Fetch the latest analysis payload (views 1–9). **Auth:** Bearer or guest. **Story:** RS-US-13.
- 200: analysis payload · 404: `ANALYSIS_NOT_FOUND`

### GET /recipes/:recipeId/analyses
List all analysis snapshots. **Auth:** Bearer. **Story:** RS-US-23.
- 200: `{ "items": [ { "analysis_id", "created_at", "is_latest", "snapshot_of" } ] }`

### POST /recipes/:recipeId/reanalyse
Explicitly re-run analysis (never silent); snapshots the previous one. **Auth:** Bearer. **Story:** RS-US-17, RS-US-23.
- 200: new analysis with `snapshot_of` set, `is_latest=true`

### POST /recipes/:recipeId/substitute-preview
Preview ONE persisted View 4 substitution (C7 — D-25A). **Auth:** Bearer or guest. **Story:** RS-US-18.
- Body: `{ "ingredient_id": uuid }` — the source ingredient of one persisted View 4 substitution
- 200: `{ "ingredient_id": uuid, "substitute": string, "classification": "structural"|"modular"|"identity_shift", "what_is_lost": string }` (the persisted consequence)
- 404: `ANALYSIS_NOT_FOUND` (no completed analysis) · `SUBSTITUTION_NOT_FOUND` (unknown/malformed ingredient) · `RECIPE_NOT_FOUND` (foreign/missing recipe)
- Read-only + deterministic — never invents a substitution; the classification is derived at preview time and never persisted.

### GET /recipes/:recipeId/print/shopping-list
Print the latest shopping-list snapshot (D-23). **Auth:** Bearer or guest. **Story:** RS-US-27.
- `?format=html|pdf` (default `pdf`) · 200: PDF (`application/pdf`) or the same template as `text/html` · 404 `SHOPPING_LIST_NOT_FOUND`

### GET /recipes/:recipeId/print/station-card
Print the persisted station-card snapshot (D-23). **Auth:** Bearer or guest. **Story:** RS-US-29.
- `?format=html|pdf` (default `pdf`) · 200: PDF (`application/pdf`) or the same template as `text/html` · 404 `STATION_CARD_NOT_FOUND`

### GET /recipes/:recipeId/print/one-pager
Print the home-mode one-pager (E6/I5 — D-31). **Auth:** Bearer or guest.
- `?format=html|pdf` (default `pdf`) · 200: PDF (`application/pdf`) or the same template as `text/html` · 404 `ONE_PAGER_NOT_FOUND`
- Snapshot-only: keep / negotiate / identity-shift / ingredients from persisted analysis views + the optional View 9 energy band; never a legal nutrition label.

---

## 6. Recipe library

### GET /recipes
List saved recipes. **Auth:** Bearer. **Story:** RS-US-20.
- Query: `?q=&tag=&family=&page=&limit=`
- 200: `{ "items": [ { "recipe_id", "title", "family", "status", "created_at", "updated_at", "last_cooked_at", "tags": [] } ], "total", "page", "limit" }`

### POST /recipes
Save a new recipe (from a confirmed parse). **Auth:** Bearer (guest → `403 GUEST_WRITE_FORBIDDEN`). **Story:** RS-US-19, RS-US-04.
- Body: `{ "title"?, "lines": [...], "method"?, "identification"?, "family"?, "tags"?: [] }`
- 201: `{ "recipe_id", "title", ... }`

### GET /recipes/:recipeId
Open a recipe with its latest analysis. **Auth:** Bearer. **Story:** RS-US-20.
- 200: `{ "recipe": {...}, "latest_analysis": {...}|null, "last_cook": {...}|null }`

### PATCH /recipes/:recipeId
Rename / edit a saved recipe (returns to parse review). **Auth:** Bearer. **Story:** RS-US-22.
- Body: `{ "title"?, "lines"?, "family"?, "status"? }` · 200: updated recipe

### DELETE /recipes/:recipeId
Delete a recipe (cascade: images, analyses, lists, logs, tags). **Auth:** Bearer. **Story:** RS-US-24.
- Body: `{ "confirm": true }` · 204 No Content

### POST /recipes/:recipeId/tags
Add tag(s). **Auth:** Bearer. **Story:** RS-US-21.
- Body: `{ "tags": [ string ] }` · 201: updated tags

### DELETE /recipes/:recipeId/tags/:tag
Remove a tag. **Auth:** Bearer. **Story:** RS-US-21.
- 204 No Content

---

## 7. Shopping list

### POST /recipes/:recipeId/shopping-list
Generate a shopping list from the structured object. **Auth:** Bearer. **Story:** RS-US-25.
- 201: `{ "list_id": uuid, "rows": [ { "row_id", "line_id", "display_name", "amount", "unit", "category", "have_need": "need" } ], "groups": { "fresh_produce": n, "fish_meat": n, "spices": n, "fats_oils": n, "other": n } }`

### GET /recipes/:recipeId/shopping-list
Get the latest shopping list. **Auth:** Bearer. **Story:** RS-US-25.
- 200: list payload with `have_need` states

### PATCH /shopping-lists/:listId/rows/:rowId
Toggle have/need. **Auth:** Bearer. **Story:** RS-US-26.
- Body: `{ "have_need": "have"|"need" }` · 200: updated row

### POST /shopping-lists/:listId/rows/group
Mark a whole group as have. **Auth:** Bearer. **Story:** RS-US-26 AC-4.
- Body: `{ "category": "fresh_produce"|..., "have_need": "have"|"need" }` · 200: updated rows

---

## 8. Cook log (after-cook)

> **D-24 (2026-09-14) ships the F1/F2/F6 slice** — POST /cook-logs, GET /cook-logs,
> PATCH /cook-logs/:cookLogId (rating/note only), GET /last-cook. Guards follow the
> existing ownership/session contract (GuestOrJwt + `assertOwned`; writes ride CSRF).
> D-26 ships `next_time` (F4) and `/swaps` (F3); D-31 ships the plate photo (F5).

### POST /recipes/:recipeId/cook-logs
Log that I cooked it. **Auth:** Bearer. **Story:** RS-US-31.
- Body (D-24 slice): `{ "cook_date"?: date, "rating"?: 1-5|null, "note"?: string|null }` — `next_time`/`swaps` are D-26 (refused with 400 `INVALID_COOK_LOG`)
- 201: `{ "cook_log_id", "recipe_id", "cook_date", "rating", "note", "next_time", "created_at" }`
- `cook_date` defaults to today (F1 AC-1); impossible calendar dates (e.g. `2026-02-31`) → 400

### GET /recipes/:recipeId/cook-logs
List cook logs for a recipe. **Auth:** Bearer. **Story:** RS-US-31.
- 200: `{ "items": [ { "cook_log_id", "recipe_id", "cook_date", "rating", "note", "next_time", "created_at" } ] }` — newest cook first (ix_cook_log_recipe_date)

### PATCH /cook-logs/:cookLogId
Edit rating / note / next-time. **Auth:** Bearer. **Story:** RS-US-32, RS-US-34.
- Body (D-24 slice): `{ "rating"?: 1-5|null, "note"?: string|null }` — partial; explicit null clears; omitted fields stay. `next_time` editing is RS-US-34 (D-26)
- 200: updated log · 404 `COOK_LOG_NOT_FOUND` for missing/malformed; foreign log → canonical 404

### POST /cook-logs/:cookLogId/swaps
Record a swap / restriction-driven swap. **Auth:** Bearer. **Story:** RS-US-33, RS-US-41.
- Body: `{ "line_id"?: uuid, "action": "skipped"|"reduced"|"increased"|"swapped", "swapped_to"?: string, "reason"?: "restriction"|"pantry"|"other", "applied_to_card"?: boolean }`
- 201: created swap

### POST /cook-logs/:cookLogId/photo
Upload a plate photo (F5 — D-31). **Auth:** Bearer or guest. **Story:** RS-US-35.
- Body: multipart `file` (JPEG/PNG, ≤ 10 MB) · 200: `{ "cook_log_id": uuid, "photo_uri": "s3://…" }`
- ONE image per log (the `cook_log_photo.cookLogId` unique key); attaching again replaces the previous object (old object deleted). Never triggers re-analysis.
- 400 `INVALID_IMAGE` (wrong type/empty) · 400 `IMAGE_TOO_LARGE` (> 10 MB) · 404 `COOK_LOG_NOT_FOUND` / `RECIPE_NOT_FOUND`

### GET /cook-logs/:cookLogId/photo
Read the plate photo URI for a log (F5 — D-31). **Auth:** Bearer or guest. **Story:** RS-US-35.
- 200: `{ "cook_log_id": uuid, "photo_uri": "s3://…" }` · 404 `PLATE_PHOTO_NOT_FOUND` (no photo) / `COOK_LOG_NOT_FOUND` / `RECIPE_NOT_FOUND`

### GET /recipes/:recipeId/last-cook
Return last-cook summary (date, rating, next-time) for reopen (F6). **Auth:** Bearer. **Story:** RS-US-36.
- 200: `{ "last_cooked_at": date, "rating": int|null, "next_time": string|null }`

---

## 9. Restriction profile (View 8)

> **D-26 (2026-09-15) ships H1/H3** — GET/PUT /me/restriction-profile (strict
> canonical validation: allergen codes vs `dietary_allergen_definition`; labeled
> PILOT diet-pattern vocabulary `vegetarian|vegan|gluten-free`), the read-only
> /restriction-vocabulary, and GET /analysis/:analysisId/restriction-highlight
> (conflicts first; unknown never a pass; not-flagged carries no pass claim).

### GET /me/restriction-profile
Get the user's restriction profile. **Auth:** Bearer. **Story:** RS-US-37.
- 200: `{ "profile_id", "allergens": [], "diet_patterns": [], "label_pack": "EU"|"US" }`

### PUT /me/restriction-profile
Create/update the restriction profile. **Auth:** Bearer. **Story:** RS-US-37.
- Body: `{ "allergens": [ string ], "diet_patterns": [ string ], "label_pack": "EU"|"US" }`
- 200: updated profile

### GET /analysis/:analysisId/view-8
Run/return View 8 (dietary) for an analysis. **Auth:** Bearer or guest. **Story:** RS-US-38.
- 200: `{ "present": [], "not_on_card": [], "unknown": [], "removal_notes": [], "disclaimer": "...", "allergen_line": { "contains": [], "notes": [], "unknown": [] } }`

### GET /analysis/:analysisId/view-8/print-line
Return the printable allergen line. **Auth:** Bearer or guest. **Story:** RS-US-40.
- 200: `{ "line": "Contains: …" }`

### GET /allergen-map
Versioned allergen mapping table. **Auth:** Bearer or guest. **Story:** RS-US-43.
- Query: `?version=` · 200: `{ "version": "v1.2", "items": [ { "canonical_name", "eu_listed", "us_major", "note" } ] }`

---

## 10. Nutrition bands (View 9)

> **D-26 (2026-09-15) ships I3** — PATCH /view-9/portions (RS-US-46): the portion
> count persists ONLY in the View 9 payload's `per_portion` (Q14 seam — no
> column). PATCH /view-9/assumptions (RS-US-45, I2/I4) existed from D-19.

### GET /analysis/:analysisId/view-9
Return View 9 as a band. **Auth:** Bearer or guest. **Story:** RS-US-44.
- 200: `{ "band": { "energy_kcal_min": number, "energy_kcal_max": number, "protein_g": {min,max}, ... }, "sodium": "unknown", "assumptions": [ { "key", "value", "tag": "ASSUMED" } ], "per_serving"?: {...}, "disclaimer": "..." }`

### PATCH /analysis/:analysisId/view-9/assumptions
Edit assumptions (recompute live). **Auth:** Bearer. **Story:** RS-US-45.
- Body: `{ "fish_class"?: "lean"|"oily", "coconut_grams"?: number, "oil_tbsp"?: number }`
- 200: recomputed band

### PATCH /analysis/:analysisId/view-9/portions
Set portions → per-serving band (I3). **Auth:** Bearer. **Story:** RS-US-46.
- Body: `{ "portions": 3|4 }` · 200: `{ "band": {...}, "per_serving": {...} }`

### GET /food-composition-table
Versioned food composition table. **Auth:** Bearer or guest. **Story:** RS-US-50.
- Query: `?version=&q=` · 200: `{ "version": "v6", "items": [ { "food_id", "food_name", "energy_kcal", ... } ] }`

---

## 11. Ingredient aliases

### GET /ingredient-aliases
Versioned vernacular alias table (RS-US-11). **Auth:** Bearer or guest.
- Query: `?version=&q=` · 200: `{ "version": "v2.1", "items": [ { "alias_name", "canonical_name" } ] }`

### POST /ingredient-aliases/resolve
Resolve vernacular names to canonical. **Auth:** Bearer or guest. **Story:** RS-US-11.
- Body: `{ "names": [ string ] }`
- 200: `{ "resolved": [ { "alias_name", "canonical_name", "ambiguous": boolean } ] }`

---

## 12. Endpoint → story mapping

| Area | Endpoint(s) | Story |
|---|---|---|
| Auth | `/auth/*` | RS-US-01, 02 |
| Preferences | `PATCH /auth/me/preferences` | RS-US-05 |
| Paste parse | `POST /recipes/parse-text` | RS-US-06 |
| Photo/OCR | `POST /recipes/upload`, `/ocr` | RS-US-07 |
| Parse review | `PATCH/DELETE/POST .../lines` | RS-US-08 |
| Alias | `/ingredient-aliases` | RS-US-11 |
| Method | `PATCH /recipes/:id/method` | RS-US-09 |
| Identify | `POST /recipes/:id/identify` | RS-US-12 |
| Analyse | `POST /recipes/:id/analyse` | RS-US-13 |
| Station card | `GET /analysis/:id/station-card` | RS-US-16, 29 |
| Re-analyse | `POST /recipes/:id/reanalyse` | RS-US-17, 23 |
| Substitute | `POST /recipes/:id/substitute-preview` | RS-US-18 |
| Library | `/recipes` CRUD | RS-US-19–24 |
| Shopping list | `/shopping-lists` | RS-US-25–27 |
| Cook log | `/cook-logs` | RS-US-31–36 |
| View 8 | `/analysis/:id/view-8` | RS-US-38–40 |
| View 9 | `/analysis/:id/view-9` | RS-US-44–47 |
| Versioned tables | `/allergen-map`, `/food-composition-table` | RS-US-43, 50 |

---

*End of API endpoints. Single-USER auth via Keycloak; guest = session state, not a role. Error envelope and pagination conventions at top.*
