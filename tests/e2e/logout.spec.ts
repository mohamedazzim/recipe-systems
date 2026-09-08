// A1 — Logout (D-07 session lifecycle; Tech Stack §14 cookie mechanics).
import { test, expect } from '@playwright/test';
import { BFF_URL, loginViaKeycloak } from './helpers/auth';

const SEEDED_USER = { username: 'chef@recipesystems.test', password: 'password' };

test.describe('A1 Logout', () => {
  test('logout clears the session — authenticated endpoint becomes unauthenticated', async ({ page }) => {
    await loginViaKeycloak(page, SEEDED_USER);

    // Session exists before logout (positive control).
    const before = await page.request.get(`${BFF_URL}/auth/me`);
    expect(before.status()).toBe(200);

    // The real logout button posts through the BFF with the CSRF double-submit token.
    await page.getByRole('button', { name: 'Sign out' }).click();

    // User-visible: back to the anonymous landing state.
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: 'Understand why this recipe works.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // Backend: the session cookie is cleared — /auth/me is rejected.
    const after = await page.request.get(`${BFF_URL}/auth/me`);
    expect(after.status()).toBe(401);
  });

  test('logout ends the Keycloak SSO session — sign-in prompts for credentials again', async ({ page }) => {
    await loginViaKeycloak(page, SEEDED_USER);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // Regression: without RP-initiated logout, Keycloak's still-active SSO session
    // silently re-authenticated here and skipped the login form entirely.
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/auth|login-actions\/authenticate/);
    await expect(page.getByLabel('Username or email')).toBeVisible();
  });
});
