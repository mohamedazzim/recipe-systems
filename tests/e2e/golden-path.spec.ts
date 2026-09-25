// End-to-end golden path — one test that walks the whole first-run journey through the real
// stack: browser → Next.js web → BFF → Postgres, with no API mocking anywhere.
//
// The other specs each cover a slice (entry, intake, review, method, library, cook). This one
// exists to answer a different question: does a brand-new user, with nothing set up, get from
// the landing page to a saved recipe in a single uninterrupted flow? It is deliberately one
// long test, because that is the only way a break in the SEAM between two slices — a button
// that hands off to the wrong step, a draft that never reaches the review surface — shows up
// as a failure of the journey rather than a pass of the parts.
//
// Every string asserted here is one the running UI actually renders; they were read off the
// accessibility tree rather than assumed. Nothing past saving is asserted: analysis needs the
// worker, which scripts/dev.sh does not start, so a check for "analysis complete" would fail
// for a reason that has nothing to do with this path.
//
// Prerequisites: the same as the rest of the tier — web on :3000, BFF on :3001, Postgres, and
// a Keycloak instance even though this test signs in as nobody. See playwright.config.ts.

import { test, expect } from '@playwright/test';

/** The pilot's golden card — the eleven lines the other specs and the golden fixtures share. */
const GOLDEN_CARD = [
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

test.describe('Golden path — a new guest gets from the landing page to a saved recipe', () => {
  test('entry → guest session → paste → review → save, in one continuous flow', async ({ page }) => {
    // 1. The landing page offers the guest path without any account.
    await page.goto('/');
    await page.getByRole('button', { name: 'Analyze a recipe' }).click();

    // 2. The guest lands on the real Home, not a bare guest card. "Your recipes" is the
    //    section below the value proposition, which is the h1.
    await expect(page.getByRole('heading', { level: 2, name: 'Your recipes' })).toBeVisible();
    await expect(page.getByText(/exploring as a guest/i)).toBeVisible();

    // 3. Paste intake — the three entry points are real, and text is one of them.
    await page.getByRole('button', { name: 'Add new recipe' }).click();
    await page.getByLabel('Recipe text').fill(GOLDEN_CARD);
    await page.getByRole('button', { name: 'Analyze recipe' }).click();

    // 4. The review surface. The save action only exists once the draft does, so waiting on it
    //    is the check that the paste actually became a structured draft — the seam between
    //    intake and review, which is where a silent failure would otherwise hide.
    await expect(page.getByRole('button', { name: 'Save recipe' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Recipe name')).toBeVisible();

    // 5. Save. Guests may save: the row carries the guest session and the claim flow moves it
    //    onto an account later, which is the A1 TC-02 seam.
    await page.getByLabel('Recipe name').fill('E2E golden path curry');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByText(/Saved as/)).toBeVisible();

    // 6. The confirmation carries the name the server stored, not the text the browser sent:
    //    "Saved as <title>" is rendered from the PUT response, so this asserts the round trip
    //    through Postgres rather than local component state.
    await expect(page.getByText('Saved as E2E golden path curry')).toBeVisible();
  });
});
