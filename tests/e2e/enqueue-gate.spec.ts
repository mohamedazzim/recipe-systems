// D-14 enqueue-gate E2E — the real HTTP surface for INV-05 against the live BFF:
// parse-preview exposes the shared enqueue state (D-14B); a flagged line blocks
// enqueue (can_enqueue false, blocker named); clearing it via the review PATCH
// (needs_review: false) unblocks immediately; clients can never SET needs_review
// (needs_review: true → 400 — OCR/D-11 owns the flag).
//
// NOTE: a flagged line cannot be created over the public surface in text scope
// (only D-11 OCR produces flags) — the blocking scenario plants the flag at the DB
// level in the live-stack HTTP check recorded in HANDOFF §5, and at the service
// level in tests/integration/inv05_enqueue_gate.test.ts. This spec asserts the
// surface contract only.
//
// NOTE (2026-09-09, HANDOFF §5): on the dev VM, Playwright browser launches are blocked
// by machine policy (exit 1260) — these page-based specs run on machines with an
// unblocked browser.

import { test, expect, Page } from '@playwright/test';
import { BFF_URL, loginViaKeycloak } from './helpers/auth';

const SEEDED_CHEF = { username: 'chef@recipesystems.test', password: 'Password@123' };

interface EnqueueState {
  can_enqueue: boolean;
  blockers: Array<{ line_id: string; display_name: string }>;
}

async function authedApi(page: Page) {
  await loginViaKeycloak(page, SEEDED_CHEF);
  const cookies = await page.context().cookies(BFF_URL);
  const csrf = cookies.find((c) => c.name === 'recipe_csrf')?.value;
  if (!csrf) throw new Error('recipe_csrf cookie missing after sign-in');
  return { req: page.context().request, csrf };
}

test.describe('D-14 needs_review enqueue gate (INV-05) — live BFF', () => {
  test('clean text draft: parse-preview reports can_enqueue true (D-14B)', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const p = await req.post(`${BFF_URL}/recipes/parse-text`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { text: 'Fish — 500g\nTamarind — A Lemon Size' },
    });
    expect(p.status()).toBe(200); // API doc §3
    const recipeId: string = (await p.json()).recipe_id;

    const preview = await req.get(`${BFF_URL}/recipes/${recipeId}/parse-preview`);
    expect(preview.status()).toBe(200);
    const body = await preview.json();
    const enqueue: EnqueueState = body.enqueue;
    expect(enqueue).toEqual({ can_enqueue: true, blockers: [] });
  });

  test('clients can never SET needs_review — needs_review: true is refused', async ({ page }) => {
    const { req, csrf } = await authedApi(page);
    const p = await req.post(`${BFF_URL}/recipes/parse-text`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { text: 'Fish — 500g' },
    });
    const recipeId: string = (await p.json()).recipe_id;

    const lines = await req.get(`${BFF_URL}/recipes/${recipeId}/lines`);
    const line = (await lines.json()).items[0];

    const res = await req.patch(`${BFF_URL}/recipes/${recipeId}/lines/${line.id}`, {
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
      data: { needs_review: true, expected_updated_at: line.updated_at },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe('INVALID_LINE_EDIT');
  });
});
