// D-20 (C3) E2E — Chef Mode + Station Card on the live stack:
//   - sign in (chef), paste the golden card, method, analyse, complete.
//   - Chef toggle → the persisted station card leads ("Station card" heading,
//     the §7 chef-voice tab labels, "Untasted briefing. Season after.").
//   - Home toggle → the home tab labels return (no Views 1–9 regression).
//   - C3 TC-03: the chef preference is persisted on the account and restored
//     on the next workspace open (signed-in path).
//   - Guest: the toggle is session-local and renders the honest chef copy.
//
// NOTE (H-13): where Playwright browser launches are machine-policy blocked
// (exit 1260), the identical assertions are re-verified live through the VS Code
// internal browser and recorded in HANDOFF §5 (D-20 entry).

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

async function createAnalysedGoldenRecipe(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Create recipe' }).click();
  await page.getByLabel('Recipe text').fill(GOLDEN_CARD);
  await page.getByRole('button', { name: 'Parse and review' }).click();
  await expect(page.getByText('11 lines · the original submission is preserved unchanged.')).toBeVisible();

  await page.getByText('I will paste it', { exact: true }).click();
  await page.getByLabel('Method text').fill(METHOD_TEXT);
  await page.getByRole('button', { name: 'Save method' }).click();
  await expect(page.getByText('Method saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Analyse recipe' }).click();
  await expect(page.getByText('Analysis complete.')).toBeVisible({ timeout: 30_000 });
}

test.describe('D-20 chef mode + station card — live rendered surfaces', () => {
  test('chef mode leads with the persisted card; home keeps Views 1–9; preference persists (C3 TC-03)', async ({
    page,
  }) => {
    await loginViaKeycloak(page, SEEDED_CHEF);
    await createAnalysedGoldenRecipe(page);

    // Deterministic start (a prior run may have persisted chef): pin Home first.
    await page.getByRole('radio', { name: 'Home' }).click();

    // Home presentation: the home tab labels are intact (D-17 surfaces).
    await expect(page.getByRole('tab', { name: '8 · Dietary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Station card' })).toHaveCount(0);

    // Chef: the persisted card leads (mise from the capture, §7 closing line).
    await page.getByRole('radio', { name: 'Chef' }).click();
    await expect(page.getByText('Chef briefs — the station card leads.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Station card' })).toBeVisible();
    await expect(page.getByText('Untasted briefing. Season after.')).toBeVisible();
    // §7 chef-voice tab labels replace the home labels.
    await expect(page.getByRole('tab', { name: '3 · Sequence, heat, cue' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '8 · Allergen brief' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '9 · Assumption log' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '8 · Dietary' })).toHaveCount(0);
    // Card content derives from the capture — mise line + sequence cues.
    const card = page.locator('section[aria-labelledby="station-card-heading"]');
    await expect(card).toContainText('Fish — 500g');
    await expect(card).toContainText('Cue:');

    // Back to home: the home labels return (no Views 1–9 regression).
    await page.getByRole('radio', { name: 'Home' }).click();
    await expect(page.getByText('Home explains.')).toBeVisible();
    await expect(page.getByRole('tab', { name: '8 · Dietary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Station card' })).toHaveCount(0);

    // C3 TC-03: switch to chef and wait for the persisted preference response.
    const [prefs] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/auth/me/preferences') && r.request().method() === 'PATCH',
      ),
      page.getByRole('radio', { name: 'Chef' }).click(),
    ]);
    expect(prefs.ok()).toBeTruthy();
    await expect(page.getByRole('radio', { name: 'Chef' })).toHaveAttribute('aria-checked', 'true');

    // Reload → reopen the recipe → chef restored from the account preference.
    await page.reload();
    await page.getByRole('button', { name: /Fish — 500g/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Station card' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Chef' })).toHaveAttribute('aria-checked', 'true');
  });

  test('guest: the toggle is session-local and chef renders the honest refusal surface', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create recipe' }).click();
    await page.getByLabel('Recipe text').fill(GOLDEN_CARD);
    await page.getByRole('button', { name: 'Parse and review' }).click();
    await expect(page.getByText('11 lines · the original submission is preserved unchanged.')).toBeVisible();

    // No analysis exists for a guest here → chef must never fabricate a card.
    await page.getByRole('radio', { name: 'Chef' }).click();
    await expect(page.getByText('Chef briefs — the station card leads.')).toBeVisible();
    // The honest copy: no persisted card exists (no analysis run), no fabricated one.
    await expect(page.getByRole('heading', { name: 'Station card' })).toHaveCount(0);

    await page.getByRole('radio', { name: 'Home' }).click();
    await expect(page.getByText('Home explains.')).toBeVisible();
  });
});
