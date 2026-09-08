# @recipe-systems/schemas \u2014 D-05 Freeze Record

- **Schema version:** `1.0.0` (single active contract \u2014 no competing versions)
- **Frozen at:** P0-5 (D-05) \u00b7 2026-09-08
- **Canonical export surface:** `src/index.ts` (re-exports; submodules are stable names)
- **Validation technology:** Zod (project convention; runtime-usable \u2014 TS types are
  derived, not the source of truth). All schemas are `.strict()` \u2014 unexpected keys reject.
- **Versioning convention:** additive changes require a new dispatch unit and bump
  `SCHEMA_VERSION` minor; breaking changes require a new major + a migration note here.
  Historical versions may be documented; only one is active.

## Contract set (with canonical sources)

| Contract | Schema | Canonical source |
|---|---|---|
| View 1 \u2013 7 payloads | `views/view-1..7.ts` | `Recipe_Systems_Analysis_Prompts.md` \u00a72\u2013\u00a78 OUTPUT SCHEMA blocks |
| View 8 payload | `views/view-8.ts` | `Recipe_Systems_Deterministic_Views.md` \u00a72 |
| View 9 payload | `views/view-9.ts` | `Recipe_Systems_Deterministic_Views.md` \u00a73 |
| Identification | `identification.ts` | API doc \u00a74 `POST /recipes/:recipeId/identify` 200 + Recipe_Systems \u00a75 + Epic-C C1 |
| Claim schema + tags | `shared.ts` | Analysis Prompts \u00a71 TAGGING + ERD \u00a7analysis_claim |
| Station card | `station-card.ts` | API doc \u00a75 `GET /analysis/:analysisId/station-card` 200 + ERD \u00a7analysis_station_card |
| Shared LLM input | `shared.ts` StructuredRecipeInputSchema | Analysis Prompts \u00a70 |
| Deterministic input | `shared.ts` DeterministicViewInputSchema | Deterministic Views \u00a71 |
| V9 assumptions | `shared.ts` View9AssumptionsSchema | Deterministic Views \u00a73 |
| Analysis envelope | `envelope.ts` | API doc \u00a75 `POST /recipes/:recipeId/analyse` 200 |

## Documented canonical readings (deviations from a literal reading are NOT allowed here)

1. `sodium` is `z.literal('unknown')` \u2014 the deterministic doc's output schema defines only
   that value and the hard rules forbid a fabricated point value. A future measured-sodium
   feature is a schema change (new version).
2. `envelope.claim_tags` \u2014 the API doc shows `"claim_tags": {...}` without keys. Minimal
   faithful reading: a per-tag count record over the six canonical tags
   (`z.record(ClaimTag, non-negative int)`).
3. View item `tag` subsets are per-view literals exactly as each prompt's OUTPUT SCHEMA
   block fixes them (e.g. V4/V7 items are `INFERRED`-only; V6 `CARD`/`UNKNOWN`-only).
4. `station-card.mise/sequence/do_nots/control_points/product_yield_hold` element types are
   unspecified in the API doc \u2014 modeled as open records/arrays (shape enforced, contents
   left to the producing unit).
