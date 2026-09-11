// D-30 (Track S) — the API/BFF shopping module: the sole logical writer of
// `shopping_list_generation` / `shopping_list_item` / `ingredient_shopping_state`
// (D-30D). The worker writes no shopping tables (A-17); the renderer is read-only
// (ADR §7). INV-17: 404 for missing AND foreign AND malformed ids (RecipeService.
// assertOwned).
//
// E1: one active row per active (non-soft-deleted) `recipe_ingredient_line`,
// card order, structured object only — never prose. Amount qualifiers ("to
// taste", "for tempering") ride `amount_text`; C-39 shopping_keys are preserved
// so genuinely distinct lines (the two fenugreeks) never collapse.
//
// E2: have/need lives ONLY in the canonical `ingredient_shopping_state`
// (composite key recipe_id + shopping_key) — regeneration and reopen read it;
// C-28 cleans it when a line is soft-deleted. No other state store exists.
//
// E3: the five canonical groups (fresh produce, fish/meat, spices, fats/oils,
// other) via a deterministic keyword mapping over the line's intake category
// (`group_name`) then `display_name` (D-30A) — persisted into
// `shopping_list_item.group_name` at generation.
//
// Q2 Option A (D-30B): the generation snapshot carries `allergen_line` — the
// frozen View-8 allergen line of the recipe's CURRENT analysis, rendered at
// generation time. Print never re-derives it from the current effective-dated
// `dietary_allergen_mapping`.

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import { View8PayloadSchema, type View8Payload } from '@recipe-systems/schemas';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService } from '../recipes/recipe.service';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** E3: the canonical five market groups, in canonical order (Recipe_Systems §12). */
export const SHOPPING_GROUPS = [
  'fresh produce',
  'fish/meat',
  'spices',
  'fats/oils',
  'other',
] as const;
export type ShoppingGroup = (typeof SHOPPING_GROUPS)[number];

/**
 * D-30A grouping mechanism (recorded design assumption): a deterministic
 * keyword mapping over the intake category then the display name, in priority
 * fish/meat → fats/oils → spices → fresh produce → other. The intake
 * `group_name` category is never written here (Q4 one-writer).
 */
const GROUP_KEYWORDS: Record<Exclude<ShoppingGroup, 'other'>, string[]> = {
  'fish/meat': [
    'fish', 'meat', 'seafood', 'prawn', 'shrimp', 'chicken', 'mutton', 'beef',
    'pork', 'lamb', 'egg', 'crab', 'squid', 'sardine', 'mackerel',
  ],
  'fats/oils': ['oil', 'ghee', 'butter', 'fat'],
  spices: [
    'powder', 'spice', 'fenugreek', 'cumin', 'pepper', 'turmeric', 'cardamom',
    'cinnamon', 'clove', 'masala', 'asafoetida', 'mustard seed', 'salt',
  ],
  'fresh produce': [
    'mango', 'drumstick', 'tamarind', 'coconut', 'onion', 'shallot', 'garlic',
    'ginger', 'tomato', 'potato', 'lemon', 'lime', 'chilli', 'chili',
    'vegetable', 'produce', 'fruit', 'leaf', 'leaves', 'okra', 'brinjal',
    'eggplant', 'carrot', 'banana',
  ],
};

export function groupShoppingLine(input: {
  category: string | null;
  displayName: string;
}): ShoppingGroup {
  const hay = `${input.category ?? ''} ${input.displayName}`.toLowerCase();
  for (const group of ['fish/meat', 'fats/oils', 'spices', 'fresh produce'] as const) {
    if (GROUP_KEYWORDS[group].some((k) => hay.includes(k))) return group;
  }
  return 'other';
}

/**
 * Q2 Option A: the deterministic rendering of the frozen View-8 allergen line.
 * INV-13: the View-8 producer surface never emits "safe" (regression-gates
 * static gate) — this renderer only joins the frozen payload's fields.
 */
export function renderAllergenLine(view8: View8Payload): string | null {
  const line = view8.allergen_line;
  const parts: string[] = [];
  if (line.contains.length > 0) parts.push(`Contains: ${line.contains.join(', ')}.`);
  if (line.unknown.length > 0) parts.push(`May contain: ${line.unknown.join(', ')}.`);
  if (line.notes.length > 0) parts.push(`Notes: ${line.notes.join(' ')}`);
  return parts.length > 0 ? parts.join(' ') : null;
}

export interface ShoppingItemWire {
  shopping_key: string | null;
  display_name: string;
  display_quantity: string;
  unit: string | null;
  group_name: ShoppingGroup;
  state: 'have' | 'need';
  position: number;
}

export interface ShoppingListWire {
  generation_id: string;
  recipe_id: string;
  layout: string;
  generated_at: string;
  allergen_line: string | null;
  groups: { name: ShoppingGroup; items: ShoppingItemWire[] }[];
}

/** Canonical group order; empty groups are omitted (nothing to render). */
function groupItems(items: ShoppingItemWire[]): ShoppingListWire['groups'] {
  const byGroup = new Map<ShoppingGroup, ShoppingItemWire[]>();
  for (const item of items) {
    const list = byGroup.get(item.group_name) ?? [];
    list.push(item);
    byGroup.set(item.group_name, list);
  }
  return SHOPPING_GROUPS.filter((g) => byGroup.has(g)).map((name) => ({
    name,
    items: byGroup.get(name) as ShoppingItemWire[],
  }));
}

@Injectable()
export class ShoppingService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly recipes: RecipeService,
  ) {}

  /** Q2 Option A: the frozen View-8 allergen line of the recipe's CURRENT
   *  analysis (D-05-gated payload) — never the live effective-dated mapping. */
  private async currentAllergenLine(recipeId: string): Promise<string | null> {
    const current = await this.prisma.analysis.findFirst({
      where: { recipeId, isCurrent: true, status: 'complete' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!current) return null;
    const view8 = await this.prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId: current.id, viewNumber: 8 } },
      select: { payload: true },
    });
    if (!view8) return null;
    const parsed = View8PayloadSchema.safeParse(view8.payload);
    if (!parsed.success) return null;
    return renderAllergenLine(parsed.data);
  }

  /**
   * E1: generate a new shopping-list snapshot from the ACTIVE ingredient lines
   * only (dispatcher rule — one row per active line; `include_on_list`
   * semantics stay OPEN per ERD §15.1). The have/need state at generation is
   * frozen per item (state_at_generation) while the canonical
   * ingredient_shopping_state rows persist independently.
   */
  async generate(actor: Actor, recipeId: string): Promise<ShoppingListWire> {
    const recipe = await this.recipes.assertOwned(actor, recipeId);
    const [lines, states] = await Promise.all([
      this.prisma.recipeIngredientLine.findMany({
        where: { recipeId: recipe.id, deletedAt: null },
        orderBy: { lineNo: 'asc' },
      }),
      this.prisma.ingredientShoppingState.findMany({
        where: { recipeId: recipe.id },
      }),
    ]);
    const stateByKey = new Map(
      states.map((s) => [s.shoppingKey, s.state as 'have' | 'need']),
    );
    const items: ShoppingItemWire[] = lines.map((line, i) => ({
      shopping_key: line.shoppingKey,
      display_name: line.displayName,
      display_quantity: line.amountText ?? (line.amount ? line.amount.toString() : ''),
      unit: line.unit,
      group_name: groupShoppingLine({ category: line.groupName, displayName: line.displayName }),
      state: stateByKey.get(line.shoppingKey) ?? 'need',
      position: i + 1,
    }));
    const allergenLine = await this.currentAllergenLine(recipe.id);
    const generation = await this.prisma.$transaction(async (tx) => {
      const g = await tx.shoppingListGeneration.create({
        data: { recipeId: recipe.id, layout: 'grouped', allergenLine },
      });
      if (items.length > 0) {
        await tx.shoppingListItem.createMany({
          data: items.map((it) => ({
            generationId: g.id,
            shoppingKey: it.shopping_key,
            displayName: it.display_name,
            displayQuantity: it.display_quantity,
            unit: it.unit,
            groupName: it.group_name,
            stateAtGeneration: it.state,
            position: it.position,
          })),
        });
      }
      return g;
    });
    return {
      generation_id: generation.id,
      recipe_id: recipe.id,
      layout: generation.layout ?? 'grouped',
      generated_at: generation.generatedAt.toISOString(),
      allergen_line: generation.allergenLine,
      groups: groupItems(items),
    };
  }

  /** Latest snapshot + the CURRENT have/need state (E2 reopen semantics). */
  async latest(actor: Actor, recipeId: string): Promise<ShoppingListWire> {
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
      this.prisma.ingredientShoppingState.findMany({
        where: { recipeId: recipe.id },
      }),
    ]);
    const stateByKey = new Map(
      states.map((s) => [s.shoppingKey, s.state as 'have' | 'need']),
    );
    const items: ShoppingItemWire[] = rows.map((r) => ({
      shopping_key: r.shoppingKey,
      display_name: r.displayName,
      display_quantity: r.displayQuantity,
      unit: r.unit,
      group_name: (r.groupName ?? 'other') as ShoppingGroup,
      state: r.shoppingKey ? (stateByKey.get(r.shoppingKey) ?? 'need') : 'need',
      position: r.position,
    }));
    return {
      generation_id: generation.id,
      recipe_id: recipe.id,
      layout: generation.layout ?? 'grouped',
      generated_at: generation.generatedAt.toISOString(),
      allergen_line: generation.allergenLine,
      groups: groupItems(items),
    };
  }

  /**
   * E2: set have/need for one active line. The canonical upsert on
   * (recipe_id, shopping_key) means regeneration never creates duplicate
   * states. A foreign / deleted / malformed key is a canonical 404 (INV-17).
   */
  async setState(
    actor: Actor,
    recipeId: string,
    input: { shopping_key: string; state: 'have' | 'need' },
  ): Promise<{ recipe_id: string; shopping_key: string; state: 'have' | 'need' }> {
    const recipe = await this.recipes.assertOwned(actor, recipeId);
    if (!UUID_RE.test(input.shopping_key)) {
      throw new NotFoundException({
        code: 'LINE_NOT_FOUND',
        message: 'Ingredient line not found',
      });
    }
    const line = await this.prisma.recipeIngredientLine.findFirst({
      where: { recipeId: recipe.id, shoppingKey: input.shopping_key, deletedAt: null },
      select: { shoppingKey: true },
    });
    if (!line) {
      throw new NotFoundException({
        code: 'LINE_NOT_FOUND',
        message: 'Ingredient line not found',
      });
    }
    const row = await this.prisma.ingredientShoppingState.upsert({
      where: {
        recipeId_shoppingKey: { recipeId: recipe.id, shoppingKey: input.shopping_key },
      },
      create: { recipeId: recipe.id, shoppingKey: input.shopping_key, state: input.state },
      update: { state: input.state },
    });
    return { recipe_id: recipe.id, shopping_key: row.shoppingKey, state: row.state as 'have' | 'need' };
  }
}

/** Shared boundary error for invalid state bodies (kept in the controller). */
export class InvalidShoppingStateError extends BadRequestException {
  constructor() {
    super({
      code: 'INVALID_SHOPPING_STATE',
      message: 'Invalid shopping state body: shopping_key must be a UUID and state must be have|need',
    });
  }
}
