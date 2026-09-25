// D-22 (P5-1) E2E — library save / browse / open on the live stack
// (TEST_PLAN's five critical web flows: "library save/reopen"):
//   1. Signed-in: paste the golden card → method → analyse → Save (blank name →
//      the family default, D1 AC-2) → "Saved as" confirmation → library row
//      (name, date, family) → reopen → reload (browser restart) → the row is
//      still there because it is account/DB-owned, never browser state.
//   2. A1 TC-02 resume-save: guest pastes + saves (named) → "Create account and
//      claim" → real Keycloak registration → callback claim (QA-B2) → the saved
//      recipe — name and all — appears in the new account's library.
//
// NOTE (H-13): where Playwright browser launches are machine-policy blocked
// (exit 1260), the identical assertions are re-verified live through the VS Code
// internal browser and recorded in HANDOFF §5 (D-22 entry).

import { test, expect } from '@playwright/test';
import { loginViaKeycloak } from './helpers/auth';

const SEEDED_CHEF = { username: 'chef@recipesystems.test', password: 'Password@123' };
const uniqueEmail = () => `e2e.d22.${Date.now()}@recipesystems.test`;

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

const METHOD_TEXT =
  'Soak tamarind and extract the juice. Temper mustard and fenugreek in coconut oil. Add fish, chilli and drumstick. Simmer until cooked. Finish with coriander.';

const FAMILY = 'Coastal Tamil (Kanyakumari) style meen kuzhambu';

async function pasteAndAnalyse(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Add new recipe' }).click();
  await page.getByLabel('Recipe text').fill(GOLDEN_CARD);
  await page.getByRole('button', { name: 'Analyze recipe' }).click();
  await expect(page.getByText(/the original submission is preserved unchanged/)).toBeVisible();

  // The workspace is tabbed, and MethodSection renders only on its own tab — the radio the
  // component's tests use does not exist until this tab is active.
  await page.getByRole('tab', { name: 'Method' }).click();
  // The radio input is sr-only (a 1x1 clipped box) and the pill's label takes the click point,
  // so Playwright cannot hit-test the input itself. Click the visible pill and let native label
  // behaviour toggle it — which is what a user does.
  await page.getByText('I will paste it', { exact: true }).click();
  await page.getByLabel('Method text').fill(METHOD_TEXT);
  await page.getByRole('button', { name: 'Save method' }).click();
  await expect(page.getByText('Method saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Analyse recipe' }).click();
  await expect(page.getByText('Analysis complete.')).toBeVisible({ timeout: 30_000 });
}

test.describe('D-22 library save / browse / open — live rendered surfaces', () => {
  test('signed-in: save applies the family default, the library row opens the recipe and survives reload', async ({
    page,
  }) => {
    await loginViaKeycloak(page, SEEDED_CHEF);
    await pasteAndAnalyse(page);

    // D1: the visible Save action with a blank name → the family default.
    await expect(page.getByRole('button', { name: 'Save recipe' })).toBeVisible();
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByText(/Saved as/)).toBeVisible();
    await expect(page.getByText(FAMILY, { exact: false })).toBeVisible();

    // Back home: the canonical library row (name = family default).
    await page.getByRole('button', { name: /Back to your recipes/ }).click();
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    const row = page.getByRole('button', { name: new RegExp(FAMILY) }).first();
    await expect(row).toBeVisible();

    // D2: opening the row lands in the workspace with the saved name as the title.
    await row.click();
    await expect(page.getByRole('heading', { level: 1, name: FAMILY })).toBeVisible();

    // Browser restart: the library is DB-owned — reload keeps the row.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(FAMILY) }).first()).toBeVisible();
  });

  test('A1 TC-02 resume-save: guest saves, signs up, claim lands the saved recipe in the new library', async ({
    page,
  }) => {
    const savedName = `D22 guest curry ${Date.now()}`;
    const email = uniqueEmail();

    await page.goto('/');
    await page.getByRole('button', { name: 'Analyze a recipe' }).click();
    await page.getByRole('button', { name: 'Add new recipe' }).click();
    await page.getByLabel('Recipe text').fill(GOLDEN_CARD);
    await page.getByRole('button', { name: 'Analyze recipe' }).click();
    await expect(page.getByText(/the original submission is preserved unchanged/)).toBeVisible();

    // Guests may save (A1 TC-02 seam) — the save state rides the recipe row.
    await page.getByLabel('Recipe name').fill(savedName);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByText(/Saved as/)).toBeVisible();

    // Claim: sign up through the real Keycloak registration → callback claim.
    await page.getByRole('button', { name: /Back to your recipes/ }).click();
    await page.getByRole('button', { name: 'Create account and claim' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/registrations/);
    await page.getByLabel('First name').fill('D22');
    await page.getByLabel('Last name').fill('Guest');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('EodTest123!');
    await page.getByLabel('Confirm password').fill('EodTest123!');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Resume-save: the saved guest recipe is in the NEW account's library. The claim returns
    // to the Home, so reach the library the same way a user does.
    await page.getByRole('button', { name: 'View library' }).click();
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    const row = page.getByRole('button', { name: new RegExp(savedName) }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole('heading', { level: 1, name: savedName })).toBeVisible();
  });

  test('D6: delete requires confirmation; after the confirmed delete the library drops the row and reload keeps it gone', async ({
    page,
  }) => {
    const name = `D22 delete me ${Date.now()}`;
    await loginViaKeycloak(page, SEEDED_CHEF);
    await pasteAndAnalyse(page);
    await page.getByLabel('Recipe name').fill(name);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByText(/Saved as/)).toBeVisible();

    // Cancel path: the destructive step can be backed out of; the recipe remains.
    await page.getByRole('button', { name: 'Delete recipe' }).click();
    await expect(page.getByText(/permanently removed/i)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/Saved as/)).toBeVisible();

    // Confirm path: two explicit steps → backend 204 → home + notice.
    await page.getByRole('button', { name: 'Delete recipe' }).click();
    await page.getByRole('button', { name: 'Delete recipe' }).click();
    await expect(page.getByText('Recipe deleted.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);

    // Browser restart: the delete was DB-owned — the row never returns.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
  });
});
