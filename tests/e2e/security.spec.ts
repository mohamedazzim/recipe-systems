// A1/A2 — Security boundaries (SCAFFOLD §3; Tech Stack §14/§15; D-09 guard pattern).
// Both sides of every boundary: who is allowed, who is blocked.
import { test, expect } from '@playwright/test';
import { BFF_URL } from './helpers/auth';

test.describe('A1 security boundaries', () => {
  test('unauthenticated access — /auth/me is rejected (401 UNAUTHENTICATED)', async ({ page }) => {
    await page.goto('/');
    const me = await page.request.get(`${BFF_URL}/auth/me`);
    expect(me.status()).toBe(401);
    const body = await me.json();
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  test('forged session token — rejected (401 SESSION_EXPIRED), never trusted', async ({ page }) => {
    await page.goto('/'); // get the browser context cookies going
    await page.context().addCookies([
      {
        name: 'recipe_session',
        value: 'forged.token.payload',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const me = await page.request.get(`${BFF_URL}/auth/me`);
    expect(me.status()).toBe(401);
    const body = await me.json();
    expect(['UNAUTHENTICATED', 'SESSION_EXPIRED']).toContain(body.error.code);
  });

  test('CSRF — state-changing request without the double-submit token is rejected (403 CSRF_MISMATCH)', async ({ request }) => {
    const res = await request.post(`${BFF_URL}/auth/logout`, { headers: { 'Content-Type': 'application/json' } });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('CSRF_MISMATCH');
  });
});
