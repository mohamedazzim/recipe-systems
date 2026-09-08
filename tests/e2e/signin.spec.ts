// A1 — Signin (USER_STORIES.md A1 "Create an account" / D-07 session mechanics).
// Real user journey: web → BFF /auth/login → Keycloak login form → code → verified session.
import { test, expect } from '@playwright/test';
import { BFF_URL, loginViaKeycloak } from './helpers/auth';

// Seeded dev identity from infra/keycloak/recipe-systems-realm.json (import-time password).
const SEEDED_USER = { username: 'chef@recipesystems.test', password: 'password' };

test.describe('A1 Signin', () => {
  test('successful signin — credentials accepted, session established, authenticated user returned', async ({ page }) => {
    await loginViaKeycloak(page, SEEDED_USER);

    // User-visible outcome: authenticated card shows the account email.
    await expect(page.getByText(SEEDED_USER.username)).toBeVisible();

    // Backend outcome: /auth/me resolves the session to the seeded account.
    const me = await page.request.get(`${BFF_URL}/auth/me`);
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.email).toBe(SEEDED_USER.username);
  });

  test('invalid credentials — Keycloak rejects with a user-visible error, no session issued', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/auth/);
    await page.getByLabel('Username or email').fill(SEEDED_USER.username);
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Still on Keycloak's login page (login-actions continuation URL) with its error.
    await expect(page).toHaveURL(/login-actions\/authenticate/);
    await expect(page.getByText(/Invalid username or password/i)).toBeVisible();

    // And the BFF has no session for this browser context.
    const me = await page.request.get(`${BFF_URL}/auth/me`);
    expect(me.status()).toBe(401);
  });
});
