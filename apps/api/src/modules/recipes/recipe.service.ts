// Recipe service — the Web API's writer of the `recipe` table (one-writer rule, ADR §2).
// Intake (D-10) creates recipes through this service and delegates raw-input and
// draft-line persistence to the Intake module (Q4 resolved 2026-09-08: the BFF exposes
// endpoints, Intake owns recipe_input / recipe_ingredient_line writes).
//
// Ownership enforcement (D-09/D-10): every intake-created recipe carries exactly one
// owner (chk_recipe_owner_xor); `assertOwned` answers 404 for both missing and foreign
// recipes so recipe existence never leaks across accounts/guest sessions (INV-17).

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, PrismaClient, Recipe } from '@recipe-systems/database';
import { View5PayloadSchema } from '@recipe-systems/schemas';
import type { Readable } from 'node:stream';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { StorageService } from '../intake/storage.service';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// D-10 decision: intake endpoints accept no title (API doc §3 has no title input).
// `title` is NOT NULL on `recipe`; placeholder until a later unit makes it editable.
export const UNTITLED_RECIPE = 'Untitled recipe';

export interface IntakeRecipeOptions {
  rawText?: string | null;
  photoUri?: string | null;
}

/** D-13 (B4): the method-attach modes the API surface exposes (API doc §4). */
export type MethodAttachInput =
  | { mode: 'none' }
  | { mode: 'paste'; methodText: string }
  | { mode: 'inferred'; methodText: string; methodSource: string };

/** D-13 (B4): the wire response — `list_only` is the flag P3 asserts for Views 3/7 INCOMPLETE. */
export interface MethodState {
  method_tag: 'METHOD' | 'INFERRED' | null;
  method_source: string | null;
  /** D-13 surface addition: the persisted method text rides the wire so the
   *  workspace can reopen on the saved method without re-entering it. */
  method_text: string | null;
  list_only: boolean;
}

/** D-22 (D1): the saved-recipe wire — artifact presence only, never copies. */
export interface SavedRecipeWire {
  recipe_id: string;
  title: string;
  saved_at: string;
  artifacts: {
    raw_input: boolean;
    photo: boolean;
    object: boolean;
    identification: boolean;
    analysis: boolean;
    timestamps: boolean;
  };
}

/** D-22 (D2): one canonical library row (AC-1 fields exactly). D-24 (F1 AC-3)
 *  adds `last_cooked_at` — the newest cook_log.cooked_at, date-only, null when
 *  the recipe has no cook logs. The 2026-09-18 dashboard read-model extension
 *  adds `photo_uri` (the stored card photo), `has_analysis`, and
 *  `has_shopping_list`/`shopping_list_generated_at` — all read from existing
 *  rows; no business behavior changed. */
export interface LibraryRecipeRow {
  recipe_id: string;
  name: string;
  date: string;
  family: string | null;
  has_cook_log: boolean;
  last_cooked_at: string | null;
  photo_uri: string | null;
  has_analysis: boolean;
  has_shopping_list: boolean;
  shopping_list_generated_at: string | null;
}

/** D-25 (D3): the recipe_tag write + search surface. The recipes module is the
 *  SOLE `recipe_tag` writer (QG2 gate 2g) — free-text tags, one per recipe. */
export const MAX_RECIPE_TAGS = 20;
export const MAX_TAG_LENGTH = 100; // recipe_tag.tag_text is VARCHAR(100)

/**
 * D-13D/G (HANDOFF §5): the persisted contract is `method_text` + `method_source_tag`
 * (CARD/METHOD/INFERRED/UNKNOWN vocabulary) + `method_inferred_source` (required when
 * INFERRED). D-13 writes METHOD (paste) and INFERRED (accepted family match) only.
 */
function toMethodState(recipe: Recipe): MethodState {
  const tag = recipe.methodSourceTag === 'METHOD' || recipe.methodSourceTag === 'INFERRED'
    ? recipe.methodSourceTag
    : null;
  return {
    method_tag: tag,
    method_source: tag === 'INFERRED' ? recipe.methodInferredSource : null,
    method_text: recipe.methodText,
    list_only: tag === null,
  };
}

@Injectable()
export class RecipeService {
  private readonly logger = new Logger(RecipeService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    /** D-22 (D6): compensating object cleanup after a hard delete. Optional so
     *  service-level call sites/tests construct without storage wiring. */
    @Optional() private readonly storage?: StorageService,
  ) {}

  /** Create the recipe row that an intake event will attach to (ADR §4 step 2). */
  async createForIntake(actor: Actor, opts: IntakeRecipeOptions = {}): Promise<Recipe> {
    const data: Prisma.RecipeUncheckedCreateInput = {
      title: UNTITLED_RECIPE,
      rawText: opts.rawText ?? null,
      photoUri: opts.photoUri ?? null,
    };
    if (actor.kind === 'user') {
      data.accountId = actor.user.accountId;
    } else {
      data.guestSessionId = actor.guestSessionId;
    }
    return this.prisma.recipe.create({ data });
  }

  /** INV-17: the actor must own the recipe. 404 for missing AND foreign rows.
   *  QA-B4 fix: non-UUID ids are format-guarded BEFORE Prisma — a malformed id
   *  is a clean 404 (same as missing), never a Prisma P2023 → 500. */
  async assertOwned(actor: Actor, recipeId: string): Promise<Recipe> {
    if (!UUID_RE.test(recipeId)) {
      throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' });
    }
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' });
    }
    const owns =
      actor.kind === 'user'
        ? recipe.accountId === actor.user.accountId
        : recipe.guestSessionId === actor.guestSessionId;
    if (!owns) {
      throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' });
    }
    return recipe;
  }

  /** Read-only asset route: the recipe's stored card photo bytes, ownership-gated
   *  (INV-17 — 404 for missing AND foreign recipes). Null when the recipe has no
   *  photo or the stored object is gone. Never writes anything. */
  async photoBytes(
    actor: Actor,
    recipeId: string,
  ): Promise<{ stream: Readable; contentType: string } | null> {
    const recipe = await this.assertOwned(actor, recipeId);
    if (!recipe.photoUri || !this.storage) return null;
    if (!recipe.photoUri.startsWith('s3://')) return null;
    const key = recipe.photoUri.slice(recipe.photoUri.indexOf('/', 5) + 1);
    const image = await this.storage.getImage(key);
    if (!image) return null;
    return { stream: image.stream, contentType: image.contentType ?? 'image/jpeg' };
  }

  /** Compensation path (D-10K): remove an intake-created recipe ONLY when no intake
   *  rows ever attached — used when a photo intake fails after the recipe row landed. */
  async removeIfIntakeEmpty(actor: Actor, recipeId: string): Promise<void> {
    const recipe = await this.assertOwned(actor, recipeId);
    const inputCount = await this.prisma.recipeInput.count({ where: { recipeId: recipe.id } });
    if (inputCount === 0) {
      await this.prisma.recipe.delete({ where: { id: recipe.id } });
    }
  }

  /**
   * D-13 (B4 / RS-US-09): set or attach a method on the corrected object.
   * - `none`     → clears all three method columns (list-only: Views 3/7 INCOMPLETE flag).
   * - `paste`    → user-provided method text, tag METHOD (no inferred source).
   * - `inferred` → accepted matched family method, tag INFERRED + named source (ERD: required).
   * One-writer rule (ADR §2): this service is the sole writer of the `recipe` table.
   */
  async attachMethod(actor: Actor, recipeId: string, input: MethodAttachInput): Promise<MethodState> {
    await this.assertOwned(actor, recipeId);
    const data: Prisma.RecipeUncheckedUpdateInput = {};
    switch (input.mode) {
      case 'none':
        data.methodText = null;
        data.methodSourceTag = null;
        data.methodInferredSource = null;
        break;
      case 'paste':
        data.methodText = input.methodText;
        data.methodSourceTag = 'METHOD';
        data.methodInferredSource = null;
        break;
      case 'inferred':
        data.methodText = input.methodText;
        data.methodSourceTag = 'INFERRED';
        data.methodInferredSource = input.methodSource;
        break;
    }
    const updated = await this.prisma.recipe.update({ where: { id: recipeId }, data });
    return toMethodState(updated);
  }

  /** D-17 (P3-3): read-only method state — the API §5 422 METHOD_REQUIRED gate
   *  (list-only analysis) and the job-payload capture both read this. */
  async getMethodState(actor: Actor, recipeId: string): Promise<MethodState> {
    const recipe = await this.assertOwned(actor, recipeId);
    return toMethodState(recipe);
  }

  /**
   * D-22 (D1): the identification family from the latest CURRENT analysis — the
   * canonical default name source. The ERD puts identification on `analysis`
   * (`analysis.family`); the worker has never populated that column (Q9 stub world
   * writes the view-5 payload), so BOTH are read, frozen-schema-gated:
   * analysis.family column first, then the persisted View 5 payload.
   * Read-only — the worker remains the sole writer of analysis_* (one-writer).
   */
  async identificationFamily(recipeId: string): Promise<string | null> {
    const current = await this.prisma.analysis.findFirst({
      where: { recipeId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, family: true },
    });
    if (!current) return null;
    if (current.family) return current.family;
    const view5 = await this.prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId: current.id, viewNumber: 5 } },
      select: { payload: true },
    });
    if (!view5) return null;
    const parsed = View5PayloadSchema.safeParse(view5.payload);
    if (!parsed.success) return null;
    return parsed.data.family;
  }

  /**
   * D-22 (D1): the canonical Save — the artifact set already persists in the
   * existing rows (recipe + inputs + lines + analyses); Save normalizes the name
   * (D-10 placeholder → family-defaulted, editable title) and confirms the set.
   * No new columns (ERD has none): `updated_at` is the save stamp, and the ERD's
   * own ix_recipe_account_updated index orders the library.
   * Guests may save (A1 TC-02 seam): the row + save state ride the QA-B2 claim
   * transaction onto the account — that is the resume-save path.
   */
  async saveRecipe(
    actor: Actor,
    recipeId: string,
    input: { title?: string },
  ): Promise<SavedRecipeWire> {
    const recipe = await this.assertOwned(actor, recipeId);
    const family = await this.identificationFamily(recipeId);
    const given = input.title?.trim() ?? '';
    const hasPlaceholder = recipe.title === UNTITLED_RECIPE;
    const title =
      given.length > 0
        ? given
        : hasPlaceholder
          ? (family ?? UNTITLED_RECIPE)
          : recipe.title;
    if (title !== recipe.title) {
      await this.prisma.recipe.update({ where: { id: recipeId }, data: { title } });
    }
    const [lineCount, analysisId, updated] = await Promise.all([
      this.prisma.recipeIngredientLine.count({
        where: { recipeId, deletedAt: null, isHeader: false },
      }),
      this.prisma.analysis.findFirst({
        where: { recipeId, isCurrent: true, status: 'complete' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
      this.prisma.recipe.findUniqueOrThrow({ where: { id: recipeId }, select: { updatedAt: true } }),
    ]);
    return {
      recipe_id: recipeId,
      title,
      saved_at: updated.updatedAt.toISOString(),
      artifacts: {
        raw_input: recipe.rawText != null,
        photo: recipe.photoUri != null,
        object: lineCount > 0,
        identification: family != null,
        analysis: analysisId != null,
        timestamps: true,
      },
    };
  }

  /**
   * RS-US servings: persist the resolved serving/yield count. `estimated` marks
   * an LLM estimate (never a stated fact) — the UI shows it as "about N" rather
   * than "makes N". One-writer rule: this service is the sole writer of `recipe`.
   */
  async setServings(
    actor: Actor,
    recipeId: string,
    servings: number | null,
    estimated: boolean,
  ): Promise<void> {
    await this.assertOwned(actor, recipeId);
    await this.prisma.recipe.update({
      where: { id: recipeId },
      data: { servings, servingsEstimated: estimated },
    });
  }

  /**
   * D-22 (D6): the canonical hard DELETE (ERD §13 — `deleted_at` is archive/hide
   * only; D6 is a real row removal). Every dependent row disappears through the
   * DB-level ON DELETE CASCADE foreign keys (proven in the D6 integration story):
   * recipe_input, recipe_ingredient_line, recipe_tag, analysis → analysis_view →
   * analysis_claim + analysis_station_card, shopping_list_generation(+items),
   * ingredient_shopping_state, cook_log(+swaps/photos). INV-17: 404 for missing
   * AND foreign AND malformed ids (assertOwned); a repeated delete is the same
   * canonical 404 — no existence leak, no duplicate-deletion state.
   *
   * Storage (ADR §3/§16): asset keys are collected BEFORE the delete; the DB
   * delete commits first, then per-object deletion runs as compensating,
   * retry-safe cleanup (an orphaned object is recoverable, a dangling URI is
   * not — hence DB-first; no distributed transaction invented). Residue is
   * never hidden: failed keys are logged as a structured warning.
   */
  async deleteRecipe(actor: Actor, recipeId: string): Promise<void> {
    await this.assertOwned(actor, recipeId);
    await this.deleteRecipeInternal(recipeId);
  }

  /**
   * D-27 (P7-3): the SAME DB-first cascade + compensating storage cleanup as
   * deleteRecipe, WITHOUT the actor gate — callable only by the scheduled
   * guest-expiry sweep (never an HTTP surface). Returns the storage keys that
   * could not be confirmed deleted (retry-safe residue, already logged).
   * Q11 pilot default labels the TTL; Q15 photo retention stays OPEN.
   */
  async deleteRecipeInternal(recipeId: string): Promise<string[]> {
    const keys = await this.collectAssetKeys(recipeId);
    await this.prisma.recipe.delete({ where: { id: recipeId } });
    if (!this.storage) return [];
    const failed: string[] = [];
    for (const key of keys) {
      const ok = await this.storage.tryDeleteObject(key);
      if (!ok) failed.push(key);
    }
    if (failed.length > 0) {
      // Observable residue (ADR §16): retry-safe orphans, never silent.
      this.logger.warn(
        `recipe ${recipeId} deleted; storage cleanup residue remains (retry-safe): ${failed.join(', ')}`,
      );
    }
    return failed;
  }

  /** Asset keys owned by the recipe subtree — recipe photo, raw-input photos,
   *  cook-log photos. Only keys under our own s3://<bucket>/ prefix are ever
   *  returned (never arbitrary keys). */
  private async collectAssetKeys(recipeId: string): Promise<string[]> {
    if (!this.storage) return [];
    const prefix = `s3://${this.storage.bucket}/`;
    const [recipe, inputs, logs] = await Promise.all([
      this.prisma.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        select: { photoUri: true },
      }),
      this.prisma.recipeInput.findMany({
        where: { recipeId },
        select: { photoUri: true },
      }),
      this.prisma.cookLog.findMany({
        where: { recipeId },
        select: { id: true },
      }),
    ]);
    const logIds = logs.map((l) => l.id);
    const cookPhotos =
      logIds.length === 0
        ? []
        : await this.prisma.cookLogPhoto.findMany({
            where: { cookLogId: { in: logIds } },
            select: { photoUri: true },
          });
    const uris = [
      recipe.photoUri,
      ...inputs.map((i) => i.photoUri),
      ...cookPhotos.map((p) => p.photoUri),
    ].filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
    return uris
      .filter((uri) => uri.startsWith(prefix))
      .map((uri) => uri.slice(prefix.length));
  }

  /**
   * D-22 (D2): the account library — persisted rows, never browser state.
   * Rows carry exactly the canonical D2 AC-1 fields: name (title), date
   * (created_at), family (identification), has_cook_log (EXISTS on the live
   * cook_log table) — plus D-24 F1 AC-3: last_cooked_at (the newest
   * cook_log.cooked_at, date-only, null when never cooked). Ordered by the
   * ERD's own index (updated_at DESC).
   * Account-only by construction — INV-17 cross-account isolation holds.
   */
  async listLibrary(actor: Actor): Promise<LibraryRecipeRow[]> {
    if (actor.kind !== 'user') return []; // the canonical library is account-owned (D-22D)
    const recipes = await this.prisma.recipe.findMany({
      where: { accountId: actor.user.accountId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, photoUri: true },
    });
    return this.toLibraryRows(recipes);
  }

  /** Shared enrichment for library + search: family, cook-log indicator, the
   *  D-24 last_cooked_at stamp, and the dashboard read-model extras (photo,
   *  analysis presence, latest shopping-list generation). Read-only. */
  private async toLibraryRows(
    recipes: Array<{ id: string; title: string; createdAt: Date; photoUri: string | null }>,
  ): Promise<LibraryRecipeRow[]> {
    const ids = recipes.map((r) => r.id);
    // Batch the existence lookups — one round-trip each, then join in memory.
    const [analysisRows, listRows] = await Promise.all([
      ids.length === 0
        ? []
        : this.prisma.analysis.findMany({
            where: { recipeId: { in: ids } },
            select: { recipeId: true },
          }),
      ids.length === 0
        ? []
        : this.prisma.shoppingListGeneration.findMany({
            where: { recipeId: { in: ids } },
            orderBy: { generatedAt: 'desc' },
            select: { recipeId: true, generatedAt: true },
          }),
    ]);
    const analysed = new Set(analysisRows.map((a) => a.recipeId));
    const latestList = new Map<string, Date>();
    for (const row of listRows) {
      if (!latestList.has(row.recipeId)) latestList.set(row.recipeId, row.generatedAt);
    }
    return Promise.all(
      recipes.map(async (recipe) => {
        const lastLog = await this.prisma.cookLog.findFirst({
          where: { recipeId: recipe.id },
          orderBy: [{ cookedAt: 'desc' }, { createdAt: 'desc' }],
          select: { cookedAt: true },
        });
        return {
          recipe_id: recipe.id,
          name: recipe.title,
          date: recipe.createdAt.toISOString(),
          family: await this.identificationFamily(recipe.id),
          has_cook_log: lastLog !== null,
          last_cooked_at: lastLog ? lastLog.cookedAt.toISOString().slice(0, 10) : null,
          photo_uri: recipe.photoUri,
          has_analysis: analysed.has(recipe.id),
          has_shopping_list: latestList.has(recipe.id),
          shopping_list_generated_at: latestList.has(recipe.id)
            ? latestList.get(recipe.id)!.toISOString()
            : null,
        };
      }),
    );
  }

  /**
   * D-25 (D3): search the account library across the three axes — name (title),
   * ingredients (active line display names), and tags (recipe_tag). Account-only
   * (INV-17); an empty query returns the whole library. Same canonical row shape
   * as the library so the UI reuses one list.
   */
  async search(actor: Actor, query: string): Promise<LibraryRecipeRow[]> {
    if (actor.kind !== 'user') return [];
    const q = query.trim();
    if (q.length === 0) return this.listLibrary(actor);
    const recipes = await this.prisma.recipe.findMany({
      where: {
        accountId: actor.user.accountId,
        deletedAt: null,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          {
            lines: {
              some: { displayName: { contains: q, mode: 'insensitive' }, deletedAt: null, isHeader: false },
            },
          },
          { tags: { some: { tagText: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, photoUri: true },
    });
    return this.toLibraryRows(recipes);
  }

  /**
   * D-25 (D3): replace the recipe's tag set (free-text). The recipes module is
   * the SOLE recipe_tag writer (QG2 gate 2g). Tags are trimmed, de-duplicated,
   * length-capped (VARCHAR(100)) and count-capped (MAX_RECIPE_TAGS). Wholesale
   * replace — the tag set is the editable surface, never a log.
   */
  async setTags(actor: Actor, recipeId: string, tags: string[]): Promise<string[]> {
    await this.assertOwned(actor, recipeId);
    const normalized = [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
    if (normalized.some((t) => t.length > MAX_TAG_LENGTH)) {
      throw new BadRequestException({
        code: 'INVALID_TAG',
        message: `tags must be at most ${MAX_TAG_LENGTH} characters`,
      });
    }
    if (normalized.length > MAX_RECIPE_TAGS) {
      throw new BadRequestException({
        code: 'INVALID_TAG',
        message: `at most ${MAX_RECIPE_TAGS} tags per recipe`,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.recipeTag.deleteMany({ where: { recipeId } });
      if (normalized.length > 0) {
        await tx.recipeTag.createMany({
          data: normalized.map((tagText) => ({ recipeId, tagText })),
          skipDuplicates: true,
        });
      }
    });
    return normalized;
  }

  /** D-25 (D3): the persisted tag set, sorted (read-only). */
  async listTags(actor: Actor, recipeId: string): Promise<string[]> {
    await this.assertOwned(actor, recipeId);
    const tags = await this.prisma.recipeTag.findMany({
      where: { recipeId },
      orderBy: { tagText: 'asc' },
      select: { tagText: true },
    });
    return tags.map((t) => t.tagText);
  }
}
