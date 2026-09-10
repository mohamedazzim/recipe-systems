// Real login helper — the single integration point for all auth E2E specs (mentor style:
// one helper, real navigation, real Keycloak forms, no faked UI).
//
// Flows driven here are exactly what a user does:
//   loginViaKeycloak:  web → "Sign in" → BFF /auth/login → Keycloak login form → submit
//                      → BFF /auth/callback → back on the web app, authenticated
//   signupViaKeycloak: web → "Create account" → BFF /auth/signup → Keycloak registration form
//                      → submit → auto-login → BFF /auth/callback → authenticated

import { Page, expect } from '@playwright/test';

export const BFF_URL = 'http://localhost:3001/api/v1';

export interface KeycloakCredentials {
  username: string;
  password: string;
}

/** Drives the real Keycloak login page (the user's actual sign-in surface). */
export async function loginViaKeycloak(
  page: Page,
  credentials: KeycloakCredentials,
): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The BFF redirects us to Keycloak's hosted login page.
  await expect(page).toHaveURL(/protocol\/openid-connect\/auth/);
  await page.getByLabel('Username or email').fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Successful login lands back on the web app in the authenticated state
  // (banner carries the account email + a Sign out control).
  await expect(page).toHaveURL('http://localhost:3000/');
  await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible();
}

/** Drives the real Keycloak registration page (the user's actual signup surface). */
export async function signupViaKeycloak(
  page: Page,
  details: { email: string; password: string; firstName?: string; lastName?: string },
): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/protocol\/openid-connect\/registrations/);
  await page.getByLabel('First name').fill(details.firstName ?? 'E2e');
  await page.getByLabel('Last name').fill(details.lastName ?? 'Tester');
  await page.getByLabel('Email').fill(details.email);
  await page.getByLabel('Username').fill(details.email);
  await page.getByLabel('Password', { exact: true }).fill(details.password);
  await page.getByLabel('Confirm password').fill(details.password);
  await page.getByRole('button', { name: 'Register' }).click();
  // Registration auto-logs in → BFF callback → authenticated web app.
  await expect(page).toHaveURL('http://localhost:3000/');
  await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible();
}
