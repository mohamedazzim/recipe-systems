// A1 — Signup (USER_STORIES.md A1 "Create an account"; D-06/D-07).
// Real user journey: web → BFF /auth/signup → Keycloak registration → auto-login → authenticated.
import { test, expect } from '@playwright/test';
import { BFF_URL, signupViaKeycloak } from './helpers/auth';

const uniqueEmail = () => `e2e.signup.${Date.now()}@recipesystems.test`;

test.describe('A1 Signup', () => {
  test('successful signup — account is created and the user lands authenticated', async ({ page }) => {
    const email = uniqueEmail();
    await signupViaKeycloak(page, { email, password: 'EodTest123!' });

    // Business outcome, user-visible (UI build 2026-09-09): signup lands on the
    // Recipe Home; the account email shows in the header.
    // The authenticated Home greets the account by name; its sections are the stats row and
    // "Recently updated recipes". "Your recipes" belongs to the GUEST Home, which is what the
    // assertion here used to name. `.first()` because the address also appears in the account
    // menu's accessible name.
    await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();

    // Backend outcome: the BFF session resolves to the new account.
    const me = await page.request.get(`${BFF_URL}/auth/me`);
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.email).toBe(email);
    expect(body.preferred_mode).toBe('home');
  });

  test('duplicate signup — Keycloak rejects the existing email with a user-visible error', async ({ page }) => {
    const email = uniqueEmail();
    await signupViaKeycloak(page, { email, password: 'EodTest123!' });
    // sign out to return to the anonymous state for the second attempt
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page.getByRole('heading', { name: 'Understand why this recipe works.' })).toBeVisible();

    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/registrations/);
    await page.getByLabel('First name').fill('Dup');
    await page.getByLabel('Last name').fill('Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('EodTest123!');
    await page.getByLabel('Confirm password').fill('EodTest123!');
    await page.getByRole('button', { name: 'Register' }).click();

    // Still on the registration form (login-actions continuation URL) with Keycloak's rejection.
    await expect(page).toHaveURL(/login-actions\/registration/);
    await expect(page.getByText('Email already exists.')).toBeVisible();
  });

  test('invalid signup input — mismatched password confirmation rejected by Keycloak with a visible error', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/registrations/);
    await page.getByLabel('First name').fill('Mismatch');
    await page.getByLabel('Last name').fill('Case');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('EodTest123!');
    await page.getByLabel('Confirm password').fill('Different123!');
    await page.getByRole('button', { name: 'Register' }).click();

    // Keycloak's confirmation validation error stays on the registration form.
    await expect(page).toHaveURL(/login-actions\/registration/);
    await expect(page.getByText(/Password confirmation doesn't match/i)).toBeVisible();
  });

  test('invalid signup input — weak password rejected by the realm password policy (8+ chars)', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/registrations/);
    await page.getByLabel('First name').fill('Weak');
    await page.getByLabel('Last name').fill('Pass');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Ab1!'); // 4 chars, has upper/lower/digit/special
    await page.getByLabel('Confirm password').fill('Ab1!');
    await page.getByRole('button', { name: 'Register' }).click();

    // Keycloak enforces the realm policy independently of the app.
    await expect(page).toHaveURL(/login-actions\/registration/);
    await expect(page.getByText(/Invalid password/i)).toBeVisible();
    await expect(page.getByText(/minimum length 8/i)).toBeVisible();
  });

  test('invalid signup input — password without a special character rejected by the realm policy', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/registrations/);
    await page.getByLabel('First name').fill('NoSpecial');
    await page.getByLabel('Last name').fill('Chars');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Abcdefgh1');
    await page.getByLabel('Confirm password').fill('Abcdefgh1');
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page).toHaveURL(/login-actions\/registration/);
    await expect(page.getByText(/Invalid password/i)).toBeVisible();
    await expect(page.getByText(/special character/i)).toBeVisible();
  });

  test('invalid signup input — malformed email rejected on the registration form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/protocol\/openid-connect\/registrations/);
    await page.getByLabel('First name').fill('Bad');
    await page.getByLabel('Last name').fill('Email');
    // Clearly malformed (no @) so Keycloak's own email check fires before uniqueness.
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Username').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('EodTest123!');
    await page.getByLabel('Confirm password').fill('EodTest123!');
    await page.getByRole('button', { name: 'Register' }).click();

    // No account is created; the form stays with Keycloak's email validation error.
    await expect(page).toHaveURL(/login-actions\/registration/);
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });
});
