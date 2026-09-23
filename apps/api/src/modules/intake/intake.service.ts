// Intake service — the SOLE logical writer of `recipe_input` and
// `recipe_ingredient_line` (Q4 resolved 2026-09-08; one-writer rule ADR §2; INV-03).
//
// IMMUTABILITY (D-10 done criterion): `recipe_input` rows are write-once. This service
// intentionally exposes NO update/delete/upsert method for recipe_input — the absence is
// grep-provable and enforced by the "recipe_input immutability" regression gate.
//
// D-12 (parse review, TEXT scope — decision trace HANDOFF §5 2026-09-09): every
// draft-line mutation (edit/add/delete/split/merge, header marking, sense confirmation)
// lives here, under the Intake writer boundary. Stale-edit rejection is optimistic
// locking on `updated_at` (D-12D). `is_header: true` soft-deletes the line (D-12C:
// ERD v13 has no header column; Recipe_Systems §12 — corrected object has no headers).

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, RecipeIngredientLine, RecipeInput } from '@recipe-systems/database';
import { OcrAdapter, OcrResult } from '@recipe-systems/ocr-adapter';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService } from '../recipes/recipe.service';
import { OCR_ADAPTER } from '../ocr/ocr.module';
import { parseAmountAndUnit, extractAmountFromDisplayName, extractServings } from './amount-parser';

/** D-11 (P2-2): conservative low-confidence threshold (0–1). Missing confidence
 *  is always flagged (Tech Stack §11: never invent a score). Not canonical — a
 *  named pilot constant. */
export const OCR_CONFIDENCE_THRESHOLD = 0.9;

/** D-11: the OCR intake outcome. `pending` = provider failure (503 retryable);
 *  `unreadable` = valid provider result with no text (422); `disabled` = no
 *  adapter configured (no draft lines produced). */
export interface OcrIntakeResult {
  status: 'complete' | 'pending' | 'unreadable' | 'disabled';
  draft_line_count: number;
  flagged_count: number;
  source_metadata: Record<string, unknown> | null;
  /** Best-effort dish title transcribed from the card (null when absent). */
  title: string | null;
}

/** Strip a leading list serial ("1.", "1)", "No. 1", "S.No 1:") from a
 *  transcribed title so a numbered menu card yields the bare dish name. */
function stripSerialPrefix(title: string): string {
  return title
    .replace(
      /^(?:s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|serial\s*no\.?|no\.?)\s*[:.\-–]?\s*\d+\s*[.):\-–]?\s*/i,
      '',
    )
    .replace(/^\s*\d+\s*(?:[.):]|\s*[-–]\s+)\s*/, '')
    .trim();
}

/**
 * Wire shape per API doc §3 + D-12B: `id` and `updated_at` added for line addressing and
 * the stale-edit token; `amount` = amount_text (display), `quantity` = parsed amount,
 * `category` = group_name; `canonical_name` stays null until D-29; `is_header` mirrors the
 * row's D-1 header flag (headers are excluded from the corrected object — D-12C).
 */
export interface WireLine {
  id: string;
  display_name: string;
  canonical_name: string | null;
  /** D-25 B6: true when the line's ingredient matched an alias with
   *  `requires_confirmation` (ambiguous — the UI asks before the canonical is
   *  committed via confirmed_sense). Distinct from needs_review (OCR/D-11). */
  requires_confirmation: boolean;
  amount: string | null;
  unit: string | null;
  quantity: number | null;
  category: string | null;
  is_header: boolean;
  include_on_list: boolean;
  confirmed_sense: string | null;
  /** D-14C surface (QA-B6 fix): the web renders the Review-required badge and the
   *  canonical Clear-review action off this flag — it must ride the wire. */
  needs_review: boolean;
  /** D-11 (B2): the OCR confidence for card-derived lines (0–1, or null when the
   *  line did not come from OCR / the provider exposed no confidence). */
  ocr_confidence: number | null;
  /** Provenance tag (six-value vocabulary: CARD/METHOD/INFERRED/ABSENT/UNKNOWN/
   *  ASSUMED). OCR-derived lines carry CARD. */
  source_tag: string | null;
  updated_at: string;
}

export function splitRawLines(rawText: string): string[] {
  // D-12 segmentation: one draft line per newline-delimited raw line OR per
  // semicolon-delimited clause (single-line pastes like
  // "1 lb ground beef; 1 onion, chopped; ..." segment into distinct draft
  // lines). Semantic-free: no amount/unit/sense resolution happens here
  // (those stay in later D-12 stages), and the raw input itself is NEVER
  // mutated — recordPaste stores the original text byte-for-byte before
  // segmentation.
  return rawText
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** D-10A (B5): one structured form entry — the same corrected-object fields as
 *  paste/photo draft lines. `amountText` carries the free-text amount ("500g",
 *  "2 tsp", "to taste", "half shell", … — B5 AC-2). */
export interface FormLineEntry {
  displayName: string;
  amountText?: string | null;
  unit?: string | null;
  amount?: number | null;
  groupName?: string | null;
}

/** D-10A (B5): the synthesized raw text a form entry set renders to — the
 *  recipe_input.raw_text / recipe.raw_text columns carry the form's own words
 *  (verbatim, one "Name — Amount" line per entry). */
export function formRawText(entries: FormLineEntry[]): string {
  return entries
    .map((e) => `${e.displayName}${e.amountText ? ` — ${e.amountText}` : ''}`)
    .join('\n');
}

export function toWireLine(line: RecipeIngredientLine): WireLine {
  return {
    id: line.id,
    display_name: line.displayName,
    canonical_name: null, // D-25 B6 fills this via resolveWireLines (dictionary/alias read-only)
    requires_confirmation: false,
    amount: line.amountText,
    unit: line.unit,
    quantity: line.amount != null ? Number(line.amount) : null,
    category: line.groupName,
    is_header: line.isHeader ?? false,
    include_on_list: line.includeOnList,
    confirmed_sense: line.confirmedSense,
    needs_review: line.needsReview,
    ocr_confidence: line.ocrConfidence != null ? Number(line.ocrConfidence) : null,
    source_tag: line.sourceTag ?? null,
    updated_at: line.updatedAt.toISOString(),
  };
}

/** D-25 B6: the resolution outcome for one line. */
export interface AliasResolution {
  canonicalName: string;
  requiresConfirmation: boolean;
}

/** Match keys are normalized (lowercase); canonical snake_case names also resolve
 *  through their display form (underscores → spaces: "curry_leaves" → "curry leaves"). */
function canonicalMatchKeys(canonicalName: string): string[] {
  const raw = canonicalName.toLowerCase();
  const display = canonicalName.replace(/_/g, ' ').toLowerCase();
  return display === raw ? [raw] : [raw, display];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * D-25 B6: build the alias/canonical resolution map (read-only). Alias entries
 * win over canonical entries for the same key so that a `requires_confirmation`
 * alias ("drumstick" → drumstick) is authoritative over the identical canonical.
 */
export function buildResolutionMap(
  aliases: Array<{ aliasText: string; requiresConfirmation: boolean; ingredient: { canonicalName: string } }>,
  canonicals: Array<{ canonicalName: string }>,
): Map<string, AliasResolution> {
  const map = new Map<string, AliasResolution>();
  for (const c of canonicals) {
    for (const key of canonicalMatchKeys(c.canonicalName)) {
      if (!map.has(key)) {
        map.set(key, { canonicalName: c.canonicalName, requiresConfirmation: false });
      }
    }
  }
  for (const a of aliases) {
    map.set(a.aliasText.toLowerCase(), {
      canonicalName: a.ingredient.canonicalName,
      requiresConfirmation: a.requiresConfirmation,
    });
  }
  return map;
}

/** Longest-match-first, whole-word lookup of the display name in the map. */
function resolveDisplayName(displayName: string, map: Map<string, AliasResolution>): AliasResolution | null {
  const norm = displayName.toLowerCase();
  let best: AliasResolution | null = null;
  let bestLen = -1;
  for (const [key, res] of map) {
    if (key.length <= bestLen) continue;
    if (new RegExp(`\\b${escapeRegex(key)}\\b`).test(norm)) {
      best = res;
      bestLen = key.length;
    }
  }
  return best;
}

/** D-25 B6: annotate a wire line with the resolved canonical + confirmation flag. */
export function toWireLineResolved(
  line: RecipeIngredientLine,
  map: Map<string, AliasResolution>,
): WireLine {
  const wire = toWireLine(line);
  const resolution = resolveDisplayName(line.displayName, map);
  if (resolution) {
    wire.canonical_name = resolution.canonicalName;
    wire.requires_confirmation = resolution.requiresConfirmation;
  }
  return wire;
}

/** D-12 line patch fields (wire names already mapped by the controller). */
export interface LinePatch {
  displayName?: string;
  amountText?: string | null;
  unit?: string | null;
  amount?: number | null; // wire "quantity"
  groupName?: string | null; // wire "category"
  confirmedSense?: string | null;
  includeOnList?: boolean;
  /** D-14C: explicit review confirmation. Literal `false` only — clients can never SET
   *  needs_review (OCR/D-11 owns true); clearing is a deliberate user action, never
   *  automatic and never implied by another edit (D-14: no auto-clear). */
  needsReview?: false;
}

/** D-14A: the single enqueue-completeness check (A-14: P3's enqueue must reuse THIS —
 *  no duplicate implementations). Read-only; the canonical flag only (no shadow state).
 *  Field names are the WIRE shape (snake_case, same convention as D-13 MethodState). */
export interface EnqueueState {
  can_enqueue: boolean;
  blockers: Array<{ line_id: string; display_name: string }>;
}

@Injectable()
export class IntakeService implements OnModuleInit {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly recipes: RecipeService,
    /** D-11: the OCR adapter (null = OCR disabled). Intake remains the sole
     *  writer of recipe_input / recipe_ingredient_line; the adapter is read-only. */
    @Optional() @Inject(OCR_ADAPTER) private readonly ocr?: OcrAdapter | null,
  ) {}

  async onModuleInit(): Promise<void> {
    // Non-blocking background backfill for existing recipes created before amount parsing
    this.backfillMissingAmounts().catch(() => undefined);
  }

  /** Backfills numeric amount and unit for lines that only have amount_text. */
  async backfillMissingAmounts(): Promise<number> {
    try {
      const lines = await this.prisma.recipeIngredientLine.findMany({
        where: {
          deletedAt: null,
          amount: null,
          amountText: { not: null },
        },
        select: {
          id: true,
          amountText: true,
          unit: true,
        },
        take: 1000,
      });

      let updatedCount = 0;
      for (const line of lines) {
        if (!line.amountText) continue;
        const parsed = parseAmountAndUnit(line.amountText);
        if (parsed.amount != null || (line.unit == null && parsed.unit != null)) {
          await this.prisma.recipeIngredientLine
            .update({
              where: { id: line.id },
              data: {
                ...(parsed.amount != null ? { amount: new Prisma.Decimal(parsed.amount) } : {}),
                ...(line.unit == null && parsed.unit != null ? { unit: parsed.unit } : {}),
              },
            })
            .catch(() => undefined);
          updatedCount++;
        }
      }
      return updatedCount;
    } catch {
      return 0;
    }
  }

  /** INV-17 + D-10 ownership enforcement: intake never writes rows for a recipe the
   *  actor does not own. */
  private assertOwned(actor: Actor, recipeId: string): Promise<void> {
    return this.recipes.assertOwned(actor, recipeId).then(() => undefined);
  }

  /** B1 paste: raw row (untouched text) + one draft line per non-empty raw line. */
  async recordPaste(actor: Actor, recipeId: string, rawText: string): Promise<RecipeInput> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.$transaction(async (tx) => {
      const input = await tx.recipeInput.create({
        data: { recipeId, inputType: 'paste', rawText },
      });
      await this.createDraftLinesInTx(tx, recipeId, rawText);
      return input;
    });
  }

  /** B2 photo: raw row carrying ONLY the object-storage URI (ADR §3 — never the blob). */
  async recordPhoto(actor: Actor, recipeId: string, photoUri: string): Promise<RecipeInput> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeInput.create({
      data: { recipeId, inputType: 'photo', photoUri },
    });
  }

  /**
   * D-11 (P2-2): run OCR over an uploaded card image and persist the OCR draft.
   * OCR is orchestrated by Intake (ADR §2 Decision 3) — the adapter is read-only.
   *
   * Failure contract (QG4 + pre-flight 2026-09-08):
   *  - provider timeout/down/malformed → `pending` (503 retryable; the uploaded
   *    photo + recipe_input row are already durable, nothing OCR-specific persisted);
   *  - valid provider result with no text → `unreadable` (422 OCR_UNREADABLE);
   *  - no adapter configured → `disabled` (no draft lines produced).
   */
  async ocrPhoto(
    actor: Actor,
    recipeId: string,
    inputId: string,
    image: Uint8Array,
    contentType: string,
  ): Promise<OcrIntakeResult> {
    await this.assertOwned(actor, recipeId);
    if (!this.ocr) {
      return { status: 'disabled', draft_line_count: 0, flagged_count: 0, source_metadata: null, title: null };
    }

    let result: OcrResult;
    try {
      result = await this.ocr.recognize(image, contentType);
    } catch {
      return { status: 'pending', draft_line_count: 0, flagged_count: 0, source_metadata: null, title: null };
    }

    const title = stripSerialPrefix(result.title ?? '') || null;

    // Structured providers separate ingredients from method steps; transcription-
    // only providers leave `kind` unset and every line is treated as an ingredient.
    const ingredientLines = result.lines.filter((l) => l.kind !== 'method');
    if (ingredientLines.length === 0) {
      return { status: 'unreadable', draft_line_count: 0, flagged_count: 0, source_metadata: null, title };
    }

    const { draftCount, flaggedCount } = await this.persistOcrDraft(inputId, recipeId, result);

    // Method steps ride the recipe's method column (the Method workspace section),
    // not the ingredient list. Best-effort: a failed attach leaves the durable
    // ingredient draft intact and the user can re-attach the method manually.
    const methodSteps = result.lines
      .filter((l) => l.kind === 'method')
      .map((l) => l.text.trim())
      .filter((t) => t.length > 0);
    if (methodSteps.length > 0) {
      await this.recipes.attachMethod(actor, recipeId, { mode: 'paste', methodText: methodSteps.join('\n\n') });
    }

    return {
      status: 'complete',
      draft_line_count: draftCount,
      flagged_count: flaggedCount,
      source_metadata: result.source_metadata,
      title,
    };
  }

  /** D-11: persist the OCR draft — write-once `ocr_text` (P1 immutability
   *  amendment: updateMany guarded by `ocrText: null`) + one draft line per OCR
   *  line, low-confidence lines flagged (INV-04: never dropped). */
  private async persistOcrDraft(
    inputId: string,
    recipeId: string,
    result: OcrResult,
  ): Promise<{ draftCount: number; flaggedCount: number }> {
    const threshold = this.ocrConfidenceThreshold();
    const ingredientLines = result.lines.filter((l) => l.kind !== 'method');
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeInput.updateMany({
        where: { id: inputId, ocrText: null },
        data: { ocrText: result.recognized_text },
      });

      const data = ingredientLines.map((line, index) => {
        const low = line.confidence === undefined || line.confidence < threshold;
        const textToParse = line.amountText ?? extractAmountFromDisplayName(line.text);
        const parsed = textToParse ? parseAmountAndUnit(textToParse) : { amount: null, unit: null };
        return {
          recipeId,
          shoppingKey: randomUUID(),
          lineNo: index + 1,
          displayName: line.text, // the card's own words as OCR'd (sourceTag CARD)
          amountText: line.amountText ?? extractAmountFromDisplayName(line.text) ?? null, // structured providers split name/amount
          amount: parsed.amount != null ? parsed.amount : null,
          unit: parsed.unit ?? null,
          sourceTag: 'CARD',
          ocrConfidence: line.confidence ?? null,
          needsReview: low,
          includeOnList: true,
        };
      });
      const created = await tx.recipeIngredientLine.createMany({ data });
      return { draftCount: created.count, flaggedCount: data.filter((d) => d.needsReview).length };
    });
  }

  /** D-11: the conservative low-confidence threshold (named pilot constant). */
  ocrConfidenceThreshold(): number {
    return OCR_CONFIDENCE_THRESHOLD;
  }

  /** B5 form: same persisted object as paste/photo (ERD chk_recipe_input_type).
   *  Service-level only for D-10: API doc §3 defines no form HTTP route yet. */
  async recordForm(actor: Actor, recipeId: string, rawText: string): Promise<RecipeInput> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeInput.create({
      data: { recipeId, inputType: 'form', rawText },
    });
  }

  /** B5 form intake (D-10A): raw row (`input_type = 'form'`) + one draft line
   *  per structured entry. The review/analysis flow then reads the draft lines
   *  EXACTLY as for paste/photo — the form and paste produce the same object
   *  (B5 AC-1). No schema change; Intake remains the sole writer. */
  async recordFormLines(
    actor: Actor,
    recipeId: string,
    entries: FormLineEntry[],
  ): Promise<RecipeInput> {
    await this.assertOwned(actor, recipeId);
    const rawText = formRawText(entries);
    return this.prisma.$transaction(async (tx) => {
      const input = await tx.recipeInput.create({
        data: { recipeId, inputType: 'form', rawText },
      });
      const creates = entries.map((entry, index) => {
        const parsed =
          (entry.amount == null || entry.unit == null) && entry.amountText
            ? parseAmountAndUnit(entry.amountText)
            : null;
        const amount = entry.amount !== undefined && entry.amount !== null ? entry.amount : (parsed?.amount ?? null);
        const unit = entry.unit !== undefined && entry.unit !== null ? entry.unit : (parsed?.unit ?? null);
        return tx.recipeIngredientLine.create({
          data: {
            recipeId,
            shoppingKey: randomUUID(),
            lineNo: index + 1,
            displayName: entry.displayName,
            amountText: entry.amountText ?? null,
            unit,
            amount,
            groupName: entry.groupName ?? null,
            sourceTag: 'CARD',
            needsReview: false,
            includeOnList: true,
          },
        });
      });
      await Promise.all(creates);
      return input;
    });
  }

  /** Draft-line creation through the Intake module ONLY (Q4). */
  async createDraftLines(actor: Actor, recipeId: string, rawText: string): Promise<RecipeIngredientLine[]> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.$transaction(async (tx) => this.createDraftLinesInTx(tx, recipeId, rawText));
  }

  private createDraftLinesInTx(
    tx: Prisma.TransactionClient,
    recipeId: string,
    rawText: string,
  ): Promise<RecipeIngredientLine[]> {
    const rawLines = splitRawLines(rawText);
    const creates = rawLines.map((text, index) => {
      const extracted = extractAmountFromDisplayName(text);
      const parsed = extracted ? parseAmountAndUnit(extracted) : { amount: null, unit: null };
      return tx.recipeIngredientLine.create({
        data: {
          recipeId,
          shoppingKey: randomUUID(),
          lineNo: index + 1,
          displayName: text, // verbatim: B1 mixed units / "to taste" / vernacular names
          amountText: extracted ?? null,
          amount: parsed.amount != null ? parsed.amount : null,
          unit: parsed.unit ?? null,
          sourceTag: 'CARD', // D-10 decision: draft lines carry the card's own words
          needsReview: false, // low-confidence flagging is OCR work (D-11, deferred)
          includeOnList: true,
        },
      });
    });
    return Promise.all(creates);
  }

  /** Non-deleted INGREDIENT lines in card order — the corrected object (D-12C):
   *  header lines (is_header) are excluded from analysis, shopping and print. */
  async listDraftLines(actor: Actor, recipeId: string): Promise<RecipeIngredientLine[]> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeIngredientLine.findMany({
      where: { recipeId, deletedAt: null, isHeader: false },
      orderBy: { lineNo: 'asc' },
    });
  }

  /** D-1 remediation: the parse-review surface — active lines INCLUDING headers,
   *  so the UI can render them distinctly and offer unmark. The corrected
   *  object still reads `listDraftLines` (ingredients only). */
  async listReviewLines(actor: Actor, recipeId: string): Promise<RecipeIngredientLine[]> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeIngredientLine.findMany({
      where: { recipeId, deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
  }

  /** D-25 B6: load the alias/canonical resolution map (read-only — dictionary and
   *  alias writes stay with the D-29 admin module, Q5 working assumption). */
  private async loadResolutionMap(): Promise<Map<string, AliasResolution>> {
    const [aliases, canonicals] = await Promise.all([
      this.prisma.ingredientAlias.findMany({
        select: {
          aliasText: true,
          requiresConfirmation: true,
          ingredient: { select: { canonicalName: true } },
        },
      }),
      this.prisma.ingredientDictionary.findMany({ select: { canonicalName: true } }),
    ]);
    return buildResolutionMap(aliases, canonicals);
  }

  /** D-25 B6: annotate draft lines with the resolved canonical + confirmation flag
   *  (the parse-review wire; the analysis capture stays verbatim — Q5/Track R). */
  async resolveWireLines(lines: RecipeIngredientLine[]): Promise<WireLine[]> {
    const map = await this.loadResolutionMap();
    return lines.map((line) => toWireLineResolved(line, map));
  }

  /** RS-US servings: the stated serving/yield count detected from the recipe's
   *  raw text OR its OCR'd text (deterministic, source-faithful — no inference). */
  async getServings(actor: Actor, recipeId: string): Promise<number | null> {
    await this.assertOwned(actor, recipeId);
    const [recipe, input] = await Promise.all([
      this.prisma.recipe.findUnique({ where: { id: recipeId }, select: { rawText: true } }),
      this.prisma.recipeInput.findFirst({
        where: { recipeId, ocrText: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { ocrText: true },
      }),
    ]);
    return extractServings(recipe?.rawText ?? null) ?? extractServings(input?.ocrText ?? null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D-12 parse review (text scope) — all mutations stay inside Intake (Q4)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Load an ACTIVE line of a recipe the actor owns; missing/foreign → 404 (INV-17 shape). */
  private async getOwnedLine(actor: Actor, recipeId: string, lineId: string): Promise<RecipeIngredientLine> {
    await this.assertOwned(actor, recipeId);
    const line = await this.prisma.recipeIngredientLine.findFirst({
      where: { id: lineId, recipeId, deletedAt: null },
    });
    if (!line) {
      throw new NotFoundException({ code: 'LINE_NOT_FOUND', message: 'Line not found' });
    }
    return line;
  }

  /** D-12D: optimistic lock on updated_at — the client echoes the value it read. */
  private assertNotStale(line: RecipeIngredientLine, expectedUpdatedAt: string): void {
    if (Date.parse(expectedUpdatedAt) !== line.updatedAt.getTime()) {
      throw new ConflictException({
        code: 'STALE_EDIT',
        message: 'This line changed since you loaded it — reload and merge your edit',
        details: { current_line: toWireLine(line) },
      });
    }
  }

  /** B3 AC-1: edit a line's review fields (amount parsing fields are user-provided). */
  async updateLine(
    actor: Actor,
    recipeId: string,
    lineId: string,
    patch: LinePatch,
    expectedUpdatedAt: string,
  ): Promise<RecipeIngredientLine> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    const data: Prisma.RecipeIngredientLineUpdateInput = {
      displayName: patch.displayName,
      amountText: patch.amountText,
      unit: patch.unit,
      groupName: patch.groupName,
      confirmedSense: patch.confirmedSense,
      includeOnList: patch.includeOnList,
    };
    if (patch.amount !== undefined) {
      data.amount = patch.amount === null ? null : new Prisma.Decimal(patch.amount);
    } else if (patch.amountText !== undefined) {
      const parsed = parseAmountAndUnit(patch.amountText);
      data.amount = parsed.amount != null ? new Prisma.Decimal(parsed.amount) : null;
      if (patch.unit === undefined && parsed.unit != null) {
        data.unit = parsed.unit;
      }
    }
    if (patch.needsReview === false) {
      // D-14C: explicit user confirmation — the ONLY path that clears the flag.
      data.needsReview = false;
    }
    return this.prisma.recipeIngredientLine.update({ where: { id: lineId }, data });
  }

  /** B3 AC-2 header marking (D-12C, D-1 remediation): is_header=true marks the line
   *  as a header — excluded from the corrected object, shopping and print, but kept
   *  visible + reversible in review. The raw text stays byte-unchanged in recipe_input. */
  async markHeader(
    actor: Actor,
    recipeId: string,
    lineId: string,
    expectedUpdatedAt: string,
  ): Promise<RecipeIngredientLine> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    return this.prisma.recipeIngredientLine.update({
      where: { id: lineId },
      data: { isHeader: true },
    });
  }

  /** D-1 remediation: undo header marking — the line returns to the ingredient
   *  set (is_header=false). */
  async unmarkHeader(
    actor: Actor,
    recipeId: string,
    lineId: string,
    expectedUpdatedAt: string,
  ): Promise<RecipeIngredientLine> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    return this.prisma.recipeIngredientLine.update({
      where: { id: lineId },
      data: { isHeader: false },
    });
  }

  /** B3 AC-1 delete — soft-delete (C-28 trigger keeps shopping state consistent). */
  async softDeleteLine(actor: Actor, recipeId: string, lineId: string): Promise<void> {
    await this.getOwnedLine(actor, recipeId, lineId);
    await this.prisma.recipeIngredientLine.update({
      where: { id: lineId },
      data: { deletedAt: new Date() },
    });
  }

  /** D-14C bulk: clear `needs_review` on every active line in one atomic pass —
   *  the same explicit user confirmation as the per-line path, applied to the
   *  whole draft at once. Returns the number of lines cleared. */
  async clearAllReviews(actor: Actor, recipeId: string): Promise<number> {
    await this.assertOwned(actor, recipeId);
    const result = await this.prisma.recipeIngredientLine.updateMany({
      where: { recipeId, deletedAt: null, needsReview: true },
      data: { needsReview: false },
    });
    return result.count;
  }

  /** D-12E: split a wrap-around line at a 1-based character count. Original soft-deleted;
   *  two fresh draft lines with NEW shopping_keys (C-39) at the original position;
   *  review flags inherited, parse fields reset; downstream line_nos shifted +1. */
  async splitLine(
    actor: Actor,
    recipeId: string,
    lineId: string,
    splitPoint: number,
    expectedUpdatedAt: string,
  ): Promise<[RecipeIngredientLine, RecipeIngredientLine]> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    if (splitPoint < 1 || splitPoint >= line.displayName.length) {
      throw new BadRequestException({
        code: 'INVALID_SPLIT',
        message: 'split_point must leave two non-empty halves',
      });
    }
    const first = line.displayName.slice(0, splitPoint).trim();
    const second = line.displayName.slice(splitPoint).trim();
    if (!first || !second) {
      throw new BadRequestException({
        code: 'INVALID_SPLIT',
        message: 'split_point must leave two non-empty halves',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredientLine.update({ where: { id: lineId }, data: { deletedAt: new Date() } });
      await this.shiftLineNos(tx, recipeId, line.lineNo, +1);
      const [l1, l2] = await Promise.all([
        tx.recipeIngredientLine.create({
          data: {
            recipeId,
            shoppingKey: randomUUID(),
            lineNo: line.lineNo,
            displayName: first,
            sourceTag: 'CARD',
            needsReview: line.needsReview, // review flag inherited — never silently cleared
            includeOnList: line.includeOnList,
          },
        }),
        tx.recipeIngredientLine.create({
          data: {
            recipeId,
            shoppingKey: randomUUID(),
            lineNo: line.lineNo + 1,
            displayName: second,
            sourceTag: 'CARD',
            needsReview: line.needsReview,
            includeOnList: line.includeOnList,
          },
        }),
      ]);
      return [l1, l2] as [RecipeIngredientLine, RecipeIngredientLine];
    });
  }

  /** D-12F: merge with the NEXT active line. display_name = line1 + ' ' + line2 (verbatim);
   *  new shopping_key (C-39); needs_review = OR of both (conservative); ocr_confidence
   *  never carried (fresh draft — no fabricated confidence); downstream line_nos −1. */
  async mergeWithNext(
    actor: Actor,
    recipeId: string,
    lineId: string,
    expectedUpdatedAt: string,
  ): Promise<RecipeIngredientLine> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    const next = await this.prisma.recipeIngredientLine.findFirst({
      where: { recipeId, deletedAt: null, isHeader: false, lineNo: { gt: line.lineNo } },
      orderBy: { lineNo: 'asc' },
    });
    if (!next) {
      throw new BadRequestException({
        code: 'NOTHING_TO_MERGE',
        message: 'No next line to merge with',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredientLine.update({ where: { id: line.id }, data: { deletedAt: new Date() } });
      await tx.recipeIngredientLine.update({ where: { id: next.id }, data: { deletedAt: new Date() } });
      await this.shiftLineNos(tx, recipeId, next.lineNo, -1);
      return tx.recipeIngredientLine.create({
        data: {
          recipeId,
          shoppingKey: randomUUID(),
          lineNo: line.lineNo,
          displayName: `${line.displayName} ${next.displayName}`,
          sourceTag: 'CARD',
          needsReview: line.needsReview || next.needsReview,
          includeOnList: line.includeOnList,
        },
      });
    });
  }

  /** B3 AC-1 add: append a new ingredient line at the end (API doc gives no position). */
  async addLine(
    actor: Actor,
    recipeId: string,
    patch: LinePatch & { displayName: string },
  ): Promise<RecipeIngredientLine> {
    await this.assertOwned(actor, recipeId);
    const max = await this.prisma.recipeIngredientLine.aggregate({
      where: { recipeId },
      _max: { lineNo: true },
    });
    const data: Prisma.RecipeIngredientLineUncheckedCreateInput = {
      recipeId,
      shoppingKey: randomUUID(),
      lineNo: (max._max.lineNo ?? 0) + 1,
      displayName: patch.displayName,
      sourceTag: 'CARD',
      needsReview: false,
      includeOnList: patch.includeOnList ?? true,
      amountText: patch.amountText ?? null,
      unit: patch.unit ?? null,
      groupName: patch.groupName ?? null,
      confirmedSense: patch.confirmedSense ?? null,
    };
    if (patch.amount !== undefined && patch.amount !== null) {
      data.amount = new Prisma.Decimal(patch.amount);
    } else if (patch.amountText) {
      const parsed = parseAmountAndUnit(patch.amountText);
      if (parsed.amount != null) {
        data.amount = new Prisma.Decimal(parsed.amount);
      }
      if (data.unit == null && parsed.unit != null) {
        data.unit = parsed.unit;
      }
    } else {
      const extracted = extractAmountFromDisplayName(patch.displayName);
      if (extracted) {
        const parsed = parseAmountAndUnit(extracted);
        data.amountText = extracted;
        if (parsed.amount != null) {
          data.amount = new Prisma.Decimal(parsed.amount);
        }
        if (data.unit == null && parsed.unit != null) {
          data.unit = parsed.unit;
        }
      }
    }
    return this.prisma.recipeIngredientLine.create({ data });
  }

  /** D-14A / INV-05: the enqueue completeness check. ACTIVE = `deletedAt IS NULL`
   *  (soft-deleted lines never block). Reads the canonical `needs_review` flag only —
   *  no shadow state (A-14). Read-only; ownership enforced via assertOwned (INV-17). */
  async getEnqueueState(actor: Actor, recipeId: string): Promise<EnqueueState> {
    const lines = await this.listDraftLines(actor, recipeId);
    const blockers = lines
      .filter((l) => l.needsReview)
      .map((l) => ({ line_id: l.id, display_name: l.displayName }));
    return { can_enqueue: blockers.length === 0, blockers };
  }

  /** B3 AC-6: the corrected object analysis will read + review status (D-12G);
   *  D-14B: + the shared enqueue state so the UI sees what blocks, line by line. */
  async parsePreview(
    actor: Actor,
    recipeId: string,
  ): Promise<{ status: 'draft' | 'confirmed'; lines: WireLine[]; enqueue: EnqueueState }> {
    const lines = await this.listDraftLines(actor, recipeId);
    const status = lines.some((l) => l.needsReview) ? 'draft' : 'confirmed';
    const enqueue = await this.getEnqueueState(actor, recipeId);
    return { status, lines: await this.resolveWireLines(lines), enqueue };
  }

  /** Shift active line_nos strictly after `afterLineNo` by `delta` (+1/-1) against the
   *  partial unique index (recipe_id, line_no) WHERE deleted_at IS NULL. Order matters:
   *  +1 shifts DOWNWARD (desc) so each row lands in a just-vacated slot; −1 shifts UPWARD
   *  (asc) so each row lands in the vacated slot below it. The opposite order collides. */
  private async shiftLineNos(
    tx: Prisma.TransactionClient,
    recipeId: string,
    afterLineNo: number,
    delta: 1 | -1,
  ): Promise<void> {
    const downstream = await tx.recipeIngredientLine.findMany({
      where: { recipeId, deletedAt: null, lineNo: { gt: afterLineNo } },
      orderBy: { lineNo: delta === 1 ? 'desc' : 'asc' },
    });
    for (const l of downstream) {
      await tx.recipeIngredientLine.update({
        where: { id: l.id },
        data: { lineNo: l.lineNo + delta },
      });
    }
  }
}
