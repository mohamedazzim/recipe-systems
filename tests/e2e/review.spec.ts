// D-12 parse-review E2E — the real HTTP surface for RS-US-08 against the live BFF:
// signed-in review (API doc labels review routes "Auth: Bearer" — D-12A), the wrapped
// golden-line split (B3 acceptance scene, text channel), edit/merge/header/delete
// round-trips, stale-edit rejection, and the corrected object analysis will read.
// DB-level truth lives in tests/integration/story_b3_parse_review.test.ts.

import { test, expect, Page } from '@playwright/test';
import { BFF_URL, loginViaKeycloak } from './helpers/auth';

// Seeded dev user (infra/keycloak/recipe-systems-realm.json; password changed 2026-09-09
// per user direction — HANDOFF §5).
const SEEDED_CHEF = { username: 'chef@recipesystems.test', password: 'Password@123' };

const WRAPPED_GOLDEN = [
  'Fish — 500g',
  'Drumstick — 1 Nos',
  'Mango — 1/2 Nos',
  'Grated Coconut — Half Shell',
  'Coconut Oil — For Tempering',
  'Chilli — 5 Nos',
  'Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp', // wrapped (photo artifact)
  'Tamarind — A Lemon Size',
  'Fenugreek Powder — 1/2 Tsp',
  'Fenugreek — 1/4 Tsp',
].join('\n');

const GOLDEN_LINES = [
  'Fish — 500g',
  'Drumstick — 1 Nos',
  'Mango — 1/2 Nos',
  'Grated Coconut — Half Shell',
  'Coconut Oil — For Tempering',
  'Chilli — 5 Nos',
  'Chilli Powder — 2 Tsp',
  'Coriander Powder — 1 Tsp',
  'Tamarind — A Lemon Size',
  'Fenugreek Powder — 1/2 Tsp',
  'Fenugreek — 1/4 Tsp',
];

interface WireLine {
  id: string;
  display_name: string;
  updated_at: string;
  [key: string]: unknown;
}

/** Sign in with the seeded chef and return a request handle sharing the session cookies. */
async function authedApi(page: Page) {
  await loginViaKeycloak(page, SEEDED_CHEF);
  const cookies = await page.context().cookies(BFF_URL);
  const csrf = cookies.find((c) => c.name === 'recipe_csrf')?.value;
  if (!csrf) throw new Error('recipe_csrf cookie missing after sign-in');
  return { req: page.context().request, csrf };
}

async function pasteGolden(req: any, csrf: string, text = WRAPPED_GOLDEN) {
  const res = await req.post(`${BFF_URL}/recipes/parse-text`, {
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    data: { text },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

test.describe('D-12 parse review (signed-in)', () => {
  test('golden paste → split the wrapped line → corrected object = 11 canonical lines (B3 TC-01)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const body = await pasteGolden(req, csrf);
    expect(body.recipe_id).toBeTruthy(); // D-12I
    const recipeId = body.recipe_id;

    const wrapped: WireLine = body.recipe.lines.find((l: WireLine) =>
      l.display_name.includes('Coriander Powder'),
    );
    const splitPoint = wrapped.display_name.indexOf(' Coriander') + 1;

    const split = await req.post(`${BFF_URL}/recipes/${recipeId}/lines/${wrapped.id}/split`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { split_point: splitPoint, expected_updated_at: wrapped.updated_at },
    });
    expect(split.status()).toBe(200);
    const splitBody = await split.json();
    expect(splitBody.lines.map((l: WireLine) => l.display_name)).toEqual([
      'Chilli Powder — 2 Tsp',
      'Coriander Powder — 1 Tsp',
    ]);

    const list = await req.get(`${BFF_URL}/recipes/${recipeId}/lines`);
    expect(list.status()).toBe(200);
    const items: WireLine[] = (await list.json()).items;
    expect(items.map((l) => l.display_name)).toEqual(GOLDEN_LINES); // both fenugreeks distinct, order kept
  });

  test('edit round-trips review fields; parse-preview is confirmed (B3 AC-3/AC-6)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const body = await pasteGolden(req, csrf);
    const recipeId = body.recipe_id;
    const fish: WireLine = body.recipe.lines[0];

    const patch = await req.patch(`${BFF_URL}/recipes/${recipeId}/lines/${fish.id}`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: {
        display_name: 'Fish — 500 gm',
        amount: '500 gm',
        quantity: 500,
        unit: 'gm',
        category: 'fish_meat',
        confirmed_sense: 'fish',
        expected_updated_at: fish.updated_at,
      },
    });
    expect(patch.status()).toBe(200);
    const updated = await patch.json();
    expect(updated).toEqual(
      expect.objectContaining({
        display_name: 'Fish — 500 gm',
        amount: '500 gm',
        quantity: 500,
        unit: 'gm',
        category: 'fish_meat',
        confirmed_sense: 'fish',
        is_header: false,
      }),
    );

    const preview = await req.get(`${BFF_URL}/recipes/${recipeId}/parse-preview`);
    expect(preview.status()).toBe(200);
    const previewBody = await preview.json();
    expect(previewBody.status).toBe('confirmed');
    expect(previewBody.lines.find((l: WireLine) => l.id === fish.id).display_name).toBe('Fish — 500 gm');
  });

  test('stale edit → 409 STALE_EDIT; fresh token → succeeds (D-12D QG4 cell)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const body = await pasteGolden(req, csrf);
    const recipeId = body.recipe_id;
    const fish: WireLine = body.recipe.lines[0];
    const oldToken = fish.updated_at;

    const first = await req.patch(`${BFF_URL}/recipes/${recipeId}/lines/${fish.id}`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { display_name: 'Fish — 500 gm', expected_updated_at: oldToken },
    });
    expect(first.status()).toBe(200);

    const stale = await req.patch(`${BFF_URL}/recipes/${recipeId}/lines/${fish.id}`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { display_name: 'Fish — 1 kg', expected_updated_at: oldToken },
    });
    expect(stale.status()).toBe(409);
    const staleBody = await stale.json();
    expect(staleBody.error.code).toBe('STALE_EDIT');
    expect(staleBody.error.details.current_line.display_name).toBe('Fish — 500 gm');

    const fresh = await req.patch(`${BFF_URL}/recipes/${recipeId}/lines/${fish.id}`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { display_name: 'Fish — 1 kg', expected_updated_at: staleBody.error.details.current_line.updated_at },
    });
    expect(fresh.status()).toBe(200);
  });

  test('header marking excludes the line; delete removes it from the corrected object (B3 AC-2/AC-1)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const text = ['For the marinade:', 'Fish — 500g', 'Fenugreek Powder — 1/2 Tsp', 'Fenugreek — 1/4 Tsp'].join('\n');
    const body = await pasteGolden(req, csrf, text);
    const recipeId = body.recipe_id;

    const header: WireLine = body.recipe.lines[0];
    const marked = await req.patch(`${BFF_URL}/recipes/${recipeId}/lines/${header.id}`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { is_header: true, expected_updated_at: header.updated_at },
    });
    expect(marked.status()).toBe(200);

    const drumstick: WireLine = body.recipe.lines.find((l: WireLine) => l.display_name.includes('Fenugreek Powder'))!;
    const deleted = await req.delete(`${BFF_URL}/recipes/${recipeId}/lines/${drumstick.id}`, {
      headers: { 'x-csrf-token': csrf },
    });
    expect(deleted.status()).toBe(204);

    const list = await req.get(`${BFF_URL}/recipes/${recipeId}/lines`);
    const names = (await list.json()).items.map((l: WireLine) => l.display_name);
    expect(names).toEqual(['Fish — 500g', 'Fenugreek — 1/4 Tsp']);
  });

  test('merge recombines the split pair into one line (D-12F)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const body = await pasteGolden(req, csrf);
    const recipeId = body.recipe_id;
    const wrapped: WireLine = body.recipe.lines.find((l: WireLine) => l.display_name.includes('Coriander Powder'));
    await req.post(`${BFF_URL}/recipes/${recipeId}/lines/${wrapped.id}/split`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { split_point: wrapped.display_name.indexOf(' Coriander') + 1, expected_updated_at: wrapped.updated_at },
    });

    const list = await req.get(`${BFF_URL}/recipes/${recipeId}/lines`);
    const chilli: WireLine = (await list.json()).items.find(
      (l: WireLine) => l.display_name === 'Chilli Powder — 2 Tsp',
    );
    const merged = await req.patch(`${BFF_URL}/recipes/${recipeId}/lines/${chilli.id}`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { merge_with_next: true, expected_updated_at: chilli.updated_at },
    });
    expect(merged.status()).toBe(200);
    expect((await merged.json()).display_name).toBe('Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp');

    const after = await req.get(`${BFF_URL}/recipes/${recipeId}/lines`);
    const names = (await after.json()).items.map((l: WireLine) => l.display_name);
    expect(names).toHaveLength(10);
    expect(names.filter((n: string) => n === 'Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp')).toHaveLength(1);
  });
});
