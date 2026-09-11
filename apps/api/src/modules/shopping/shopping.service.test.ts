// D-30 (Track S) unit tests — ShoppingService with a mocked Prisma client.
// Covers: E1 generation from ACTIVE lines only (two fenugreeks stay distinct),
// E2 state persistence via the canonical upsert (regeneration never duplicates),
// E3 five-group mapping (D-30A keyword mechanism), Q2 Option A allergen snapshot
// (frozen View-8 line, never the live mapping), INV-17 404s, C-28 interplay
// (deleted lines are excluded from generation and state writes).

import { PrismaClient } from '@recipe-systems/database';
import { NotFoundException } from '@nestjs/common';
import { RecipeService } from '../recipes/recipe.service';
import {
  ShoppingService,
  ShoppingListWire,
  groupShoppingLine,
  renderAllergenLine,
} from './shopping.service';
import type { View8Payload } from '@recipe-systems/schemas';

const UUID = '11111111-2222-3333-4444-555555555555';

function makeLines(count = 2) {
  return [
    {
      id: 'l1', recipeId: UUID, shoppingKey: 'aaaa0000-0000-0000-0000-000000000001',
      lineNo: 1, displayName: 'Fish — 500g', amount: { toString: () => '500' },
      amountText: '500g', unit: 'g', groupName: null, deletedAt: null,
    },
    {
      id: 'l2', recipeId: UUID, shoppingKey: 'aaaa0000-0000-0000-0000-000000000002',
      lineNo: 2, displayName: 'Fenugreek — 1/4 Tsp', amount: null,
      amountText: '1/4 Tsp', unit: null, groupName: 'spices', deletedAt: null,
    },
    {
      id: 'l3', recipeId: UUID, shoppingKey: 'aaaa0000-0000-0000-0000-000000000003',
      lineNo: 3, displayName: 'Fenugreek Powder — 1/2 Tsp', amount: null,
      amountText: '1/2 Tsp', unit: null, groupName: null, deletedAt: null,
    },
    ...(count > 3
      ? [{
          id: 'l4', recipeId: UUID, shoppingKey: 'aaaa0000-0000-0000-0000-000000000004',
          lineNo: 4, displayName: 'Soft-deleted garlic', amount: null,
          amountText: null, unit: null, groupName: null,
          deletedAt: new Date('2026-09-01T00:00:00Z'),
        }]
      : []),
  ];
}

const VIEW8: View8Payload = {
  present: ['Fish', 'Mustard'],
  not_on_card: [],
  unknown: ['Coconut'],
  removal_notes: [],
  disclaimer: 'Reads the card only. Does not test food.',
  allergen_line: {
    contains: ['Fish', 'Mustard'],
    notes: ['Fish species unknown.'],
    unknown: ['Coconut'],
  },
};

function mockPrisma(lines: ReturnType<typeof makeLines>, states: Array<{ shoppingKey: string; state: string }> = []) {
  const generation = {
    id: 'gen-1',
    recipeId: UUID,
    layout: 'grouped',
    allergenLine: 'Contains: Fish, Mustard. Notes: Fish species unknown.',
    generatedAt: new Date('2026-09-11T10:00:00Z'),
    createdAt: new Date('2026-09-11T10:00:00Z'),
  };
  const tx = {
    shoppingListGeneration: { create: jest.fn(async () => generation) },
    shoppingListItem: { createMany: jest.fn(async () => ({ count: 0 })) },
  };
  const prisma = {
    recipeIngredientLine: {
      findMany: jest.fn(async () => lines.filter((l) => l.deletedAt === null)),
      findFirst: jest.fn(async (args: { where: { shoppingKey: string } }) =>
        lines.find((l) => l.shoppingKey === args.where.shoppingKey && l.deletedAt === null) ?? null),
    },
    ingredientShoppingState: {
      findMany: jest.fn(async () =>
        states.map((s) => ({ recipeId: UUID, shoppingKey: s.shoppingKey, state: s.state }))),
      upsert: jest.fn(async (args: { create: { shoppingKey: string; state: string } }) => ({
        shoppingKey: args.create.shoppingKey,
        state: args.create.state,
      })),
    },
    analysis: { findFirst: jest.fn(async () => ({ id: 'analysis-1' })) },
    analysisView: { findUnique: jest.fn(async () => ({ payload: VIEW8 })) },
    shoppingListGeneration: {
      findFirst: jest.fn(async () => generation),
      create: jest.fn(async () => generation),
    },
    shoppingListItem: {
      findMany: jest.fn(async () => [
        { shoppingKey: 'aaaa0000-0000-0000-0000-000000000001', displayName: 'Fish — 500g', displayQuantity: '500g', unit: 'g', groupName: 'fish/meat', position: 1 },
        { shoppingKey: 'aaaa0000-0000-0000-0000-000000000003', displayName: 'Fenugreek Powder — 1/2 Tsp', displayQuantity: '1/2 Tsp', unit: null, groupName: 'spices', position: 3 },
      ]),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, generation, tx };
}

function service(lines = makeLines(3), states: Array<{ shoppingKey: string; state: string }> = []) {
  const { prisma, tx } = mockPrisma(lines, states);
  const recipes = { assertOwned: jest.fn(async () => ({ id: UUID })) } as unknown as RecipeService;
  const svc = new ShoppingService(prisma as unknown as PrismaClient, recipes);
  return { svc, prisma, recipes, tx };
}

const actor = { kind: 'user', user: { accountId: 'acct-1', email: 'chef@recipesystems.test' } } as Parameters<ShoppingService['generate']>[0];

describe('ShoppingService (D-30)', () => {
  describe('groupShoppingLine (E3 — D-30A keyword mechanism)', () => {
    it('maps the golden card into the five canonical groups', () => {
      expect(groupShoppingLine({ category: null, displayName: 'Fish — 500g' })).toBe('fish/meat');
      expect(groupShoppingLine({ category: null, displayName: 'Drumstick — 1 Nos' })).toBe('fresh produce');
      expect(groupShoppingLine({ category: null, displayName: 'Mango — 1/2 Nos' })).toBe('fresh produce');
      expect(groupShoppingLine({ category: null, displayName: 'Grated Coconut — Half Shell' })).toBe('fresh produce');
      expect(groupShoppingLine({ category: null, displayName: 'Coconut Oil — For Tempering' })).toBe('fats/oils');
      expect(groupShoppingLine({ category: null, displayName: 'Chilli — 5 Nos' })).toBe('fresh produce');
      expect(groupShoppingLine({ category: null, displayName: 'Chilli Powder — 2 Tsp' })).toBe('spices');
      expect(groupShoppingLine({ category: null, displayName: 'Coriander Powder — 1 Tsp' })).toBe('spices');
      expect(groupShoppingLine({ category: null, displayName: 'Tamarind — A Lemon Size' })).toBe('fresh produce');
      expect(groupShoppingLine({ category: null, displayName: 'Fenugreek Powder — 1/2 Tsp' })).toBe('spices');
      expect(groupShoppingLine({ category: null, displayName: 'Fenugreek — 1/4 Tsp' })).toBe('spices');
    });
    it('uses the intake category first and falls back to other', () => {
      expect(groupShoppingLine({ category: 'fish_meat', displayName: 'Anything' })).toBe('fish/meat');
      expect(groupShoppingLine({ category: 'produce', displayName: 'Anything' })).toBe('fresh produce');
      expect(groupShoppingLine({ category: 'fats_oils', displayName: 'Anything' })).toBe('fats/oils');
      expect(groupShoppingLine({ category: null, displayName: 'Mystery pod' })).toBe('other');
    });
  });

  describe('renderAllergenLine (Q2 Option A renderer)', () => {
    it('joins contains / unknown / notes deterministically', () => {
      expect(renderAllergenLine(VIEW8)).toBe(
        'Contains: Fish, Mustard. May contain: Coconut. Notes: Fish species unknown.',
      );
    });
    it('returns null when the payload has no allergen line content', () => {
      const empty: View8Payload = {
        ...VIEW8,
        allergen_line: { contains: [], notes: [], unknown: [] },
      };
      expect(renderAllergenLine(empty)).toBeNull();
    });
  });

  describe('generate (E1 + Q2)', () => {
    it('generates one row per ACTIVE line, preserving distinct shopping keys and qualifiers', async () => {
      const { svc, tx, recipes } = service(makeLines(4));
      const out = (await svc.generate(actor, UUID)) as ShoppingListWire;
      expect(recipes.assertOwned).toHaveBeenCalledWith(actor, UUID);
      const items = out.groups.flatMap((g) => g.items);
      expect(items).toHaveLength(3); // soft-deleted line excluded
      const fenugreeks = items.filter((i) => i.display_name.toLowerCase().includes('fenugreek'));
      expect(fenugreeks).toHaveLength(2);
      expect(fenugreeks[0].shopping_key).not.toBe(fenugreeks[1].shopping_key);
      expect(items.find((i) => i.display_name === 'Fish — 500g')?.display_quantity).toBe('500g');
      // The frozen View-8 allergen line is persisted with the snapshot (Option A).
      expect(tx.shoppingListGeneration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            layout: 'grouped',
            allergenLine: 'Contains: Fish, Mustard. May contain: Coconut. Notes: Fish species unknown.',
          }),
        }),
      );
      expect(out.allergen_line).toContain('Fish');
      // Grouping is persisted per item.
      const createMany = tx.shoppingListItem.createMany as jest.Mock;
      const createArgs = createMany.mock.calls[0]?.[0]?.data as Array<{
        displayName: string;
        groupName: string;
      }>;
      const fishRow = createArgs.find((d) => d.displayName === 'Fish — 500g');
      expect(fishRow?.groupName).toBe('fish/meat');
    });

    it('carries the persisted have/need state into state_at_generation', async () => {
      const { svc } = service(
        makeLines(3),
        [{ shoppingKey: 'aaaa0000-0000-0000-0000-000000000001', state: 'have' }],
      );
      const out = (await svc.generate(actor, UUID)) as ShoppingListWire;
      const items = out.groups.flatMap((g) => g.items);
      expect(items.find((i) => i.shopping_key === 'aaaa0000-0000-0000-0000-000000000001')?.state).toBe('have');
      expect(items.find((i) => i.shopping_key === 'aaaa0000-0000-0000-0000-000000000002')?.state).toBe('need');
    });

    it('renders a null allergen line when there is no current analysis', async () => {
      const { svc, prisma, tx } = service(makeLines(3));
      (prisma.analysis.findFirst as jest.Mock).mockImplementation(async () => null);
      await svc.generate(actor, UUID);
      expect(tx.shoppingListGeneration.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ allergenLine: null }) }),
      );
    });
  });

  describe('latest (E2 reopen)', () => {
    it('returns the latest snapshot with CURRENT state applied', async () => {
      const { svc } = service(
        makeLines(3),
        [{ shoppingKey: 'aaaa0000-0000-0000-0000-000000000001', state: 'have' }],
      );
      const out = (await svc.latest(actor, UUID)) as ShoppingListWire;
      expect(out.generation_id).toBe('gen-1');
      const fish = out.groups.flatMap((g) => g.items).find((i) => i.display_name === 'Fish — 500g');
      expect(fish?.state).toBe('have');
    });

    it('404 SHOPPING_LIST_NOT_FOUND when nothing was generated', async () => {
      const { svc, prisma } = service();
      (prisma.shoppingListGeneration.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.latest(actor, UUID)).rejects.toMatchObject({
        name: 'NotFoundException',
      });
    });
  });

  describe('setState (E2)', () => {
    it('upserts on the canonical composite key — no duplicate states', async () => {
      const { svc, prisma } = service();
      const out = await svc.setState(actor, UUID, {
        shopping_key: 'aaaa0000-0000-0000-0000-000000000001',
        state: 'have',
      });
      expect(out).toEqual({
        recipe_id: UUID,
        shopping_key: 'aaaa0000-0000-0000-0000-000000000001',
        state: 'have',
      });
      expect(prisma.ingredientShoppingState.upsert).toHaveBeenCalledTimes(1);
    });

    it('404 LINE_NOT_FOUND for unknown, soft-deleted and malformed keys (INV-17)', async () => {
      const { svc } = service(makeLines(4));
      await expect(
        svc.setState(actor, UUID, { shopping_key: 'ffffffff-0000-0000-0000-000000000000', state: 'have' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        svc.setState(actor, UUID, { shopping_key: 'aaaa0000-0000-0000-0000-000000000004', state: 'have' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        svc.setState(actor, UUID, { shopping_key: 'not-a-uuid', state: 'have' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('delegates ownership to assertOwned (foreign actor → canonical 404)', async () => {
      const { svc, recipes } = service();
      (recipes.assertOwned as jest.Mock).mockRejectedValueOnce(
        new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' }),
      );
      await expect(
        svc.setState(actor, UUID, { shopping_key: 'aaaa0000-0000-0000-0000-000000000001', state: 'have' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
