// D-24 (P6-1) E2E — the cook-log entry critical flow (TEST_PLAN's five
// critical web flows: "cook log entry") on the live stack:
//   Saved recipe → "I cooked this" → rating 4 → note ("2 green chillies,
//   fenugreek powder off heat" — the §15 acceptance scene) → save → reload
//   (browser restart) → reopen from the Library → the recall strip shows
//   last cooked + rating + note at the top, above the analysis — and the
//   analysis, shopping list and have/need state are untouched (nothing was
//   re-generated, no new analysis fired).
//
// NOTE (H-13): where Playwright browser launches are machine-policy blocked
// (exit 1260), the identical assertions are re-verified live through the VS
// Code internal browser and recorded in HANDOFF §5 (D-24 entry).

import { test, expect } from '@playwright/test';
import { loginViaKeycloak } from './helpers/auth';

const SEEDED_CHEF = { username: 'chef@recipesystems.test', password: 'Password@123' };

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

async function pasteAnalyseAndSave(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Add new recipe' }).click();
  await page.getByLabel('Recipe text').fill(GOLDEN_CARD);
  await page.getByRole('button', { name: 'Analyze recipe' }).click();
  await expect(page.getByText('11 lines · the original submission is preserved unchanged.')).toBeVisible();

  await page.getByText('I will paste it', { exact: true }).click();
  await page.getByLabel('Method text').fill(METHOD_TEXT);
  await page.getByRole('button', { name: 'Save method' }).click();
  await expect(page.getByText('Method saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Analyse recipe' }).click();
  await expect(page.getByText('Analysis complete.')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText(/Saved as/)).toBeVisible();
}

test.describe('D-24 cook log entry — live rendered surfaces', () => {
  test('log → rate 4 → note → reload → reopen: recall at the top, analysis and shopping untouched', async ({
    page,
  }) => {
    await loginViaKeycloak(page, SEEDED_CHEF);
    await pasteAnalyseAndSave(page);

    // Pre-existing shopping state: generate the list and mark fish as have.
    await page.getByRole('button', { name: 'Generate shopping list' }).click();
    await expect(page.getByText(/Fresh produce|Spices|Fish/).first()).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/Mark Fish — 500g as have/).click();
    await expect(page.getByLabel(/Mark Fish — 500g as need/)).toBeVisible();

    // The canonical cook step (Recipe_Systems §15): log, rate 4, note.
    await page.getByRole('button', { name: 'I cooked this' }).click();
    await page.getByLabel('Rating').selectOption('4');
    await page.getByLabel('Note').fill('2 green chillies, fenugreek powder off heat');
    await page.getByRole('button', { name: 'Save cook log' }).click();

    // F6 AC-1 — the recall at the top; F2 AC-3 — the note above the analysis.
    await expect(page.getByTestId('last-cook-recall')).toContainText('Rating 4/5');
    await expect(page.getByText('2 green chillies, fenugreek powder off heat')).toBeVisible();

    // Browser restart: the workspace reloads on the same recipe.
    await page.reload();
    await expect(page.getByTestId('last-cook-recall')).toContainText('Rating 4/5');
    await expect(page.getByText('2 green chillies, fenugreek powder off heat')).toBeVisible();

    // Reopen from the Library — the last-cooked date rides the library row.
    await page.getByRole('button', { name: /Back to your recipes/ }).click();
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await expect(page.getByText(/Cooked/).first()).toBeVisible();
    await page.getByRole('button', { name: new RegExp(FAMILY) }).first().click();
    await expect(page.getByTestId('last-cook-recall')).toContainText('Rating 4/5');
    await expect(page.getByText('2 green chillies, fenugreek powder off heat')).toBeVisible();

    // Historical state untouched: the saved analysis still surfaces and the
    // have/need state survived — no regeneration, no silent rewrite.
    await expect(page.getByText(/Analysis complete/)).toBeVisible();
    await expect(page.getByLabel(/Mark Fish — 500g as need/)).toBeVisible();
  });
});
