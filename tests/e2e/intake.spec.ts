// D-10 intake E2E — real HTTP surface against the live BFF: guest paste (golden),
// verbatim preservation (B1), CSRF boundary, input validation, photo upload (B2).
// DB-level truth lives in tests/integration/intake_storage.test.ts; this spec drives
// the actual API contract from docs/Recipe_Systems_API.md §3.
import { test, expect } from '@playwright/test';
import { BFF_URL, signupViaKeycloak } from './helpers/auth';

const GOLDEN_TEXT = [
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
].join('\n');

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

function csrfFromSetCookie(setCookie?: string): string {
  const match = (setCookie ?? '').match(/recipe_csrf=([^;]+)/);
  if (!match) throw new Error('recipe_csrf cookie not found in set-cookie');
  return decodeURIComponent(match[1]);
}

test.describe('D-10 intake API (guest)', () => {
  test('golden paste → 200, 11 verbatim draft lines, two fenugreeks distinct (B1 TC-02)', async ({ request }) => {
    const session = await request.post(`${BFF_URL}/auth/guest/session`);
    expect(session.status()).toBe(200);
    const csrf = csrfFromSetCookie(session.headers()['set-cookie']);

    const res = await request.post(`${BFF_URL}/recipes/parse-text`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { text: GOLDEN_TEXT },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.recipe.raw_text).toBe(GOLDEN_TEXT);
    expect(body.recipe.lines).toHaveLength(11);
    const fenugreeks = body.recipe.lines
      .map((l: any) => l.display_name)
      .filter((d: string) => /fenugreek/i.test(d));
    expect(fenugreeks).toEqual(['Fenugreek Powder — 1/2 Tsp', 'Fenugreek — 1/4 Tsp']);
    expect(body.recipe.flags).toEqual([]);
    // A draft line carries the verbatim card text AND the enrichment: the parsed amount and
    // unit, and — where the alias table has a mapping — the canonical ingredient.
    // canonical_name is deliberately NOT asserted: it is null against an unseeded database and
    // "fish" against a seeded one, so asserting either bakes in the environment it was written
    // on. The amount is parsed unconditionally, so it is safe.
    expect(body.recipe.lines[0]).toEqual(
      expect.objectContaining({
        display_name: 'Fish — 500g',
        amount: '500g',
        is_header: false,
        include_on_list: true,
        confirmed_sense: null,
      }),
    );
  });

  test('mixed units / "to taste" / vernacular names are preserved verbatim (B1)', async ({ request }) => {
    const session = await request.post(`${BFF_URL}/auth/guest/session`);
    const csrf = csrfFromSetCookie(session.headers()['set-cookie']);
    const text = 'Murungakkai — to taste\nChinna vengayam — 1/2 kg\nSalt — as required';
    const res = await request.post(`${BFF_URL}/recipes/parse-text`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { text },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.recipe.raw_text).toBe(text);
    expect(body.recipe.lines.map((l: any) => l.display_name)).toEqual([
      'Murungakkai — to taste',
      'Chinna vengayam — 1/2 kg',
      'Salt — as required',
    ]);
  });

  test('state-changing intake without the CSRF token is rejected (403 CSRF_MISMATCH)', async ({ request }) => {
    const session = await request.post(`${BFF_URL}/auth/guest/session`);
    expect(session.status()).toBe(200);
    const res = await request.post(`${BFF_URL}/recipes/parse-text`, {
      headers: { 'Content-Type': 'application/json' },
      data: { text: 'Fish — 500g' },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('CSRF_MISMATCH');
  });

  test('empty text is rejected (400 INVALID_TEXT)', async ({ request }) => {
    const session = await request.post(`${BFF_URL}/auth/guest/session`);
    const csrf = csrfFromSetCookie(session.headers()['set-cookie']);
    const res = await request.post(`${BFF_URL}/recipes/parse-text`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { text: '   ' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_TEXT');
  });

  test('photo upload → 201 with recipe_id, image_id and a storage file_key (B2)', async ({ request }) => {
    const session = await request.post(`${BFF_URL}/auth/guest/session`);
    const csrf = csrfFromSetCookie(session.headers()['set-cookie']);
    const res = await request.post(`${BFF_URL}/recipes/upload`, {
      headers: { 'x-csrf-token': csrf },
      multipart: {
        file: { name: 'card.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.recipe_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.image_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.file_key).toMatch(/^recipes\/[0-9a-f-]{36}\.jpg$/);
  });

  test('non-image uploads are rejected (400 INVALID_IMAGE)', async ({ request }) => {
    const session = await request.post(`${BFF_URL}/auth/guest/session`);
    const csrf = csrfFromSetCookie(session.headers()['set-cookie']);
    const res = await request.post(`${BFF_URL}/recipes/upload`, {
      headers: { 'x-csrf-token': csrf },
      multipart: {
        file: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_IMAGE');
  });
});

test.describe('D-10 intake API (account)', () => {
  test('a signed-in account can paste and the flow returns verbatim lines', async ({ page }) => {
    const email = `intake-${Date.now()}@recipesystems.test`;
    await signupViaKeycloak(page, { email, password: 'Intake123!' });

    const cookies = await page.context().cookies();
    const csrf = cookies.find((c) => c.name === 'recipe_csrf')?.value;
    expect(csrf).toBeTruthy();

    const res = await page.request.post(`${BFF_URL}/recipes/parse-text`, {
      headers: { 'x-csrf-token': csrf!, 'Content-Type': 'application/json' },
      data: { text: 'Fish — 500g\nSalt — to taste' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.recipe.lines.map((l: any) => l.display_name)).toEqual([
      'Fish — 500g',
      'Salt — to taste',
    ]);
  });
});
