// Playwright E2E config — Recipe Systems (SCAFFOLD §6 / TEST_PLAN §3 e2e tier).
//
// These tests drive the REAL stack: web (:3000) → BFF (:3001) → Keycloak (:8081) → Postgres.
// Prerequisites (local dev loop, docs/SETUP.md):
//   docker compose -f infra/docker/docker-compose.yml --profile core --profile identity up -d
//   (cd packages/database && npx prisma migrate deploy)
//   npm run dev:web  +  the API on :3001 (see apps/api/.env.example vars)
//
// Intentionally NOT part of the default CI unit pipeline: hosted CI has no Keycloak service
// (TEST_PLAN §4 — providers mocked in CI). Run locally with: npm run test:e2e

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // shared Keycloak/DB state; one spec at a time
  workers: 1,
  retries: 0, // E2E must fail loudly, not hide flakes behind retries
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
});
