-- Migration 013 — RS-US (chef mode): the dish video walkthrough. One row per
-- recipe (upsert). Holds a THIRD-PARTY YouTube video found for the dish plus the
-- timestamped chapters read from that video. Discovery is LLM-proposed and
-- VERIFIED to exist (oEmbed) before storage, so the row is provenance for
-- external content — never a claim about the captured recipe object.
CREATE TABLE "recipe_video" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "video_url" VARCHAR(512),
    "video_id" VARCHAR(32),
    "title" VARCHAR(512),
    "channel" VARCHAR(255),
    "chapters" JSONB,
    "error" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recipe_video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_video_recipe_id_key" ON "recipe_video"("recipe_id");

-- AddForeignKey
ALTER TABLE "recipe_video"
    ADD CONSTRAINT "recipe_video_recipe_id_fkey"
    FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Generation lifecycle (mirrors the analysis status discipline).
ALTER TABLE "recipe_video"
    ADD CONSTRAINT chk_recipe_video_status
    CHECK ("status" IN ('generating', 'ready', 'failed'));
