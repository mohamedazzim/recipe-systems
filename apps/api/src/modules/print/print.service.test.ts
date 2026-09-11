// D-23 — PrintService unit tests (mocked Prisma + injected fake PdfRuntime):
// E4/E5 snapshot mapping, H4 snapshot value (never the live mapping — the
// mocked Prisma has NO dietaryAllergenMapping, so any print-time join would
// throw), QG4 retryable failure mapping, INV-17 404s.

import { PrismaClient } from '@recipe-systems/database';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PdfRuntime } from '@recipe-systems/rendering';
import { RecipeService } from '../recipes/recipe.service';
import { PrintService } from './print.service';

const UUID = '11111111-2222-3333-4444-555555555555';

const generation = {
  id: 'gen-1',
  recipeId: UUID,
  layout: 'grouped',
  allergenLine: 'Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.',
  generatedAt: new Date('2026-09-11T10:00:00Z'),
};

const cardRow = {
  id: 'card-1',
  analysisId: 'analysis-1',
  mise: { fish: { display_name: 'Fish — 500g', amount: '500g', tag: 'CARD' } },
  sequence: [
    {
      stage_name: 'Load and heat',
      action: 'Add fish; boil then reduce',
      cue: 'Fish opaque and just flaking',
      duration: 'About 5-6 minutes',
      tag: 'METHOD',
    },
  ],
  doNots: [{ item: 'garlic', note: 'Confirmed absent at review — do not add.' }],
  controlPoints: [{ stage_name: 'Load and heat', cue: 'Fish opaque', tag: 'METHOD' }],
  productYieldHold: null,
  allergenLine: 'Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.',
  printable: true,
};

function service(overrides: { runtime?: PdfRuntime } = {}) {
  const prisma = {
    shoppingListGeneration: { findFirst: jest.fn(async () => generation) },
    shoppingListItem: {
      findMany: jest.fn(async () => [
        { shoppingKey: 'k1', displayName: 'Fish — 500g', displayQuantity: '500g', unit: 'g', groupName: 'fish/meat', stateAtGeneration: 'need', position: 1 },
        { shoppingKey: 'k2', displayName: 'Fenugreek Powder — 1/2 Tsp', displayQuantity: '', unit: null, groupName: 'spices', stateAtGeneration: 'have', position: 2 },
        { shoppingKey: 'k3', displayName: 'Fenugreek — 1/4 Tsp', displayQuantity: '', unit: null, groupName: 'spices', stateAtGeneration: 'need', position: 3 },
      ]),
    },
    analysis: { findFirst: jest.fn(async () => ({ id: 'analysis-1', family: 'Coastal Tamil fish curry' })) },
    analysisStationCard: { findUnique: jest.fn(async () => cardRow) },
    ingredientShoppingState: {
      // Current ticking overrides the frozen stateAtGeneration (E2 AC-2):
      // Fish is ticked HAVE now even though the snapshot said need.
      findMany: jest.fn(async () => [{ shoppingKey: 'k1', state: 'have' }]),
    },
  } as unknown as PrismaClient;
  const recipes = { assertOwned: jest.fn(async () => ({ id: UUID, title: 'Kanyakumari Meen Kuzhambu' })) } as unknown as RecipeService;
  const runtime = overrides.runtime ?? {
    renderToPdf: jest.fn(async () => Buffer.from('%PDF-1.4 fake')),
    measureHeight: jest.fn(async () => 800),
  };
  const svc = new PrintService(prisma, recipes, runtime);
  return { svc, prisma, recipes, runtime };
}

const actor = { kind: 'user', user: { accountId: 'a', email: 'e@e.e' } } as never;

describe('PrintService (D-23)', () => {
  it('E4: the shopping print maps the D-30 snapshot — groups, both fenugreeks, have-strike, snapshot allergen line', async () => {
    const { svc } = service();
    const out = await svc.shoppingListPrint(actor, UUID, 'html');
    expect(out.html).toContain('Kanyakumari Meen Kuzhambu');
    expect(out.html).toContain('Fenugreek Powder — 1/2 Tsp');
    expect(out.html).toContain('Fenugreek — 1/4 Tsp'); // distinct rows
    expect(out.html).toContain('Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.');
    // E2 AC-2: CURRENT ticking (Fish, ticked now) + snapshot fallback
    // (Fenugreek Powder, ticked at generation) are BOTH struck.
    expect(out.html.match(/class="have"/g)).toHaveLength(2);
    const fishRow = out.html.slice(out.html.indexOf('Fish — 500g') - 130);
    expect(fishRow).toContain('class="have"');
    expect(out.pdf).toBeNull();
  });

  it('E5: the station-card print maps the persisted D-20 card snapshot (no regeneration)', async () => {
    const { svc } = service();
    const out = await svc.stationCardPrint(actor, UUID, 'html');
    expect(out.html).toContain('Chef mode · station card');
    expect(out.html).toContain('Fish — 500g');
    expect(out.html).toContain('Control points');
    expect(out.html).toContain('garlic');
    expect(out.html).toContain('Untasted briefing. Season after.');
    expect(out.html).toContain('Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.');
    // The card snapshot came from the persisted row, not a re-computation.
    expect(out.html).toContain('Coastal Tamil fish curry');
  });

  it('H4/Q2: the print never touches dietary_allergen_mapping (a join would throw)', async () => {
    const { svc, prisma } = service();
    expect((prisma as unknown as Record<string, unknown>).dietaryAllergenMapping).toBeUndefined();
    await expect(svc.shoppingListPrint(actor, UUID, 'html')).resolves.toBeTruthy();
    await expect(svc.stationCardPrint(actor, UUID, 'html')).resolves.toBeTruthy();
  });

  it('PDF generation returns a buffer; html format returns the template', async () => {
    const { svc, runtime } = service();
    const pdf = await svc.shoppingListPrint(actor, UUID, 'pdf');
    expect(pdf.pdf?.toString()).toContain('%PDF');
    expect(runtime.renderToPdf).toHaveBeenCalledTimes(1);
  });

  it('QG4: PdfRenderError → 503 PDF_RENDER_FAILED (retryable), never a partial PDF', async () => {
    const { svc } = service({
      runtime: {
        renderToPdf: jest.fn(async () => {
          throw new Error('launch failed');
        }),
        measureHeight: jest.fn(async () => 800),
      },
    });
    await expect(svc.shoppingListPrint(actor, UUID, 'pdf')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(svc.shoppingListPrint(actor, UUID, 'pdf')).rejects.toMatchObject({
      response: { code: 'PDF_RENDER_FAILED', retryable: true },
    });
  });

  it('404 SHOPPING_LIST_NOT_FOUND when nothing was generated', async () => {
    const { svc, prisma } = service();
    (prisma.shoppingListGeneration.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(svc.shoppingListPrint(actor, UUID, 'pdf')).rejects.toMatchObject({
      response: { code: 'SHOPPING_LIST_NOT_FOUND' },
    });
  });

  it('404 STATION_CARD_NOT_FOUND when no card exists (missing analysis or refusal path)', async () => {
    const { svc, prisma } = service();
    (prisma.analysis.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(svc.stationCardPrint(actor, UUID, 'pdf')).rejects.toMatchObject({
      response: { code: 'STATION_CARD_NOT_FOUND' },
    });
    (prisma.analysis.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'analysis-1', family: null });
    (prisma.analysisStationCard.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(svc.stationCardPrint(actor, UUID, 'pdf')).rejects.toMatchObject({
      response: { code: 'STATION_CARD_NOT_FOUND' },
    });
  });

  it('INV-17: ownership is delegated to assertOwned (foreign → canonical 404)', async () => {
    const { svc, recipes } = service();
    (recipes.assertOwned as jest.Mock).mockRejectedValue(
      new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' }),
    );
    await expect(svc.shoppingListPrint(actor, UUID, 'pdf')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.stationCardPrint(actor, UUID, 'pdf')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
