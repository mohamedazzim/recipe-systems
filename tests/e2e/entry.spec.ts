// Entry page (A1 sign-in / sign-up entry) — the landing experience must
// communicate the product and route every action to the right flow.
// Assertions target user-visible hierarchy and real navigation outcomes.
import { test, expect } from '@playwright/test';

test.describe('Entry page', () => {
  test('renders the product hierarchy: analysis positioning, briefing views, and ordered actions', async ({ page }) => {
    await page.goto('/');

    // One h1 carries the value proposition.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Understand why this recipe works.' }),
    ).toBeVisible();
    // The positioning: analysis, not generation.
    await expect(page.getByText('Analysis, not generation.')).toBeVisible();
    // Action hierarchy: one primary product action, secondary auth, explained guest path.
    await expect(page.getByRole('button', { name: 'Analyze a recipe' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText(/claim your work/)).toBeVisible();
  });

  test('Sign in routes into the Keycloak login flow', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/openid-connect\/auth/);
  });

  test('Create account routes into the Keycloak registration flow', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/openid-connect\/registrations/);
  });

  test('Analyze a recipe starts a guest session and lands on the Recipe Home with a secondary claim band', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Analyze a recipe' }).click();
    // The old bare guest card was replaced (UI build 2026-09-09): guests now land
    // on the real Recipe Home; the claim band is secondary, never the main page.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Good food starts here.' }),
    ).toBeVisible();
    // "Your recipes" is the page's own section below the value proposition, not the h1 —
    // the assertion here used to name it as the level-1 heading.
    await expect(page.getByRole('heading', { level: 2, name: 'Your recipes' })).toBeVisible();
    await expect(page.getByText(/exploring as a guest/i)).toBeVisible();
    await expect(page.getByText(/can be claimed onto an account/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account and claim' })).toBeVisible();
    // The intake offers three real entry points. The photo path is a working upload now,
    // so the old disabled "Photo capture / Coming soon." stub assertions no longer apply.
    await expect(page.getByRole('button', { name: /Paste text/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Structured form/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload photo/ })).toBeVisible();
  });

  test('shows the auth error state with a retry path', async ({ page }) => {
    await page.goto('/?auth_error=Identity%20provider%20rejected%20the%20attempt');
    await expect(page.getByText('Sign-in failed')).toBeVisible();
    await expect(page.getByText('Identity provider rejected the attempt')).toBeVisible();
    // The landing actions remain available for retry.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
