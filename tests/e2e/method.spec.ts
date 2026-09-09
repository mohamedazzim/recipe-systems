// D-13 method-attach E2E — the real HTTP surface for RS-US-09 against the live BFF:
// signed-in paste / inferred / none round-trips on an intake-created recipe (B4 TC-01/02/03),
// the wire shape {method_tag, method_source, list_only} (API §4), source-less INFERRED
// rejected (A-13: never a source-less INFERRED), and guest 401 (method selection is
// client-side for guests — API §4).
// DB-level truth lives in tests/integration/story_b4_method_attach.test.ts.
//
// NOTE (2026-09-09, HANDOFF §5): on the dev VM, Playwright browser launches are blocked
// by machine policy (exit 1260) — these page-based specs run on machines with an
// unblocked browser; the same contract is re-verified live over plain HTTP in the
// D-13 live-stack checks recorded in HANDOFF §5.

import { test, expect, Page } from '@playwright/test';
import { BFF_URL, loginViaKeycloak } from './helpers/auth';

const SEEDED_CHEF = { username: 'chef@recipesystems.test', password: 'Password@123' };

const METHOD_TEXT =
  'Dry roast the spices; boil tamarind; temper in coconut oil; simmer with fish.';
const FAMILY_METHOD =
  'Boil tamarind water; temper mustard, fenugreek; add fish; simmer; garnish with curry leaves.';
const NAMED_SOURCE = 'CDK 1669 / Mrs. Anitha';

interface MethodResponse {
  method_tag: 'METHOD' | 'INFERRED' | null;
  method_source: string | null;
  list_only: boolean;
}

async function authedApi(page: Page) {
  await loginViaKeycloak(page, SEEDED_CHEF);
  const cookies = await page.context().cookies(BFF_URL);
  const csrf = cookies.find((c) => c.name === 'recipe_csrf')?.value;
  if (!csrf) throw new Error('recipe_csrf cookie missing after sign-in');
  return { req: page.context().request, csrf };
}

async function pasteRecipe(req: any, csrf: string): Promise<string> {
  const res = await req.post(`${BFF_URL}/recipes/parse-text`, {
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    data: { text: 'Fish — 500g\nTamarind — A Lemon Size' },
  });
  expect(res.status()).toBe(200); // API doc §3: parse-text → 200
  const body = await res.json();
  return body.recipe_id ?? body.recipe.id ?? body.id;
}

function patchMethod(req: any, csrf: string, recipeId: string, body: unknown) {
  return req.patch(`${BFF_URL}/recipes/${recipeId}/method`, {
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    data: body,
  });
}

test.describe('D-13 method attach (B4) — live BFF', () => {
  test('TC-01: paste attaches the user method → METHOD, list_only false', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const recipeId = await pasteRecipe(req, csrf);

    const res = await patchMethod(req, csrf, recipeId, {
      method: 'paste',
      method_text: METHOD_TEXT,
    });
    expect(res.status()).toBe(200);
    const body: MethodResponse = await res.json();
    expect(body).toEqual({ method_tag: 'METHOD', method_source: null, list_only: false });
  });

  test('TC-02: inferred attaches the family method → INFERRED with the named source', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const recipeId = await pasteRecipe(req, csrf);

    const res = await patchMethod(req, csrf, recipeId, {
      method: 'inferred',
      method_text: FAMILY_METHOD,
      method_source: NAMED_SOURCE,
    });
    expect(res.status()).toBe(200);
    const body: MethodResponse = await res.json();
    expect(body).toEqual({
      method_tag: 'INFERRED',
      method_source: NAMED_SOURCE,
      list_only: false,
    });
  });

  test('TC-03: none clears the method → list_only true (Views 3/7 INCOMPLETE flag)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const recipeId = await pasteRecipe(req, csrf);

    const res = await patchMethod(req, csrf, recipeId, { method: 'none' });
    expect(res.status()).toBe(200);
    const body: MethodResponse = await res.json();
    expect(body).toEqual({ method_tag: null, method_source: null, list_only: true });
  });

  test('source-less INFERRED is refused at the boundary (A-13: MAJOR otherwise)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const recipeId = await pasteRecipe(req, csrf);

    const res = await patchMethod(req, csrf, recipeId, {
      method: 'inferred',
      method_text: FAMILY_METHOD,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe('INVALID_METHOD');
  });

  test('guests get 401 — method selection is client-side for guests (API §4)', async ({ page }) => {
    // Unauthenticated: no login, no session cookie.
    const res = await page.context().request.patch(`${BFF_URL}/recipes/any/method`, {
      headers: { 'Content-Type': 'application/json' },
      data: { method: 'none' },
    });
    expect(res.status()).toBe(401);
  });
});
