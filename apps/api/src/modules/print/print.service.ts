// D-23 (P5-2) — the API print service. READ-ONLY against the persisted
// snapshots (INV-12 / ADR §7): the shopping print reads the latest
// shopping_list_generation + items ONLY; the station-card print reads the
// persisted analysis_station_card row ONLY. Neither ever touches live recipe
// lines, re-runs analysis, nor queries the live effective-dated allergen
// mapping (QG2 gate 2d).
//
// The allergen line is the PERSISTED snapshot value (Q2 Option A) — never
// re-derived at print time.
//
// QG4 "PDF render | failure": PdfRenderError → 503 with code
// PDF_RENDER_FAILED (retryable); snapshots untouched; never a blank/partial PDF.

import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import {
  PdfRenderError,
  chromiumRuntime,
  renderPdf,
  shoppingListHtml,
  stationCardHtml,
  type PdfRuntime,
  type ShoppingListPrintData,
  type StationCardPrintData,
} from '@recipe-systems/rendering';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService } from '../recipes/recipe.service';
import { SHOPPING_GROUPS, type ShoppingGroup } from '../shopping/shopping.service';

export interface PrintResult {
  pdf: Buffer | null;
  html: string;
  filename: string;
}

/** Nest DI token for the injectable Chromium runtime (unit tests pass a fake). */
export const PRINT_RUNTIME = 'PRINT_RUNTIME';

@Injectable()
export class PrintService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly recipes: RecipeService,
    /** Injectable Chromium runtime — unit tests fake it (QG4 cells). */
    @Optional() @Inject(PRINT_RUNTIME) private readonly runtime: PdfRuntime = chromiumRuntime(),
  ) {}

  /** E4 + H4: the latest D-30 snapshot rendered for print. */
  async shoppingListPrint(
    actor: Actor,
    recipeId: string,
    format: 'pdf' | 'html',
  ): Promise<PrintResult> {
    const recipe = await this.recipes.assertOwned(actor, recipeId);
    const generation = await this.prisma.shoppingListGeneration.findFirst({
      where: { recipeId: recipe.id },
      orderBy: { generatedAt: 'desc' },
    });
    if (!generation) {
      throw new NotFoundException({
        code: 'SHOPPING_LIST_NOT_FOUND',
        message: 'No shopping list generated yet',
      });
    }
    const [rows, states] = await Promise.all([
      this.prisma.shoppingListItem.findMany({
        where: { generationId: generation.id },
        orderBy: { position: 'asc' },
      }),
      // E2 AC-2: the print reflects the CURRENT ticking — the canonical
      // ingredient_shopping_state (recipe-scoped shopping state, not a live
      // recipe line; INV-12 unaffected).
      this.prisma.ingredientShoppingState.findMany({
        where: { recipeId: recipe.id },
      }),
    ]);
    const stateByKey = new Map(states.map((s) => [s.shoppingKey, s.state]));
    const byGroup = new Map<ShoppingGroup, ShoppingListPrintData['groups'][number]['items']>();
    for (const row of rows) {
      const group = (SHOPPING_GROUPS as readonly string[]).includes(row.groupName ?? '')
        ? (row.groupName as ShoppingGroup)
        : 'other';
      const items = byGroup.get(group) ?? [];
      const state = (row.shoppingKey ? stateByKey.get(row.shoppingKey) : undefined) ?? row.stateAtGeneration;
      items.push({
        displayName: row.displayName,
        displayQuantity: row.displayQuantity,
        state: state === 'have' ? 'have' : 'need',
      });
      byGroup.set(group, items);
    }
    const data: ShoppingListPrintData = {
      recipeTitle: recipe.title,
      generatedDate: generation.generatedAt.toISOString().slice(0, 10),
      // Q2 Option A: the SNAPSHOT value — never the live mapping.
      allergenLine: generation.allergenLine,
      groups: SHOPPING_GROUPS.filter((g) => byGroup.has(g)).map((name) => ({
        name,
        items: byGroup.get(name) as ShoppingListPrintData['groups'][number]['items'],
      })),
    };
    const html = shoppingListHtml(data);
    return this.finish(html, format, `shopping-list-${recipe.id}.pdf`);
  }

  /** E5 + H4: the persisted D-20 card snapshot rendered for print. */
  async stationCardPrint(
    actor: Actor,
    recipeId: string,
    format: 'pdf' | 'html',
  ): Promise<PrintResult> {
    const recipe = await this.recipes.assertOwned(actor, recipeId);
    const analysis = await this.prisma.analysis.findFirst({
      where: { recipeId: recipe.id, isCurrent: true, status: 'complete' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, family: true },
    });
    const card = analysis
      ? await this.prisma.analysisStationCard.findUnique({
          where: { analysisId: analysis.id },
        })
      : null;
    if (!card) {
      throw new NotFoundException({
        code: 'STATION_CARD_NOT_FOUND',
        message: 'No station card for this recipe',
      });
    }
    const mise = Object.entries(
      (card.mise ?? {}) as Record<string, { display_name: string; amount: string | null; tag: string }>,
    ).map(([, item]) => ({
      displayName: item.display_name,
      amount: item.amount,
      tag: item.tag,
    }));
    const sequence = (card.sequence ?? []) as Array<{
      stage_name: string; action: string; cue: string; duration: string; tag: string;
    }>;
    const controlPoints = (card.controlPoints ?? []) as Array<{
      stage_name: string; cue: string; tag: string;
    }>;
    const doNots = (card.doNots ?? []) as Array<{ item: string; note: string }>;
    const yieldHold = card.productYieldHold
      ? Object.entries(card.productYieldHold as Record<string, unknown>)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(' · ')
      : null;
    const data: StationCardPrintData = {
      recipeTitle: recipe.title,
      family: analysis?.family ?? null,
      mise,
      sequence: sequence.map((s) => ({
        stageName: s.stage_name,
        action: s.action,
        cue: s.cue,
        duration: s.duration,
        tag: s.tag,
      })),
      controlPoints: controlPoints.map((p) => ({
        stageName: p.stage_name,
        cue: p.cue,
        tag: p.tag,
      })),
      doNots,
      productYieldHold: yieldHold,
      // Q2 Option A: the SNAPSHOT value — never the live mapping.
      allergenLine: card.allergenLine,
    };
    const html = stationCardHtml(data);
    return this.finish(html, format, `station-card-${recipe.id}.pdf`);
  }

  private async finish(html: string, format: 'pdf' | 'html', filename: string): Promise<PrintResult> {
    if (format === 'html') {
      return { pdf: null, html, filename };
    }
    try {
      const pdf = await renderPdf(html, this.runtime);
      return { pdf, html, filename };
    } catch (err) {
      if (err instanceof PdfRenderError) {
        // Canonical retryable error (TEST_PLAN QG4): snapshots unchanged.
        throw new ServiceUnavailableException({
          code: 'PDF_RENDER_FAILED',
          message: 'PDF generation failed — retryable; snapshots unchanged',
          retryable: true,
        });
      }
      throw err;
    }
  }
}
