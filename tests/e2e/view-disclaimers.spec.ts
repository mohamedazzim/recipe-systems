// D-21 disclaimer sweep E2E — the real rendered surfaces (A-21: verbatim H6/I6 on
// every View 8/9 surface; INV-13 "safe" nowhere; INV-14 band, never a point).
// Full user journey on the live stack: sign in → paste the golden card → method →
// analyse → complete → inspect Views 8 and 9 in the browser.
//
// NOTE (H-13): on the dev VM Playwright browser launches are machine-policy blocked
// (exit 1260). Where that is the case, the identical assertions are re-verified live
// through the VS Code internal browser and recorded in HANDOFF §5 (D-21 entry).

import { test, expect } from '@playwright/test';
import { loginViaKeycloak } from './helpers/auth';

const SEEDED_CHEF = { username: 'chef@recipesystems.test', password: 'Password@123' };

const H6 = 'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.';
const I6 = 'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.';

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

test.describe('D-21 disclaimers (H6/I6) — live rendered surfaces', () => {
  test('H6 verbatim on View 8; I6 verbatim on View 9; no "safe"; band not a point', async ({ page }) => {
    await loginViaKeycloak(page, SEEDED_CHEF);

    // Create + paste the golden card.
    await page.getByRole('button', { name: 'Add new recipe' }).click();
    await page.getByLabel('Recipe text').fill(GOLDEN_CARD);
    await page.getByRole('button', { name: 'Analyze recipe' }).click();
    await expect(page.getByText(/the original submission is preserved unchanged/)).toBeVisible();

    // Method (paste) — analysis requires it (list-only 422 otherwise).
    await page.getByRole('radio', { name: 'I will paste it' }).click();
    await page.getByLabel('Method text').fill(METHOD_TEXT);
    await page.getByRole('button', { name: 'Save method' }).click();
    await expect(page.getByText('Method saved.')).toBeVisible();

    // Analyse and wait for the worker.
    await page.getByRole('button', { name: 'Analyse recipe' }).click();
    await expect(page.getByText('Analysis complete.')).toBeVisible({ timeout: 30_000 });

    // View 8 — H6 verbatim; the forbidden word appears nowhere on the surface.
    await page.getByRole('tab', { name: /8 · Dietary/ }).click();
    const view8 = page.locator('#panel-view-8');
    await expect(view8).toContainText(H6);
    const view8Text = await view8.innerText();
    expect(view8Text).not.toMatch(/\bsafe\b/i);

    // View 9 — I6 verbatim; the energy figure is a band (dash), never a point.
    await page.getByRole('tab', { name: /9 · Nutrition/ }).click();
    const view9 = page.locator('#panel-view-9');
    await expect(view9).toContainText(I6);
    await expect(view9).toContainText('Sodium: Unknown');
    const view9Text = await view9.innerText();
    expect(view9Text).toMatch(/\d[\d,]*–\d[\d,]*\s*kcal/);
  });
});
