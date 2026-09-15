#!/usr/bin/env bash
# Recipe Systems — QG2 static regression gates (TEST_PLAN §2).
# Binding on EVERY dispatch unit (DISPATCH global rule 8): the FULL cumulative suite + this script
# run on every unit. Gates run green-trivially before their subject exists; they ARM automatically
# as code lands (TEST_PLAN QG2). Any gate that fires exits non-zero with the evidence.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# GATES_SCAN_ROOT: optional override for scratch-tree violation proofs
# (tests/integration/qg2_gates.test.ts plants violations in a temp tree and proves
# each gate fires). Defaults to the real repository root.
SCAN="${GATES_SCAN_ROOT:-$ROOT}"
cd "$ROOT"

FAIL=0
note()  { echo "  [gate:ok]   $1"; }
fire()  { echo "  [gate:FIRE] $1"; FAIL=1; }
trivial() { echo "  [gate:armed-later] $1 (subject does not exist yet — trivially green)"; }

echo "== QG2 static gates (TEST_PLAN §2) =="

# --- 1. One-writer rule (ADR §2) ---------------------------------------------------------------
echo "-- one-writer: analysis_* written only by apps/analysis-worker"
# Prisma model style (prisma.analysis.update / prisma.analysisView.create) and raw-SQL style
# (INSERT INTO analysis_view ...) — both must be caught.
pat='prisma\.(analysis|analysis[A-Z][A-Za-z]*|analysis_[a-z_]+)\.(create|upsert|delete|update|updateMany|createMany|deleteMany)|\b(INSERT INTO|UPDATE|DELETE FROM)\s+analysis_?[A-Za-z_]+'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "^\S+/analysis-worker/" || true)
if [ -z "$hits" ]; then trivial "one-writer analysis_* (no write references outside the worker yet)"; else
  fire "analysis_* write-context reference outside apps/analysis-worker:"; echo "$hits"
fi

echo "-- one-writer: dietary_* / nutrition_* written only by the admin module (apps/api admin)"
pat='prisma\.(dietary|nutrition)[._]?[A-Za-z]*\.(create|upsert|delete|update|updateMany|createMany|deleteMany)|\b(INSERT INTO|UPDATE|DELETE FROM)\s+(dietary|nutrition)_?[A-Za-z_]+'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null || true)
outside=$(echo "$hits" | grep -vE "apps/api/(src/)?admin" || true)
if [ -z "$hits" ]; then trivial "one-writer dietary_*/nutrition_* (no write references yet)"; else
  if [ -z "$outside" ]; then note "dietary_*/nutrition_* writes confined to the admin module"; else fire "dietary_*/nutrition_* write outside the admin module:"; echo "$outside"; fi
fi

echo "-- one-writer: ingredient_dictionary / ingredient_alias admin-module writer (Q5 working assumption)"
pat='prisma\.ingredient[._]?([Dd]ictionary|[Aa]lias)[._]?[A-Za-z]*\.(create|upsert|delete|update|updateMany|createMany|deleteMany)|\b(INSERT INTO|UPDATE|DELETE FROM)\s+ingredient_?(dictionary|alias)'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null || true)
outside=$(echo "$hits" | grep -vE "apps/api/(src/)?admin" || true)
if [ -z "$hits" ]; then trivial "one-writer dictionary/alias (no write references yet)"; else
  if [ -z "$outside" ]; then note "dictionary/alias writes confined to the admin module"; else fire "dictionary/alias write outside the admin module:"; echo "$outside"; fi
fi

# --- 2. Render read-only (ADR §7) --------------------------------------------------------------
echo "-- render read-only: packages/rendering contains no database writes"
hits=$(grep -rInE "prisma|executeRaw|queryRaw|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\.create\(|\.update\(|\.delete\(" \
  "$SCAN/packages/rendering" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null || true)
if [ -z "$hits" ]; then note "packages/rendering has no database-write references"; else
  fire "packages/rendering must be read-only:"; echo "$hits"
fi

# --- 2b. Shopping one-writer (D-30) --------------------------------------------------------------
echo "-- one-writer: shopping_* written only by the API shopping module (D-30)"
pat='prisma\.(shoppingListGeneration|shoppingListItem|ingredientShoppingState)[A-Za-z]*\.(create|upsert|delete|update|updateMany|createMany|deleteMany)|\b(INSERT INTO|UPDATE|DELETE FROM)\s+(shopping_list_generation|shopping_list_item|ingredient_shopping_state)'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "packages/database/prisma/migrations/" || true)
outside=$(echo "$hits" | grep -vE "apps/api/src/modules/shopping" || true)
if [ -z "$hits" ]; then trivial "shopping one-writer (no write references yet)"; else
  if [ -z "$outside" ]; then note "shopping_* writes confined to the API shopping module"; else fire "shopping_* write outside the API shopping module:"; echo "$outside"; fi
fi

# --- 2c. Q2 Option A: allergen_line snapshot column (D-30) --------------------------------------
echo "-- Q2 Option A: shopping_list_generation.allergen_line exists in schema + migration (D-30)"
SCHEMA_FILE="$SCAN/packages/database/prisma/schema.prisma"
if [ ! -f "$SCHEMA_FILE" ]; then
  trivial "allergen_line column gate (no Prisma schema in the scan tree yet)"
elif grep -q "allergen_line" "$SCHEMA_FILE" \
  && grep -rq "allergen_line" "$SCAN/packages/database/prisma/migrations"; then
  note "allergen_line snapshot column declared in the Prisma schema and a migration"
else
  fire "Q2 Option A: shopping_list_generation must carry allergen_line (schema + migration)"
fi

# --- 2d. Print snapshot-only (D-23 / INV-12 / Q2 Option A) ---------------------------------------
echo "-- print snapshot-only: the print path never reads the live effective-dated mapping (D-23)"
pat='prisma\.dietaryAllergenMapping|dietary_allergen_mapping\.'
hits=$(grep -rInE "$pat" "$SCAN/apps/api/src/modules/print" "$SCAN/packages/rendering/src" \
  --include="*.ts" --include="*.tsx" --exclude="*.test.ts" --exclude="*.spec.ts" 2>/dev/null || true)
if [ -z "$hits" ]; then note "print path has no live-mapping reads (the persisted allergen snapshot only)"; else
  fire "print must consume the persisted allergen snapshot only:"; echo "$hits"
fi

# --- 2e. Cook one-writer (D-24) ------------------------------------------------------------------
echo "-- one-writer: cook_log* written only by the API cook module (D-24)"
pat='prisma\.(cookLog|cookLogSwap|cookLogPhoto)[A-Za-z]*\.(create|upsert|delete|update|updateMany|createMany|deleteMany)|\b(INSERT INTO|UPDATE|DELETE FROM)\s+cook_log(_swap|_photo)?'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "packages/database/prisma/migrations/" || true)
outside=$(echo "$hits" | grep -vE "apps/api/src/modules/cook" || true)
if [ -z "$hits" ]; then trivial "cook one-writer (no write references yet)"; else
  if [ -z "$outside" ]; then note "cook_log* writes confined to the API cook module"; else fire "cook_log* write outside the API cook module:"; echo "$outside"; fi
fi

# --- 2f. Restriction one-writer (D-26) -----------------------------------------------------------
echo "-- one-writer: account_restriction_* written only by the API restrictions module (D-26)"
pat='\b(prisma|tx)\.(accountRestrictionProfile|accountRestrictionItem)[A-Za-z]*\.(create|upsert|delete|update|updateMany|createMany|deleteMany)|\b(INSERT INTO|UPDATE|DELETE FROM)\s+account_restriction_(profile|item)'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "packages/database/prisma/migrations/" || true)
outside=$(echo "$hits" | grep -vE "apps/api/src/modules/restrictions" || true)
if [ -z "$hits" ]; then trivial "restriction one-writer (no write references yet)"; else
  if [ -z "$outside" ]; then note "account_restriction_* writes confined to the API restrictions module"; else fire "account_restriction_* write outside the API restrictions module:"; echo "$outside"; fi
fi

# --- 2g. Recipe-tag one-writer (D-25) ------------------------------------------------------------
echo "-- one-writer: recipe_tag written only by the API recipes module (D-25)"
pat='\b(prisma|tx)\.recipeTag[A-Za-z]*\.(create|upsert|delete|update|updateMany|createMany|deleteMany)|\b(INSERT INTO|UPDATE|DELETE FROM)\s+recipe_tag'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "packages/database/prisma/migrations/" || true)
outside=$(echo "$hits" | grep -vE "apps/api/src/modules/recipes" || true)
if [ -z "$hits" ]; then trivial "recipe_tag one-writer (no write references yet)"; else
  if [ -z "$outside" ]; then note "recipe_tag writes confined to the API recipes module"; else fire "recipe_tag write outside the API recipes module:"; echo "$outside"; fi
fi

# --- 3. DDL outside Prisma migrations (SCAFFOLD §2) --------------------------------------------
echo "-- DDL: no CREATE/ALTER/DROP TABLE outside packages/database/prisma/migrations"
hits=$(grep -rInE "CREATE TABLE|ALTER TABLE|DROP TABLE" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "packages/database/prisma/migrations/" || true)
if [ -z "$hits" ]; then note "no DDL outside packages/database/prisma/migrations"; else
  fire "DDL outside Prisma migrations:"; echo "$hits"
fi

# --- 3b. recipe_input immutability (D-10 done criterion; Q4 Intake write-once) ------------------
echo "-- immutability: recipe_input has no UPDATE/DELETE path anywhere"
pat='recipeInput\.(update|updateMany|upsert|delete|deleteMany)|\b(UPDATE|DELETE FROM)\s+recipe_input'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "packages/database/prisma/migrations/" || true)
if [ -z "$hits" ]; then note "recipe_input is write-once (no update/delete references, D-10)"; else
  fire "recipe_input must be immutable:"; echo "$hits"
fi

# --- 4. Provenance tags (SCAFFOLD §6) ----------------------------------------------------------
echo "-- provenance: claim_tag values subset of the six canonical tags"
CANON="CARD METHOD INFERRED ABSENT UNKNOWN ASSUMED"
# Value literals only (quoted both sides) -- type references like ClaimTagSchema are
# not values. Test files excluded: negative fixtures intentionally carry non-canonical tags.
pat='(claim_tag|claimTag)["'"'"':= ]+["'"'"'][A-Z]+["'"'"']'
hits=$(grep -rhoE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.ts" --include="*.tsx" \
  --exclude="*.test.ts" --exclude="*.spec.ts" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null | sort -u || true)
bad=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  tag=$(echo "$line" | grep -oE "['"'"'"]?[A-Z]+['"'"'"]?$" | tr -d "'"'"'\"'"'"'")
  if ! echo " $CANON " | grep -q " $tag "; then bad="$bad
$line"; fi
done <<< "$hits"
if [ -z "$hits" ]; then trivial "provenance tags (no claim_tag references yet)"; else
  if [ -z "$bad" ]; then note "all claim_tag references use canonical tags"; else fire "non-canonical claim_tag value:"; echo "$bad"; fi
fi

# --- 5. Disclaimers (INV-13 / INV-14, H6 / I6 — D-21: unconditional on every surface) ---------
echo "-- disclaimers: View 8 never \"safe\"; View 9 never point-kcal over a range"
ASR="$SCAN/tests/assertions/golden_recipe_assertions.yaml"
if [ -f "$ASR" ]; then
  if grep -qiE "safe" "$ASR" && grep -qiE "point-kcal|kcal" "$ASR" && grep -qiE "band|range" "$ASR"; then
    note "golden assertions file carries the no-\"safe\" / no-point-kcal assertions (armed)"
  else
    fire "golden_recipe_assertions.yaml exists but is missing the no-\"safe\" or no-point-kcal assertions"
  fi
else
  trivial "disclaimer assertions (fixture assertions land at D-03)"
fi

# D-21: the two canonical texts, verbatim, in the producer constants. Any paraphrase
# anywhere on the emission path breaks CI (A-21: a truncated paraphrase is a MAJOR).
H6_TEXT="Reads the card only. Does not test food. Does not know your kitchen. Not medical advice."
I6_TEXT="Table estimate from stated assumptions. Not a lab analysis. Not medical advice."
PRODUCER="$SCAN/apps/analysis-worker/src/deterministic-views.ts"
WEBVIEWS="$SCAN/apps/web/components/app/AnalysisViews.tsx"
if [ -f "$PRODUCER" ]; then
  if grep -qF "$H6_TEXT" "$PRODUCER" && grep -qF "$I6_TEXT" "$PRODUCER"; then
    note "H6/I6 disclaimers present verbatim in the View 8/9 producer constants"
  else
    fire "H6/I6 disclaimer texts must appear verbatim in the deterministic View 8/9 producer (paraphrase = MAJOR)"
  fi
  # INV-13 static: the forbidden word on the View 8 output surface fires, always.
  if grep -qiE "\bsafe\b" "$PRODUCER"; then
    fire "INV-13: the word \"safe\" appears in the View 8 producer output surface"
  fi
  # INV-14 static: the band is structural — a point-kcal refactor that drops either
  # bound of the energy band fires.
  if grep -qE "energy_kcal_min" "$PRODUCER" && grep -qE "energy_kcal_max" "$PRODUCER"; then
    note "View 9 producer carries the structural min/max energy band (no point-kcal path)"
  else
    fire "INV-14: the View 9 producer must emit both energy_kcal_min and energy_kcal_max (a point-kcal refactor fires)"
  fi
else
  trivial "View 8/9 producer disclaimer gates (producer lands at D-19)"
fi
if [ -f "$WEBVIEWS" ]; then
  if grep -qiE "\bsafe\b" "$WEBVIEWS"; then
    fire "INV-13: the word \"safe\" appears in the View 8/9 web render surface"
  else
    note "no \"safe\" on the View 8/9 web render surface"
  fi
  # The render path must draw the disclaimer from the payload (never a hardcoded
  # paraphrase) on BOTH surfaces.
  count=$(grep -cE "\{payload\.disclaimer\}" "$WEBVIEWS" || true)
  if [ "${count:-0}" -ge 2 ]; then
    note "View 8 and View 9 render payload.disclaimer from the persisted payload (both surfaces)"
  else
    fire "both View 8 and View 9 must render {payload.disclaimer} (hardcoded/paraphrased copy fires)"
  fi
  if grep -qE "energy_kcal_min" "$WEBVIEWS" && grep -qE "energy_kcal_max" "$WEBVIEWS"; then
    note "View 9 web render draws both band bounds (no point-kcal render path)"
  else
    fire "INV-14: the View 9 web render must use both energy_kcal_min and energy_kcal_max"
  fi
else
  trivial "View 8/9 web render disclaimer gates (render lands at D-19)"
fi

# --- 6. Golden test present, not skipped, ran (ERD §16) -----------------------------------------
echo "-- golden: golden test exists, is not skipped, and ran in this CI run"
FIX="$SCAN/tests/fixtures/golden_kanyakumari_card.json"
if [ -f "$FIX" ]; then
  files=$(grep -rIl "golden_kanyakumari_card" "$SCAN/tests" "$SCAN/apps" "$SCAN/packages" --include="*.test.ts" --include="*.spec.ts" 2>/dev/null || true)
  n=$(printf '%s\n' "$files" | grep -c . || true)
  skip=""
  if [ -n "$files" ]; then
    # word-bounded both sides: "xit" must not match inside e.g. "result.exit"
    skip=$(grep -rInE "\.(skip|only)\b|\bxdescribe\b|\bxit\b" $files 2>/dev/null || true)
  fi
  if [ "$n" -ge 1 ] && [ -z "$skip" ]; then note "golden test present and not skipped (armed)"; else
    fire "golden fixture exists but no non-skipped golden test found"
  fi
else
  trivial "golden-test-present gate (fixture lands at D-03)"
fi

# --- 6b. Golden invariant evaluation (D-03): the 8 ERD §16 checks, CI-blocking ------------------
echo "-- golden: evaluate the 8 invariants (scripts/golden-check.js)"
if [ -f "scripts/golden-check.js" ]; then
  if node scripts/golden-check.js; then
    note "all 8 golden invariants evaluated and passing"
  else
    fire "golden invariant evaluation failed (see [golden:FIRE] above)"
  fi
else
  fire "scripts/golden-check.js missing (D-03 deliverable)"
fi

# --- 6c. INV-05 single source of truth (A-14): no shadow enqueue-readiness STATE ----------------
# Persisted-state scan only (.prisma columns + raw SQL): a parallel column/field that can drift
# is a MAJOR (A-14). Wire-level derived names in .ts (e.g. can_enqueue in a response body) are
# derived, not state — deliberately out of scope for this gate.
echo "-- INV-05: no shadow enqueue-readiness state (needs_review is the only flag)"
pat='(enqueue_ready|analysis_ready|review_complete|can_enqueue|ready_for_analysis)'
hits=$(grep -rInE "$pat" "$SCAN/apps" "$SCAN/packages" --include="*.prisma" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=generated 2>/dev/null \
  | grep -vE "packages/database/prisma/migrations/" || true)
if [ -z "$hits" ]; then note "no shadow enqueue-readiness state in schema/SQL (INV-05, A-14)"; else
  fire "shadow enqueue-readiness state (drift risk vs needs_review):"; echo "$hits"
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "RESULT: regression gates FAILED (see [gate:FIRE] lines above)"
  exit 1
fi
echo "RESULT: regression gates PASS"
