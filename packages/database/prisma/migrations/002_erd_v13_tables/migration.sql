-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255),
    "auth_provider" VARCHAR(32) NOT NULL,
    "preferred_mode" VARCHAR(16) NOT NULL DEFAULT 'home',
    "label_pack" VARCHAR(8),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_session" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),
    "claimed_by_account_id" UUID,

    CONSTRAINT "guest_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_restriction_profile" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "label_pack" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_restriction_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_restriction_item" (
    "id" UUID NOT NULL,
    "restriction_profile_id" UUID NOT NULL,
    "allergen_id" UUID,
    "diet_pattern" VARCHAR(64),
    "restriction_type" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_restriction_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe" (
    "id" UUID NOT NULL,
    "account_id" UUID,
    "guest_session_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "raw_text" TEXT,
    "photo_uri" TEXT,
    "method_text" TEXT,
    "method_source_tag" VARCHAR(16),
    "method_inferred_source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_input" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "input_type" VARCHAR(16) NOT NULL,
    "raw_text" TEXT,
    "photo_uri" TEXT,
    "ocr_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredient_line" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "ingredient_id" UUID,
    "shopping_key" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,4),
    "amount_text" VARCHAR(128),
    "unit" VARCHAR(64),
    "group_name" VARCHAR(64),
    "confirmed_sense" VARCHAR(255),
    "include_on_list" BOOLEAN NOT NULL DEFAULT true,
    "source_tag" VARCHAR(16) NOT NULL,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "ocr_confidence" DECIMAL(4,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "recipe_ingredient_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_tag" (
    "recipe_id" UUID NOT NULL,
    "tag_text" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_tag_pkey" PRIMARY KEY ("recipe_id","tag_text")
);

-- CreateTable
CREATE TABLE "ingredient_dictionary" (
    "id" UUID NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ingredient_dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_alias" (
    "id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "alias_text" VARCHAR(255) NOT NULL,
    "language" VARCHAR(32),
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "snapshot_of_analysis_id" UUID,
    "mode" VARCHAR(16) NOT NULL,
    "family" VARCHAR(255),
    "family_confidence" VARCHAR(255),
    "architecture_summary" TEXT,
    "not_this_neighbors" JSONB,
    "absent_family_items" JSONB,
    "prompt_version" VARCHAR(64),
    "model_version" VARCHAR(128),
    "status" VARCHAR(16) NOT NULL,
    "is_current" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_view" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "view_number" SMALLINT NOT NULL,
    "view_key" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_claim" (
    "id" UUID NOT NULL,
    "analysis_view_id" UUID NOT NULL,
    "allergen_id" UUID,
    "claim_text" TEXT NOT NULL,
    "claim_tag" VARCHAR(16) NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_station_card" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "mise" JSONB NOT NULL,
    "sequence" JSONB NOT NULL,
    "do_nots" JSONB NOT NULL,
    "control_points" JSONB NOT NULL,
    "product_yield_hold" JSONB,
    "printable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_station_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_generation" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "layout" VARCHAR(32),
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_list_generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_item" (
    "id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "shopping_key" UUID,
    "display_name" VARCHAR(255) NOT NULL,
    "display_quantity" VARCHAR(128) NOT NULL,
    "unit" VARCHAR(64),
    "group_name" VARCHAR(64),
    "state_at_generation" VARCHAR(8) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_list_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_shopping_state" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "shopping_key" UUID NOT NULL,
    "state" VARCHAR(8) NOT NULL DEFAULT 'need',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ingredient_shopping_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_log" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "cooked_at" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" SMALLINT,
    "note" TEXT,
    "next_time_instruction" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cook_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_log_swap" (
    "id" UUID NOT NULL,
    "cook_log_id" UUID NOT NULL,
    "shopping_key" UUID,
    "ingredient_name_snapshot" VARCHAR(255) NOT NULL,
    "change_type" VARCHAR(16) NOT NULL,
    "original_value" TEXT,
    "actual_value" TEXT,
    "applied_to_recipe" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cook_log_swap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_log_photo" (
    "id" UUID NOT NULL,
    "cook_log_id" UUID NOT NULL,
    "photo_uri" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cook_log_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietary_allergen_definition" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "label_pack" VARCHAR(16),
    "is_statutory" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dietary_allergen_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietary_allergen_mapping" (
    "id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "allergen_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "source_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dietary_allergen_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_food_composition_entry" (
    "id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "external_source" VARCHAR(64) NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "food_name" VARCHAR(255) NOT NULL,
    "is_primary_for_ingredient" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nutrition_food_composition_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_food_composition_version" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "energy_kcal_per_100g" DECIMAL(12,4),
    "protein_g_per_100g" DECIMAL(12,4),
    "fat_g_per_100g" DECIMAL(12,4),
    "carb_g_per_100g" DECIMAL(12,4),
    "fiber_g_per_100g" DECIMAL(12,4),
    "sodium_mg_per_100g" DECIMAL(12,4),
    "source_version" VARCHAR(128) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),

    CONSTRAINT "nutrition_food_composition_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_email_key" ON "account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_restriction_profile_account_id_key" ON "account_restriction_profile"("account_id");

-- CreateIndex
CREATE INDEX "ix_recipe_input_recipe_created" ON "recipe_input"("recipe_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredient_line_recipe_id_shopping_key_key" ON "recipe_ingredient_line"("recipe_id", "shopping_key");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_dictionary_canonical_name_key" ON "ingredient_dictionary"("canonical_name");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_alias_alias_text_key" ON "ingredient_alias"("alias_text");

-- CreateIndex
CREATE INDEX "ix_ingredient_alias_language" ON "ingredient_alias"("language", "alias_text");

-- CreateIndex
CREATE INDEX "ix_analysis_recipe_created" ON "analysis"("recipe_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_analysis_id_recipe" ON "analysis"("id", "recipe_id");

-- CreateIndex
CREATE INDEX "ix_analysis_claim_tag" ON "analysis_claim"("analysis_view_id", "claim_tag");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_station_card_analysis_id_key" ON "analysis_station_card"("analysis_id");

-- CreateIndex
CREATE INDEX "ix_shopping_generation_recipe" ON "shopping_list_generation"("recipe_id", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "ix_shopping_item_generation" ON "shopping_list_item"("generation_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_shopping_state_recipe_id_shopping_key_key" ON "ingredient_shopping_state"("recipe_id", "shopping_key");

-- CreateIndex
CREATE INDEX "ix_cook_log_recipe_date" ON "cook_log"("recipe_id", "cooked_at" DESC);

-- CreateIndex
CREATE INDEX "ix_cook_swap_log" ON "cook_log_swap"("cook_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "cook_log_photo_cook_log_id_key" ON "cook_log_photo"("cook_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "dietary_allergen_definition_code_key" ON "dietary_allergen_definition"("code");

-- CreateIndex
CREATE INDEX "ix_allergen_mapping_ingredient_version" ON "dietary_allergen_mapping"("ingredient_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "uq_food_composition_source" ON "nutrition_food_composition_entry"("external_source", "external_id");

-- AddForeignKey
ALTER TABLE "guest_session" ADD CONSTRAINT "guest_session_claimed_by_account_id_fkey" FOREIGN KEY ("claimed_by_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_restriction_profile" ADD CONSTRAINT "account_restriction_profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_restriction_item" ADD CONSTRAINT "account_restriction_item_restriction_profile_id_fkey" FOREIGN KEY ("restriction_profile_id") REFERENCES "account_restriction_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_restriction_item" ADD CONSTRAINT "account_restriction_item_allergen_id_fkey" FOREIGN KEY ("allergen_id") REFERENCES "dietary_allergen_definition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_guest_session_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_input" ADD CONSTRAINT "recipe_input_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredient_line" ADD CONSTRAINT "recipe_ingredient_line_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredient_line" ADD CONSTRAINT "recipe_ingredient_line_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient_dictionary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_tag" ADD CONSTRAINT "recipe_tag_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_alias" ADD CONSTRAINT "ingredient_alias_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient_dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_view" ADD CONSTRAINT "analysis_view_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_claim" ADD CONSTRAINT "analysis_claim_analysis_view_id_fkey" FOREIGN KEY ("analysis_view_id") REFERENCES "analysis_view"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_claim" ADD CONSTRAINT "analysis_claim_allergen_id_fkey" FOREIGN KEY ("allergen_id") REFERENCES "dietary_allergen_definition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_station_card" ADD CONSTRAINT "analysis_station_card_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_generation" ADD CONSTRAINT "shopping_list_generation_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "shopping_list_generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_shopping_state" ADD CONSTRAINT "ingredient_shopping_state_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_log" ADD CONSTRAINT "cook_log_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_log_swap" ADD CONSTRAINT "cook_log_swap_cook_log_id_fkey" FOREIGN KEY ("cook_log_id") REFERENCES "cook_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_log_photo" ADD CONSTRAINT "cook_log_photo_cook_log_id_fkey" FOREIGN KEY ("cook_log_id") REFERENCES "cook_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dietary_allergen_mapping" ADD CONSTRAINT "dietary_allergen_mapping_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient_dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dietary_allergen_mapping" ADD CONSTRAINT "dietary_allergen_mapping_allergen_id_fkey" FOREIGN KEY ("allergen_id") REFERENCES "dietary_allergen_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_food_composition_entry" ADD CONSTRAINT "nutrition_food_composition_entry_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient_dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_food_composition_version" ADD CONSTRAINT "nutrition_food_composition_version_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "nutrition_food_composition_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- ERD v13 raw-SQL constructs (Recipe_Systems_ERD_FINAL.md §12, applied verbatim)
-- Prisma cannot express: CHECKs, partial indexes, EXCLUDE USING gist, composite
-- FKs, and the soft-delete trigger. Migration 001 owns the btree_gist extension.
-- ============================================================================

-- Guest session / recipe ownership
ALTER TABLE recipe
    ADD CONSTRAINT chk_recipe_owner_xor
    CHECK (
        (account_id IS NOT NULL AND guest_session_id IS NULL)
        OR
        (account_id IS NULL AND guest_session_id IS NOT NULL)
    );

CREATE INDEX ix_recipe_guest_session ON recipe(guest_session_id) WHERE guest_session_id IS NOT NULL;
CREATE INDEX ix_guest_session_expiry ON guest_session(expires_at) WHERE claimed_at IS NULL;
CREATE INDEX ix_guest_session_claimed_by ON guest_session(claimed_by_account_id) WHERE claimed_by_account_id IS NOT NULL;

-- Recipe
CREATE INDEX ix_recipe_account_updated
    ON recipe(account_id, updated_at DESC)
    WHERE deleted_at IS NULL;

-- Recipe input (v13, C-41)
ALTER TABLE recipe_input
    ADD CONSTRAINT chk_recipe_input_type
    CHECK (input_type IN ('paste', 'photo', 'form'));

-- Recipe ingredient line
ALTER TABLE recipe_ingredient_line
    ADD CONSTRAINT uq_recipe_ingredient_line_shopping_key
    UNIQUE (recipe_id, shopping_key);

CREATE UNIQUE INDEX uq_recipe_ingredient_line
    ON recipe_ingredient_line(recipe_id, line_no)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_recipe_ingredient_line_needs_review
    ON recipe_ingredient_line(recipe_id)
    WHERE needs_review = TRUE AND deleted_at IS NULL;

ALTER TABLE recipe_ingredient_line
    ADD CONSTRAINT chk_ocr_confidence_range
    CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1));

-- Analysis
CREATE UNIQUE INDEX uq_analysis_current
    ON analysis(recipe_id)
    WHERE is_current = TRUE;

ALTER TABLE analysis
    ADD CONSTRAINT fk_analysis_snapshot_same_recipe
    FOREIGN KEY (snapshot_of_analysis_id, recipe_id)
    REFERENCES analysis(id, recipe_id);

ALTER TABLE analysis_view
    ADD CONSTRAINT chk_analysis_view_status
    CHECK (status IN ('COMPLETE', 'INCOMPLETE'));

CREATE UNIQUE INDEX uq_analysis_view
    ON analysis_view(analysis_id, view_number);

CREATE INDEX ix_analysis_claim_allergen
    ON analysis_claim(allergen_id)
    WHERE allergen_id IS NOT NULL;

-- Shopping
ALTER TABLE ingredient_shopping_state
    ADD CONSTRAINT uq_ingredient_shopping_state UNIQUE (recipe_id, shopping_key);

ALTER TABLE ingredient_shopping_state
    ADD CONSTRAINT fk_shopping_state_recipe_line
    FOREIGN KEY (recipe_id, shopping_key)
    REFERENCES recipe_ingredient_line(recipe_id, shopping_key)
    ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION trg_cleanup_shopping_state_on_line_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        DELETE FROM ingredient_shopping_state
        WHERE recipe_id = NEW.recipe_id
          AND shopping_key = NEW.shopping_key;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_line_soft_delete_cleans_shopping_state
AFTER UPDATE OF deleted_at ON recipe_ingredient_line
FOR EACH ROW
EXECUTE FUNCTION trg_cleanup_shopping_state_on_line_soft_delete();

-- Dietary / nutrition
ALTER TABLE dietary_allergen_mapping
    ADD CONSTRAINT chk_allergen_mapping_period CHECK (
        effective_to IS NULL OR effective_to > effective_from
    );

ALTER TABLE dietary_allergen_mapping
    ADD CONSTRAINT excl_allergen_mapping_overlap
    EXCLUDE USING gist (
        ingredient_id WITH =,
        allergen_id WITH =,
        tstzrange(effective_from, effective_to, '[)') WITH &&
    );

CREATE UNIQUE INDEX uq_food_composition_primary
    ON nutrition_food_composition_entry(ingredient_id)
    WHERE is_primary_for_ingredient = TRUE;

ALTER TABLE nutrition_food_composition_version
    ADD CONSTRAINT chk_food_composition_version_period CHECK (
        effective_to IS NULL OR effective_to > effective_from
    );

ALTER TABLE nutrition_food_composition_version
    ADD CONSTRAINT excl_food_composition_version_overlap
    EXCLUDE USING gist (
        entry_id WITH =,
        tstzrange(effective_from, effective_to, '[)') WITH &&
    );

-- Account restriction
ALTER TABLE account_restriction_item
    ADD CONSTRAINT chk_restriction_item_type_matches_value
    CHECK (
        (restriction_type = 'allergen'     AND allergen_id IS NOT NULL AND diet_pattern IS NULL)
        OR
        (restriction_type = 'diet_pattern' AND diet_pattern IS NOT NULL AND allergen_id IS NULL)
    );

-- ============================================================================
-- §5–§10 data-dictionary CHECK constraints (ERD v13; declared per column,
-- spelled out here because Prisma cannot express CHECK constraints)
-- ============================================================================

ALTER TABLE account
    ADD CONSTRAINT chk_account_auth_provider CHECK (auth_provider IN ('password', 'sso')),
    ADD CONSTRAINT chk_account_preferred_mode CHECK (preferred_mode IN ('home', 'chef')),
    ADD CONSTRAINT chk_account_label_pack CHECK (label_pack IS NULL OR label_pack IN ('US', 'EU'));

ALTER TABLE account_restriction_profile
    ADD CONSTRAINT chk_profile_label_pack CHECK (label_pack IN ('US', 'EU'));

ALTER TABLE recipe
    ADD CONSTRAINT chk_recipe_method_source_tag
    CHECK (method_source_tag IS NULL OR method_source_tag IN ('CARD', 'METHOD', 'INFERRED', 'UNKNOWN'));

ALTER TABLE recipe_ingredient_line
    ADD CONSTRAINT chk_line_source_tag
    CHECK (source_tag IN ('CARD', 'METHOD', 'INFERRED', 'ABSENT', 'UNKNOWN', 'ASSUMED'));

ALTER TABLE analysis
    ADD CONSTRAINT chk_analysis_mode CHECK (mode IN ('home', 'chef')),
    ADD CONSTRAINT chk_analysis_status CHECK (status IN ('generating', 'complete', 'failed'));

ALTER TABLE analysis_view
    ADD CONSTRAINT chk_analysis_view_number CHECK (view_number BETWEEN 1 AND 9);

ALTER TABLE analysis_claim
    ADD CONSTRAINT chk_analysis_claim_tag
    CHECK (claim_tag IN ('CARD', 'METHOD', 'INFERRED', 'ABSENT', 'UNKNOWN', 'ASSUMED'));

ALTER TABLE shopping_list_generation
    ADD CONSTRAINT chk_shopping_layout CHECK (layout IS NULL OR layout IN ('grouped', 'flat'));

ALTER TABLE shopping_list_item
    ADD CONSTRAINT chk_shopping_item_state CHECK (state_at_generation IN ('have', 'need'));

ALTER TABLE ingredient_shopping_state
    ADD CONSTRAINT chk_shopping_state CHECK (state IN ('have', 'need'));

ALTER TABLE cook_log
    ADD CONSTRAINT chk_cook_log_rating CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));

ALTER TABLE cook_log_swap
    ADD CONSTRAINT chk_cook_log_swap_change_type
    CHECK (change_type IN ('skipped', 'reduced', 'increased', 'swapped'));

ALTER TABLE dietary_allergen_definition
    ADD CONSTRAINT chk_allergen_label_pack
    CHECK (label_pack IS NULL OR label_pack IN ('US', 'EU', 'both'));
